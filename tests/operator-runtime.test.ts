import {it,expect} from 'vitest';
import {createPgPool} from '../server/pg-runtime';
import {oidcSettings} from '../server/oidc-auth';
import {startOperator} from '../server/operator-main';
it('rejects missing OIDC configuration before network access',()=>{expect(()=>oidcSettings({})).toThrow('missing');expect(()=>oidcSettings({AX_PUBLIC_ORIGIN:'http://localhost',AX_OIDC_ISSUER:'https://id.example',AX_OIDC_CLIENT_ID:'a',AX_OIDC_CLIENT_SECRET:'synthetic',AX_OIDC_ALLOWED_SUBJECTS:'a'})).toThrow('invalid');});
it('verifies PostgreSQL TLS despite URL override flags',async()=>{const p=createPgPool('postgres://synthetic:synthetic@localhost/test?sslmode=no-verify&ssl=false');try{expect(p.options.ssl).toEqual({rejectUnauthorized:true});expect(p.options.connectionString).not.toContain('sslmode');}finally{await p.end();}});
it('rejects missing database and test-mode production entrypoints',async()=>{expect(()=>createPgPool(undefined)).toThrow('missing');await expect(startOperator({NODE_ENV:'test'})).rejects.toThrow('production');await expect(startOperator({NODE_ENV:'production'})).rejects.toThrow('missing');});

it('requires explicit registration mode for empty allowlist and never treats it as an allow-all',()=>{const env={AX_PUBLIC_ORIGIN:'https://ax.example',AX_OIDC_ISSUER:'https://accounts.google.com',AX_OIDC_CLIENT_ID:'synthetic',AX_OIDC_CLIENT_SECRET:'synthetic'};expect(()=>oidcSettings(env)).toThrow('registration_disabled');expect(()=>oidcSettings({...env,AX_OIDC_REGISTRATION_ENABLED:'TRUE'})).toThrow('registration_disabled');expect(oidcSettings({...env,AX_OIDC_REGISTRATION_ENABLED:'true'})).toMatchObject({allowed:[],registrationEnabled:true});expect(oidcSettings({...env,AX_OIDC_ALLOWED_SUBJECTS:'A'})).toMatchObject({allowed:['A'],registrationEnabled:false});});
