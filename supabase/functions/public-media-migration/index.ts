import { authenticatedTeamMember, corsHeaders, edgeEnvironment, fail, reply } from '../_shared/googleDriveEdge.ts';
import { R2_MEDIA_CATEGORIES, R2_PROVIDER, createR2ObjectKey, deleteR2Object, listR2Objects, r2Configuration, r2PublicUrl, safeR2ObjectKey, signedR2Request, uploadR2Object } from '../_shared/r2Media.js';
import { createServerWebsiteDerivatives } from '../_shared/migrationImage.ts';
import { migrationIdentity, validateLegacyImageSource } from '../_shared/storageGovernance.js';

const BUCKET = 'project-media';
const MAX_SOURCE_BYTES = 5 * 1024 * 1024;

function config() { return r2Configuration({ R2_MEDIA_ENABLED: Deno.env.get('R2_MEDIA_ENABLED'), R2_ACCOUNT_ID: Deno.env.get('R2_ACCOUNT_ID'), R2_ACCESS_KEY_ID: Deno.env.get('R2_ACCESS_KEY_ID'), R2_SECRET_ACCESS_KEY: Deno.env.get('R2_SECRET_ACCESS_KEY'), R2_BUCKET_NAME: Deno.env.get('R2_BUCKET_NAME'), R2_PUBLIC_BASE_URL: Deno.env.get('R2_PUBLIC_BASE_URL') }); }
function cleanBody(value: any) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
function isSuper(actor: any) { return actor.role === 'super_admin'; }
function contains(value: any, target: string): boolean { return typeof value === 'string' ? value === target : Array.isArray(value) ? value.some((item) => contains(item,target)) : Boolean(value && typeof value === 'object' && Object.values(value).some((item) => contains(item,target))); }

