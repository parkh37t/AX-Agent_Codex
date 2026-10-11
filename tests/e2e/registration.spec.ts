import {test,expect,type Page} from '@playwright/test';
const empty=process.env.AX_TEST_REGISTRATION==='empty';
async function begin(page:Page){await page.goto('/');await page.getByRole('link',{name:'로그인',exact:true}).click();expect(new URL(page.url()).searchParams.get('scope')).toBe('openid');expect(new URL(page.url()).searchParams.has('access_type')).toBe(false);}
async function pending(page:Page){await begin(page);await page.getByRole('link',{name:'허용되지 않은 사용자'}).click();await expect(page.getByRole('heading',{name:'관리자 허용 대기'})).toBeVisible();}
test('verified owner-only subject view grants no session or API access; refresh and expiry',async({page,browser})=>{
 await pending(page);expect(page.url()).toBe('https://localhost:5443/auth/registration');await expect(page.getByLabel('검증된 sub')).toHaveValue('C');
 const cookies=await page.context().cookies(),registration=cookies.find(c=>c.name==='__Host-ax-registration')!;expect(registration).toMatchObject({httpOnly:true,secure:true,sameSite:'Lax'});expect(cookies.some(c=>c.name==='__Host-ax-session')).toBe(false);
 const html=await page.content();expect(html).not.toMatch(/synthetic-secret|synthetic-access-token|id_token|access_token|eyJ[A-Za-z0-9_-]+\./);
 for(const [method,path] of [['GET','/api/projects'],['GET','/api/projects/anything'],['PUT','/api/projects/anything'],['POST','/api/jobs']]){const res=await page.request.fetch(path,{method,headers:{Origin:'https://localhost:5443','Content-Type':'application/json','X-AX-Request':'1'},...(method==='GET'?{}:{data:{}})});expect(res.status()).toBe(empty?503:401);}
 expect((await page.request.get('/api/projects',{headers:{Cookie:'__Host-ax-session='+registration.value}})).status()).toBe(empty?503:401);
 const outsider=await browser.newContext({ignoreHTTPSErrors:true});expect((await outsider.request.get('https://localhost:5443/auth/registration?sub=C')).status()).toBe(401);await outsider.close();
 const deadline=await page.getByText('확인 기한:',{exact:false}).textContent();await page.reload();expect(await page.getByText('확인 기한:',{exact:false}).textContent()).toBe(deadline);expect((await page.context().cookies()).find(c=>c.name===registration.name)?.expires).toBe(registration.expires);
 expect((await page.request.get('/auth/registration',{headers:{Origin:'https://evil.example'}})).status()).toBe(403);
 await page.request.post('/__test/expire_registration');await page.reload();await expect(page.getByText('등록 확인 기한이 끝났습니다.',{exact:false})).toBeVisible();expect((await page.request.get('/auth/registration')).status()).toBe(401);
});
test('retry rotates the pending handle; consumed callback and expired login cannot enroll',async({page,browser})=>{
 let callback='';page.on('request',r=>{if(r.url().includes('/auth/callback?'))callback=r.url();});await pending(page);const old=(await page.context().cookies()).find(c=>c.name==='__Host-ax-registration')!;
 await pending(page);const fresh=(await page.context().cookies()).find(c=>c.name==='__Host-ax-registration')!;expect(fresh.value).not.toBe(old.value);
 const other=await browser.newContext({ignoreHTTPSErrors:true});await other.addCookies([old]);expect((await other.request.get('https://localhost:5443/auth/registration')).status()).toBe(401);expect((await other.request.get(callback)).status()).toBe(401);await other.close();
 await begin(page);await page.request.post('/__test/expire_login');await page.getByRole('link',{name:'허용되지 않은 사용자'}).click();await expect(page.getByText('로그인 확인에 실패했습니다.',{exact:false})).toBeVisible();expect((await page.context().cookies()).some(c=>c.name==='__Host-ax-registration'||c.name==='__Host-ax-session')).toBe(false);
});
test('empty allowlist stays closed; mixed allowlist retains normal login and pending is never promoted',async({page})=>{
 const status=await(await page.request.get('/api/status')).json();expect(status.registrationOnly).toBe(empty);expect(status.identityConfigured).toBe(!empty);
 await begin(page);await page.getByRole('link',{name:'테스트 사용자 A'}).click();if(empty){await expect(page.getByRole('heading',{name:'관리자 허용 대기'})).toBeVisible();expect((await page.request.get('/api/session')).status()).toBe(503);}else{await expect(page.getByRole('button',{name:'로그아웃'})).toBeVisible();expect((await page.request.get('/api/session')).status()).toBe(200);await page.goto('/auth/login');await page.getByRole('link',{name:'허용되지 않은 사용자'}).click();await expect(page.getByRole('heading',{name:'관리자 허용 대기'})).toBeVisible();expect((await page.request.get('/api/session')).status()).toBe(401);}
});
for(const fault of ['state','nonce','pkce','issuer','audience','signature','response_issuer','expired'])test(`registration rejects ${fault} before showing subject`,async({page})=>{await begin(page);await page.request.post('/__test/'+fault);await page.getByRole('link',{name:'허용되지 않은 사용자'}).click();await expect(page.getByText('로그인 확인에 실패했습니다.',{exact:false})).toBeVisible();expect((await page.context().cookies()).some(c=>c.name==='__Host-ax-registration'||c.name==='__Host-ax-session')).toBe(false);expect((await page.request.get('/auth/registration')).status()).toBe(401);});

test('HTML-shaped verified subject is displayed literally without executable markup',async({page})=>{
 await begin(page);await page.request.post('/__test/html_subject');await page.getByRole('link',{name:'허용되지 않은 사용자'}).click();
 await expect(page.getByRole('heading',{name:'관리자 허용 대기'})).toBeVisible();
 await expect(page.getByLabel('검증된 sub')).toHaveValue('</textarea><img src=x onerror="window.axInjected=true"><script>window.axInjected=true</script>&"\'');
 await expect(page.locator('img,script')).toHaveCount(0);expect(await page.evaluate(()=>('axInjected' in window))).toBe(false);
 const html=await page.content();expect(html).toContain('&lt;img');expect(html).toContain('&lt;script&gt;');expect((await page.context().cookies()).some(c=>c.name==='__Host-ax-session')).toBe(false);
});
