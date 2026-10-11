import pg from 'pg';
import type {PgPool} from './postgres-workflow-store';
import { authSchemaSql } from './oidc-auth';
/** Always verifies database TLS. URL flags cannot disable certificate verification. */
export function createPgPool(value:string|undefined){
 if(!value)throw new Error('database_configuration_missing');const url=new URL(value);
 if(!['postgres:','postgresql:'].includes(url.protocol)||!url.hostname)throw new Error('database_configuration_invalid');
 for(const key of ['ssl','sslmode','sslcert','sslkey','sslrootcert','uselibpqcompat'])url.searchParams.delete(key);
 const pool=new pg.Pool({connectionString:url.href,ssl:{rejectUnauthorized:true},max:2,query_timeout:10000,statement_timeout:10000,connectionTimeoutMillis:10000,idleTimeoutMillis:30000});
 pool.on('error',()=>{/* Do not log connection credentials. Readiness rejects failed queries. */});return pool;
}
export async function migrate(pool:PgPool){const c=await pool.connect();try{await c.query('BEGIN');await c.query(`CREATE TABLE IF NOT EXISTS ax_workflow_state (id integer PRIMARY KEY CHECK (id=1),payload jsonb NOT NULL)`);await c.query(`INSERT INTO ax_workflow_state (id,payload) VALUES (1,'{"version":1,"projects":{},"jobs":{},"budget":{"limitUsd":4,"spentUsd":0,"reservations":{}}}') ON CONFLICT (id) DO NOTHING`);await c.query(authSchemaSql);await c.query('COMMIT');}catch{await c.query('ROLLBACK');throw new Error('database_migration_failed');}finally{c.release();}}
