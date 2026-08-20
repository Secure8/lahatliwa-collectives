import { Archive, Check, Plus } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import IconLabelAction from '../../components/IconLabelAction';
import LoadingState from '../../components/LoadingState';
import { WORK_TAXONOMY_KINDS } from '../../lib/workTaxonomy';
import { supabase } from '../../lib/supabaseClient';

const labels = { discipline: 'Disciplines', specialty: 'Specialties', industry: 'Industries' };
const slugify = (value) => String(value || '').trim().toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export default function AdminTaxonomy() {
  const [terms, setTerms] = useState([]);
  const [kind, setKind] = useState('discipline');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    const { data, error: loadError } = await supabase.from('creative_taxonomy_terms')
      .select('id,kind,name,slug,sort_order,is_active').order('kind').order('sort_order').order('name');
    if (loadError) setError(loadError.message); else setTerms(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  const grouped = useMemo(() => Object.fromEntries(WORK_TAXONOMY_KINDS.map((item) => [item, terms.filter((term) => term.kind === item)])), [terms]);

  async function createTerm(event) {
    event.preventDefault();
    const cleanName = name.trim();
    const slug = slugify(cleanName);
    if (!cleanName || !slug) return;
    setBusy('create'); setError('');
    const order = Math.max(0, ...grouped[kind].map((term) => Number(term.sort_order) || 0)) + 10;
    const { error: createError } = await supabase.from('creative_taxonomy_terms').insert({ kind, name: cleanName, slug, sort_order: order });
    if (createError) setError(createError.message); else { setName(''); await load(); }
    setBusy('');
  }

  async function setActive(term, isActive) {
    setBusy(term.id); setError('');
    const { error: updateError } = await supabase.from('creative_taxonomy_terms').update({ is_active: isActive }).eq('id', term.id);
    if (updateError) setError(updateError.message); else setTerms((current) => current.map((item) => item.id === term.id ? { ...item, is_active: isActive } : item));
    setBusy('');
  }

  return <AdminLayout>
    <header className="ll-operations-intro">
      <p className="ll-kicker">Discovery structure</p>
      <h2>Taxonomy</h2>
      <p>Keep the same disciplines, specialties, and industries available across Creative profiles, Work, Discover, and inquiries.</p>
    </header>
    <form className="ll-taxonomy-create" onSubmit={createTerm}>
      <label><span>Category</span><select value={kind} onChange={(event) => setKind(event.target.value)}>{WORK_TAXONOMY_KINDS.map((item) => <option key={item} value={item}>{labels[item]}</option>)}</select></label>
      <label><span>New term</span><input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} placeholder="Enter a clear reusable term"/></label>
      <IconLabelAction type="submit" icon={<Plus size={16}/>} label={busy === 'create' ? 'Adding…' : 'Add term'} tone="primary" disabled={!name.trim() || Boolean(busy)}/>
    </form>
    {error && <p className="ll-form-error" role="alert">{error}</p>}
    {loading ? <LoadingState label="Loading taxonomy"/> : <div className="ll-taxonomy-groups">
      {WORK_TAXONOMY_KINDS.map((groupKind) => <section key={groupKind}>
        <header><h3>{labels[groupKind]}</h3><span>{grouped[groupKind].filter((term) => term.is_active).length} active</span></header>
        <div>{grouped[groupKind].map((term) => <article key={term.id} data-archived={!term.is_active || undefined}>
          <div><strong>{term.name}</strong><small>{term.slug}</small></div>
          <IconLabelAction icon={term.is_active ? <Archive size={15}/> : <Check size={15}/>} label={term.is_active ? 'Archive' : 'Restore'} onClick={() => setActive(term, !term.is_active)} disabled={Boolean(busy)}/>
        </article>)}</div>
      </section>)}
    </div>}
  </AdminLayout>;
}
