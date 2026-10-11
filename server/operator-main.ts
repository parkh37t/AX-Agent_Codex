import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import express from 'express';
import {createPgPool,migrate} from './pg-runtime';
import {createOidcAuth,oidcSettings} from './oidc-auth';
import {createOperatorService} from './operator-service';
import {createOperatorLifecycle} from './operator-lifecycle';
export async function startOperator(env:NodeJS.ProcessEnv){
 if(env.NODE_ENV!=='production')throw Error('operator_requires_production_mode');
 const settings=oidcSettings(env);if(!existsSync(resolve('dist-operator/index.html')))throw Error('operator_build_missing');
 const port=Number(env.PORT??4319);if(!Number.isInteger(port)||port<1||port>65535)throw Error('port_invalid');
 const pool=createPgPool(env.DATABASE_URL);
 const lifecycle=createOperatorLifecycle({pool,onTransition:(phase,reason)=>console.info(`AX worker ${phase}: ${reason}`),activate:async(owned,signal)=>{
  // Never initialize schema, recover jobs or construct the worker until ownership is held.
  if(env.AX_DB_MIGRATE==='true')await migrate(owned);
  const auth=await createOidcAuth(owned,env);signal.throwIfAborted();owned.assert();
  const service=createOperatorService({pool:owned,identity:auth.identity,origin:settings.origin,environment:env,authRouter:auth.router,apiAccessConfigured:auth.apiAccessConfigured,registrationEnabled:auth.registrationEnabled});
  signal.addEventListener('abort',service.shutdown,{once:true});
  try{if(!await service.workflow.storageReady())throw Error('storage_unavailable');signal.throwIfAborted();owned.assert();const dir=resolve('dist-operator');service.app.use(express.static(dir,{index:false}));service.app.get('/',(_req,res)=>res.sendFile(resolve(dir,'index.html')));return service;}catch(e){service.shutdown();throw e;}
 }});
 const server=lifecycle.app.listen(port,'0.0.0.0');
 try{await new Promise<void>((ok,fail)=>{server.once('listening',ok);server.once('error',fail);});}catch{lifecycle.stop();await pool.end();throw Error('operator_listen_failed');}
 lifecycle.start();let stopped=false;const stop=()=>{if(stopped)return;stopped=true;lifecycle.stop();server.close();server.closeIdleConnections();void pool.end();};process.once('SIGTERM',stop);process.once('SIGINT',stop);return {server,stop,status:lifecycle.status};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)startOperator(process.env).catch(()=>{console.error('AX operator startup failed. Check required configuration, build and listener.');process.exitCode=1;});
