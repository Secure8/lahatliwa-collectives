import { Bell, CheckCheck, Mail, MapPin, MessageCircle, Phone, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { AdminConfirmationDialog } from '../components/admin/AdminDialog';
import LoadingState from '../components/LoadingState';
import { deleteCreativeNotification, loadCreativeNotifications, markCreativeNotificationsRead } from '../lib/creativeNotifications';

const dateLabel = (value) => new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));

export default function CreativeNotifications() {
  const [items, setItems] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const selected = useMemo(() => items.find((item) => item.id === selectedId) || null, [items, selectedId]);

  useEffect(() => { let active = true; loadCreativeNotifications().then((data) => { if (!active) return; setItems(data); setSelectedId(data[0]?.id || ''); }).catch((reason) => active && setError(reason.message)).finally(() => active && setLoading(false)); return () => { active = false; }; }, []);
  useEffect(() => { if (!selected || selected.read_at) return; markCreativeNotificationsRead([selected.id]).then(() => setItems((current) => current.map((item) => item.id === selected.id ? { ...item, read_at: new Date().toISOString() } : item))).catch(() => null); }, [selected?.id]);

  if (loading) return <div className="page-shell py-20"><LoadingState label="Loading notifications" /></div>;
  return <div className="page-shell ll-notifications-page">
    <header className="ll-notifications-heading"><div><p className="ll-kicker"><Bell size={14}/> Private inbox</p><h1>Notifications</h1><p>New connection requests and inquiries sent directly to you appear here.</p></div>{items.some((item) => !item.read_at) && <button type="button" onClick={() => markCreativeNotificationsRead(items.filter((item) => !item.read_at).map((item) => item.id)).then(() => setItems((current) => current.map((item) => ({ ...item, read_at: item.read_at || new Date().toISOString() }))))}><CheckCheck size={17}/> Mark all read</button>}</header>
    {error && <p role="alert" className="ll-feed-error">{error}</p>}
    {!items.length ? <section className="ll-notifications-empty"><Bell size={24}/><h2>No notifications yet</h2><p>When a viewer sends an inquiry directly to you, it will appear here.</p></section> : <div className="ll-notifications-layout"><nav aria-label="Inquiry notifications">{items.map((item) => <button key={item.id} type="button" className={`${item.id === selectedId ? 'is-active' : ''}${!item.read_at ? ' is-unread' : ''}`} onClick={() => setSelectedId(item.id)}><i/><span><strong>{item.title}</strong><small>{item.preview}</small><time>{dateLabel(item.created_at)}</time></span></button>)}</nav>{selected && <InquiryPanel item={selected} onDelete={() => setDeleteTarget(selected)}/>}</div>}
    <AdminConfirmationDialog
      open={Boolean(deleteTarget)}
      onClose={() => setDeleteTarget(null)}
      onConfirm={async () => {
        const removedId = deleteTarget?.id;
        await deleteCreativeNotification(removedId);
        setItems((current) => {
          const remaining = current.filter((item) => item.id !== removedId);
          setSelectedId(remaining[0]?.id || '');
          return remaining;
        });
      }}
      title="Delete this notification?"
      description="This inquiry will disappear from your inbox. The Super Admin will retain the original record for moderation and support."
      confirmLabel="Delete notification"
      destructive
    />
  </div>;
}

function InquiryPanel({ item, onDelete }) {
  const inquiry = item.project_inquiries || {};
  return <article className="ll-inquiry-panel"><header><div><p className="ll-kicker">{inquiry.public_reference || 'Creative inquiry'}</p><h2>{inquiry.summary || item.title}</h2><p>From {inquiry.name}{inquiry.organization ? ` · ${inquiry.organization}` : ''}</p></div><button type="button" className="ll-inquiry-panel__delete" onClick={onDelete}><Trash2 size={16}/><span>Delete</span></button></header><div className="ll-inquiry-panel__message"><MessageCircle size={18}/><p>{inquiry.details || item.preview}</p></div><dl>{inquiry.client_email && <div><dt><Mail size={15}/> Email</dt><dd><a href={`mailto:${inquiry.client_email}`}>{inquiry.client_email}</a></dd></div>}{inquiry.client_phone && <div><dt><Phone size={15}/> Phone or message</dt><dd>{inquiry.client_phone}</dd></div>}{inquiry.general_location && <div><dt><MapPin size={15}/> Location</dt><dd>{inquiry.general_location}</dd></div>}{inquiry.preferred_schedule && <div><dt>Timeline</dt><dd>{inquiry.preferred_schedule}</dd></div>}{inquiry.budget_range && <div><dt>Budget</dt><dd>{inquiry.budget_range}</dd></div>}</dl><p className="ll-inquiry-panel__privacy">This inquiry is private to you and the Super Admin.</p></article>;
}
