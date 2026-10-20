import {timingSafeEqual} from 'node:crypto';
import {spawn} from 'node:child_process';
import {readFile,stat} from 'node:fs/promises';

export function sshReceive(payload, env) {
  const target=env.HESTIA_SSH_TARGET||'';
  if(!/^[a-z][a-z0-9]{0,30}@(?:[a-z0-9.-]+)$/.test(target)||!env.HESTIA_KEY_FILE||!env.HESTIA_KNOWN_HOSTS_FILE)throw Error('Target not configured');
  return new Promise((resolve,reject)=>{
    const child=spawn('ssh',['-T','-o','BatchMode=yes','-o','IdentitiesOnly=yes','-o','StrictHostKeyChecking=yes','-o','ConnectTimeout=10','-o',`UserKnownHostsFile=${env.HESTIA_KNOWN_HOSTS_FILE}`,'-i',env.HESTIA_KEY_FILE,target],{stdio:['pipe','pipe','pipe']});
    let output='', size=0; const timer=setTimeout(()=>{child.kill('SIGKILL');reject(Error('Uncertain timeout'));},30000);
    child.stdout.on('data',chunk=>{size+=chunk.length;if(size>65536){child.kill();reject(Error('Response too large'));}else output+=chunk;});
    child.stderr.resume(); child.stdin.on('error',()=>{});
    child.on('error',error=>{clearTimeout(timer);reject(error);});
    child.on('close',code=>{clearTimeout(timer);if(code!==0)return reject(Error('Uncertain release state'));try{resolve(JSON.parse(output));}catch{reject(Error('Invalid receipt'));}});
    child.stdin.end(JSON.stringify(payload));
  });
}
export async function publishHestia(request,{env=process.env,receive=sshReceive}={}) {
  if(request.method!=='POST')return Response.json({error:'POST required'},{status:405});
  if(request.headers.has('origin'))return Response.json({error:'Server-to-server only'},{status:403});
  if(env.HESTIA_PUBLISH_ENABLED!=='1')return Response.json({error:'Hestia publishing disabled'},{status:503});
  let key=env.HESTIA_PUBLISH_KEY||'';
  if(env.HESTIA_PUBLISH_KEY_FILE){
    try {const info=await stat(env.HESTIA_PUBLISH_KEY_FILE);if(!info.isFile()||info.size>256)throw Error();key=(await readFile(env.HESTIA_PUBLISH_KEY_FILE,'utf8')).trim();}
    catch{return Response.json({error:'Hestia credential unavailable'},{status:503});}
  }
  const actual=Buffer.from(request.headers.get('x-publish-key')||''), expected=Buffer.from(key);
  if(expected.length<32||actual.length!==expected.length||!timingSafeEqual(actual,expected))return Response.json({error:'Forbidden'},{status:403});
  if(!request.headers.get('content-type')?.startsWith('application/json'))return Response.json({error:'JSON required'},{status:415});
  const chunks=[];let bytes=0;
  for await(const chunk of request.body||[]){bytes+=chunk.length;if(bytes>2*1024*1024)return Response.json({error:'Request too large'},{status:413});chunks.push(Buffer.from(chunk));}
  let body;try{body=JSON.parse(Buffer.concat(chunks));}catch{return Response.json({error:'Invalid JSON'},{status:400});}
  if(!body||!['publish','rollback','inspect'].includes(body.operation)||!(/^[a-f0-9]{64}$/.test(body.releaseId||'')))return Response.json({error:'Invalid release'},{status:400});
  try {
    const receipt=await receive(body,env);
    if(receipt.status!==(body.operation==='inspect'?'inspected':'activated')||receipt.domain!==env.HESTIA_DOMAIN||!(body.operation==='inspect'?/^[a-f0-9]{64}$/.test(receipt.releaseId||''):receipt.releaseId===body.releaseId)||!Array.isArray(receipt.files))throw Error('Unverified receipt');
    return Response.json(receipt);
  }catch{return Response.json({error:'Release state uncertain; inspect target, do not retry automatically.'},{status:502});}
}