function sourcePath(value: any, supabaseUrl = '') {
  const input = typeof value === 'string' ? value.trim() : '';
  if (!input || /^(data|blob|javascript):/i.test(input)) return '';
  if (!/^https?:\/\//i.test(input)) return input.replace(/\\/g,'/').replace(/^\/+/, '').replace(/^project-media\//i,'').split(/[?#]/)[0];
  try {
    const url = new URL(input); const origin = new URL(supabaseUrl);
    if (url.origin !== origin.origin) return '';
    const markers = [`/storage/v1/object/public/${BUCKET}/`,`/storage/v1/object/sign/${BUCKET}/`,`/object/public/${BUCKET}/`];
    const marker = markers.find((item) => url.pathname.includes(item));
    return marker ? decodeURIComponent(url.pathname.slice(url.pathname.indexOf(marker)+marker.length)) : '';
  } catch { return ''; }
}

function walkStrings(value: any, path: Array<string|number> = [], result: any[] = []) {
  if (typeof value === 'string') result.push({ value, path });
  else if (Array.isArray(value)) value.forEach((item,index) => walkStrings(item,[...path,index],result));
  else if (value && typeof value === 'object') Object.entries(value).forEach(([key,item]) => walkStrings(item,[...path,key],result));
  return result;
}

function replaceAtPath(value: any, path: Array<string|number>, replacement: string) {
  const clone = structuredClone(value); let cursor = clone;
  for (let index=0; index<path.length-1; index+=1) cursor = cursor?.[path[index]];
  if (cursor && path.length) cursor[path[path.length-1]] = replacement;
  return clone;
}

async function collectCandidates(actor: any, limit: number) {
  const [projects,creatives,admins,settings,pages,services,assets] = await Promise.all([
    actor.admin.from('projects').select('id,owner_user_id,created_by,cover_image,gallery_images,gallery_items').limit(250),
    actor.admin.from('creative_members').select('id,profile_image_url,cover_image').limit(250),
    actor.admin.from('admin_users').select('user_id,creative_member_id').eq('status','active'),
    actor.admin.from('site_settings').select('*').limit(20), actor.admin.from('page_content').select('id,content').limit(100),
    actor.admin.from('service_branches').select('id,icon_url,image_url').limit(100), actor.admin.from('media_assets').select('id,url,storage_path').limit(250),
  ]);
  if ([projects,creatives,admins,settings,pages,services,assets].some((result:any)=>result.error)) throw Object.assign(new Error('Public media references could not be scanned.'),{code:'REFERENCE_SCAN_FAILED'});
  const ownerByCreative = new Map((admins.data||[]).filter((row:any)=>row.user_id&&row.creative_member_id).map((row:any)=>[row.creative_member_id,row.user_id]));
  const candidates:any[]=[]; const push=(candidate:any)=>{const path=sourcePath(candidate.reference,Deno.env.get('SUPABASE_URL')||'');if(path)candidates.push({...candidate,path});};
  for(const project of projects.data||[]){const owner=project.owner_user_id||project.created_by||actor.user.id;if(project.cover_image)push({ownerUserId:owner,projectId:project.id,recordType:'project',recordId:project.id,field:'cover_image',locator:{table:'projects',field:'cover_image'},reference:project.cover_image,category:'project_cover'});for(const value of project.gallery_images||[])push({ownerUserId:owner,projectId:project.id,recordType:'project',recordId:project.id,field:'gallery_images',locator:{table:'projects',field:'gallery_images',match:value},reference:value,category:'project_gallery'});for(const item of project.gallery_items||[]){if(item?.type==='image'&&item.url)push({ownerUserId:owner,projectId:project.id,recordType:'project',recordId:project.id,field:'gallery_items',locator:{table:'projects',field:'gallery_items',itemId:item.id,subfield:'url',match:item.url},reference:item.url,category:'project_gallery'});if(item?.thumbnail_storage_path||item?.thumbnail_url){const value=item.thumbnail_storage_path||item.thumbnail_url;push({ownerUserId:owner,projectId:project.id,recordType:'project',recordId:project.id,field:'gallery_items',locator:{table:'projects',field:'gallery_items',itemId:item.id,subfield:item.thumbnail_storage_path?'thumbnail_storage_path':'thumbnail_url',match:value},reference:value,category:'external_thumbnail'});}}}
  for(const creative of creatives.data||[]){const owner=ownerByCreative.get(creative.id)||actor.user.id;for(const [field,category] of [['profile_image_url','profile_photo'],['cover_image','profile_cover']])if(creative[field])push({ownerUserId:owner,creativeMemberId:creative.id,recordType:'creative',recordId:creative.id,field,locator:{table:'creative_members',field},reference:creative[field],category});}
  for(const row of settings.data||[])for(const [field,value] of Object.entries(row))if(/(?:image|logo).*url/i.test(field)&&typeof value==='string')push({ownerUserId:actor.user.id,recordType:'site_setting',recordId:row.id,field,locator:{table:'site_settings',field},reference:value,category:'site_image'});
  for(const row of pages.data||[])for(const item of walkStrings(row.content))push({ownerUserId:actor.user.id,recordType:'page_content',recordId:row.id,field:'content',locator:{table:'page_content',field:'content',path:item.path},reference:item.value,category:'site_image'});
  for(const row of services.data||[])for(const field of ['icon_url','image_url'])if(row[field])push({ownerUserId:actor.user.id,recordType:'service_branch',recordId:row.id,field,locator:{table:'service_branches',field},reference:row[field],category:'service_image'});
  for(const row of assets.data||[]){const value=row.storage_path||row.url;if(value)push({ownerUserId:actor.user.id,recordType:'media_asset',recordId:row.id,field:row.storage_path?'storage_path':'url',locator:{table:'media_assets',field:row.storage_path?'storage_path':'url'},reference:value,category:'site_image'});}
  const unique=new Map();for(const item of candidates){const key=[item.recordType,item.recordId,item.field,JSON.stringify(item.locator),item.path].join('|');if(!unique.has(key))unique.set(key,item);}return [...unique.values()].slice(0,Math.max(1,Math.min(limit,100)));
}

async function discover(actor:any,limit:number){
  const candidates=await collectCandidates(actor,limit);
  let created=0,existing=0,manualReview=0;
  for(const candidate of candidates){
    const identity=await migrationIdentity({provider:'supabase',bucket:BUCKET,path:candidate.path,recordType:candidate.recordType,recordId:candidate.recordId,field:candidate.field});
    const {data:known,error:knownError}=await actor.admin.from('storage_migrations').select('id').eq('migration_identity',identity).maybeSingle();
    if(knownError)throw knownError;
    if(known){existing+=1;continue;}
    const extension=candidate.path.split('.').pop()?.toLowerCase()||'';
    const supported=['jpg','jpeg','png','webp'].includes(extension);
    const {data:tracked,error:trackedError}=await actor.admin.from('external_media_objects')
      .select('id,owner_user_id,metadata').eq('provider','supabase').eq('bucket',BUCKET).eq('storage_path',candidate.path).neq('status','deleted').maybeSingle();
    if(trackedError)throw trackedError;
    let mediaId=tracked?.id||crypto.randomUUID();
    const ownerUserId=tracked?.owner_user_id||candidate.ownerUserId;
    if(tracked){
      const {error}=await actor.admin.from('external_media_objects').update({
        source_provider:'supabase',source_bucket:BUCKET,source_path:candidate.path,
        verification_status:'pending',accounting_state:supported?'legacy':'manual_review',
        project_id:candidate.projectId||null,creative_member_id:candidate.creativeMemberId||null,
        metadata:{...(tracked.metadata||{}),migration_discovery:true,source_reference:candidate.reference},
      }).eq('id',mediaId);
      if(error)throw error;
    }else{
      const {error}=await actor.admin.from('external_media_objects').insert({
        id:mediaId,owner_user_id:ownerUserId,provider:'supabase',bucket:BUCKET,storage_path:candidate.path,
        filename:candidate.path.split('/').pop()||'legacy-image',mime_type:'application/octet-stream',size_bytes:0,
        visibility:'public',status:'verification_required',file_category:candidate.category,
        project_id:candidate.projectId||null,creative_member_id:candidate.creativeMemberId||null,
        source_provider:'supabase',source_bucket:BUCKET,source_path:candidate.path,
        verification_status:'pending',accounting_state:supported?'legacy':'manual_review',
        metadata:{migration_discovery:true,source_reference:candidate.reference},
      });
      if(error)throw error;
    }
    const status=supported?'not_started':'manual_review';
    const {error}=await actor.admin.from('storage_migrations').insert({
      owner_user_id:ownerUserId,media_object_id:mediaId,source_media_object_id:mediaId,
      source_provider:'supabase',source_bucket:BUCKET,source_path:candidate.path,
      destination_provider:R2_PROVIDER,destination_connection_id:null,status,bytes_total:0,bytes_transferred:0,
      migration_identity:identity,source_record_type:candidate.recordType,source_record_id:candidate.recordId,
      source_field:candidate.field,source_locator:candidate.locator,source_extension:extension,
      project_id:candidate.projectId||null,creative_member_id:candidate.creativeMemberId||null,
      media_category:candidate.category,manual_review_reason:supported?null:'Unsupported or unclassified source extension',
    });
    if(error){
      if(error.code==='23505'){existing+=1;continue;}
      throw error;
    }
    created+=1;
    if(!supported)manualReview+=1;
  }
  return{discovered:candidates.length,created,existing,manualReview};
}

async function sha256(bytes:Uint8Array){const value=await crypto.subtle.digest('SHA-256',bytes);return[...new Uint8Array(value)].map((byte)=>byte.toString(16).padStart(2,'0')).join('');}

async function referenceContains(actor:any,migration:any,url:string){
  const locator=migration.source_locator||{};
  if(locator.table==='projects')return contains((await actor.admin.from('projects').select('cover_image,gallery_images,gallery_items').eq('id',migration.source_record_id).maybeSingle()).data,url);
  if(locator.table==='creative_members')return contains((await actor.admin.from('creative_members').select('profile_image_url,cover_image').eq('id',migration.source_record_id).maybeSingle()).data,url);
  if(locator.table==='site_settings')return contains((await actor.admin.from('site_settings').select('*').eq('id',migration.source_record_id).maybeSingle()).data,url);
  if(locator.table==='service_branches')return contains((await actor.admin.from('service_branches').select('icon_url,image_url').eq('id',migration.source_record_id).maybeSingle()).data,url);
  if(locator.table==='media_assets')return contains((await actor.admin.from('media_assets').select('url,storage_path').eq('id',migration.source_record_id).maybeSingle()).data,url);
  if(locator.table==='page_content')return contains((await actor.admin.from('page_content').select('content').eq('id',migration.source_record_id).maybeSingle()).data,url);
  return false;
}

async function activateReference(actor:any,migration:any,newUrl:string,oldReference:string){const locator=migration.source_locator||{};let error:any=null;if(locator.table==='projects'){const {data:row}=await actor.admin.from('projects').select('cover_image,gallery_images,gallery_items').eq('id',migration.source_record_id).maybeSingle();if(!row||!contains(row,oldReference))throw Object.assign(new Error('The original project reference changed.'),{code:'SOURCE_REFERENCE_CHANGED'});if(locator.field==='cover_image')({error}=await actor.admin.from('projects').update({cover_image:newUrl}).eq('id',migration.source_record_id).eq('cover_image',oldReference));else if(locator.field==='gallery_images')({error}=await actor.admin.from('projects').update({gallery_images:(row.gallery_images||[]).map((value:any)=>value===oldReference?newUrl:value)}).eq('id',migration.source_record_id));else{const items=(row.gallery_items||[]).map((item:any)=>item.id===locator.itemId&&item[locator.subfield]===oldReference?{...item,[locator.subfield]:newUrl,...(locator.subfield==='thumbnail_storage_path'?{thumbnail_url:newUrl}:{})}:item);({error}=await actor.admin.from('projects').update({gallery_items:items}).eq('id',migration.source_record_id));}}
  else if(locator.table==='creative_members')({error}=await actor.admin.from('creative_members').update({[locator.field]:newUrl}).eq('id',migration.source_record_id).eq(locator.field,oldReference));
  else if(locator.table==='site_settings')({error}=await actor.admin.from('site_settings').update({[locator.field]:newUrl}).eq('id',migration.source_record_id).eq(locator.field,oldReference));
  else if(locator.table==='service_branches')({error}=await actor.admin.from('service_branches').update({[locator.field]:newUrl}).eq('id',migration.source_record_id).eq(locator.field,oldReference));
  else if(locator.table==='media_assets'){const {data:row}=await actor.admin.from('media_assets').select('url,storage_path').eq('id',migration.source_record_id).maybeSingle();if(!row||!contains(row,oldReference))throw Object.assign(new Error('The original media record changed.'),{code:'SOURCE_REFERENCE_CHANGED'});({error}=await actor.admin.from('media_assets').update({url:newUrl,storage_path:null}).eq('id',migration.source_record_id));}
  else if(locator.table==='page_content'){const {data:row}=await actor.admin.from('page_content').select('content').eq('id',migration.source_record_id).maybeSingle();if(!row||!contains(row.content,oldReference))throw Object.assign(new Error('The original page-content reference changed.'),{code:'SOURCE_REFERENCE_CHANGED'});({error}=await actor.admin.from('page_content').update({content:replaceAtPath(row.content,locator.path||[],newUrl)}).eq('id',migration.source_record_id));}
  else throw Object.assign(new Error('The source reference is unclassified.'),{code:'SOURCE_LOCATOR_UNSUPPORTED'});
  if(error)throw error;
  if(!await referenceContains(actor,migration,newUrl))throw Object.assign(new Error('The migrated reference could not be confirmed after activation.'),{code:'ACTIVATION_NOT_CONFIRMED'});
  const activatedAt=new Date().toISOString();
  const {error:stateError}=await actor.admin.from('storage_migrations').update({status:'activated',activated_at:activatedAt,updated_at:activatedAt}).eq('id',migration.id).eq('status','verified');
  if(stateError)throw stateError;
}

async function cleanupFailedGroup(actor:any,cfg:any,rows:any[]){
  const migrationId=rows[0]?.migration_id;
  if(migrationId){
    const {data:migration}=await actor.admin.from('storage_migrations').select('*').eq('id',migrationId).maybeSingle();
    const primaryVariant=R2_MEDIA_CATEGORIES[migration?.media_category]?.primaryVariant||'display';
    const primary=rows.find((row)=>row.media_variant===primaryVariant)||rows[0];
    if(migration&&primary?.public_url&&await referenceContains(actor,migration,primary.public_url)){
      await actor.admin.from('external_media_objects').update({status:'available',accounting_state:'active',verification_status:'verified',cleanup_status:'manual_required',cleanup_error:'POST_ACTIVATION_FINALIZATION_FAILED'}).eq('media_group_id',rows[0].media_group_id);
      return;
    }
  }
  for(const row of rows){try{await deleteR2Object(fetch,cfg,row.external_file_id);await actor.admin.from('external_media_objects').update({status:'deleted',accounting_state:'deleted',external_file_id:null,public_url:null,deleted_at:new Date().toISOString(),cleanup_status:'complete'}).eq('id',row.id);}catch{await actor.admin.from('storage_cleanup_jobs').insert({provider:R2_PROVIDER,bucket_name:cfg.bucketName,object_path:row.external_file_id,project_id:row.project_id||null,migration_id:row.migration_id||null,estimated_bytes:row.size_bytes,reason:'failed_migration_partial',created_by:actor.user.id});}}
}

async function verifyDestinationRows(actor:any,cfg:any,rows:any[]){
  if(rows.length!==3)throw Object.assign(new Error('The destination media group is incomplete.'),{code:'MIGRATION_GROUP_INCOMPLETE'});
  let actualBytes=0;
  for(const row of rows){
    const response=await signedR2Request(fetch,cfg,'HEAD',row.external_file_id);
    const size=Number(response.headers.get('content-length')||0);
    if(!response.ok||size!==Number(row.size_bytes)||String(response.headers.get('content-type')||'').split(';')[0]!=='image/webp')throw Object.assign(new Error('R2 migration verification failed.'),{code:'R2_MIGRATION_VERIFICATION_FAILED'});
    actualBytes+=size;
    const {error}=await actor.admin.from('external_media_objects').update({status:'available',trusted_size_bytes:size,uploaded_bytes:size,verification_status:'verified',last_verified_at:new Date().toISOString()}).eq('id',row.id);
    if(error)throw error;
  }
  return actualBytes;
}

async function processOne(actor:any,cfg:any,migration:any){
  let reservationId='';
  let rows:any[]=[];
  try{
    const {data:policy}=await actor.admin.from('storage_policies').select('migration_retention_days').eq('singleton',true).single();
    let state=migration.status;
    let groupId=migration.destination_media_group_id||'';
    let actualBytes=Number(migration.destination_bytes||0);

    if(['uploaded','verified','activated'].includes(state)&&groupId){
      const {data,error}=await actor.admin.from('external_media_objects').select('*').eq('provider',R2_PROVIDER).eq('migration_id',migration.id).eq('media_group_id',groupId).neq('status','deleted').order('media_variant');
      if(error)throw error;
      rows=data||[];
      if(rows.length!==3)throw Object.assign(new Error('The resumable destination group is incomplete.'),{code:'MIGRATION_GROUP_INCOMPLETE',manual:true});
      reservationId=rows[0].reservation_id||'';
    }else{
      const {data:blob,error:downloadError}=await actor.admin.storage.from(migration.source_bucket).download(migration.source_path);
      if(downloadError||!blob)throw Object.assign(new Error('The Supabase source object is missing.'),{code:'MISSING_SUPABASE_SOURCE',manual:true});
      if(blob.size>MAX_SOURCE_BYTES)throw Object.assign(new Error('The source exceeds the safe Edge transformation limit.'),{code:'SOURCE_TOO_LARGE_FOR_EDGE',manual:true});
      const source=new Uint8Array(await blob.arrayBuffer());
      const validation=validateLegacyImageSource({path:migration.source_path,mimeType:blob.type,sizeBytes:source.byteLength,signature:source.slice(0,16)});
      if(!validation.eligible)throw Object.assign(new Error('The source image could not be safely classified.'),{code:validation.reason,manual:true});
      const sourceChecksum=await sha256(source);
      await actor.admin.from('external_media_objects').update({mime_type:validation.mimeType,size_bytes:source.byteLength,trusted_size_bytes:source.byteLength,checksum_algorithm:'sha256',checksum_value:sourceChecksum,status:'available',verification_status:'verified',last_verified_at:new Date().toISOString()}).eq('id',migration.source_media_object_id);
      await actor.admin.from('storage_migrations').update({source_mime_type:validation.mimeType,source_checksum:sourceChecksum,bytes_total:source.byteLength,updated_at:new Date().toISOString()}).eq('id',migration.id);
      const derivatives=await createServerWebsiteDerivatives(source);
      groupId=crypto.randomUUID();
      const estimated=derivatives.reduce((sum,item)=>sum+item.bytes.byteLength,0);
      const {data:reservation,error:reservationError}=await actor.admin.rpc('reserve_public_media_bytes',{p_operation_id:groupId,p_operation_kind:'migration',p_owner_user_id:migration.owner_user_id,p_project_id:migration.project_id||null,p_creative_member_id:migration.creative_member_id||null,p_actor_role:'super_admin',p_estimated_bytes:estimated,p_override:false,p_override_reason:null});
      if(reservationError||!reservation?.allowed)throw Object.assign(new Error('Storage budget does not currently allow this migration.'),{code:reservation?.code||'MIGRATION_BUDGET_RESTRICTED'});
      reservationId=reservation.reservationId;
      const targetId=migration.project_id||migration.creative_member_id||migration.owner_user_id;
      rows=derivatives.map((derivative)=>{
        const id=crypto.randomUUID();const key=createR2ObjectKey(migration.media_category,targetId,groupId,derivative.variant);
        return{id,owner_user_id:migration.owner_user_id,provider:R2_PROVIDER,external_file_id:key,filename:`${groupId}-${derivative.variant}.webp`,mime_type:'image/webp',size_bytes:derivative.bytes.byteLength,trusted_size_bytes:null,width:derivative.width,height:derivative.height,visibility:'public',status:'uploading',file_category:migration.media_category,project_id:migration.project_id||null,creative_member_id:migration.creative_member_id||null,media_group_id:groupId,media_variant:derivative.variant,public_url:r2PublicUrl(cfg,key),reservation_id:reservationId,destination_bucket:cfg.bucketName,source_provider:'supabase',source_bucket:migration.source_bucket,source_path:migration.source_path,migration_id:migration.id,verification_status:'pending',accounting_state:'provisional',metadata:{migration_identity:migration.migration_identity}};
      });
      const {error:insertError}=await actor.admin.from('external_media_objects').insert(rows);if(insertError)throw insertError;
      await actor.admin.from('storage_migrations').update({status:'in_progress',destination_media_group_id:groupId,destination_bucket:cfg.bucketName,updated_at:new Date().toISOString()}).eq('id',migration.id);
      for(let index=0;index<rows.length;index+=1){const response=await uploadR2Object(fetch,cfg,rows[index].external_file_id,'image/webp',derivatives[index].bytes);if(!response.ok)throw Object.assign(new Error('R2 migration upload failed.'),{code:'R2_MIGRATION_UPLOAD_FAILED'});}
      await actor.admin.from('storage_migrations').update({status:'uploaded',bytes_transferred:source.byteLength,destination_bytes:estimated,updated_at:new Date().toISOString()}).eq('id',migration.id);
      state='uploaded';
    }

    if(state==='uploaded'){
      actualBytes=await verifyDestinationRows(actor,cfg,rows);
      await actor.admin.from('storage_migrations').update({status:'verified',checksum_verified:true,verified_at:new Date().toISOString(),destination_bytes:actualBytes,updated_at:new Date().toISOString()}).eq('id',migration.id);
      state='verified';
    }

    const primaryVariant=R2_MEDIA_CATEGORIES[migration.media_category]?.primaryVariant||'display';
    const primary=rows.find((row)=>row.media_variant===primaryVariant)||rows[0];
    if(state==='verified'){
      const oldReference=migration.source_locator?.match||((await actor.admin.from('external_media_objects').select('metadata').eq('id',migration.source_media_object_id).single()).data?.metadata?.source_reference);
      if(!oldReference)throw Object.assign(new Error('The stored source reference is unavailable.'),{code:'SOURCE_REFERENCE_MISSING',manual:true});
      await activateReference(actor,migration,primary.public_url,oldReference);
      state='activated';
    }
    if(state!=='activated')throw Object.assign(new Error('The migration could not resume from its stored state.'),{code:'MIGRATION_RESUME_STATE_INVALID',manual:true});

    const activatedAt=migration.activated_at||new Date().toISOString();
    const retentionUntil=new Date(Date.now()+Number(policy?.migration_retention_days||30)*86400000).toISOString();
    await actor.admin.from('external_media_objects').update({accounting_state:'active',activated_at:activatedAt,upload_expires_at:null}).eq('media_group_id',groupId).eq('provider',R2_PROVIDER);
    await actor.admin.from('external_media_objects').update({accounting_state:'retained_duplicate',source_retention_until:retentionUntil}).eq('id',migration.source_media_object_id);
    await actor.admin.from('storage_migrations').update({status:'retained_for_rollback',activated_at:activatedAt,switched_at:activatedAt,retain_source_until:retentionUntil,lock_token:null,locked_at:null,locked_by:null,updated_at:activatedAt}).eq('id',migration.id);
    if(reservationId)await actor.admin.rpc('reconcile_storage_reservation',{p_reservation_id:reservationId,p_actual_bytes:actualBytes,p_success:true,p_error:null});
    return{id:migration.id,status:'retained_for_rollback'};
  }catch(error){
    if(rows.length)await cleanupFailedGroup(actor,cfg,rows);
    if(reservationId)await actor.admin.rpc('reconcile_storage_reservation',{p_reservation_id:reservationId,p_actual_bytes:0,p_success:false,p_error:error?.code||'MIGRATION_FAILED'});
    const primaryVariant=R2_MEDIA_CATEGORIES[migration.media_category]?.primaryVariant||'display';
    const primary=rows.find((row)=>row.media_variant===primaryVariant)||rows[0];
    const switched=Boolean(primary?.public_url&&await referenceContains(actor,migration,primary.public_url).catch(()=>false));
    const status=switched||error?.manual?'manual_review':'failed';
    await actor.admin.from('storage_migrations').update({status,last_error_code:error?.code||'MIGRATION_FAILED',last_error_message:String(error?.message||'Migration failed').slice(0,500),manual_review_reason:status==='manual_review'?String(error.message).slice(0,500):null,lock_token:null,locked_at:null,locked_by:null,updated_at:new Date().toISOString()}).eq('id',migration.id);
    return{id:migration.id,status,error:error?.code||'MIGRATION_FAILED'};
  }
}

function xmlValue(value:string){return value.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'");}
async function reconcile(actor:any,cfg:any){
  const {data:policy}=await actor.admin.from('storage_policies').select('reconciliation_recheck_hours').eq('singleton',true).single();
  const recheckAfter=new Date(Date.now()+Number(policy?.reconciliation_recheck_hours||24)*3600000).toISOString();
  const {data:run,error:runError}=await actor.admin.from('storage_reconciliation_runs').insert({requested_by:actor.user.id,status:'running',provider_scope:[R2_PROVIDER]}).select('*').single();
  if(runError)throw runError;
  const findings:any[]=[];
  try{
    const {data:ledger,error,count}=await actor.admin.from('external_media_objects')
      .select('id,external_file_id,public_url,media_group_id,media_variant,status,size_bytes,trusted_size_bytes,accounting_state,verification_status,migration_id,replaces_media_object_id,replaced_by_media_object_id,upload_expires_at',{count:'exact'})
      .eq('provider',R2_PROVIDER).limit(1000);
    if(error)throw error;
    const ledgerTruncated=Number(count||0)>1000;
    const rows=ledger||[];
    const headRows=rows.filter((row:any)=>row.external_file_id).slice(0,200);
    for(const row of headRows){
      if(!safeR2ObjectKey(row.external_file_id)){
        findings.push({finding_identity:`unclassified:${row.id}`,finding_type:'unclassified_provider_object',provider:R2_PROVIDER,severity:'manual_review',media_object_id:row.id,migration_id:row.migration_id,status:'manual_review',recheck_after:recheckAfter,details:{recorded:true}});
        continue;
      }
      const response=await signedR2Request(fetch,cfg,'HEAD',row.external_file_id);
      if(row.status==='deleted'){
        if(response.ok)findings.push({finding_identity:`deleted-present:${row.id}`,finding_type:'deleted_object_present',provider:R2_PROVIDER,severity:'warning',media_object_id:row.id,migration_id:row.migration_id,recheck_after:recheckAfter,details:{providerBytes:Number(response.headers.get('content-length')||0)}});
        continue;
      }
      if(response.status===404)findings.push({finding_identity:`missing:${row.id}`,finding_type:'missing_r2_object',provider:R2_PROVIDER,severity:'critical',media_object_id:row.id,migration_id:row.migration_id,recheck_after:recheckAfter,details:{}});
      else if(response.ok&&Number(response.headers.get('content-length')||0)!==Number(row.trusted_size_bytes||row.size_bytes))findings.push({finding_identity:`size:${row.id}`,finding_type:'incorrect_size',provider:R2_PROVIDER,severity:'warning',media_object_id:row.id,migration_id:row.migration_id,recheck_after:recheckAfter,details:{providerBytes:Number(response.headers.get('content-length')||0),recordedBytes:Number(row.trusted_size_bytes||row.size_bytes)}});
    }
    const activeUrls=new Map<string,any[]>();
    for(const row of rows.filter((item:any)=>item.status==='available'&&item.accounting_state==='active'&&item.public_url))activeUrls.set(row.public_url,[...(activeUrls.get(row.public_url)||[]),row]);
    for(const [url,duplicates] of activeUrls){
      if(duplicates.length>1)findings.push({finding_identity:`duplicate:${await migrationIdentity({path:url})}`,finding_type:'duplicate_active_reference',provider:R2_PROVIDER,severity:'critical',media_object_id:duplicates[0].id,recheck_after:recheckAfter,details:{count:duplicates.length}});
    }
    for(const row of rows.filter((item:any)=>item.status==='error'&&(item.replaces_media_object_id||item.replaced_by_media_object_id))){
      findings.push({finding_identity:`failed-replacement:${row.id}`,finding_type:'failed_replacement',provider:R2_PROVIDER,severity:'warning',media_object_id:row.id,migration_id:row.migration_id,recheck_after:recheckAfter,details:{}});
    }
    for(const row of rows.filter((item:any)=>item.accounting_state==='provisional'&&Date.parse(item.upload_expires_at||'')<=Date.now())){
      findings.push({finding_identity:`provisional:${row.id}`,finding_type:'long_lived_provisional',provider:R2_PROVIDER,severity:'warning',media_object_id:row.id,migration_id:row.migration_id,recheck_after:recheckAfter,details:{}});
    }
    const {data:migrations}=await actor.admin.from('storage_migrations').select('*').eq('destination_provider',R2_PROVIDER).in('status',['activated','retained_for_rollback','queued_for_source_deletion','completed']).limit(100);
    for(const migration of migrations||[]){
      const groupRows=rows.filter((row:any)=>row.media_group_id===migration.destination_media_group_id&&row.status!=='deleted');
      const primaryVariant=R2_MEDIA_CATEGORIES[migration.media_category]?.primaryVariant||'display';
      const primary=groupRows.find((row:any)=>row.media_variant===primaryVariant)||groupRows[0];
      if(primary?.public_url&&!await referenceContains(actor,migration,primary.public_url))findings.push({finding_identity:`not-activated:${migration.id}`,finding_type:'migration_not_activated',provider:R2_PROVIDER,severity:'critical',media_object_id:primary.id,migration_id:migration.id,recheck_after:recheckAfter,details:{}});
    }
    const listResponse=await listR2Objects(fetch,cfg,{maxKeys:1000});
    if(!listResponse.ok)throw Object.assign(new Error('R2 inventory scan failed.'),{code:'R2_LIST_FAILED'});
    const xml=await listResponse.text();
    const listed=[...xml.matchAll(/<Contents>[\s\S]*?<Key>([\s\S]*?)<\/Key>[\s\S]*?<Size>(\d+)<\/Size>[\s\S]*?<\/Contents>/g)].map((match)=>({key:xmlValue(match[1]),size:Number(match[2])}));
    const known=new Set(rows.map((row:any)=>row.external_file_id).filter(Boolean));
    for(const object of listed){
      if(!safeR2ObjectKey(object.key))findings.push({finding_identity:`unclassified-key:${await migrationIdentity({path:object.key})}`,finding_type:'unclassified_provider_object',provider:R2_PROVIDER,severity:'manual_review',status:'manual_review',recheck_after:recheckAfter,details:{sizeBytes:object.size}});
      else if(!ledgerTruncated&&!known.has(object.key))findings.push({finding_identity:`orphan-key:${await migrationIdentity({path:object.key})}`,finding_type:'orphaned_r2_object',provider:R2_PROVIDER,severity:'warning',recheck_after:recheckAfter,details:{sizeBytes:object.size}});
    }
    if(findings.length){const {error:findingError}=await actor.admin.from('storage_reconciliation_findings').insert(findings.map((item)=>({...item,run_id:run.id})));if(findingError)throw findingError;}
    const summary={missing:findings.filter((item)=>item.finding_type.includes('missing')).length,orphaned:findings.filter((item)=>item.finding_type.includes('orphaned')).length,manualReview:findings.filter((item)=>item.status==='manual_review').length,ledgerTruncated,headVerified:headRows.length};
    await actor.admin.from('storage_reconciliation_runs').update({status:'completed',scanned_records:rows.length,scanned_objects:listed.length,finding_count:findings.length,summary,completed_at:new Date().toISOString()}).eq('id',run.id);
    if(headRows.length)await actor.admin.from('external_media_objects').update({last_reconciled_at:new Date().toISOString()}).eq('provider',R2_PROVIDER).in('id',headRows.map((row:any)=>row.id));
    return{runId:run.id,summary,findings:findings.length};
  }catch(error){
    await actor.admin.from('storage_reconciliation_runs').update({status:'failed',error_code:error?.code||'RECONCILIATION_FAILED',error_message:String(error?.message||'Reconciliation failed').slice(0,500),completed_at:new Date().toISOString()}).eq('id',run.id);
    throw error;
  }
}

Deno.serve(async(request)=>{const env=edgeEnvironment();const cors=corsHeaders(request,env.siteOrigin);if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});if(request.method!=='POST')return fail('METHOD_NOT_ALLOWED','Method not allowed.',405,cors);if(!cors['Access-Control-Allow-Origin'])return fail('ORIGIN_NOT_ALLOWED','This request origin is not allowed.',403,cors);const actor=await authenticatedTeamMember(request,env);if('error'in actor)return fail(actor.error,'Only an active Super Admin can manage public-media migration.',actor.status,cors);if(!isSuper(actor))return fail('NOT_AUTHORIZED','Only the Super Admin can manage public-media migration.',403,cors);const cfg=config();if(!cfg.configured)return fail('R2_MEDIA_DISABLED','R2 migration is not configured.',503,cors);const body=cleanBody(await request.json().catch(()=>({})));try{if(body.action==='discover')return reply({success:true,result:await discover(actor,Number(body.limit||50))},200,cors);if(body.action==='process_batch'){const {data:policy}=await actor.admin.from('storage_policies').select('migration_paused,migration_batch_size').eq('singleton',true).single();if(policy?.migration_paused)return fail('MIGRATION_PAUSED','Migration is paused.',409,cors);const workerId=crypto.randomUUID();const {data:jobs,error}=await actor.admin.rpc('claim_public_media_migrations',{p_batch_size:Math.min(Number(body.limit||policy?.migration_batch_size||3),10),p_worker_id:workerId});if(error)throw error;const results=[];for(const job of jobs||[])results.push(await processOne(actor,cfg,job));return reply({success:true,result:{claimed:(jobs||[]).length,results}},200,cors);}if(body.action==='reconcile')return reply({success:true,result:await reconcile(actor,cfg)},200,cors);return fail('ACTION_NOT_ALLOWED','The requested migration action is unavailable.',400,cors);}catch(error){return fail(error?.code||'PUBLIC_MEDIA_MIGRATION_FAILED',String(error?.message||'Public media migration failed.').slice(0,300),500,cors);}});
