import {test,expect,type Page} from '@playwright/test';
const rfp='협력사는 요청 제목을 입력하고 요청을 등록한다. 등록 실패 시 재시도 안내를 제공한다. 자동 결제는 이번 범위에서 제외한다. 예산은 미확정이다. 제출 기한은 본문 6일과 부록 8일이 상충한다.';
async function login(page:Page,user='A'){await page.goto('/');await page.getByRole('link',{name:'로그인',exact:true}).click();await page.getByRole('link',{name:'테스트 사용자 '+user}).click();await expect(page.getByRole('button',{name:'로그아웃'})).toBeVisible();}
test('real browser/server/OIDC flow, four synthetic stages, editing, isolation, errors and expiry',async({page,browser})=>{
 await login(page);await expect(page.getByText('모의 검증 모드',{exact:false})).toBeVisible();await page.getByLabel('프로젝트 제목').fill('합성 서버 E2E');await page.getByLabel('RFP 원문',{exact:true}).fill(rfp);await page.getByRole('button',{name:'서버에 저장'}).click();await expect(page.getByText('저장 리비전 1',{exact:true})).toBeVisible();
 const id=await page.getByLabel('저장된 프로젝트').inputValue();
 for(const [index,label] of ['RFP 분석','전략','제안서','화면 설계'].entries()){await page.getByRole('button',{name:label+' 생성',exact:true}).click();await expect(page.getByText('작업 상태: completed')).toBeVisible();if(index===0){await page.reload();await page.getByLabel('저장된 프로젝트').selectOption(id);await expect(page.getByText('작업 상태: completed')).toBeVisible();}await expect(page.getByText('저장 리비전 '+(index+1),{exact:true})).toBeVisible();await page.getByLabel('출처와 미확정 사항을 검토했습니다').check();await page.getByRole('button',{name:'검토 후 반영',exact:true}).click();await expect(page.getByText('저장 리비전 '+(index+2),{exact:true})).toBeVisible();}
 await expect(page.getByText('요구 2 · 전략 1 · 제안 슬라이드 1 · 화면 1')).toBeVisible();await page.screenshot({path:'/workspace/ax-intake/operator-workflow.png',fullPage:true});
 await page.getByLabel('프로젝트 제목').fill('합성 서버 E2E 편집');await page.getByRole('button',{name:'서버에 저장'}).click();await expect(page.getByText('저장 리비전 6',{exact:true})).toBeVisible();
 const stored=await page.evaluate(async id=>await(await fetch('/api/projects/'+id)).json(),id);expect(stored.snapshots).toHaveLength(4);
 const b=await browser.newContext({ignoreHTTPSErrors:true});const other=await b.newPage();await login(other,'B');await expect(other.getByLabel('저장된 프로젝트').locator('option')).toHaveCount(1);expect(await other.evaluate(async id=>(await fetch('/api/projects/'+id)).status,id)).toBe(404);await b.close();
 await page.request.post('/__test/fail');await page.getByRole('button',{name:'RFP 분석 생성',exact:true}).click();await expect(page.getByText('작업 상태: failed')).toBeVisible();await expect(page.getByText('저장 리비전 6',{exact:true})).toBeVisible();
 await page.request.post('/__test/expire');await page.getByRole('button',{name:'RFP 분석 생성',exact:true}).click();await expect(page.getByRole('link',{name:'로그인',exact:true})).toBeVisible();await expect(page.getByLabel('RFP 원문',{exact:true})).toHaveCount(0);await expect(page.getByText('세션이 만료되었습니다. 다시 로그인하세요.')).toBeVisible();
});
test('logout removes access and callback replay is denied',async({page})=>{let callback='';page.on('request',r=>{if(r.url().includes('/auth/callback?'))callback=r.url();});await login(page);const cookies=await page.context().cookies();const session=cookies.find(c=>c.name==='__Host-ax-session');expect(session).toMatchObject({httpOnly:true,secure:true,sameSite:'Lax'});await page.getByRole('button',{name:'로그아웃'}).click();await expect(page.getByRole('link',{name:'로그인',exact:true})).toBeVisible();expect((await page.request.get('/api/projects')).status()).toBe(401);await page.goto(callback);await expect(page.getByText('로그인 확인에 실패했습니다.',{exact:false})).toBeVisible();});
for(const kind of ['state','nonce','pkce','issuer','audience','signature','response_issuer','expired','unauthorized']){
 test(`OIDC rejects ${kind} and issues no AX session`,async({page})=>{
  await page.goto('/');await page.getByRole('link',{name:'로그인',exact:true}).click();
  if(kind!=='unauthorized')expect((await page.request.post('/__test/'+kind)).status()).toBe(204);
  const callback=page.waitForResponse(r=>r.url().includes('/auth/callback?'));
  await page.getByRole('link',{name:kind==='unauthorized'?'허용되지 않은 사용자':'테스트 사용자 A'}).click();
  expect((await callback).status()).toBe(401);
  await expect(page.getByText('로그인 확인에 실패했습니다.',{exact:false})).toBeVisible();
  expect((await page.context().cookies()).some(c=>c.name==='__Host-ax-session')).toBe(false);
  expect((await page.request.get('/api/projects')).status()).toBe(401);
 });
}
