import {it,expect,vi} from 'vitest';
import {WebWorkflow,stateSchema,type WorkflowStore} from '../server/web-workflow';
import {workflowProject,workflowResult} from './fixtures/workflow';
function gate(){let release!:()=>void;const promise=new Promise<void>(r=>release=r);return {promise,release};}
it.each((['getProject','getJob','saveProject','applyResult'] as const).flatMap(operation=>['logout','expiry'].map(mode=>({operation,mode}))))('blocks $mode during delayed PG $operation',async ({operation,mode})=>{
 let state=stateSchema.parse({version:1,projects:{},jobs:{}}),pause=false;const entered=gate(),resume=gate();
 const store:WorkflowStore={read:async()=>{const copy=structuredClone(state);if(pause&&operation.startsWith('get')){entered.release();await resume.promise;}return copy;},commit:async(fn,guard)=>{const copy=structuredClone(state),r=fn(copy);if(pause&&!operation.startsWith('get')){entered.release();await resume.promise;}guard?.();state=copy;return r;}};
 const app=new WebWorkflow(store,{kind:'test',resolve:async()=>({subject:'a',accountId:'a',workspaceId:'a',sessionId:'a',expiresAt:Date.now()+60000}),revoke:async()=>{}},{kind:'test',run:async({project,task})=>workflowResult(project,task)});
 try{const p=workflowProject();await app.saveProject('a',p,0);const j=await app.submit('a',{projectId:p.id,expectedRevision:1,task:'rfp',idempotencyKey:'a'});await app.run('a',j.id);const before=JSON.stringify(state);pause=true;
 const pending=operation==='getProject'?app.getProject('a',p.id):operation==='getJob'?app.getJob('a',j.id):operation==='saveProject'?app.saveProject('a',{...p,title:'changed'},1):app.applyResult('a',j.id,1);
 const outcome=pending.then(()=>false,()=>true);await entered.promise;if(mode==='logout')await app.logout('a');else vi.spyOn(Date,'now').mockReturnValue(Date.now()+120000);resume.release();expect(await outcome).toBe(true);expect(JSON.stringify(state)).toBe(before);
 }finally{app.dispose();vi.restoreAllMocks();}
});
it('preserves snapshots after an ordinary edit',async()=>{
 let state=stateSchema.parse({version:1,projects:{},jobs:{}});const store:WorkflowStore={read:()=>structuredClone(state),commit:(fn,g)=>{const d=structuredClone(state),r=fn(d);g?.();state=d;return r;}};
 const app=new WebWorkflow(store,{kind:'test',resolve:async()=>({subject:'a',accountId:'a',workspaceId:'a',sessionId:'a',expiresAt:Date.now()+60000}),revoke:async()=>{}},{kind:'test',run:async({project,task})=>workflowResult(project,task)});
 try{const p=workflowProject();await app.saveProject('a',p,0);const j=await app.submit('a',{projectId:p.id,expectedRevision:1,task:'rfp',idempotencyKey:'a'});await app.run('a',j.id);const applied=await app.applyResult('a',j.id,1);const saved=await app.saveProject('a',{...applied.value,title:'edited'},2);expect(saved.snapshots).toHaveLength(1);expect(saved.snapshots?.[0]).toEqual(p);}finally{app.dispose();vi.restoreAllMocks();}
});
