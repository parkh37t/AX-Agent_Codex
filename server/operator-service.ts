import type {Router} from 'express';
import type { IdentityAdapter } from './tenant-boundary';
import { WebWorkflow } from './web-workflow';
import { PostgresWorkflowStore, type PgPool } from './postgres-workflow-store';
import { createResponsesRunner, operatorApiEnvironment } from './responses-runner';
import { createHostedApi } from './hosted-api';
/** Operator composition contract. Caller supplies an approved pg pool and real OIDC-backed AX sessions.
 * No login provider, API key, database, HTTP listener, or cloud service is created here.
 */
export function createOperatorService(options:{pool:PgPool;identity?:IdentityAdapter;origin:string;environment:NodeJS.ProcessEnv;authRouter?:Router;apiAccessConfigured?:boolean;registrationEnabled?:boolean}) {
 if(options.identity&&options.identity.kind!=='oidc'&&!(options.identity.kind==='test'&&process.env.NODE_ENV==='test'))throw new Error('Operator service requires AX OIDC sessions');
 const settings=operatorApiEnvironment(options.environment);
 const runner=createResponsesRunner(settings.config,settings.secret);
 const workflow=new WebWorkflow(new PostgresWorkflowStore(options.pool),options.identity,runner);
 const app=createHostedApi({workflow,runner,origin:options.origin,identityConfigured:!!options.identity&&(options.apiAccessConfigured??true),authRouter:options.authRouter,registrationEnabled:options.registrationEnabled});
 return {app,workflow,shutdown:()=>workflow.dispose()};
}
