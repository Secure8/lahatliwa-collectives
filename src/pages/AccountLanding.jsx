import { AlertCircle, LogOut } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import BrandWordmark from '../components/BrandWordmark';
import LoadingState from '../components/LoadingState';
import { useAdminAccess } from '../lib/adminAccess';
import { supabase } from '../lib/supabaseClient';

export default function AccountLanding() {
  const { role, adminUser } = useAdminAccess();
  const [profile, setProfile] = useState({ loading: role === 'creative', slug: '', error: '' });

  useEffect(() => {
    let active = true;
    if (role !== 'creative') {
      setProfile({ loading: false, slug: '', error: '' });
      return () => { active = false; };
    }
    if (!adminUser?.creative_member_id) {
      setProfile({ loading: false, slug: '', error: 'This Creative account is not linked to a public profile.' });
      return () => { active = false; };
    }
    supabase.from('creative_members').select('slug').eq('id', adminUser.creative_member_id).maybeSingle().then(({ data, error }) => {
      if (!active) return;
      setProfile({ loading: false, slug: data?.slug || '', error: error ? 'Your Creative profile could not be opened.' : data?.slug ? '' : 'This Creative account is not linked to a public profile.' });
    });
    return () => { active = false; };
  }, [role, adminUser?.creative_member_id]);

  if (profile.loading) return <main className="ll-auth-page"><LoadingState label="Opening your Creative profile" /></main>;
  if (role === 'super_admin') return <Navigate to="/admin/dashboard" replace />;
  if (profile.slug) return <Navigate to={`/creatives/${profile.slug}`} replace />;
  return <AccountIssue message={profile.error || 'This account does not have a supported platform role.'} />;
}

function AccountIssue({ message }) {
  async function signOut() { await supabase.auth.signOut(); }
  return <main className="ll-auth-page"><section className="ll-auth-card"><BrandWordmark variant="auth" to="/" /><div className="ll-auth-form"><span className="ll-auth-icon" aria-hidden="true"><AlertCircle size={20} /></span><h1>Account needs attention</h1><p>{message} Ask a Super Admin to review the Team record, then sign in again.</p><button type="button" onClick={signOut} className="ll-primary-action ll-auth-submit"><LogOut size={17} /> Sign out</button></div></section></main>;
}
