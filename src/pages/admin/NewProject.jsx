import { useEffect } from 'react';
import { X } from 'lucide-react';
import { Link } from 'react-router-dom';
import ProjectForm from '../../components/admin/ProjectForm';
import { useAdminAccess } from '../../lib/adminAccess';

export default function NewProject() {
  const { role } = useAdminAccess();
  const closeTo = role === 'creative' ? '/account' : '/';
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    window.scrollTo({ top: 0, behavior: 'auto' });
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, []);
  return (
    <>
      <div className="ll-work-editor-layer">
        <Link to={closeTo} className="ll-work-editor-scrim" aria-label="Close work creator" />
        <section className="ll-work-editor" role="dialog" aria-modal="true" aria-labelledby="new-work-title">
          <header><div><p className="ll-kicker">Create work</p><h1 id="new-work-title">New project</h1><p>Build a current-work update or completed portfolio entry.</p></div><Link to={closeTo} aria-label="Close"><X size={21} /></Link></header>
          <div className="ll-work-editor-body"><ProjectForm /></div>
        </section>
      </div>
    </>
  );
}

