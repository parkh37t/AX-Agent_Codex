import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';
const dir=mkdtempSync(join(tmpdir(),'ax-oidc-test-'));
try{
 execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',join(dir,'key.pem'),'-out',join(dir,'cert.pem'),'-days','2','-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost,IP:127.0.0.1'],{stdio:'ignore'});
 const result=spawnSync(process.execPath,['node_modules/@playwright/test/cli.js','test','--config','playwright.operator.config.ts'],{stdio:'inherit',env:{...process.env,AX_TEST_CERT_DIR:dir,NODE_EXTRA_CA_CERTS:join(dir,'cert.pem')}});process.exitCode=result.status??1;
}finally{rmSync(dir,{recursive:true,force:true});}
