import express from 'express';
import type {PgClient,PgPool} from './postgres-workflow-store';
export const LEADER_LOCK=418023761;
export const lockHeldSql=`SELECT EXISTS (SELECT 1 FROM pg_locks WHERE locktype='advisory' AND pid=pg_backend_pid() AND classid=0 AND objid=${LEADER_LOCK} AND objsubid=1 AND mode='ExclusiveLock' AND granted) AS locked`;
export interface LockClient extends PgClient {release(destroy?:boolean):void;on(event:string,listener:()=>void):unknown;}
export interface LockPool {connect():Promise<LockClient>;}
/** All app SQL uses the SAME session as the advisory lock. Each checkout is serialized,
 * so BEGIN/UPDATE/COMMIT cannot interleave with auth, recovery or heartbeat queries.
 * Closing that session drops both the lock and any unfinished transaction together. */
export class OwnedConnection implements PgPool {
 private live=true;private busy=false;private waiters:Array<{resolve:(client:PgClient)=>void;reject:(e:Error)=>void}>=[];
 constructor(private client:LockClient,private lost:()=>void){}
 assert(){if(!this.live)throw Error('worker_ownership_lost');}
 connect():Promise<PgClient>{try{this.assert();}catch(e){return Promise.reject(e);}return new Promise((resolve,reject)=>{this.waiters.push({resolve,reject});this.dispatch();});}
 private dispatch(){if(this.busy||!this.live)return;const next=this.waiters.shift();if(!next)return;this.busy=true;let released=false;
  next.resolve({query:async(sql,values)=>{this.assert();if(released)throw Error('connection_released');try{const r=await this.client.query(sql,values);this.assert();return r;}catch(e){this.lost();throw e;}},release:()=>{if(released)return;released=true;this.busy=false;this.dispatch();}});
 }
 close(){if(!this.live)return;this.live=false;for(const waiter of this.waiters.splice(0))waiter.reject(Error('worker_ownership_lost'));this.client.release(true);}
}
type Service={app:express.Express;shutdown:()=>void};
type Phase='standby'|'initializing'|'active'|'failed'|'stopped';
export function createOperatorLifecycle(options:{pool:LockPool;activate:(pool:OwnedConnection,signal:AbortSignal)=>Promise<Service>;retryMs?:number;heartbeatMs?:number;standbyTimeoutMs?:number;onTransition?:(phase:Phase,reason:string)=>void}){
 const app=express();app.disable('x-powered-by');let phase:Phase='standby',reason='waiting_for_worker_lock',service:Service|undefined,owned:OwnedConnection|undefined;const abort=new AbortController();let retry:ReturnType<typeof setTimeout>|undefined,heartbeat:ReturnType<typeof setTimeout>|undefined;
 const transition=(p:Phase,r:string)=>{phase=p;reason=r;options.onTransition?.(p,r);};
 const deadline=setTimeout(()=>fail('worker_start_timeout'),options.standbyTimeoutMs??360000);deadline.unref?.();
 function retire(){clearTimeout(deadline);clearTimeout(retry);clearTimeout(heartbeat);abort.abort();service?.shutdown();owned?.close();}
 function fail(code:string){if(phase==='failed'||phase==='stopped')return;transition('failed',code);retire();}
 const health=()=>({phase,reason,serviceReady:phase==='active'});
 app.use((_req,res,next)=>{res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');next();});
 app.get('/health/live',(_req,res)=>res.status(phase==='failed'||phase==='stopped'?503:200).json({...health(),live:phase!=='failed'&&phase!=='stopped'}));
 app.get('/health/ready',(_req,res)=>res.status(phase==='active'?200:503).json(health()));
 // Existing Render health path is /api/status. During a bounded handoff it remains
 // liveness-compatible, explicitly ready:false. No auth or business endpoint is opened.
 app.use((req,res,next)=>{if(phase==='active'&&service)return service.app(req,res,next);if(req.method==='GET'&&req.path==='/api/status')return void res.status(phase==='failed'||phase==='stopped'?503:200).json({...health(),ready:false,storageReady:false,identityConfigured:false,executionReady:false,mode:'operator_api'});res.setHeader('Retry-After','2');res.status(503).json({error:'worker_not_ready',...health()});});
 async function monitor(){if(phase!=='active'&&phase!=='initializing')return;try{const c=await owned!.connect();try{if(!(await c.query(lockHeldSql)).rows[0]?.locked)throw Error('lost');}finally{c.release();}}catch{fail('worker_lock_lost');return;}if(phase==='active'||phase==='initializing'){heartbeat=setTimeout(()=>void monitor(),options.heartbeatMs??2000);heartbeat.unref?.();}}
 async function claim(){
  if(phase!=='standby')return;let client:LockClient|undefined;
  try{client=await options.pool.connect();if(phase!=='standby'){client.release(true);return;}
   if(!(await client.query(`SELECT pg_try_advisory_lock(${LEADER_LOCK}) AS locked`)).rows[0]?.locked){client.release();client=undefined;if(phase==='standby'){retry=setTimeout(()=>void claim(),options.retryMs??1000);retry.unref?.();}return;}
   if(phase!=='standby'){client.release(true);return;}
   const onLost=()=>fail('worker_lock_connection_lost');client.on('error',onLost);client.on('end',onLost);
   owned=new OwnedConnection(client,()=>fail('worker_database_session_failed'));client=undefined;transition('initializing','worker_lock_acquired');void monitor();
   const started=await options.activate(owned,abort.signal);if(abort.signal.aborted){started.shutdown();return;}service=started;clearTimeout(deadline);transition('active','worker_ready');
  }catch{client?.release(true);fail('worker_initialization_failed');}
 }
 let started=false;return {app,status:health,start(){if(!started){started=true;transition('standby','waiting_for_worker_lock');void claim();}},stop(){if(phase==='stopped')return;transition('stopped','worker_stopped');retire();}};
}
