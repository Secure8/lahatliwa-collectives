import { normalizeRole } from './adminAccess';
import { supabase } from './supabaseClient';

const teamRecordSelect = 'id, user_id, email, display_name, avatar_url, role, editorial_roles, status, creative_member_id';

export const notInvitedMessage = 'This email has not been invited to the Lahat Liwa team.';
export const disabledTeamMessage = 'Your team access has been disabled.';

export async function claimSignedInTeamRecord(user) {
  const userEmail = user?.email?.trim();

  if (!user?.id || !userEmail) {
    return { data: null, blockedReason: notInvitedMessage };
  }

  const { data: existingRecord, error: readError } = await supabase
    .from('admin_users')
    .select(teamRecordSelect)
    .ilike('email', userEmail)
    .maybeSingle();

  if (readError) return { data: null, error: readError };
  if (!existingRecord) return { data: null, blockedReason: notInvitedMessage };
  if (existingRecord.status === 'disabled') return { data: existingRecord, blockedReason: disabledTeamMessage };
  if (!['invited', 'active'].includes(existingRecord.status)) return { data: null, blockedReason: notInvitedMessage };
  if (existingRecord.user_id && existingRecord.user_id !== user.id) {
    return { data: null, blockedReason: notInvitedMessage };
  }
  if (existingRecord.user_id === user.id) {
    return { data: { ...existingRecord, role: normalizeRole(existingRecord.role) } };
  }

  const { data: claimedRecord, error: claimError } = await supabase
    .from('admin_users')
    .update({
      user_id: user.id,
      status: existingRecord.status === 'invited' ? 'active' : existingRecord.status,
      updated_at: new Date().toISOString(),
    })
    .eq('id', existingRecord.id)
    .select(teamRecordSelect)
    .maybeSingle();

  if (claimError) return { data: null, error: claimError };
  if (!claimedRecord) return { data: null, blockedReason: notInvitedMessage };

  return { data: { ...claimedRecord, role: normalizeRole(claimedRecord.role) } };
}
