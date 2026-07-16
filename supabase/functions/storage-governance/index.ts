import { authenticatedTeamMember, corsHeaders, edgeEnvironment, fail, reply } from '../_shared/googleDriveEdge.ts';
import { r2Configuration } from '../_shared/r2Media.js';
import { readR2BucketUsage } from '../_shared/providerStorageUsage.js';

const POLICY_FIELDS = new Set([
  'budget_bytes','reserve_bytes','max_derivative_set_bytes','large_upload_threshold_bytes','info_percent','warning_percent',
  'strong_warning_percent','restrict_large_percent','pause_non_admin_percent','block_percent',
  'provisional_retention_hours','draft_retention_hours','reconciliation_recheck_hours',
  'emergency_supabase_fallback_enabled',
]);

function cleanBody(value:any){return value&&typeof value==='object'&&!Array.isArray(value)?value:{};}
function storageR2Configuration(){return r2Configuration({R2_MEDIA_ENABLED:Deno.env.get('R2_MEDIA_ENABLED'),R2_ACCOUNT_ID:Deno.env.get('R2_ACCOUNT_ID'),R2_ACCESS_KEY_ID:Deno.env.get('R2_ACCESS_KEY_ID'),R2_SECRET_ACCESS_KEY:Deno.env.get('R2_SECRET_ACCESS_KEY'),R2_BUCKET_NAME:Deno.env.get('R2_BUCKET_NAME'),R2_PUBLIC_BASE_URL:Deno.env.get('R2_PUBLIC_BASE_URL')});}

async function providerStorageUsage(actor:any){
  const config=storageR2Configuration();
  const [supabaseUsage,r2Usage]=await Promise.allSettled([
    actor.admin.rpc('get_provider_storage_usage'),
    config.configured?readR2BucketUsage(fetch,config):Promise.reject(Object.assign(new Error('R2 usage is not configured.'),{code:'R2_USAGE_NOT_CONFIGURED'})),
  ]);
  const supabaseData=supabaseUsage.status==='fulfilled'&&!supabaseUsage.value.error?supabaseUsage.value.data?.supabase:null;
  return{
    supabase:supabaseData?{...supabaseData,available:true}:{available:false,code:'SUPABASE_USAGE_UNAVAILABLE'},
    r2:r2Usage.status==='fulfilled'?r2Usage.value:{available:false,code:String(r2Usage.reason?.code||'R2_USAGE_UNAVAILABLE').slice(0,80)},
  };
}
Deno.serve(async(request)=>{const env=edgeEnvironment();const cors=corsHeaders(request,env.siteOrigin);if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});if(request.method!=='POST')return fail('METHOD_NOT_ALLOWED','Method not allowed.',405,cors);if(!cors['Access-Control-Allow-Origin'])return fail('ORIGIN_NOT_ALLOWED','This request origin is not allowed.',403,cors);const actor=await authenticatedTeamMember(request,env);if('error'in actor)return fail(String(actor.error||'INVALID_SESSION'),'Only an active Super Admin can access storage governance.',Number(actor.status||401),cors);if(actor.role!=='super_admin')return fail('NOT_AUTHORIZED','Only the Super Admin can access storage governance.',403,cors);const body=cleanBody(await request.json().catch(()=>({})));try{
  if(body.action==='dashboard'){const [{data,error},providerUsage]=await Promise.all([actor.admin.rpc('get_storage_governance_snapshot'),providerStorageUsage(actor)]);if(error)throw error;return reply({success:true,snapshot:{...(data||{}),providerUsage}},200,cors);}
  if(body.action==='update_policy'){const patch=cleanBody(body.policy);if(!Object.keys(patch).length||Object.keys(patch).some((key)=>!POLICY_FIELDS.has(key)))return fail('INVALID_POLICY','The storage policy update contains unsupported fields.',400,cors);const {data,error}=await actor.admin.from('storage_policies').update({...patch,updated_by:actor.user.id,updated_at:new Date().toISOString()}).eq('singleton',true).select('*').single();if(error)return fail('POLICY_UPDATE_FAILED',error.message,400,cors);await actor.admin.from('storage_audit_events').insert({actor_user_id:actor.user.id,action:'storage_policy_updated',target_type:'storage_policy',target_id:'primary',outcome:'completed',details:{changedFields:Object.keys(patch)}});return reply({success:true,policy:data},200,cors);}
  if(body.action==='authorize_emergency_fallback'){const reason=String(body.reason||'').trim();if(reason.length<8)return fail('FALLBACK_REASON_REQUIRED','Provide a clear emergency reason.',400,cors);const {data:policy}=await actor.admin.from('storage_policies').select('emergency_supabase_fallback_enabled').eq('singleton',true).single();if(!policy?.emergency_supabase_fallback_enabled)return fail('EMERGENCY_FALLBACK_DISABLED','Emergency Supabase fallback is disabled by policy.',409,cors);const {data,error}=await actor.admin.from('storage_emergency_fallback_authorizations').insert({actor_user_id:actor.user.id,reason,target_category:String(body.category||'site_image'),project_id:body.projectId||null,creative_member_id:body.creativeMemberId||null,expires_at:new Date(Date.now()+10*60*1000).toISOString()}).select('id,expires_at').single();if(error)throw error;await actor.admin.from('storage_audit_events').insert({actor_user_id:actor.user.id,action:'emergency_supabase_fallback_authorized',target_type:'fallback_authorization',target_id:data.id,outcome:'allowed',details:{reason,category:String(body.category||'site_image')}});return reply({success:true,authorization:{id:data.id,expiresAt:data.expires_at}},201,cors);}
  return fail('ACTION_NOT_ALLOWED','The requested storage-governance action is unavailable.',400,cors);
}catch(error){const caught=error as {code?:string;message?:string};return fail(caught.code||'STORAGE_GOVERNANCE_FAILED',String(caught.message||'Storage governance failed.').slice(0,300),500,cors);}});
