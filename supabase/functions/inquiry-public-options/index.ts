import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const jsonHeaders = { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=60, stale-while-revalidate=120' };
const reply = (body: unknown, status = 200, cors = {}) => new Response(JSON.stringify(body), { status, headers: { ...jsonHeaders, ...cors } });
const fail = (code: string, message: string, status: number, cors = {}) => reply({ success: false, code, message }, status, cors);

function corsHeaders(req: Request, siteUrl: string) {
  const origin = req.headers.get('Origin') || '';
  const allowed = new Set([siteUrl.replace(/\/$/, ''), 'http://localhost:5173', 'http://127.0.0.1:5173']);
  return {
    ...(allowed.has(origin) ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}),
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

Deno.serve(async (req) => {
  const configuredSiteUrl = Deno.env.get('PUBLIC_SITE_URL') || '';
  let siteUrl = '';
  try { siteUrl = new URL(configuredSiteUrl).origin; } catch { siteUrl = ''; }
  const cors = corsHeaders(req, siteUrl);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return fail('METHOD_NOT_ALLOWED', 'Method not allowed.', 405, cors);
  if (!siteUrl || !cors['Access-Control-Allow-Origin']) return fail('ORIGIN_NOT_ALLOWED', 'This request origin is not allowed.', 403, cors);

  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) return fail('SERVICE_NOT_CONFIGURED', 'Current creative choices are temporarily unavailable.', 503, cors);

  try {
    const body = await req.json().catch(() => ({}));
    if (body?.action !== 'list') return fail('INVALID_ACTION', 'The requested action is invalid.', 400, cors);
    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
    const { data: eligibleAccounts, error: accountError } = await admin.from('admin_users')
      .select('creative_member_id')
      .eq('status', 'active')
      .not('user_id', 'is', null)
      .not('creative_member_id', 'is', null);
    if (accountError) throw accountError;
    const creativeIds = [...new Set((eligibleAccounts || []).map((account: any) => account.creative_member_id).filter(Boolean))];
    if (!creativeIds.length) return reply({ success: true, creatives: [] }, 200, cors);

    const { data: creatives, error } = await admin.from('creative_members')
      .select('id, name, slug, role, profile_image_url')
      .in('id', creativeIds)
      .eq('is_published', true)
      .order('display_order', { ascending: true, nullsFirst: false })
      .order('name', { ascending: true });
    if (error) {
      console.error('[inquiry-public-options] creative listing failed', { code: error.code });
      return fail('OPTIONS_UNAVAILABLE', 'Current creative choices could not be loaded.', 500, cors);
    }
    const safeCreatives = (creatives || []).map((creative: any) => ({
      id: creative.id,
      name: creative.name,
      slug: creative.slug,
      role: creative.role,
      profile_image_url: creative.profile_image_url,
    }));
    return reply({ success: true, creatives: safeCreatives }, 200, cors);
  } catch (error) {
    console.error('[inquiry-public-options] request failed', { code: (error as any)?.code || 'UNEXPECTED_ERROR' });
    return fail('OPTIONS_UNAVAILABLE', 'Current creative choices could not be loaded.', 500, cors);
  }
});
