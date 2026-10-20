import {timingSafeEqual} from 'node:crypto';
export async function inspectTarget(request,{env,fetcher=fetch}){
 const key=env.COOLIFY_PUBLISH_KEY,supplied=request.headers.get('x-publish-key')||'';
 if(!key||Buffer.byteLength(key)!==Buffer.byteLength(supplied)||!timingSafeEqual(Buffer.from(key),Buffer.from(supplied)))return Response.json({error:'Unauthorized'},{status:403});
 if(env.TZSVTAV_REQUIRE_NEW_DEVELOPMENT!=='1'||env.COOLIFY_ENVIRONMENT_NAME!=='development')return Response.json({error:'New development scope required'},{status:503});
 const url=new URL(request.url),slug=url.searchParams.get('slug');if(request.method!=='GET'||!/^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/.test(slug||'')||url.searchParams.size!==1)return Response.json({error:'Invalid target'},{status:400});
 try{
  const base=new URL(env.COOLIFY_API_URL);if(!['http:','https:'].includes(base.protocol)||base.username||base.password||base.search||base.hash||!env.COOLIFY_API_TOKEN)throw Error();base.pathname=base.pathname.replace(/\/$/,'').replace(/\/api\/v1$/,'')+'/api/v1/applications';
  const response=await fetcher(base,{method:'GET',redirect:'error',signal:AbortSignal.timeout(10000),headers:{Accept:'application/json',Authorization:'Bearer '+env.COOLIFY_API_TOKEN}});if(!response.ok||!response.headers.get('content-type')?.includes('application/json'))throw Error();
  const reader=response.body.getReader();let size=0;const chunks=[];try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>262144)throw Error();chunks.push(Buffer.from(value));}}finally{await reader.cancel();}
  const raw=JSON.parse(Buffer.concat(chunks).toString('utf8')),rows=Array.isArray(raw)?raw:raw.data;if(!Array.isArray(rows)||rows.some(row=>!row||typeof row!=='object'))throw Error();
  const hostname=slug+'.builder.tzsvtav.com';let occupied=false;
  for(const row of rows)for(const field of ['fqdn','domains'])if(row[field]){if(typeof row[field]!=='string')throw Error();for(const value of row[field].split(',')){if(!value.trim())continue;const target=new URL(/^[a-z]+:/i.test(value.trim())?value.trim():'https://'+value.trim());if(target.hostname===hostname||(target.hostname.startsWith('*.')&&hostname.endsWith(target.hostname.slice(1))))occupied=true;}}
  return Response.json({state:occupied?'occupied':'free',scope:'new-development',hostname});
 }catch{return Response.json({error:'Target not verified'},{status:502});}
}
