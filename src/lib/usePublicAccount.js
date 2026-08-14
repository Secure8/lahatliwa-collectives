import { useEffect, useState } from 'react';
import { useAuthSession } from './authSession';
import { normalizeRole } from './adminAccess';
import { supabase } from './supabaseClient';

export default function usePublicAccount() {
  const { status, session } = useAuthSession();
  const [account, setAccount] = useState(null);
  const [loading, setLoading] = useState(status === 'authenticated');

  useEffect(() => {
    let active = true;
    if (status !== 'authenticated' || !session?.user?.id) {
      setAccount(null);
      setLoading(false);
      return () => { active = false; };
    }
    setLoading(true);
    (async () => {
      const { data, error } = await supabase.from('admin_users')
        .select('role,status,creative_member_id,display_name,avatar_url')
        .eq('user_id', session.user.id).maybeSingle();
      if (!active) return;
      if (error || data?.status !== 'active') {
        setAccount(null);
        setLoading(false);
        return;
      }
      let creative = null;
      if (data.creative_member_id) {
        const result = await supabase.from('creative_members')
          .select('slug,name,profile_image_url')
          .eq('id', data.creative_member_id).maybeSingle();
        creative = result.data || null;
      }
      if (active) {
        setAccount({ ...data, role: normalizeRole(data.role), creative_members: creative });
        setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [session?.user?.id, status]);

  return { account, loading, authenticated: status === 'authenticated', authorized: Boolean(account), session };
}
