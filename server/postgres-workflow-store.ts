import { stateSchema, type State, type WorkflowStore } from './web-workflow';
/** Compatible with a node-postgres Pool. Construction does not connect or create an account. */
export interface PgClient { query(sql:string,values?:unknown[]):Promise<{rows:Array<Record<string,unknown>>}>; release():void; }
export interface PgPool { connect():Promise<PgClient>; }
/** Small-test single-worker JSONB repository; transactions serialize data/budget updates across requests. */
export class PostgresWorkflowStore implements WorkflowStore {
 constructor(private pool:PgPool){}
 // Schema is provisioned explicitly by an operator, never as an import/startup side effect.
 static readonly schemaSql=`CREATE TABLE ax_workflow_state (id integer PRIMARY KEY CHECK (id = 1), payload jsonb NOT NULL);
INSERT INTO ax_workflow_state (id,payload) VALUES (1,'{"version":1,"projects":{},"jobs":{},"budget":{"limitUsd":4,"spentUsd":0,"reservations":{}}}');`;
 async read():Promise<State>{const c=await this.pool.connect();try{const r=await c.query('SELECT payload FROM ax_workflow_state WHERE id = 1');return stateSchema.parse(r.rows[0]?.payload);}finally{c.release();}}
 async commit<T>(fn:(draft:State)=>T,beforeCommit?:()=>void):Promise<T>{
  const c=await this.pool.connect();
  try {
   await c.query('BEGIN');
   const r=await c.query('SELECT payload FROM ax_workflow_state WHERE id = 1 FOR UPDATE');
   const draft=stateSchema.parse(r.rows[0]?.payload),result=fn(draft),valid=stateSchema.parse(draft);
   await c.query('UPDATE ax_workflow_state SET payload = $1::jsonb WHERE id = 1',[JSON.stringify(valid)]);
   beforeCommit?.();
   await c.query('COMMIT');return structuredClone(result);
  } catch(error){await c.query('ROLLBACK').catch(()=>{});throw error;}finally{c.release();}
 }
}
