import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WebWorkflow, WorkflowFileStore, type WorkflowRunner } from '../server/web-workflow';
import { type IdentityAdapter } from '../server/tenant-boundary';
import { workflowProject, workflowResult, throughProposal } from './fixtures/workflow';
import { recordVerification } from '../shared/domain';
const cleanup:Array<()=>void>=[];
afterEach(()=>{cleanup.splice(0).reverse().forEach(f=>f());vi.useRealTimers();vi.unstubAllEnvs();});
function fixture(runner?:WorkflowRunner,persist?:ConstructorParameters<typeof WorkflowFileStore>[1]) {
 const dir=mkdtempSync(join(tmpdir(),'ax-web-flow-'));cleanup.push(()=>rmSync(dir,{recursive:true,force:true}));const file=join(dir,'state.json');
 const sessions=new Map(['a','b'].map(subject=>[subject,{subject,accountId:'account',workspaceId:'workspace',sessionId:'same-session-id',expiresAt:Date.now()+60000}]));
 const identity:IdentityAdapter={kind:'test',resolve:async h=>sessions.get(h)??null,revoke:async h=>{sessions.delete(h);}};
 const run=vi.fn(async({project,task})=>workflowResult(project,task));
 const store=new WorkflowFileStore(file,persist),app=new WebWorkflow(store,identity,runner??{kind:'test',run});cleanup.push(()=>app.dispose());
 const p=workflowProject(),input={projectId:p.id,expectedRevision:1,task:'rfp' as const,idempotencyKey:'one'};
 return {app,store,file,p,input,run,identity,sessions};
}
function deferred() {let resolve!:(v:unknown)=>void;const promise=new Promise(r=>{resolve=r;});const started=vi.fn();return {resolve,promise,started,runner:{kind:'test' as const,run:async()=>{started();return promise;}}};}
async function started(d:ReturnType<typeof deferred>){await vi.waitFor(()=>expect(d.started).toHaveBeenCalled());}
describe('unmounted web workflow with durable single-process store and test adapters',()=>{
 it('stores validated results separately from the unchanged project',async()=>{
  const f=fixture();await f.app.saveProject('a',f.p,0);const j=await f.app.submit('a',f.input);await f.app.run('a',j.id);
  expect((await f.app.getJob('a',j.id)).status).toBe('completed');expect((await f.app.getJob('a',j.id)).result?.rfp).toBeTruthy();
  expect((await f.app.getProject('a',f.p.id)).value).toEqual(f.p);expect(f.run).toHaveBeenCalledTimes(1);
  const reopened=new WebWorkflow(new WorkflowFileStore(f.file),f.identity,{kind:'test',run:f.run});cleanup.push(()=>reopened.dispose());expect((await reopened.getJob('a',j.id)).status).toBe('completed');
  expect(readFileSync(f.file,'utf8')).not.toContain('expiresAt');
 });
 it('isolates identical project IDs and rejects foreign job reads and cancellation',async()=>{
  const f=fixture();await f.app.saveProject('a',f.p,0);await f.app.saveProject('b',{...f.p,title:'B'},0);const j=await f.app.submit('a',f.input);
  expect((await f.app.getProject('a',f.p.id)).value.title).toBe(f.p.title);expect((await f.app.getProject('b',f.p.id)).value.title).toBe('B');
  await expect(f.app.getJob('b',j.id)).rejects.toMatchObject({status:404});await expect(f.app.cancel('b',j.id)).rejects.toMatchObject({status:404});await expect(f.app.run('b',j.id)).rejects.toMatchObject({status:404});
 });
 it('deduplicates requests and refuses reusing a key with changed input or rerunning completed jobs',async()=>{
  const f=fixture();await f.app.saveProject('a',f.p,0);const [a,b]=await Promise.all([f.app.submit('a',f.input),f.app.submit('a',f.input)]);expect(a.id).toBe(b.id);
  await expect(f.app.submit('a',{...f.input,task:'strategy'})).rejects.toMatchObject({status:409});await f.app.run('a',a.id);await expect(f.app.run('a',a.id)).rejects.toMatchObject({status:409});expect(f.run).toHaveBeenCalledTimes(1);
 });
 it('rejects stale writes and prevents late results overwriting a changed revision',async()=>{
  const d=deferred(),f=fixture(d.runner);await f.app.saveProject('a',f.p,0);await expect(f.app.saveProject('a',f.p,0)).rejects.toMatchObject({status:409});
  const j=await f.app.submit('a',f.input),running=f.app.run('a',j.id);await started(d);await f.app.saveProject('a',{...f.p,title:'edited'},1);d.resolve(workflowResult(f.p,'rfp'));await running;
  expect(await f.app.getJob('a',j.id)).toMatchObject({status:'failed',error:'revision_conflict'});expect((await f.app.getJob('a',j.id)).result).toBeUndefined();expect((await f.app.getProject('a',f.p.id)).value.title).toBe('edited');
 });
 it.each(['cancel','logout','expiry'] as const)('rejects late results after %s even when the runner ignores abort',async mode=>{
  const d=deferred(),f=fixture(d.runner);await f.app.saveProject('a',f.p,0);const j=await f.app.submit('a',f.input),running=f.app.run('a',j.id);await started(d);
  if(mode==='cancel')await f.app.cancel('a',j.id);if(mode==='logout')await f.app.logout('a');if(mode==='expiry')f.sessions.get('a')!.expiresAt=0;
  d.resolve(workflowResult(f.p,'rfp'));await running;const saved=f.store.read().jobs[j.id];expect(saved.status).not.toBe('completed');expect(saved.result).toBeUndefined();
 });
 it('preserves the last committed project if persistence fails',async()=>{
  let fail=false;
  const f=fixture(undefined,(file,bytes)=>{if(fail)throw new Error('disk unavailable');requireWrite(file,bytes);});
  await f.app.saveProject('a',f.p,0);const bytes=readFileSync(f.file,'utf8');fail=true;
  await expect(f.app.saveProject('a',{...f.p,title:'lost'},1)).rejects.toThrow('disk unavailable');expect((await f.app.getProject('a',f.p.id)).revision).toBe(1);expect(readFileSync(f.file,'utf8')).toBe(bytes);
 });
 it('does not call the runner if persisting running state fails',async()=>{
  let fail=false;const f=fixture(undefined,(file,bytes)=>{if(fail)throw new Error('disk unavailable');requireWrite(file,bytes);});await f.app.saveProject('a',f.p,0);const j=await f.app.submit('a',f.input);fail=true;
  await expect(f.app.run('a',j.id)).rejects.toThrow('disk unavailable');expect(f.run).not.toHaveBeenCalled();expect(f.store.read().jobs[j.id].status).toBe('queued');
 });
 it('marks interrupted work failed on restart without automatic reexecution',async()=>{
  const f=fixture();await f.app.saveProject('a',f.p,0);const j=await f.app.submit('a',f.input);f.store.commit(s=>{s.jobs[j.id].status='running';});
  const restarted=new WebWorkflow(new WorkflowFileStore(f.file),f.identity,{kind:'test',run:f.run});cleanup.push(()=>restarted.dispose());expect(await restarted.getJob('a',j.id)).toMatchObject({status:'failed',error:'interrupted_restart'});expect(f.run).not.toHaveBeenCalled();
 });
 it('allows only one concurrent execution of a queued job',async()=>{
  const d=deferred();let signal:AbortSignal|undefined;
  const f=fixture({kind:'test',run:async(i,o)=>{signal=o.signal;return d.runner.run();}});await f.app.saveProject('a',f.p,0);const j=await f.app.submit('a',f.input);
  const first=f.app.run('a',j.id),second=f.app.run('a',j.id);
  await expect(second).rejects.toMatchObject({status:409});await started(d);await f.app.cancel('a',j.id);expect(signal?.aborted).toBe(true);d.resolve(workflowResult(f.p,'rfp'));await first;expect(d.started).toHaveBeenCalledTimes(1);
 });
 it('does not expose a completed result if saving it fails and recovers interrupted state',async()=>{
  let fail=false;const d=deferred(),f=fixture(d.runner,(file,bytes)=>{if(fail)throw new Error('disk unavailable');requireWrite(file,bytes);});
  await f.app.saveProject('a',f.p,0);const j=await f.app.submit('a',f.input),running=f.app.run('a',j.id);await started(d);fail=true;d.resolve(workflowResult(f.p,'rfp'));
  await expect(running).rejects.toThrow('disk unavailable');expect(f.store.read().jobs[j.id].result).toBeUndefined();expect(JSON.parse(readFileSync(f.file,'utf8')).jobs[j.id].result).toBeUndefined();
  const recovered=new WebWorkflow(new WorkflowFileStore(f.file),f.identity,{kind:'test',run:f.run});cleanup.push(()=>recovered.dispose());expect((await recovered.getJob('a',j.id)).error).toBe('interrupted_restart');
 });
 it('fails closed without official adapters and rejects production test runners',async()=>{
  const f=fixture(),closed=new WebWorkflow(f.store);await expect(closed.submit('a',f.input)).rejects.toMatchObject({status:503});await expect(closed.getProject('a',f.p.id)).rejects.toMatchObject({status:503});
  vi.stubEnv('NODE_ENV','production');expect(()=>new WebWorkflow(f.store,undefined,{kind:'test',run:f.run})).toThrow(/Test runner/);
 });
 it('aborts despite cancellation persistence failure and blocks late completion after storage recovers',async()=>{
  let fail=false,signal:AbortSignal|undefined;const d=deferred();
  const f=fixture({kind:'test',run:async(i,o)=>{signal=o.signal;return d.runner.run();}},(file,bytes)=>{if(fail)throw new Error('disk unavailable');requireWrite(file,bytes);});
  await f.app.saveProject('a',f.p,0);const j=await f.app.submit('a',f.input),running=f.app.run('a',j.id);await started(d);fail=true;
  await expect(f.app.cancel('a',j.id)).rejects.toThrow('disk unavailable');expect(signal?.aborted).toBe(true);
  expect(f.store.read().jobs[j.id].status).toBe('running');fail=false;d.resolve(workflowResult(f.p,'rfp'));await running;
  expect(await f.app.getJob('a',j.id)).toMatchObject({status:'cancelled'});expect(f.store.read().jobs[j.id].result).toBeUndefined();
 });
 it('keeps an unpersisted queued cancellation sticky until restart recovery',async()=>{
  let fail=false;const f=fixture(undefined,(file,bytes)=>{if(fail)throw new Error('disk unavailable');requireWrite(file,bytes);});await f.app.saveProject('a',f.p,0);const j=await f.app.submit('a',f.input);fail=true;
  await expect(f.app.cancel('a',j.id)).rejects.toThrow('disk unavailable');fail=false;await expect(f.app.run('a',j.id)).rejects.toMatchObject({status:409});expect(f.run).not.toHaveBeenCalled();
  const recovered=new WebWorkflow(new WorkflowFileStore(f.file),f.identity,{kind:'test',run:f.run});cleanup.push(()=>recovered.dispose());expect(await recovered.getJob('a',j.id)).toMatchObject({status:'failed',error:'interrupted_restart'});
 });
 it('retains no result when cancellation and failure-state persistence both fail before restart',async()=>{
  let fail=false;const d=deferred(),f=fixture(d.runner,(file,bytes)=>{if(fail)throw new Error('disk unavailable');requireWrite(file,bytes);});await f.app.saveProject('a',f.p,0);const j=await f.app.submit('a',f.input),running=f.app.run('a',j.id);await started(d);fail=true;
  await expect(f.app.cancel('a',j.id)).rejects.toThrow('disk unavailable');d.resolve(workflowResult(f.p,'rfp'));await expect(running).rejects.toThrow('disk unavailable');
  expect(JSON.parse(readFileSync(f.file,'utf8')).jobs[j.id].result).toBeUndefined();f.app.dispose();
  const recovered=new WebWorkflow(new WorkflowFileStore(f.file),f.identity,{kind:'test',run:f.run});cleanup.push(()=>recovered.dispose());expect(await recovered.getJob('a',j.id)).toMatchObject({status:'failed',error:'interrupted_restart'});expect((await recovered.getJob('a',j.id)).result).toBeUndefined();
 });
 it('rejects fabricated source evidence without storing a result',async()=>{
  const f=fixture({kind:'test',run:async({project})=>{const r=workflowResult(project,'rfp');r.rfp!.items[0].quote='invented';return r;}});await f.app.saveProject('a',f.p,0);const j=await f.app.submit('a',f.input);await f.app.run('a',j.id);expect((await f.app.getJob('a',j.id)).status).toBe('failed');expect((await f.app.getJob('a',j.id)).result).toBeUndefined();
 });
 it('treats imported workflow and acceptance records as stale history, never current approval',async()=>{
  const f=fixture();const imported=recordVerification(throughProposal(),{requirementId:'internal:REQ-1',result:'pass',method:'document_review',reviewer:'synthetic',evidence:'imported claim'});
  const saved=await f.app.saveProject('a',imported,0);expect(saved.value.workflow?.rfp?.stale).toBe(true);expect(saved.value.workflow?.strategy?.stale).toBe(true);expect(saved.value.verifications?.[0].invalidated).toBe(true);
  await expect(f.app.submit('a',{...f.input,projectId:imported.id,task:'design'})).rejects.toMatchObject({status:400});
 });
 it('limits distinct pending jobs globally and per user, even with different keys',async()=>{
  const f=fixture();await f.app.saveProject('a',f.p,0);await f.app.saveProject('b',f.p,0);const j=await f.app.submit('a',f.input);
  await expect(f.app.submit('a',{...f.input,idempotencyKey:'two'})).rejects.toMatchObject({status:429});await expect(f.app.submit('b',f.input)).rejects.toMatchObject({status:429});
  await f.app.cancel('a',j.id);expect((await f.app.submit('b',f.input)).status).toBe('queued');
 });
 it('enforces daily request limits across completed jobs',async()=>{
  const f=fixture();const limited=new WebWorkflow(f.store,f.identity,{kind:'test',run:f.run},{maxConcurrent:1,maxConcurrentPerUser:1,maxRequestsPerUserPerDay:1});cleanup.push(()=>limited.dispose());
  await limited.saveProject('a',f.p,0);const j=await limited.submit('a',f.input);await limited.run('a',j.id);await expect(limited.submit('a',{...f.input,idempotencyKey:'two'})).rejects.toMatchObject({status:429});
 });
 it('reserves budget before a call, retains ambiguous reservations and blocks additional spending after restart',async()=>{
  const f=fixture({kind:'test',run:async(_i,o)=>{await o.reserveBudget!(3.5);throw new Error('ambiguous network failure');}});await f.app.saveProject('a',f.p,0);const a=await f.app.submit('a',f.input);await f.app.run('a',a.id);expect(Object.values(f.store.read().budget.reservations)).toEqual([3.5]);
  const r=new WebWorkflow(new WorkflowFileStore(f.file),f.identity,{kind:'test',run:async(_i,o)=>{await o.reserveBudget!(1);throw Error('must not reach execution');}});cleanup.push(()=>r.dispose());const b=await r.submit('a',{...f.input,idempotencyKey:'two'});expect((await r.run('a',b.id)).error).toBe('Test budget exhausted');
 });
 it('keeps actual reported usage even when artifact validation fails',async()=>{
  const f=fixture({kind:'test',run:async(_i,o)=>{const id=await o.reserveBudget!(1);await o.onUsage!({responseId:'resp_usage',model:'synthetic',inputTokens:10,outputTokens:20,totalTokens:30,estimatedUsd:0.1},id);return {};}});await f.app.saveProject('a',f.p,0);const j=await f.app.submit('a',f.input);const job=await f.app.run('a',j.id);expect(job.status).toBe('failed');expect(job.usage?.[0].totalTokens).toBe(30);expect(f.store.read().budget.spentUsd).toBe(0.1);expect(Object.keys(f.store.read().budget.reservations)).toHaveLength(0);
 });
 it('fails closed when asynchronous persistent storage cannot initialize',async()=>{
  const f=fixture();const app=new WebWorkflow({read:async()=>{throw Error('private database error');},commit:async()=>{throw Error('private database error');}},f.identity,{kind:'test',run:f.run});cleanup.push(()=>app.dispose());expect(await app.storageReady()).toBe(false);await expect(app.getProject('a','id')).rejects.toMatchObject({status:503,message:'storage_unavailable'});expect(f.run).not.toHaveBeenCalled();
 });
 it('invalidates stored approvals on changed source despite forged client flags and keeps invalidation sticky',async()=>{
  const f=fixture();const trusted=recordVerification(throughProposal(),{requirementId:'internal:REQ-1',result:'pass',method:'document_review',reviewer:'server-review-fixture',evidence:'trusted synthetic review'});
  await f.app.saveProject('a',trusted,0);
  // Simulate an independently trusted server review, not the untrusted save/import operation.
  f.store.commit(s=>{Object.values(s.projects)[0].value=structuredClone(trusted);});
  const edited=structuredClone(trusted);edited.sources[0].text+=' Changed source';
  const saved=await f.app.saveProject('a',edited,1);expect(saved.value.workflow?.rfp?.stale).toBe(true);expect(saved.value.workflow?.proposal?.stale).toBe(true);expect(saved.value.verifications?.[0].invalidated).toBe(true);
  await expect(f.app.submit('a',{...f.input,projectId:trusted.id,expectedRevision:2,task:'design'})).rejects.toMatchObject({status:400});
  const reverted=await f.app.saveProject('a',trusted,2);expect(reverted.value.workflow?.rfp?.stale).toBe(true);expect(reverted.value.verifications?.[0].invalidated).toBe(true);
 });
 it('preserves server verification history and invalidates new client records even without content changes',async()=>{
  const f=fixture();const p=recordVerification(throughProposal(),{requirementId:'internal:REQ-1',result:'fail',method:'document_review',reviewer:'server-review-fixture',evidence:'trusted synthetic failure'});await f.app.saveProject('a',p,0);f.store.commit(s=>{Object.values(s.projects)[0].value=structuredClone(p);});
  const modified=structuredClone(p);modified.verifications![0].result='pass';modified.verifications!.push({...p.verifications![0],id:'client-new',result:'pass',invalidated:false});
  const saved=await f.app.saveProject('a',modified,1);expect(saved.value.verifications?.[0]).toEqual(p.verifications![0]);expect(saved.value.verifications?.[1]).toMatchObject({id:'client-new',invalidated:true});expect(saved.value.workflow).toEqual(p.workflow);
 });
});
import { writeFileSync } from 'node:fs';
function requireWrite(file:string,bytes:string){writeFileSync(file,bytes,{mode:0o600});}
it('retains the concurrency slot until an abort-ignoring runner exits',async()=>{
 const d=deferred(),f=fixture(d.runner);await f.app.saveProject('a',f.p,0);const j=await f.app.submit('a',f.input),running=f.app.run('a',j.id);await started(d);await f.app.cancel('a',j.id);await expect(f.app.submit('b',{...f.input,idempotencyKey:'two'})).rejects.toMatchObject({status:429});d.resolve(workflowResult(f.p,'rfp'));await running;expect((await f.app.submit('a',{...f.input,idempotencyKey:'three'})).status).toBe('queued');
});
