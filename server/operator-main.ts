import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import express from 'express';
import type {PoolClient} from 'pg';
import {createPgPool,migrate} from './pg-runtime';
import {createOidcAuth,oidcSettings} from './oidc-auth';
import {createOperatorService} from './operator-service';
export async function startOperator(env:NodeJS.ProcessEnv){
 if(env.NODE_ENV!=='production')throw new Error('operator_requires_production_mode');
 const settings=oidcSettings(env);if(!existsSync(resolve('dist-operator/index.html')))throw new Error('operator_build_missing');const pool=createPgPool(env.DATABASE_URL);
 let lock:PoolClient|undefined;
 try{
  if(env.AX_DB_MIGRATE==='true')await migrate(pool);
  // A session advisory lock enforces one active worker, including rolling deployments.
  lock=await pool.connect();const r=await lock.query('SELECT pg_try_advisory_lock(418023761) AS locked');if(!r.rows[0]?.locked){lock.release();lock=undefined;throw new Error('operator_worker_already_running');}
  const auth=await createOidcAuth(pool,env),service=createOperatorService({pool,identity:auth.identity,origin:settings.origin,environment:env,authRouter:auth.router,apiAccessConfigured:auth.apiAccessConfigured,registrationEnabled:auth.registrationEnabled});
  if(!await service.workflow.storageReady())throw new Error('storage_unavailable');
  const dir=resolve('dist-operator');service.app.use(express.static(dir,{index:false}));service.app.get('/',(_req,res)=>res.sendFile(resolve(dir,'index.html')));
  const port=Number(env.PORT??4319);if(!Number.isInteger(port)||port<1||port>65535)throw new Error('port_invalid');
  const server=service.app.listen(port,'0.0.0.0');await new Promise<void>((ok,fail)=>{server.once('listening',ok);server.once('error',fail);});
  let stopped=false;const stop=()=>{if(stopped)return;stopped=true;service.shutdown();server.close(()=>{lock?.release();lock=undefined;void pool.end();});};lock.on('error',stop);process.once('SIGTERM',stop);process.once('SIGINT',stop);return {server,stop};
 }catch{lock?.release();await pool.end();throw new Error('operator_startup_failed_check_configuration');}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)startOperator(process.env).catch(()=>{console.error('AX operator startup failed. Check required configuration, DB schema, OIDC and single-worker lock.');process.exitCode=1;});
