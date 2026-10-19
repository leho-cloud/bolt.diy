import {timingSafeEqual} from 'node:crypto';
const id=value=>typeof value==='string'&&/^[a-z0-9_-]{1,100}$/i.test(value);
export async function inspectCoolify(request,{env,fetcher=fetch}){
 const key=env.COOLIFY_PUBLISH_KEY,supplied=request.headers.get('x-publish-key')||'';
 if(!key||Buffer.byteLength(key)!==Buffer.byteLength(supplied)||!timingSafeEqual(Buffer.from(key),Buffer.from(supplied)))return Response.json({error:'Unauthorized'},{status:403});
 const url=new URL(request.url),appId=url.searchParams.get('application'),deploymentId=url.searchParams.get('deployment');
 if(request.method!=='GET'||!id(appId)||(deploymentId!==null&&!id(deploymentId))||[...url.searchParams.keys()].some(x=>!['application','deployment'].includes(x)))return Response.json({error:'Invalid read request'},{status:400});
 try{
  const base=new URL(env.COOLIFY_API_URL);if(!['http:','https:'].includes(base.protocol)||base.username||base.password||base.search||base.hash||!env.COOLIFY_API_TOKEN)throw Error();
  base.pathname=base.pathname.replace(/\/$/,'').replace(/\/api\/v1$/,'')+'/api/v1/';
  const get=async path=>{const r=await fetcher(new URL(path,base),{method:'GET',redirect:'error',signal:AbortSignal.timeout(10000),headers:{Accept:'application/json',Authorization:'Bearer '+env.COOLIFY_API_TOKEN}});if(!r.ok||!r.headers.get('content-type')?.includes('application/json'))throw Error();const reader=r.body.getReader();let size=0;const chunks=[];try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>262144)throw Error();chunks.push(Buffer.from(value));}}finally{await reader.cancel();}return JSON.parse(Buffer.concat(chunks).toString('utf8'));};
  const app=await get('applications/'+appId);if(app.uuid!==appId)throw Error();
  const pick=(value,keys)=>Object.fromEntries(keys.filter(k=>['string','number','boolean'].includes(typeof value?.[k])).map(k=>[k,value[k]]));
  const application=pick(app,['id','uuid','git_repository','git_branch','git_commit_sha','build_pack','is_static','is_auto_deploy_enabled','fqdn','status','environment_id']);
  application.settings=pick(app.settings,['is_static','is_auto_deploy_enabled','is_preview_deployments_enabled']);
  let deployment=null;
  if(deploymentId){const dep=await get('deployments/'+deploymentId);if(dep.deployment_uuid!==deploymentId||String(dep.application_id)!==String(app.id))throw Error();deployment=pick(dep,['deployment_uuid','application_id','commit','status']);}
  return Response.json({application,deployment});
 }catch{return Response.json({error:'Read result not verified'},{status:502});}
}
