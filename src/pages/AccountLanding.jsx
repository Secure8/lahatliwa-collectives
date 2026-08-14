import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import LoadingState from '../components/LoadingState';
import { useAdminAccess } from '../lib/adminAccess';
import { supabase } from '../lib/supabaseClient';

export default function AccountLanding() {
  const { role, adminUser } = useAdminAccess(); const [slug, setSlug] = useState(''); const [ready, setReady] = useState(role !== 'creative');
  useEffect(() => { if (role !== 'creative' || !adminUser?.creative_member_id) return; supabase.from('creative_members').select('slug').eq('id', adminUser.creative_member_id).single().then(({ data }) => { setSlug(data?.slug || ''); setReady(true); }); }, [role, adminUser?.creative_member_id]);
  if (!ready) return <main className="grid min-h-screen place-items-center bg-zinc-950 text-white"><LoadingState label="Opening your Creative profile" /></main>;
  if (role === 'super_admin') return <Navigate to="/admin/dashboard" replace />;
  if (slug) return <Navigate to={`/creatives/${slug}`} replace />;
  return <Navigate to="/admin/login" replace />;
}
