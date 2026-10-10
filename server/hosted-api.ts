import express, { type ErrorRequestHandler } from 'express';
import { z } from 'zod';
import { projectSchema } from '../shared/domain';
import { WebWorkflow, WorkflowError, type WorkflowRunner } from './web-workflow';
import { TenantAccessError } from './tenant-boundary';
const submit=z.object({projectId:z.string().min(1),expectedRevision:z.number().int().positive(),task:z.enum(['rfp','strategy','proposal','design']),idempotencyKey:z.string().min(1).max(200)}).strict();
/** Composition only, no listener, identity provider registration, credentials, or deployment side effects. */
export function createHostedApi(options:{workflow:WebWorkflow;runner:WorkflowRunner;origin:string;identityConfigured:boolean;authRouter?:express.Router}) {
 const origin=new URL(options.origin);if(origin.protocol!=='https:')throw new Error('Hosted API requires an HTTPS public origin');
 const app=express();app.disable('x-powered-by');
 app.use((req,res,next)=>{
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
  if(req.headers.host!==origin.host)return void res.status(403).json({error:'host_not_allowed'});
  if(req.headers.origin&&req.headers.origin!==origin.origin)return void res.status(403).json({error:'origin_not_allowed'});
  if(!['GET','HEAD'].includes(req.method)&&(req.headers.origin!==origin.origin||req.header('X-AX-Request')!=='1'||!req.is('application/json')))return void res.status(403).json({error:'same_origin_json_required'});
  next();
 });
 if(options.authRouter)app.use('/auth',options.authRouter);
 app.use(express.json({limit:'256kb',strict:true}));
 app.get('/api/status',async(_req,res)=>{const storageReady=await options.workflow.storageReady(),status=options.runner.status?.()??{ready:false,reason:'execution_adapter_unconfigured'};res.json({mode:'operator_api',simulation:options.runner.kind==='test',identityConfigured:options.identityConfigured,storageReady,executionReady:status.ready,ready:options.identityConfigured&&status.ready&&storageReady,reason:!storageReady?'storage_unavailable':!options.identityConfigured?'identity_provider_not_configured':status.reason});});
 app.use('/api',(req,res,next)=>{
  if(!options.identityConfigured)return void res.status(503).json({error:'identity_provider_not_configured'});
  const matches=(req.headers.cookie??'').split(';').map(s=>s.trim()).filter(s=>s.startsWith('__Host-ax-session='));
  if(matches.length!==1)return void res.status(401).json({error:'login_required'});
  const handle=matches[0].slice('__Host-ax-session='.length);
  if(!/^[A-Za-z0-9_-]{16,256}$/.test(handle))return void res.status(401).json({error:'invalid_session'});
  res.locals.handle=handle;next();
 });
 app.get('/api/session',async(_req,res)=>res.json(await options.workflow.session(res.locals.handle)));
 app.get('/api/projects',async(_req,res)=>res.json(await options.workflow.listProjects(res.locals.handle)));
 app.get('/api/projects/:id/jobs',async(req,res)=>res.json(await options.workflow.projectJobs(res.locals.handle,String(req.params.id))));
 app.get('/api/projects/:id',async(req,res)=>res.json(await options.workflow.getProject(res.locals.handle,String(req.params.id))));
 app.put('/api/projects/:id',async(req,res)=>{
  const input=z.object({project:projectSchema,expectedRevision:z.number().int().nonnegative()}).strict().parse(req.body);
  if(input.project.id!==req.params.id)throw new WorkflowError(400,'project_id_mismatch');
  res.json(await options.workflow.saveProject(res.locals.handle,input.project,input.expectedRevision));
 });
 app.post('/api/jobs',async(req,res)=>{
  const job=await options.workflow.submit(res.locals.handle,submit.parse(req.body));
  res.status(202).json({id:job.id,status:job.status});
  if(job.status==='queued')void options.workflow.run(res.locals.handle,job.id).catch(()=>{/* domain state and recovery retain the failure; no secret/error logging */});
 });
 app.get('/api/jobs/:id',async(req,res)=>res.json(await options.workflow.getJob(res.locals.handle,String(req.params.id))));
 app.post('/api/jobs/:id/cancel',async(req,res)=>res.json(await options.workflow.cancel(res.locals.handle,String(req.params.id))));
 app.post('/api/jobs/:id/apply',async(req,res)=>{
  const input=z.object({expectedRevision:z.number().int().positive()}).strict().parse(req.body);
  res.json(await options.workflow.applyResult(res.locals.handle,String(req.params.id),input.expectedRevision));
 });
 app.post('/api/logout',async(_req,res)=>{await options.workflow.logout(res.locals.handle);res.setHeader('Set-Cookie','__Host-ax-session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0');res.sendStatus(204);});
 const errors:ErrorRequestHandler=(error,_req,res,_next)=>{
  if(error instanceof WorkflowError||error instanceof TenantAccessError)return void res.status(error.status).json({error:error instanceof WorkflowError?error.message:'session_access_denied'});
  if(error instanceof z.ZodError)return void res.status(400).json({error:'invalid_input'});
  res.status(error?.type==='entity.too.large'?413:500).json({error:'request_failed'});
 };
 app.use(errors);return app;
}
