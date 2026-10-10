import { describe,it,expect } from 'vitest';
import { PostgresWorkflowStore,type PgClient } from '../server/postgres-workflow-store';
import { stateSchema,WebWorkflow } from '../server/web-workflow';
import { workflowProject,workflowResult } from './fixtures/workflow';
function fake(failUpdate=false){
 let state=stateSchema.parse({version:1,projects:{},jobs:{}}),pending=state;const sqls:string[]=[];let releases=0;
 const client:PgClient={release(){releases++;},async query(sql,values){sqls.push(sql);if(sql==='BEGIN')pending=structuredClone(state);if(sql.startsWith('SELECT'))return {rows:[{payload:structuredClone(state)}]};if(sql.startsWith('UPDATE')){if(failUpdate)throw Error('database unavailable');pending=JSON.parse(values![0] as string);}if(sql==='COMMIT')state=pending;return {rows:[]};}};
 return {store:new PostgresWorkflowStore({connect:async()=>client}),sqls,read:()=>state,releases:()=>releases};
}
describe('PostgreSQL adapter transaction contract (mock client, no database connection)',()=>{
 it('uses one connection and row lock for an atomic budget update',async()=>{const f=fake();await f.store.commit(s=>{s.budget.reservations['one']=1;});expect(f.read().budget.reservations.one).toBe(1);expect(f.sqls).toEqual(['BEGIN','SELECT payload FROM ax_workflow_state WHERE id = 1 FOR UPDATE','UPDATE ax_workflow_state SET payload = $1::jsonb WHERE id = 1','COMMIT']);expect(f.releases()).toBe(1);});
 it('rolls back failed persistence and releases its connection',async()=>{const f=fake(true);await expect(f.store.commit(s=>{s.budget.spentUsd=2;})).rejects.toThrow('database unavailable');expect(f.read().budget.spentUsd).toBe(0);expect(f.sqls.at(-1)).toBe('ROLLBACK');expect(f.releases()).toBe(1);});
 it('rechecks cancellation before COMMIT and rolls back staged data',async()=>{const f=fake();await expect(f.store.commit(s=>{s.budget.spentUsd=2;},()=>{throw Error('cancelled');})).rejects.toThrow('cancelled');expect(f.read().budget.spentUsd).toBe(0);expect(f.sqls).not.toContain('COMMIT');expect(f.sqls.at(-1)).toBe('ROLLBACK');});
 it('integrates the async repository with project, execution and explicit review',async()=>{
  const f=fake(),p=workflowProject(),app=new WebWorkflow(f.store,{kind:'test',resolve:async()=>({subject:'a',accountId:'ax',workspaceId:'one',sessionId:'a',expiresAt:Date.now()+60000}),revoke:async()=>{}},{kind:'test',run:async({project,task})=>workflowResult(project,task)});
  try{await app.saveProject('handle',p,0);const j=await app.submit('handle',{projectId:p.id,expectedRevision:1,task:'rfp',idempotencyKey:'one'});expect((await app.run('handle',j.id)).status).toBe('completed');expect((await app.applyResult('handle',j.id,1)).revision).toBe(2);expect((await app.getProject('handle',p.id)).value.workflow?.rfp?.stale).toBe(false);}finally{app.dispose();}
 });
});
