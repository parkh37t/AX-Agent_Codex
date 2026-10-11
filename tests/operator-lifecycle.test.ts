import {EventEmitter} from 'node:events';
import {request} from 'node:http';
import type {AddressInfo} from 'node:net';
import express from 'express';
import {afterEach,it,expect,vi} from 'vitest';
import {createOperatorLifecycle,OwnedConnection,lockHeldSql,type LockClient} from '../server/operator-lifecycle';
import {createHostedApi} from '../server/hosted-api';
import {WebWorkflow,stateSchema} from '../server/web-workflow';
import {PostgresWorkflowStore} from '../server/postgres-workflow-store';
import type {Task} from '../shared/domain';
import {workflowProject,workflowResult} from './fixtures/workflow';
const cleanup:Array<()=>void|Promise<void>>=[];afterEach(async()=>{for(const f of cleanup.splice(0).reverse())await f();});
function deferred<T>(){let resolve!:(v:T)=>void;const promise=new Promise<T>(r=>resolve=r);return {promise,resolve};}
function database(){
 let owner:Client|string|null=null,state=stateSchema.parse({version:1,projects:{},jobs:{}});const events:string[]=[];let next=0;
 class Client extends EventEmitter implements LockClient {
  id=++next;dead=false;draft:typeof state|undefined;
  async query(sql:string,values?:unknown[]){if(this.dead)throw Error('closed');events.push(`${this.id}:${sql}`);
   if(sql.includes('pg_try_advisory_lock')){if(owner===null)owner=this;return {rows:[{locked:owner===this}]};}
   if(sql===lockHeldSql)return {rows:[{locked:owner===this}]};
   if(owner!==this)throw Error('unowned SQL');
   if(sql==='BEGIN')this.draft=structuredClone(state);
   if(sql.startsWith('SELECT payload'))return {rows:[{payload:structuredClone(this.draft??state)}]};
   if(sql.startsWith('UPDATE ax_workflow_state'))this.draft=JSON.parse(values![0] as string);
   if(sql==='COMMIT'){if(this.draft)state=this.draft;this.draft=undefined;}
   if(sql==='ROLLBACK')this.draft=undefined;
   return {rows:[]};
  }
  release(destroy=false){if(destroy){this.dead=true;this.draft=undefined;if(owner===this)owner=null;}events.push(`${this.id}:release:${destroy}`);}
  die(kind='error'){this.dead=true;this.draft=undefined;if(owner===this)owner=null;this.emit(kind);}
 }
 return {pool:{connect:async()=>new Client()},events,read:()=>state,leader:()=>owner as Client,block:()=>{owner='legacy';},unlock:()=>{owner=null;}};
}
async function listen(lifecycle:ReturnType<typeof createOperatorLifecycle>){const server=lifecycle.app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));cleanup.push(()=>new Promise<void>(r=>{lifecycle.stop();server.close(()=>r());}));lifecycle.start();return (path:string)=>new Promise<{status:number;body:any}>(resolve=>{request({hostname:'127.0.0.1',port:(server.address() as AddressInfo).port,path,headers:{Host:'ax.example',Origin:'https://ax.example',Cookie:'__Host-ax-session=synthetic_session'}},res=>{let data='';res.on('data',b=>data+=b);res.on('end',()=>resolve({status:res.statusCode!,body:JSON.parse(data)}));}).end();});}
it('two live HTTP instances hand off ownership before recovery; old abort-ignoring work cannot commit',async()=>{
 const db=database(),gate=deferred<unknown>();let first!:WebWorkflow,second!:WebWorkflow;let firstCalls=0,secondCalls=0;const identity={kind:'test' as const,resolve:async()=>({subject:'A',accountId:'ax',workspaceId:'personal',sessionId:'s',expiresAt:Date.now()+60000}),revoke:async()=>{}};
 const build=(which:number)=>async(pool:OwnedConnection)=>{which===1?firstCalls++:secondCalls++;const runner={kind:'test' as const,status:()=>({ready:true,reason:'test_only'}),run:async({project,task}:{project:ReturnType<typeof workflowProject>;task:Task})=>which===1?gate.promise:workflowResult(project,task)};const workflow=new WebWorkflow(new PostgresWorkflowStore(pool),identity,runner);if(which===1)first=workflow;else second=workflow;await workflow.storageReady();const app=createHostedApi({workflow,runner,origin:'https://ax.example',identityConfigured:true});return {app,shutdown:()=>workflow.dispose()};};
 const old=createOperatorLifecycle({pool:db.pool,activate:build(1),retryMs:5,heartbeatMs:20}),oldHttp=await listen(old);await vi.waitFor(()=>expect(old.status().phase).toBe('active'));
 const p=workflowProject();await first.saveProject('session',p,0);const job=await first.submit('session',{projectId:p.id,expectedRevision:1,task:'rfp',idempotencyKey:'old'});const running=first.run('session',job.id).catch(()=>undefined);await vi.waitFor(()=>expect(db.read().jobs[job.id].status).toBe('running'));
 const fresh=createOperatorLifecycle({pool:db.pool,activate:build(2),retryMs:5,heartbeatMs:20}),freshHttp=await listen(fresh);
 expect((await freshHttp('/health/live')).status).toBe(200);expect((await freshHttp('/api/status')).body).toMatchObject({ready:false,phase:'standby'});expect((await freshHttp('/health/ready')).status).toBe(503);expect((await freshHttp('/api/projects')).status).toBe(503);expect((await freshHttp('/auth/login')).status).toBe(503);expect(secondCalls).toBe(0);expect(db.read().jobs[job.id].status).toBe('running');
 // Simulate Render retiring the previous deployment after the new liveness succeeds.
 old.stop();expect((await oldHttp('/health/live')).status).toBe(503);await vi.waitFor(()=>expect(fresh.status().phase).toBe('active'));
 expect(firstCalls).toBe(1);expect(secondCalls).toBe(1);expect((await freshHttp('/health/ready')).status).toBe(200);expect((await freshHttp('/api/projects')).body[0].id).toBe(p.id);expect(db.read().jobs[job.id]).toMatchObject({status:'failed',error:'interrupted_restart'});
 gate.resolve(workflowResult(p,'rfp'));await running;expect(db.read().jobs[job.id].result).toBeUndefined();
 const next=await second.submit('session',{projectId:p.id,expectedRevision:1,task:'rfp',idempotencyKey:'new'});await second.run('session',next.id);expect(db.read().jobs[next.id].status).toBe('completed');
});
it.each(['error','end'])('lock connection %s fails closed and aborts active execution without reacquisition',async kind=>{
 const db=database();let signal!:AbortSignal;const shutdown=vi.fn();const lifecycle=createOperatorLifecycle({pool:db.pool,activate:async(_pool,s)=>{signal=s;return {app:express(),shutdown};},retryMs:5,heartbeatMs:20});const http=await listen(lifecycle);await vi.waitFor(()=>expect(lifecycle.status().phase).toBe('active'));db.leader().die(kind);expect(signal.aborted).toBe(true);expect(shutdown).toHaveBeenCalledTimes(1);expect((await http('/health/live')).status).toBe(503);expect((await http('/api/jobs')).status).toBe(503);await new Promise(r=>setTimeout(r,30));expect(lifecycle.status().phase).toBe('failed');
});
it('heartbeat detects a missing advisory lock and closes the owned SQL session',async()=>{
 const db=database();let pool!:OwnedConnection;const lifecycle=createOperatorLifecycle({pool:db.pool,heartbeatMs:5,activate:async p=>{pool=p;return {app:express(),shutdown(){}};}});await listen(lifecycle);await vi.waitFor(()=>expect(lifecycle.status().phase).toBe('active'));db.unlock();await vi.waitFor(()=>expect(lifecycle.status().phase).toBe('failed'));await expect(pool.connect()).rejects.toThrow('ownership_lost');
});
it('standby timeout is bounded and never initializes recovery or business routes',async()=>{
 const db=database();db.block();const activate=vi.fn();const lifecycle=createOperatorLifecycle({pool:db.pool,activate,retryMs:5,standbyTimeoutMs:40});const http=await listen(lifecycle);expect((await http('/health/live')).status).toBe(200);await vi.waitFor(()=>expect(lifecycle.status().phase).toBe('failed'));expect(activate).not.toHaveBeenCalled();expect((await http('/health/live')).status).toBe(503);
});
it('ownership loss during initialization prevents late activation',async()=>{
 const db=database(),gate=deferred<{app:express.Express;shutdown:()=>void}>(),shutdown=vi.fn();const lifecycle=createOperatorLifecycle({pool:db.pool,activate:()=>gate.promise});const http=await listen(lifecycle);await vi.waitFor(()=>expect(lifecycle.status().phase).toBe('initializing'));expect((await http('/health/ready')).status).toBe(503);db.leader().die();gate.resolve({app:express(),shutdown});await vi.waitFor(()=>expect(shutdown).toHaveBeenCalled());expect(lifecycle.status().phase).toBe('failed');
});
it('serializes transaction checkouts on the lock session and rejects queued/late SQL on loss',async()=>{
 const db=database(),client=await db.pool.connect();await client.query('SELECT pg_try_advisory_lock(418023761) AS locked');let owned!:OwnedConnection;owned=new OwnedConnection(client,()=>owned.close());const first=await owned.connect();await first.query('BEGIN');let entered=false;const second=owned.connect().then(c=>{entered=true;return c;});await Promise.resolve();expect(entered).toBe(false);await first.query('COMMIT');first.release();const c=await second;expect(entered).toBe(true);const waiting=owned.connect();const rejected=expect(waiting).rejects.toThrow('ownership_lost');owned.close();await rejected;await expect(c.query('UPDATE ax_workflow_state SET payload=$1',[])).rejects.toThrow('ownership_lost');c.release();expect(client.dead).toBe(true);
});
it('emits only fixed transition codes for standby, ownership and readiness',async()=>{
 const db=database(),lines:string[]=[];const lifecycle=createOperatorLifecycle({pool:db.pool,onTransition:(phase,reason)=>lines.push(`AX worker ${phase}: ${reason}`),activate:async()=>({app:express(),shutdown(){}})});await listen(lifecycle);await vi.waitFor(()=>expect(lifecycle.status().phase).toBe('active'));expect(lines).toEqual(['AX worker standby: waiting_for_worker_lock','AX worker initializing: worker_lock_acquired','AX worker active: worker_ready']);lifecycle.stop();expect(lines.at(-1)).toBe('AX worker stopped: worker_stopped');
});
it('initialization failure emits a fixed safe code without raw error values',async()=>{
 const db=database(),lines:string[]=[];const lifecycle=createOperatorLifecycle({pool:db.pool,onTransition:(phase,reason)=>lines.push(`AX worker ${phase}: ${reason}`),activate:async()=>{throw Error('synthetic-sensitive-payload');}});const http=await listen(lifecycle);await vi.waitFor(()=>expect(lifecycle.status().phase).toBe('failed'));expect(lines.at(-1)).toBe('AX worker failed: worker_initialization_failed');expect(JSON.stringify(lines)).not.toContain('synthetic-sensitive-payload');expect(JSON.stringify((await http('/api/status')).body)).not.toContain('synthetic-sensitive-payload');
});
