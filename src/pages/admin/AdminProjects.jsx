import { ArrowUpRight, Image, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import AdminLayout from '../../components/admin/AdminLayout';
import LoadingState from '../../components/LoadingState';
import { formatDate } from '../../lib/helpers';
import { getPublicImageUrl } from '../../lib/storage';
import { supabase } from '../../lib/supabaseClient';

const filters = [
  ['all', 'All'],
  ['active', 'Current work'],
  ['completed', 'Portfolio'],
  ['draft', 'Drafts'],
];

export default function AdminProjects() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    let active = true;
    async function loadProjects() {
      const { data, error: projectError } = await supabase
        .from('projects')
        .select('*')
        .order('created_at', { ascending: false });
      if (!active) return;
      if (projectError) setError(projectError.message);
      else setProjects(data || []);
      setLoading(false);
    }
    loadProjects();
    return () => { active = false; };
  }, []);

  const visibleProjects = useMemo(() => {
    const query = search.trim().toLowerCase();
    return projects.filter((project) => {
      const matchesFilter = filter === 'all'
        || (filter === 'active' && project.work_status === 'active')
        || (filter === 'completed' && project.work_status !== 'active' && project.status === 'published')
        || (filter === 'draft' && project.status === 'draft');
      const matchesSearch = !query || [project.title, project.category, project.slug]
        .some((value) => String(value || '').toLowerCase().includes(query));
      return matchesFilter && matchesSearch;
    });
  }, [filter, projects, search]);

  return <AdminLayout>
    <header className="ll-operations-intro">
      <p className="ll-kicker">Public work overview</p>
      <h2>Projects</h2>
      <p>This is a read-only view of Creative work. Super Admin can review what is public, but cannot create, edit, or delete projects here.</p>
    </header>

    <div className="ll-simple-toolbar">
      <label className="ll-simple-search">
        <Search size={17}/><span className="sr-only">Search projects</span>
        <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search projects"/>
      </label>
      <div className="ll-filter-pills" aria-label="Filter projects">
        {filters.map(([key, label]) => <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)}>{label}</button>)}
      </div>
    </div>

    {error && <p className="ll-form-error" role="alert">{error}</p>}
    {loading ? <LoadingState label="Loading projects"/> : visibleProjects.length ? <div className="ll-project-review-list">
      {visibleProjects.map((project) => {
        const cover = getPublicImageUrl(project.cover_image);
        const mediaCount = (project.gallery_images || []).length + (project.gallery_items || []).length;
        const published = project.status === 'published' && project.slug;
        const content = <>
          <span className="ll-project-review-list__cover">{cover ? <img src={cover} alt="" loading="lazy"/> : <Image size={18}/>}</span>
          <span className="ll-project-review-list__copy">
            <strong>{project.title}</strong>
            <small>{project.work_status === 'active' ? 'Current work' : project.status === 'draft' ? 'Draft' : 'Portfolio'} · {formatDate(project.project_date || project.created_at)} · {mediaCount} media</small>
          </span>
          {published && <ArrowUpRight size={18} aria-hidden="true"/>}
        </>;
        return published
          ? <Link key={project.id} to={`/projects/${project.slug}`} className="ll-project-review-list__item">{content}</Link>
          : <div key={project.id} className="ll-project-review-list__item">{content}</div>;
      })}
    </div> : <div className="ll-operations-empty"><strong>No projects match</strong><p>Try another search or filter.</p></div>}
  </AdminLayout>;
}
