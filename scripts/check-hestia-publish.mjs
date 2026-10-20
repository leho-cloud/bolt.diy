import test from 'node:test';
import assert from 'node:assert/strict';
import {publishHestia} from './hestia-publish.mjs';
const env={HESTIA_PUBLISH_ENABLED:'1',HESTIA_PUBLISH_KEY:'k'.repeat(40),HESTIA_DOMAIN:'test.example'};
const body={operation:'publish',releaseId:'a'.repeat(64),files:[]};
const request=(value=body,key=env.HESTIA_PUBLISH_KEY,extra={})=>new Request('http://internal',{method:'POST',headers:{'content-type':'application/json','x-publish-key':key,...extra},body:JSON.stringify(value)});
test('inspection accepts only an authenticated receipt for the configured domain',async()=>{
 for(const domain of ['test.example','other.example']){
  const response=await publishHestia(request({operation:'inspect',releaseId:'0'.repeat(64)}),{env,receive:async()=>({status:'inspected',domain,releaseId:'b'.repeat(64),files:[]})});
  assert.equal(response.status,domain==='test.example'?200:502);
 }
});
test('Hestia endpoint is disabled by default, authenticates before transport and rejects browser calls',async()=>{
 let calls=0;const receive=async()=>{calls++;};
 for(const [req,settings,status] of [[request(),{},503],[request(body,'wrong'),env,403],[request(body,env.HESTIA_PUBLISH_KEY,{origin:'https://example.com'}),env,403],[request({operation:'delete',releaseId:body.releaseId}),env,400],[request({...body,padding:'a'.repeat(2*1024*1024)}),env,413]])assert.equal((await publishHestia(req,{env:settings,receive})).status,status);
 assert.equal(calls,0);
});
test('activation requires exact target and release receipt; uncertain state never retried',async()=>{
 for(const domain of ['test.example','other.example']){
 let calls=0;const result=await publishHestia(request(),{env,receive:async()=>{calls++;return {status:'activated',domain,releaseId:body.releaseId,files:[]};}});assert.equal(result.status,domain==='test.example'?200:502);assert.equal(calls,1);
 }
});
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
test('file-mounted credential authenticates without exposing it and fails closed if missing',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'hestia-credential-'));const file=join(directory,'key');
 try{
 await writeFile(file,env.HESTIA_PUBLISH_KEY+'\n',{mode:0o600});let calls=0;
 const settings={...env,HESTIA_PUBLISH_KEY:'ignored',HESTIA_PUBLISH_KEY_FILE:file};
 const receive=async()=>{calls++;return {status:'activated',domain:env.HESTIA_DOMAIN,releaseId:body.releaseId,files:[]};};
 const response=await publishHestia(request(),{env:settings,receive});assert.equal(response.status,200);assert.ok(!(await response.text()).includes(env.HESTIA_PUBLISH_KEY));
 assert.equal((await publishHestia(request(),{env:{...settings,HESTIA_PUBLISH_KEY_FILE:join(directory,'missing')},receive})).status,503);assert.equal(calls,1);
 }finally{await rm(directory,{recursive:true,force:true});}
});
