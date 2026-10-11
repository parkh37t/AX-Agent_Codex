import { createHash,randomBytes } from 'node:crypto';
import * as oidc from 'openid-client';
import express from 'express';
import type { PgPool } from './postgres-workflow-store';
import type {IdentityAdapter,IdentitySession} from './tenant-boundary';
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const random=()=>randomBytes(32).toString('base64url');
const cookieOptions={httpOnly:true,secure:true,sameSite:'lax' as const,path:'/'};
const escapeHtml=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export const authSchemaSql=`CREATE TABLE IF NOT EXISTS ax_auth_records (id text PRIMARY KEY, kind text NOT NULL, payload jsonb NOT NULL, expires_at bigint NOT NULL);`;
export class PgAuthStore {
 constructor(private pool:PgPool){}
 private async query(sql:string,values:unknown[]){const c=await this.pool.connect();try{return await c.query(sql,values);}finally{c.release();}}
 async put(handle:string,kind:string,payload:unknown,expires:number){await this.query('INSERT INTO ax_auth_records (id,kind,payload,expires_at) VALUES ($1,$2,$3::jsonb,$4)',[hash(handle),kind,JSON.stringify(payload),expires]);}
 async get(handle:string,kind:string,consume=false):Promise<any>{const r=await this.query(consume?'DELETE FROM ax_auth_records WHERE id=$1 AND kind=$2 RETURNING payload,expires_at':'SELECT payload,expires_at FROM ax_auth_records WHERE id=$1 AND kind=$2',[hash(handle),kind]);const row=r.rows[0];return row&&Number(row.expires_at)>Date.now()?row.payload:null;}
 async remove(handle:string){await this.query('DELETE FROM ax_auth_records WHERE id=$1',[hash(handle)]);}
 async clean(){await this.query('DELETE FROM ax_auth_records WHERE expires_at < $1',[Date.now()]);}
}
export function cookie(req:express.Request,name:string){const parts=(req.headers.cookie??'').split(';').map(p=>p.trim()).filter(p=>p.startsWith(name+'='));if(parts.length!==1)return '';const value=parts[0].slice(name.length+1);return /^[A-Za-z0-9_-]{16,256}$/.test(value)?value:'';}
export function oidcSettings(env:NodeJS.ProcessEnv){
 const required=['AX_PUBLIC_ORIGIN','AX_OIDC_ISSUER','AX_OIDC_CLIENT_ID','AX_OIDC_CLIENT_SECRET'];
 if(required.some(k=>!env[k]?.trim()))throw new Error('oidc_configuration_missing');
 const origin=new URL(env.AX_PUBLIC_ORIGIN!),issuer=new URL(env.AX_OIDC_ISSUER!);
 if(origin.protocol!=='https:'||origin.href!==origin.origin+'/'||issuer.protocol!=='https:'||issuer.username||issuer.password||issuer.hash||issuer.search)throw new Error('oidc_configuration_invalid');
 const allowed=(env.AX_OIDC_ALLOWED_SUBJECTS??'').split(',').map(s=>s.trim()).filter(Boolean),registrationEnabled=env.AX_OIDC_REGISTRATION_ENABLED==='true';
 if(!allowed.length&&!registrationEnabled)throw new Error('oidc_allowlist_missing_registration_disabled');
 return {registrationEnabled,origin:origin.origin,issuer,clientId:env.AX_OIDC_CLIENT_ID!,secret:env.AX_OIDC_CLIENT_SECRET!,allowed};
}
/** Production uses discovery and verified ID tokens. No test identity or insecure transport switch. */
export async function createOidcAuth(pool:PgPool,env:NodeJS.ProcessEnv){
 const settings=oidcSettings(env),config=await oidc.discovery(settings.issuer,settings.clientId,settings.secret,undefined,{timeout:10});
 oidc.enableNonRepudiationChecks(config);
 return oidcRoutes(new PgAuthStore(pool),config,settings.origin,new Set(settings.allowed),settings.registrationEnabled);
}
/** Same verified protocol path is exercised against a local HTTPS OIDC provider in tests. */
export function oidcRoutes(store:PgAuthStore,config:oidc.Configuration,origin:string,allowed:Set<string>,registrationEnabled=false){
 if(new URL(origin).protocol!=='https:'||(!allowed.size&&!registrationEnabled))throw new Error('oidc_configuration_invalid');
 const router=express.Router(),redirectUri=origin+'/auth/callback';
 const identity:IdentityAdapter={kind:'oidc',resolve:async handle=>{const s=await store.get(handle,'session') as IdentitySession|null;return s&&allowed.has(s.subject)?s:null;},revoke:handle=>store.remove(handle)};
 router.get('/login',async(req,res)=>{
  try{await store.clean();for(const name of ['__Host-ax-login','__Host-ax-registration']){const old=cookie(req,name);if(old)await store.remove(old);res.clearCookie(name,cookieOptions);}const handle=random(),verifier=oidc.randomPKCECodeVerifier(),state=oidc.randomState(),nonce=oidc.randomNonce();
   await store.put(handle,'login',{verifier,state,nonce},Date.now()+300000);
   const url=oidc.buildAuthorizationUrl(config,{redirect_uri:redirectUri,scope:'openid',response_type:'code',code_challenge:await oidc.calculatePKCECodeChallenge(verifier),code_challenge_method:'S256',state,nonce});
   res.cookie('__Host-ax-login',handle,{httpOnly:true,secure:true,sameSite:'lax',path:'/',maxAge:300000});res.redirect(url.href);
  }catch{res.status(503).send('로그인을 준비하지 못했습니다. 설정 또는 연결을 확인하세요.');}
 });
 router.get('/callback',async(req,res)=>{
  res.clearCookie('__Host-ax-login',{httpOnly:true,secure:true,sameSite:'lax',path:'/'});
  try{const handle=cookie(req,'__Host-ax-login');if(!handle)throw new Error();const flow=await store.get(handle,'login',true);if(!flow)throw new Error();
   const tokens=await oidc.authorizationCodeGrant(config,new URL(req.originalUrl,origin),{pkceCodeVerifier:flow.verifier,expectedState:flow.state,expectedNonce:flow.nonce,idTokenExpected:true});
   const claims=tokens.claims();if(!claims?.sub)throw new Error();
   if(!allowed.has(claims.sub)&&!registrationEnabled)throw new Error();
   const expiresAt=Math.min(Date.now()+3600000,claims.exp*1000);if(expiresAt<=Date.now())throw new Error();
   const previous=cookie(req,'__Host-ax-session');if(previous)await store.remove(previous);
   const oldRegistration=cookie(req,'__Host-ax-registration');if(oldRegistration)await store.remove(oldRegistration);res.clearCookie('__Host-ax-registration',cookieOptions);
   if(!allowed.has(claims.sub)){
    const registration=random(),deadline=Math.min(expiresAt,Date.now()+300000);
    await store.put(registration,'registration',{subject:claims.sub,issuer:claims.iss,expiresAt:deadline},deadline);
    res.clearCookie('__Host-ax-session',cookieOptions);
    res.cookie('__Host-ax-registration',registration,{...cookieOptions,maxAge:deadline-Date.now()});
    res.redirect('/auth/registration');return;
   }
   const session=random();await store.put(session,'session',{subject:claims.sub,accountId:hash(String(claims.iss)),workspaceId:'personal',sessionId:random(),expiresAt},expiresAt);
   res.cookie('__Host-ax-session',session,{httpOnly:true,secure:true,sameSite:'lax',path:'/',maxAge:expiresAt-Date.now()});res.redirect('/');
  }catch{res.status(401).send('로그인 확인에 실패했습니다. 허용된 계정으로 다시 로그인하세요.');}
 });
 router.get('/registration',async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');
  if(!registrationEnabled)return void res.sendStatus(404);
  try{const handle=cookie(req,'__Host-ax-registration'),record=handle?await store.get(handle,'registration'):null;
   if(!record){res.clearCookie('__Host-ax-registration',cookieOptions);res.status(401).send('등록 확인 기한이 끝났습니다. 다시 로그인하세요.');return;}
   res.type('html').send(`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AX 등록 대기</title><main><h1>관리자 허용 대기</h1><p>로그인 제공자가 확인한 본인의 식별자입니다. 관리자에게 이 값을 전달해 허용 목록 등록을 요청하세요.</p><label>검증된 sub<textarea readonly>${escapeHtml(record.subject)}</textarea></label><p>발급자: ${escapeHtml(record.issuer)}</p><p>확인 기한: ${escapeHtml(new Date(record.expiresAt).toISOString())}</p><p>앱 세션은 발급되지 않았습니다. 프로젝트 조회·저장 및 AI 실행 권한이 없습니다. 새로고침은 확인 기한을 늘리지 않습니다.</p><a href="/auth/login">다시 로그인</a><p>관리자 등록 후 다시 로그인하면 허용 여부를 확인합니다.</p></main></html>`);
  }catch{res.status(503).send('등록 상태를 확인할 수 없습니다.');}
 });
 return {router,identity,registrationEnabled,apiAccessConfigured:allowed.size>0};
}
