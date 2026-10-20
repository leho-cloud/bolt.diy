import test from 'node:test';
import assert from 'node:assert/strict';
import {publishHestia} from './hestia-publish.mjs';
const env={HESTIA_PUBLISH_ENABLED:'1',HESTIA_PUBLISH_KEY:'k'.repeat(40),HESTIA_DOMAIN:'test.example'};
const body={operation:'publish',releaseId:'a'.repeat(64),files:[]};
const request=(value=body,key=env.HESTIA_PUBLISH_KEY,extra={})=>new Request('http://internal',{method:'POST',headers:{'content-type':'application/json','x-publish-key':key,...extra},body:JSON.stringify(value)});
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
