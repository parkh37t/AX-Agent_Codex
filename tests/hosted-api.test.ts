import { afterEach,describe,expect,it,vi } from 'vitest';
import { request } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHostedApi } from '../server/hosted-api';
import { WebWorkflow,WorkflowFileStore,type WorkflowRunner } from '../server/web-workflow';
import { createResponsesRunner } from '../server/responses-runner';
import type { IdentityAdapter } from '../server/tenant-boundary';
import { workflowProject,workflowResult } from './fixtures/workflow';
const cleanups:Array<()=>Promise<void>|void>=[];afterEach(async()=>{for(const f of cleanups.splice(0).reverse())await f();});
const A='synthetic_session_a',B='synthetic_session_b';
async function setup(identityConfigured=true,runner?:WorkflowRunner){
 const dir=mkdtempSync(join(tmpdir(),'ax-api-'));cleanups.push(()=>rmSync(dir,{recursive:true,force:true}));
 const sessions=new Map([A,B].map(subject=>[subject,{subject,accountId:'ax',workspaceId:'test',sessionId:subject,expiresAt:Date.now()+60000}]));
 const identity:IdentityAdapter={kind:'test',resolve:async h=>sessions.get(h)??null,revoke:async h=>{sessions.delete(h);}};
 const r=runner??{kind:'test' as const,status:()=>({ready:true,reason:'test_only'}),run:vi.fn(async({project,task})=>workflowResult(project,task))};
 const store=new WorkflowFileStore(join(dir,'state.json')),workflow=new WebWorkflow(store,identityConfigured?identity:undefined,r);
 cleanups.push(()=>workflow.dispose());const server=createHostedApi({workflow,runner:r,origin:'https://ax.example',identityConfigured}).listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));cleanups.push(()=>new Promise<void>(resolve=>server.close(()=>resolve())));
 const call=(method:string,path:string,body?:unknown,handle=A,overrides:Record<string,string>={})=>new Promise<{status:number;body:any}>(resolve=>{
  const req=request({hostname:'127.0.0.1',port:(server.address() as AddressInfo).port,path,method,headers:{Host:'ax.example',Origin:'https://ax.example','Content-Type':'application/json','X-AX-Request':'1',Cookie:`__Host-ax-session=${handle}`,...overrides}},res=>{let text='';res.on('data',b=>text+=b);res.on('end',()=>resolve({status:res.statusCode!,body:text?JSON.parse(text):null}));});if(body!==undefined)req.write(JSON.stringify(body));req.end();
 });return {call,store,workflow,runner:r};
}
describe('hosted API composition (loopback synthetic HTTP, no provider)',()=>{
 it('fails closed for missing identity and rejects bad origin, cookie and oversized body',async()=>{
  const f=await setup(false);expect((await f.call('GET','/api/status')).body).toMatchObject({ready:false,reason:'identity_provider_not_configured'});expect((await f.call('GET','/api/projects/id')).status).toBe(503);
  const g=await setup();expect((await g.call('GET','/api/projects/id',undefined,'invalid')).status).toBe(401);expect((await g.call('POST','/api/jobs',{},A,{Origin:'https://evil.example'})).status).toBe(403);expect((await g.call('POST','/api/jobs',{},A,{'X-AX-Request':'0'})).status).toBe(403);expect((await g.call('POST','/api/jobs',{large:'x'.repeat(300000)})).status).toBe(413);
 });
 it('enforces ownership on project and job endpoints and logout',async()=>{
  const f=await setup(),p=workflowProject();expect((await f.call('PUT',`/api/projects/${p.id}`,{project:p,expectedRevision:0})).status).toBe(200);expect((await f.call('GET',`/api/projects/${p.id}`,undefined,B)).status).toBe(404);
  const j=await f.call('POST','/api/jobs',{projectId:p.id,expectedRevision:1,task:'rfp',idempotencyKey:'one'});expect(j.status).toBe(202);
  expect((await f.call('GET',`/api/jobs/${j.body.id}`,undefined,B)).status).toBe(404);expect((await f.call('POST',`/api/jobs/${j.body.id}/cancel`,{},B)).status).toBe(404);expect((await f.call('POST','/api/logout',{})).status).toBe(204);expect((await f.call('GET',`/api/projects/${p.id}`)).status).toBe(401);
 });
 it('completes four mocked Responses stages only after explicit review, retaining snapshots and actual-response usage',async()=>{
  let expected=workflowProject(),task:'rfp'|'strategy'|'proposal'|'design'='rfp',n=0;
  const transport=vi.fn(async()=>Response.json({id:`resp_test_${++n}`,status:'completed',usage:{input_tokens:100,output_tokens:200,total_tokens:300},output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(workflowResult(expected,task))}]}]})) as typeof fetch;
  const runner=createResponsesRunner({enabled:true,model:'synthetic-model',maxRequestBytes:200000,maxOutputTokens:512,maxResponseBytes:2000000,timeoutMs:1000,retries:0,inputUsdPerMillion:0.2,outputUsdPerMillion:1.2},()=> 'synthetic-test-only',transport);
  const f=await setup(true,runner);await f.call('PUT',`/api/projects/${expected.id}`,{project:expected,expectedRevision:0});let revision=1;
  for(task of ['rfp','strategy','proposal','design'] as const){
   const j=await f.call('POST','/api/jobs',{projectId:expected.id,expectedRevision:revision,task,idempotencyKey:task});expect(j.status).toBe(202);
   await vi.waitFor(async()=>expect((await f.call('GET',`/api/jobs/${j.body.id}`)).body.status).toBe('completed'));
   expect((await f.call('GET',`/api/projects/${expected.id}`)).body.revision).toBe(revision);
   const applied=await f.call('POST',`/api/jobs/${j.body.id}/apply`,{expectedRevision:revision});expect(applied.status).toBe(200);revision++;expected=applied.body.value;expect(expected.workflow?.[task]?.stale).toBe(false);
   const job=(await f.call('GET',`/api/jobs/${j.body.id}`)).body;expect(job.usage[0].totalTokens).toBe(300);expect(job.knowledge.length).toBeGreaterThan(0);
   expect((await f.call('POST',`/api/jobs/${j.body.id}/apply`,{expectedRevision:revision})).status).toBe(409);
  }
  expect(expected.screens).toHaveLength(1);expect(expected.generationHistory?.map(h=>h.method)).toEqual(Array(4).fill('operator_api'));expect(transport).toHaveBeenCalledTimes(4);const state=f.store.read();expect(Object.values(state.projects)[0].snapshots).toHaveLength(4);expect(state.budget.spentUsd).toBeGreaterThan(0);expect(Object.keys(state.budget.reservations)).toHaveLength(0);expect(JSON.stringify(state)).not.toContain('synthetic-test-only');
 });
});
