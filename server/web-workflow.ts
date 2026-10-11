import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import { z } from 'zod';
import { projectSchema, artifactSchema, workflowBlocker, invalidateWorkflow, invalidateVerifications, mergeArtifacts, type Project, type Task } from '../shared/domain';
import { validateManualResult } from '../shared/generation';
import { TenantWorkspace, type IdentityAdapter, type IdentitySession } from './tenant-boundary';

export const usageSchema = z.object({ responseId:z.string().max(200), model:z.string().max(100), inputTokens:z.number().int().nonnegative(), outputTokens:z.number().int().nonnegative(), totalTokens:z.number().int().nonnegative(), estimatedUsd:z.number().nonnegative().optional() });
export type ApiUsage = z.infer<typeof usageSchema>;
const jobSchema = z.object({ id: z.string(), owner: z.string(), projectId: z.string(), revision: z.number().int(), task: z.enum(['rfp','strategy','proposal','design']), key: z.string(), status: z.enum(['queued','running','completed','failed','cancelled']), input: projectSchema, result: artifactSchema.optional(), error: z.string().optional(), createdAt:z.string().default('1970-01-01T00:00:00.000Z'), appliedRevision:z.number().int().optional(), usage:z.array(usageSchema).optional(), knowledge:z.array(z.object({path:z.string(),sha256:z.string()})).optional() });
type StoredJob = z.infer<typeof jobSchema>;
export const stateSchema = z.object({ version: z.literal(1), projects: z.record(z.object({ revision: z.number().int().positive(), value: projectSchema, snapshots:z.array(projectSchema).optional() })), jobs: z.record(jobSchema), budget:z.object({limitUsd:z.number().positive(),spentUsd:z.number().nonnegative(),reservations:z.record(z.number().nonnegative())}).default({limitUsd:4,spentUsd:0,reservations:{}}) });
export type State = z.infer<typeof stateSchema>;
const owner = (s: IdentitySession) => JSON.stringify([s.subject,s.accountId,s.workspaceId]);
const projectKey = (scope: string, id: string) => JSON.stringify([scope,id]);
export class WorkflowError extends Error { constructor(public status: number, message: string) { super(message); } }
export interface WorkflowRunner {
  kind: 'official' | 'test';
  status?(): { ready:boolean; reason:string };
  run(input: { project: Project; task: Task }, options: { signal: AbortSignal; scope: IdentitySession; onUsage?:(usage:ApiUsage,reservationId?:string)=>void|Promise<void>; reserveBudget?:(maximumUsd:number)=>string|Promise<string>; onKnowledge?:(refs:Array<{path:string;sha256:string}>)=>void|Promise<void> }): Promise<unknown>;
}
export interface WorkflowStore { read():State|Promise<State>; commit<T>(fn:(draft:State)=>T,beforeCommit?:()=>void):T|Promise<T>; }
/** Single-process prototype store. One service instance owns the file; not a distributed DB. No credentials are persisted. */
export class WorkflowFileStore {
  private state: State;
  constructor(private file: string, private persist = (file: string, bytes: string) => {
    const tmp = `${file}.${randomUUID()}.tmp`;
    try { writeFileSync(tmp, bytes, { mode: 0o600, flag: 'wx' }); renameSync(tmp, file); }
    finally { if (existsSync(tmp)) unlinkSync(tmp); }
  }) {
    this.state = existsSync(file) ? stateSchema.parse(JSON.parse(readFileSync(file,'utf8'))) : { version:1, projects:{}, jobs:{}, budget:{limitUsd:4,spentUsd:0,reservations:{}} };
  }
  read() { return structuredClone(this.state); }
  /** Synchronous commit keeps the final cancellation/revision guard and file replacement in one event-loop turn. */
  commit<T>(fn: (draft: State) => T,beforeCommit?:()=>void): T {
    const draft = this.read(), result = fn(draft);
    const valid = stateSchema.parse(draft);
    beforeCommit?.();
    this.persist(this.file, JSON.stringify(valid)); // failure leaves the previous in-memory state untouched
    this.state = valid;
    return structuredClone(result);
  }
}
/** Unmounted P1 domain flow. Official auth and inference adapters remain unimplemented. */
export class WebWorkflow {
  private boundary: TenantWorkspace;
  private ready:Promise<void>;
  private initializationFailed=false;
  private disposed=false;
  private active = new Map<string,{ boundaryId:string; signal:AbortSignal; abort:()=>void; handle:string; session:IdentitySession }>();
  private cancellationRequested = new Set<string>();
  private revoked = new Set<string>();
  constructor(private store: WorkflowStore, identity?: IdentityAdapter, private runner?: WorkflowRunner, private limits={maxConcurrent:1,maxConcurrentPerUser:1,maxRequestsPerUserPerDay:10}) {
    this.boundary = new TenantWorkspace(identity);
    this.limits=z.object({maxConcurrent:z.number().int().min(1).max(4),maxConcurrentPerUser:z.number().int().min(1).max(4),maxRequestsPerUserPerDay:z.number().int().min(1).max(100)}).parse(limits);
    if (runner?.kind === 'test' && process.env.NODE_ENV !== 'test') throw new WorkflowError(503,'Test runner is disabled outside tests');
    this.ready=(async()=>{
      const interrupted=Object.values((await store.read()).jobs).some(j=>j.status==='queued'||j.status==='running');
      if(interrupted)await store.commit(s=>{for(const j of Object.values(s.jobs))if(j.status==='queued'||j.status==='running'){j.status='failed';j.error='interrupted_restart';delete j.result;}});
    })().catch(()=>{this.initializationFailed=true;});
  }
  async storageReady(){await this.ready;return !this.initializationFailed&&!this.disposed;}
  private async auth(handle:string) {
    await this.ready;
    if(this.initializationFailed)throw new WorkflowError(503,'storage_unavailable');
    const s=await this.boundary.authorize(handle);
    this.guard(handle,s);return s;
  }
  private guard(handle:string,s:IdentitySession,signal?:AbortSignal) {
    if(this.disposed||this.revoked.has(handle)||s.expiresAt<=Date.now()||signal?.aborted) throw new WorkflowError(401,'Session or job is no longer active');
  }
  private async commitUser<T>(handle:string,session:IdentitySession,fn:(state:State)=>T){const value=await this.store.commit(fn,()=>this.guard(handle,session));await this.auth(handle);this.guard(handle,session);return value;}
  private owned(s:State,scope:string,id:string) { const j=s.jobs[id];if(!j||j.owner!==scope)throw new WorkflowError(404,'Job not found');return j; }
  async saveProject(handle:string,value:unknown,expectedRevision:number) {
    const session=await this.auth(handle),p=projectSchema.parse(value),key=projectKey(owner(session),p.id);
    return this.commitUser(handle,session,s=>{
      this.guard(handle,session);const old=s.projects[key];if((old?.revision??0)!==expectedRevision)throw new WorkflowError(409,'Project revision changed');
      if(old) {
        // Review authority belongs to stored server records, never editable client flags.
        const previous=old.value;
        const imported=(p.verifications??[]).filter(r=>!previous.verifications?.some(v=>v.id===r.id)).map(r=>({...r,invalidated:true}));
        p.workflow=previous.workflow?structuredClone(previous.workflow):undefined;
        p.verifications=previous.verifications||imported.length?[...(previous.verifications??[]),...imported]:undefined;
        p.workflow=invalidateWorkflow(previous,p);
        p.verifications=invalidateVerifications(previous,p);
      } else {
        if(p.workflow)for(const receipt of Object.values(p.workflow))if(receipt)receipt.stale=true;
        p.verifications=p.verifications?.map(r=>({...r,invalidated:true}));
      }
      return s.projects[key]={revision:expectedRevision+1,value:projectSchema.parse(p),...(old?.snapshots?{snapshots:old.snapshots}:{})};
    });
  }
  async getProject(handle:string,id:string) {
    const session=await this.auth(handle),p=(await this.store.read()).projects[projectKey(owner(session),id)];if(!p)throw new WorkflowError(404,'Project not found');await this.auth(handle);this.guard(handle,session);return p;
  }
  async submit(handle:string,input:{projectId:string;expectedRevision:number;task:'rfp'|'strategy'|'proposal'|'design';idempotencyKey:string}) {
    if(!this.runner||this.runner.status?.().ready===false)throw new WorkflowError(503,'Execution adapter is disabled or not configured');
    const session=await this.auth(handle),scope=owner(session);
    if(!input.idempotencyKey||input.idempotencyKey.length>200)throw new WorkflowError(400,'Invalid idempotency key');
    return this.commitUser(handle,session,s=>{
      this.guard(handle,session);
      const existing=Object.values(s.jobs).find(j=>j.owner===scope&&j.key===input.idempotencyKey);
      if(existing){if(existing.projectId!==input.projectId||existing.revision!==input.expectedRevision||existing.task!==input.task)throw new WorkflowError(409,'Idempotency key reused for different input');return existing;}
      const pending=Object.values(s.jobs).filter(j=>j.status==='queued'||j.status==='running'||this.active.has(j.id));
      if(pending.length>=this.limits.maxConcurrent||pending.filter(j=>j.owner===scope).length>=this.limits.maxConcurrentPerUser)throw new WorkflowError(429,'Concurrent job limit reached');
      const today=new Date().toISOString().slice(0,10);
      if(Object.values(s.jobs).filter(j=>j.owner===scope&&j.createdAt.slice(0,10)===today).length>=this.limits.maxRequestsPerUserPerDay)throw new WorkflowError(429,'Daily request limit reached');
      const p=s.projects[projectKey(scope,input.projectId)];if(!p)throw new WorkflowError(404,'Project not found');
      if(p.revision!==input.expectedRevision)throw new WorkflowError(409,'Project revision changed');
      const blocked=workflowBlocker(p.value,input.task);if(blocked)throw new WorkflowError(400,blocked);
      const id=randomUUID();return s.jobs[id]={id,owner:scope,projectId:input.projectId,revision:p.revision,task:input.task,key:input.idempotencyKey,status:'queued',input:p.value,createdAt:new Date().toISOString()};
    });
  }
  async getJob(handle:string,id:string) {const session=await this.auth(handle);const result=this.owned(await this.store.read(),owner(session),id);await this.auth(handle);this.guard(handle,session);return result;}
  async cancel(handle:string,id:string) {
    const session=await this.auth(handle);
    this.guard(handle,session);
    const current=this.owned(await this.store.read(),owner(session),id);
    if(current.status==='queued'||current.status==='running') {
      // Stopping execution cannot depend on successfully persisting its status.
      this.cancellationRequested.add(id);
      this.active.get(id)?.abort();
    }
    const result=await this.store.commit(s=>{this.guard(handle,session);const j=this.owned(s,owner(session),id);if(j.status==='queued'||j.status==='running'){j.status='cancelled';delete j.result;}return j;},()=>this.guard(handle,session));
    await this.auth(handle);this.guard(handle,session);return result;
  }
  async run(handle:string,id:string) {
    if(!this.runner||this.runner.status?.().ready===false)throw new WorkflowError(503,'Execution adapter is disabled or not configured');
    const session=await this.auth(handle),scope=owner(session);
    const queued=this.owned(await this.store.read(),scope,id);if(queued.status!=='queued')throw new WorkflowError(409,'Job is not queued');
    if(this.cancellationRequested.has(id))throw new WorkflowError(409,'Cancellation was requested');
    const permit=await this.boundary.registerJob(handle);
    const cancellation=new AbortController(),signal=AbortSignal.any([permit.signal,cancellation.signal]);
    try {
      const dispatchSession=await this.auth(handle);
      if(owner(dispatchSession)!==scope||dispatchSession.sessionId!==session.sessionId)throw new WorkflowError(401,'Session changed before dispatch');
      const input=await this.store.commit(s=>{this.guard(handle,session,signal);const j=this.owned(s,scope,id);if(j.status!=='queued'||this.cancellationRequested.has(id))throw new WorkflowError(409,'Job is not queued or cancellation was requested');const p=s.projects[projectKey(scope,j.projectId)];if(p?.revision!==j.revision)throw new WorkflowError(409,'Project revision changed');j.status='running';return j;},()=>this.guard(handle,session,signal));
      this.active.set(id,{boundaryId:permit.id,signal,abort:()=>cancellation.abort(),handle,session});
      try {
        await this.boundary.assertRunnable(handle,permit.id);
        this.guard(handle,dispatchSession,signal);
        if(this.cancellationRequested.has(id))throw new WorkflowError(409,'Cancellation was requested');
        const value=await this.runner.run({project:structuredClone(input.input),task:input.task},{signal,scope:{...dispatchSession},reserveBudget:(maximumUsd)=>this.store.commit(s=>{if(!Number.isFinite(maximumUsd)||maximumUsd<=0)throw new WorkflowError(503,'Invalid cost reservation');const held=Object.values(s.budget.reservations).reduce((a,b)=>a+b,0);if(s.budget.spentUsd+held+maximumUsd>s.budget.limitUsd)throw new WorkflowError(429,'Test budget exhausted');const reservation=randomUUID();s.budget.reservations[reservation]=maximumUsd;return reservation;}),onUsage:(usage,reservationId)=>this.store.commit(s=>{const j=this.owned(s,scope,id);const clean=usageSchema.parse(usage);if(!j.usage?.some(u=>u.responseId===clean.responseId)){j.usage=[...(j.usage??[]),clean];if(reservationId&&s.budget.reservations[reservationId]!==undefined&&clean.estimatedUsd!==undefined){delete s.budget.reservations[reservationId];s.budget.spentUsd+=clean.estimatedUsd;}}}),onKnowledge:(refs)=>this.store.commit(s=>{this.owned(s,scope,id).knowledge=refs;})});
        const current=await this.auth(handle);
        if(owner(current)!==scope||current.sessionId!==session.sessionId)throw new WorkflowError(401,'Session changed');
        await this.boundary.assertRunnable(handle,permit.id);
        const result=validateManualResult(input.input,value,input.task);
        await this.store.commit(s=>{this.guard(handle,current,signal);const j=this.owned(s,scope,id);if(j.status!=='running'||this.cancellationRequested.has(id))throw new WorkflowError(409,'Job is not running or cancellation was requested');if(s.projects[projectKey(scope,j.projectId)]?.revision!==j.revision)throw new WorkflowError(409,'Project revision changed');j.result=result;j.status='completed';},()=>{this.guard(handle,current,signal);if(this.cancellationRequested.has(id))throw new WorkflowError(409,'Cancellation was requested');});
      } catch(error) {
        await this.store.commit(s=>{const j=this.owned(s,scope,id);if(j.status==='running'){j.status=signal.aborted||this.cancellationRequested.has(id)||this.revoked.has(handle)?'cancelled':'failed';j.error=error instanceof WorkflowError&&error.message==='Project revision changed'?'revision_conflict':error instanceof WorkflowError&&['api_timeout','api_incomplete','api_refusal','request_limit','response_limit','Test budget exhausted','api_http_429','api_http_401','api_http_403'].includes(error.message)?error.message:'execution_or_validation_failed';delete j.result;}});
      }
    } catch(error) {
      await this.store.commit(s=>{const j=this.owned(s,scope,id);if(j.status==='queued'){j.status=this.cancellationRequested.has(id)?'cancelled':'failed';j.error='dispatch_failed';delete j.result;}});
      throw error;
    } finally {if(this.active.get(id)?.boundaryId===permit.id)this.active.delete(id);this.boundary.finishJob(permit.id);}
    return this.owned(await this.store.read(),scope,id);
  }
  async applyResult(handle:string,id:string,expectedRevision:number) {
    const session=await this.auth(handle),scope=owner(session);
    return this.commitUser(handle,session,s=>{
      this.guard(handle,session);const j=this.owned(s,scope,id),p=s.projects[projectKey(scope,j.projectId)];
      if(j.status!=='completed'||!j.result||j.appliedRevision!==undefined)throw new WorkflowError(409,'No unreviewed completed result');
      if(!p||p.revision!==expectedRevision||p.revision!==j.revision)throw new WorkflowError(409,'Project revision changed');
      const result=validateManualResult(p.value,j.result,j.task),next=mergeArtifacts(p.value,result,j.task);
      if(this.runner?.kind==='official')next.generationHistory=[...(p.value.generationHistory??[]).slice(-49),{task:j.task,method:'operator_api',appliedAt:new Date().toISOString(),sources:j.input.sources.map(({id,name,readScope})=>({id,name,readScope})),knowledge:j.knowledge??[]}];
      p.snapshots=[...(p.snapshots??[]),p.value].slice(-8);p.value=next;p.revision+=1;j.appliedRevision=p.revision;return p;
    });
  }
  async listProjects(handle:string){const session=await this.auth(handle),scope=owner(session),state=await this.store.read();await this.auth(handle);this.guard(handle,session);return Object.entries(state.projects).filter(([key])=>JSON.parse(key)[0]===scope).map(([,p])=>({id:p.value.id,title:p.value.title,revision:p.revision}));}
  async projectJobs(handle:string,id:string){const session=await this.auth(handle),scope=owner(session),state=await this.store.read();const p=state.projects[projectKey(scope,id)];if(!p)throw new WorkflowError(404,'Project not found');await this.auth(handle);this.guard(handle,session);return Object.values(state.jobs).filter(j=>j.owner===scope&&j.projectId===id&&j.revision===p.revision&&j.appliedRevision===undefined).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).map(j=>({id:j.id,status:j.status}));}
  async session(handle:string){await this.auth(handle);return {authenticated:true};}
  async logout(handle:string) {this.revoked.add(handle);await this.boundary.logout(handle);}
  dispose(){this.disposed=true;for(const job of this.active.values())job.abort();this.boundary.dispose();this.active.clear();}
}
