/** Explicit operator-only rehearsal through the existing publisher HTTP server. */
import {createHash,randomBytes} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {createPublisherServer} from './tzsvtav-publisher-server.mjs';
if(process.argv[2]!=='--execute-test'||process.env.HESTIA_DOMAIN!=='hosting-proba.tzsvtav.com')throw Error('Explicit isolated test target required');
const hash=text=>createHash('sha256').update(text).digest('hex');
const css=':root{font-family:system-ui;color:#e4eaf3;background:#192334}body{margin:0;min-height:100vh;display:grid;place-items:center}main{max-width:680px;margin:24px;padding:48px;border:1px solid #53617a;border-radius:24px;background:#243146}small{letter-spacing:.18em;color:#aeb8c9}h1{font-size:clamp(28px,5vw,48px);line-height:1.1;border-left:5px solid #e51d40;padding-left:20px}p{line-height:1.7}.badge{display:inline-block;background:#153f37;color:#adf1d4;padding:8px 14px;border:1px solid #508a74;border-radius:30px}';
function release(version){
 const html=`<!doctype html><html lang="hu"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta name="robots" content="noindex,nofollow"><title>TZSVTAV tárhelypróba</title><link rel="stylesheet" href="/style.css"><main><small>TZSVTAV · ELKÜLÖNÍTETT TÁRHELYPRÓBA</small><h1>A külön tárhely működik.</h1><p>A kész oldal az új Hestia-szerveren fut. A fejlesztő és a publikáló ettől külön marad.</p><p class="badge">${version}. próbaverzió</p><p>HTTPS · ellenőrzött fájlok · visszaállítható kiadás</p></main></html>`;
 const files=[{path:'index.html',content:html},{path:'style.css',content:css}].map(f=>({...f,sha256:hash(f.content)})).sort((a,b)=>a.path.localeCompare(b.path));
 return {operation:'publish',releaseId:hash(files.map(f=>f.path+'\0'+f.sha256+'\n').join('')),files};
}
const env={...process.env,HESTIA_PUBLISH_ENABLED:'1',HESTIA_PUBLISH_KEY:randomBytes(32).toString('hex')};
const server=createPublisherServer({env});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const evidence={domain:env.HESTIA_DOMAIN,startedAt:new Date().toISOString(),transport:'existing-publisher-local-http-to-restricted-ssh',steps:[]};
const first=release(1),second=release(2);
async function run(payload,expected,label){
 const response=await fetch(`http://127.0.0.1:${server.address().port}/api/hestia-publish`,{method:'POST',headers:{'content-type':'application/json','x-publish-key':env.HESTIA_PUBLISH_KEY},body:JSON.stringify(payload),signal:AbortSignal.timeout(40000)});
 const receipt=await response.json();if(!response.ok)throw Error(JSON.stringify(receipt));
 for(const file of expected.files){const page=await fetch(`https://${env.HESTIA_DOMAIN}/${file.path}`,{redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15000)});if(!page.ok||hash(Buffer.from(await page.arrayBuffer()))!==file.sha256)throw Error('Public file mismatch: '+file.path);}
 evidence.steps.push({label,releaseId:receipt.releaseId,previousReleaseId:receipt.previousReleaseId,filesVerified:expected.files.length,httpsVerified:true});
 console.log(label+': HTTPS and file hashes verified');
}
try{await run(first,first,'release-1');await run(second,second,'release-2');await run({operation:'rollback',releaseId:first.releaseId},first,'rollback-to-1');evidence.completedAt=new Date().toISOString();await writeFile(process.env.HESTIA_EVIDENCE_FILE,JSON.stringify(evidence,null,2)+'\n',{mode:0o600});}
finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
