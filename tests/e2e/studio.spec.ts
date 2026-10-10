import { test as base, expect, type Page, type Download } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import type { Artifacts, GenerateRequest, Project } from '../../shared/domain';
import { workflowProject, workflowResult } from '../fixtures/workflow';

const STORE_KEY = 'ax-agent-studio:projects:v1';
const ROUTES = ['/', '/sources', '/proposal', '/handoff', '/asis', '/plan', '/trace', '/prototype', '/references', '/advanced', '/settings', '/new'];
type TestBridge = { requests: GenerateRequest[]; allowGeneration: boolean; holdCompletion: boolean; polls: number; result?: Artifacts; failNext?: boolean };

// Every API route is intercepted. The fake completion is an explicit UI fixture,
// not evidence of a real Codex inference or account connection.
const test = base.extend<{ bridge: TestBridge; browserErrors: string[] }>({
  browserErrors: [async ({ page }, use) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(`page: ${error.message}`));
    page.on('console', message => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
    await use(errors);
    expect(errors, 'No browser JavaScript or console errors').toEqual([]);
  }, { auto: true }],
  bridge: [async ({ page }, use) => {
    const state: TestBridge = { requests: [], allowGeneration: false, holdCompletion: false, polls: 0 };
    const unexpected: string[] = [];
    await page.route('**/api/**', async route => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      if (path === '/api/status') return route.fulfill({ json: {
        installed: true, authenticated: true, authMode: 'chatgpt', version: 'UI-TEST-FAKE',
        message: 'E2E 테스트 응답입니다. 실제 로그인이나 모델 호출을 확인하지 않았습니다.',
      } });
      if (path === '/api/session') return route.fulfill({ json: { token: 'explicit-e2e-fake-session' } });
      if (path === '/api/jobs' && request.method() === 'POST' && state.allowGeneration) {
        const input = request.postDataJSON() as GenerateRequest;
        state.requests.push(input);
        if (state.failNext) { state.failNext = false; return route.fulfill({ status: 503, json: { error: '명시적 합성 실패: 다시 시도하세요.' } }); }
        const p = input.project;
        state.result = {
          proposal: {
            summary: '명시적 E2E 가짜 결과: 사용자가 반영하기 전에는 원본을 바꾸지 않습니다.',
            winThemes: ['테스트용 전략'],
            slides: [{ id: 'SLD-UI-TEST', title: 'E2E 가짜 생성 장표', message: '모델 호출 없는 인터셉트 응답', bullets: ['수동 검토 후 반영'], diagram: 'statement', requirementIds: [], evidenceIds: [], claim: 'hypothesis' }],
          },
          analysis: p.analysis, requirements: p.requirements, ia: p.ia, functions: p.functions,
          screens: p.screens, assumptions: ['UI 테스트용 가짜 응답이며 실제 추론 결과가 아닙니다.'],
        };
        if (input.workflow) state.result = workflowResult(p, input.task);
        return route.fulfill({ status: 202, json: { id: 'explicit-ui-test-job' } });
      }
      if (path === '/api/jobs/explicit-ui-test-job' && state.result) {
        state.polls++;
        return route.fulfill({ json: {
          id: 'explicit-ui-test-job', status: state.holdCompletion ? 'queued' : 'completed',
          stage: state.holdCompletion ? '명시적 UI 테스트 대기' : '명시적 UI 테스트 완료',
          startedAt: '2026-10-10T00:00:00.000Z', ...(state.holdCompletion ? {} : { result: state.result }),
        } });
      }
      unexpected.push(`${request.method()} ${path}`);
      // Never fall through to the real bridge, even if a new endpoint appears.
      return route.fulfill({ status: 409, json: { error: 'Blocked unexpected API in UI test' } });
    });
    await use(state);
    expect(unexpected, 'No real backend operations may escape UI tests').toEqual([]);
  }, { auto: true }],
});

async function navigate(page: Page, route: string) {
  await page.goto(`/#${route}`);
  await expect(page.locator(route === '/' ? '.hero h2' : '.section-head h1')).toBeVisible();
}

async function activeProject(page: Page): Promise<Project> {
  return page.evaluate(key => {
    const projects = JSON.parse(localStorage.getItem(key) || '[]') as Project[];
    const active = localStorage.getItem('ax-agent-studio:active');
    return projects.find(project => project.id === active) || projects[0];
  }, STORE_KEY);
}

async function downloadBytes(download: Download) {
  expect(await download.failure()).toBeNull();
  const path = await download.path();
  expect(path).not.toBeNull();
  return readFile(path!);
}

async function exportFromMenu(page: Page, label: string) {
  await page.getByRole('button', { name: '내보내기', exact: true }).click();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: label, exact: true }).click();
  return downloaded;
}

test('demo is labelled and every workspace route renders without console errors', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.demo-notice')).toContainText('체험 프로젝트 · 합성 자료로 구성된 예시입니다.');
  for (const route of ROUTES) {
    await navigate(page, route);
    await expect(page.getByLabel('프로젝트 선택')).toHaveValue((await activeProject(page)).id);
  }
});

test('create project, add a source, plan linked screens, edit a spec and download real files', async ({ page }) => {
  await navigate(page, '/new');
  await page.getByLabel('프로젝트의 목표').fill('협력사가 요청을 등록하고 처리 내역을 확인할 수 있게 개선한다.');
  await page.getByPlaceholder('예: 모아 앱 경험 리뉴얼').fill('E2E 협력사 업무 설계');
  await page.getByLabel('고객 · 조직', { exact: true }).fill('합성 테스트 조직');
  await page.getByRole('button', { name: '프로젝트 만들기', exact: true }).click();
  await expect(page).toHaveURL(/#\/proposal$/);
  await expect(page.locator('.demo-notice')).toHaveCount(0);

  await navigate(page, '/sources');
  await page.getByLabel('자료 유형').selectOption('meeting');
  await page.getByLabel('자료 이름').fill('킥오프 회의 메모');
  await page.getByLabel('내용', { exact: true }).fill('2026-10-10 합성 회의: 협력사는 요청 제목을 입력하고, 처리 결과를 조회한다.');
  await page.getByRole('button', { name: '자료 추가', exact: true }).click();
  await expect(page.locator('.source-card')).toContainText('킥오프 회의 메모');
  await expect(page.locator('.source-card')).toContainText('원문 전체 여부 미확인');

  await navigate(page, '/plan');
  await page.getByRole('button', { name: '메뉴로 초안 만들기', exact: true }).click();
  await page.getByLabel('메뉴 구조', { exact: true }).fill('업무 대시보드\n거래 내역\n요청 등록');
  await page.getByRole('button', { name: '연결된 화면 초안 만들기', exact: true }).click();
  await expect(page.locator('.screen-nav-item')).toHaveCount(3);
  const planned = await activeProject(page);
  expect(planned.sources).toHaveLength(1);
  expect(planned.requirements).toHaveLength(3);
  expect(planned.ia).toHaveLength(3);
  expect(planned.functions).toHaveLength(3);
  expect(planned.screens).toHaveLength(3);
  for (const screen of planned.screens) {
    expect(screen.id).toMatch(/^SCR-/);
    for (const functionId of screen.functionIds) {
      const fn = planned.functions.find(item => item.id === functionId)!;
      expect(planned.ia.some(item => item.id === fn.iaId)).toBe(true);
      expect(fn.requirementIds.every(id => planned.requirements.some(item => item.id === id))).toBe(true);
    }
  }
  const preview = page.frameLocator('iframe');
  await expect(preview.getByRole('heading', { name: '요청 등록', exact: true })).toBeVisible();
  await preview.getByRole('tab', { name: '오류', exact: true }).click();
  await expect(preview.getByRole('heading', { name: '정보를 불러오지 못했습니다' })).toBeVisible();
  await preview.getByRole('button', { name: '다시 시도', exact: true }).click();
  await expect(preview.getByRole('tab', { name: '정상', exact: true })).toHaveAttribute('aria-selected', 'true');

  await page.getByRole('button', { name: '화면 명세 편집', exact: true }).click();
  await page.getByLabel('화면 이름', { exact: true }).fill('협력사 요청 등록');
  await page.getByLabel('필드 1 이름', { exact: true }).fill('요청 제목');
  await page.getByLabel('필드 1 검증 규칙', { exact: true }).fill('요청 제목은 필수입니다.');
  await page.locator('.field-edit-row').getByLabel('필수', { exact: true }).check();
  await page.getByRole('button', { name: '화면 미리보기', exact: true }).click();
  await expect(preview.getByRole('heading', { name: '협력사 요청 등록', exact: true })).toBeVisible();
  await preview.getByRole('button', { name: '입력 확인', exact: true }).click();
  await expect(preview.getByRole('status')).toContainText('필수 항목과 입력 형식을 확인');
  await preview.getByLabel('요청 제목').fill('업무 개선 요청');
  await preview.getByRole('button', { name: '입력 확인', exact: true }).click();
  await expect(preview.getByRole('status')).toContainText('입력 확인을 마쳤습니다');

  const jsonDownload = await exportFromMenu(page, '프로젝트 백업 JSON');
  expect(jsonDownload.suggestedFilename()).toMatch(/\.json$/);
  const backup = JSON.parse((await downloadBytes(jsonDownload)).toString('utf8')) as Project;
  expect(backup.title).toBe('E2E 협력사 업무 설계');
  expect(backup.screens.at(-1)?.title).toBe('협력사 요청 등록');
  const htmlDownload = await exportFromMenu(page, '오프라인 프로토타입 HTML');
  expect(htmlDownload.suggestedFilename()).toMatch(/\.html$/);
  const html = (await downloadBytes(htmlDownload)).toString('utf8');
  expect(html).toContain('협력사 요청 등록');
  expect(html).toContain('요청 제목');
  expect(html).toContain("connect-src 'none'");

  await page.reload();
  await expect(page.locator('.screen-nav-item')).toHaveCount(3);
  expect((await activeProject(page)).screens.at(-1)?.title).toBe('협력사 요청 등록');
});

test('demo PPTX download contains editable presentation text', async ({ page }) => {
  await navigate(page, '/proposal');
  const project = await activeProject(page);
  const download = await exportFromMenu(page, '제안서 PPTX');
  expect(download.suggestedFilename()).toMatch(/\.pptx$/);
  const bytes = await downloadBytes(download);
  expect(bytes.subarray(0, 2).toString()).toBe('PK');
  const zip = await JSZip.loadAsync(bytes);
  expect(zip.file('ppt/presentation.xml')).not.toBeNull();
  const slideFiles = Object.keys(zip.files).filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name));
  expect(slideFiles.length).toBeGreaterThanOrEqual(project.proposal.slides.length + 1);
  const slideText = (await Promise.all(slideFiles.map(name => zip.file(name)!.async('string')))).join('\n');
  expect(slideText).toContain('<a:t>');
  expect(slideText).toContain('합성 예시');
});

test('invalid import and invalid JSON edits preserve the stored original', async ({ page }) => {
  await navigate(page, '/advanced');
  const before = await activeProject(page);
  const rawBefore = await page.evaluate(key => localStorage.getItem(key), STORE_KEY);
  await page.locator('input[type=file][accept=".json"]').setInputFiles({
    name: 'invalid-project.json', mimeType: 'application/json', buffer: Buffer.from('{"version":1,"title":"invalid"}'),
  });
  await expect(page.getByRole('status')).toContainText('기존 프로젝트는 유지했습니다');
  expect(await activeProject(page)).toEqual(before);
  expect(await page.evaluate(key => localStorage.getItem(key), STORE_KEY)).toBe(rawBefore);
  await page.getByRole('button', { name: '전체 JSON', exact: true }).click();
  await page.getByLabel('프로젝트 JSON').fill('{ broken');
  await page.getByRole('button', { name: '검증하고 반영', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  expect(await activeProject(page)).toEqual(before);
  await page.getByRole('button', { name: '현재 데이터로 되돌리기', exact: true }).click();
  expect(JSON.parse(await page.getByLabel('프로젝트 JSON').inputValue())).toEqual(before);
  await page.reload();
  expect(await activeProject(page)).toEqual(before);
});

test('malformed persisted data keeps an exact recovery backup when a new project is created', async ({ page }) => {
  await page.goto('/');
  const damaged = '[{"version":999,"title":"keep this original"}]';
  await page.evaluate(({ key, value }) => localStorage.setItem(key, value), { key: STORE_KEY, value: damaged });
  await page.reload();
  await expect(page.locator('.recovery-strip')).toContainText('원본을 별도로 보관');
  const recoveryDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: '원본 복구 파일 다운로드', exact: true }).click();
  expect((await downloadBytes(await recoveryDownload)).toString('utf8')).toBe(damaged);
  const recoveryCopies = () => page.evaluate(key => Object.keys(localStorage)
    .filter(name => name.startsWith(`${key}:recovery:`)).map(name => localStorage.getItem(name)), STORE_KEY);
  expect(await recoveryCopies()).toContain(damaged);
  await page.getByRole('button', { name: '새 프로젝트', exact: true }).click();
  await page.getByLabel('프로젝트의 목표').fill('복구 후 새 작업을 시작한다.');
  await page.getByRole('button', { name: '프로젝트 만들기', exact: true }).click();
  await expect(page).toHaveURL(/#\/proposal$/);
  expect((await activeProject(page)).brief).toBe('복구 후 새 작업을 시작한다.');
  expect(await recoveryCopies()).toContain(damaged);
});

test('switching copied projects with identical screen IDs shows the selected project values', async ({ page }) => {
  await navigate(page, '/plan');
  const original = await activeProject(page);
  const copy = structuredClone(original);
  copy.title = 'E2E 동일 ID 백업 복제';
  copy.screens[0].roles = ['복제 프로젝트 전용 역할'];
  copy.screens[0].sections = ['복제 프로젝트 전용 영역'];
  await page.locator('input[type=file][accept=".json"]').setInputFiles({
    name: 'valid-copy.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(copy)),
  });
  await expect(page.getByRole('status')).toContainText('백업을 새 프로젝트로 가져왔습니다');
  const imported = await activeProject(page);
  expect(imported.id).not.toBe(original.id);
  await navigate(page, '/plan');
  await page.getByRole('button', { name: '화면 명세 편집', exact: true }).click();
  await expect(page.getByLabel('사용자 역할 · 쉼표로 구분')).toHaveValue('복제 프로젝트 전용 역할');
  await page.getByLabel('프로젝트 선택').selectOption(original.id);
  await page.getByRole('button', { name: '화면 명세 편집', exact: true }).click();
  await expect(page.getByLabel('사용자 역할 · 쉼표로 구분')).toHaveValue(original.screens[0].roles.join(', '));
  await expect(page.getByLabel('레이아웃 영역 · 한 줄에 하나')).toHaveValue(original.screens[0].sections.join('\n'));
  // Trigger blur as a user would; a stale uncontrolled value must not overwrite A.
  await page.getByLabel('사용자 역할 · 쉼표로 구분').focus();
  await page.getByLabel('화면 이름', { exact: true }).focus();
  expect((await activeProject(page)).screens[0].roles).toEqual(original.screens[0].roles);
});

test('adding fields beyond the supported maximum cannot corrupt persisted projects', async ({ page }) => {
  await navigate(page, '/plan');
  const original = await activeProject(page);
  await page.getByRole('button', { name: '화면 명세 편집', exact: true }).click();
  const add = page.getByRole('button', { name: '필드 추가', exact: true });
  const initialCount = await page.locator('.field-edit-row').count();
  for (let count = initialCount; count < 31; count++) {
    if (await add.isEnabled()) await add.click();
  }
  expect(await page.locator('.field-edit-row').count()).toBeLessThanOrEqual(30);
  await page.reload();
  await expect(page.locator('.error-strip')).toHaveCount(0);
  expect((await activeProject(page)).id).toBe(original.id);
});

test('390px mobile routes do not overflow and navigation closes after selection', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of ROUTES) {
    await navigate(page, route);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), { message: `${route} horizontal overflow` }).toBeLessThanOrEqual(1);
  }
  await page.getByRole('button', { name: '메뉴 열기', exact: true }).click();
  await page.locator('.sidebar').getByRole('link', { name: '자료 보관함', exact: true }).click();
  await expect(page).toHaveURL(/#\/sources$/);
  await expect(page.getByRole('button', { name: '메뉴 닫기', exact: true })).toHaveCount(0);
});

test('explicit fake AI completion requires review and preserves the previous version on apply', async ({ page, bridge }) => {
  bridge.allowGeneration = true;
  await navigate(page, '/proposal');
  const original = await activeProject(page);
  await page.getByRole('button', { name: 'Codex로 제안 설계', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '생성 결과 검토' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('명시적 E2E 가짜 결과');
  expect(bridge.requests).toHaveLength(1);
  expect(bridge.requests[0].task).toBe('proposal');
  expect(bridge.requests[0].project.id).toBe(original.id);
  expect((await activeProject(page)).proposal).toEqual(original.proposal);
  await dialog.getByRole('button', { name: '프로젝트에 반영', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByLabel('결론 제목', { exact: true })).toHaveValue('E2E 가짜 생성 장표');
  const changed = await activeProject(page);
  expect(changed.id).toBe(original.id);
  expect(changed.sources).toEqual(original.sources);
  expect(changed.screens).toEqual(original.screens);
  const history = await page.evaluate(id => JSON.parse(localStorage.getItem(`ax-agent-studio:history:${id}`) || '[]'), original.id);
  expect(history[0].label).toBe('제안 설계 반영 전');
  expect(history[0].project).toEqual(original);
  await navigate(page, '/advanced');
  await page.getByRole('button', { name: '버전 보관함', exact: true }).click();
  await expect(page.locator('.history-row')).toContainText('제안 설계 반영 전');
  page.once('dialog', dialog => dialog.accept());
  await page.locator('.history-row').getByRole('button', { name: '복원', exact: true }).click();
  expect((await activeProject(page)).proposal).toEqual(original.proposal);
});

test('fake queued and completed jobs recover after reload and closed results can reopen', async ({ page, bridge }) => {
  bridge.allowGeneration = true;
  bridge.holdCompletion = true;
  await navigate(page, '/proposal');
  const original = await activeProject(page);
  const readBookmark = () => page.evaluate(() => JSON.parse(sessionStorage.getItem('ax-agent-studio:active-job') || 'null'));
  await page.getByRole('button', { name: 'Codex로 제안 설계', exact: true }).click();
  await expect.poll(readBookmark).toEqual({
    id: 'explicit-ui-test-job',
    context: { projectId: original.id, task: 'proposal', updatedAt: original.updatedAt, instruction: '', workflow: false },
  });
  await expect(page.locator('.job-bar')).toContainText('명시적 UI 테스트 대기');
  const bookmark = await readBookmark();
  const pollsBeforeReload = bridge.polls;

  // Reload while the fake server still reports queued. The existing job must be
  // polled again; a second generation request would duplicate paid work.
  await page.reload();
  await expect(page.locator('.job-bar')).toContainText('명시적 UI 테스트 대기');
  await expect.poll(() => bridge.polls).toBeGreaterThan(pollsBeforeReload);
  expect(await readBookmark()).toEqual(bookmark);
  expect(bridge.requests).toHaveLength(1);
  expect(await activeProject(page)).toEqual(original);

  bridge.holdCompletion = false;
  const dialog = page.getByRole('dialog', { name: '생성 결과 검토' });
  await expect(dialog).toContainText('명시적 E2E 가짜 결과');
  expect(await readBookmark()).toEqual(bookmark);
  await dialog.getByRole('button', { name: '결과 닫기', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole('button', { name: '결과 검토', exact: true }).click();
  await expect(dialog).toContainText('명시적 E2E 가짜 결과');
  expect(await activeProject(page)).toEqual(original);

  // Completion is also recoverable after closing the modal and reloading.
  await dialog.getByRole('button', { name: '결과 닫기', exact: true }).click();
  await page.reload();
  await expect(dialog).toContainText('명시적 E2E 가짜 결과');
  expect(bridge.requests).toHaveLength(1);
  expect(await activeProject(page)).toEqual(original);
  expect(await readBookmark()).toEqual(bookmark);
  await dialog.getByRole('button', { name: '프로젝트에 반영', exact: true }).click();
  await expect(page.getByLabel('결론 제목', { exact: true })).toHaveValue('E2E 가짜 생성 장표');
  await expect.poll(readBookmark).toBeNull();
});

test('acceptance review persists, exports, invalidates after editing, and imports as history', async ({ page }, testInfo) => {
  await navigate(page, '/trace');
  const original = await activeProject(page);
  const first = original.requirements[0];
  const panel = page.getByRole('region', { name: '수용 기준 검증 기록' });
  await panel.getByLabel('검증할 요구사항').selectOption(first.id);
  await panel.getByLabel('확인자', { exact: true }).fill('합성 E2E 검토자');
  await panel.getByLabel('검증 방법').selectOption('prototype');
  await panel.getByLabel('검증 결과').selectOption('pass');
  await panel.getByLabel('관찰 근거 · 실행 방법과 결과').fill('합성 테스트: 정상·빈값·오류 탭의 표시만 확인. 실제 업무 API 미호출.');
  await panel.getByRole('button', { name: '검증 기록 추가', exact: true }).click();
  await expect(panel.locator('.verification-record')).toHaveCount(1);
  await expect(panel.locator('.verification-record')).toContainText('프로토타입 시뮬레이션');
  const saved = await activeProject(page);
  expect(saved.requirements).toEqual(original.requirements);
  expect(saved.handoff).toEqual(original.handoff);
  expect(saved.verifications?.[0].invalidated).toBe(false);
  await page.reload();
  await expect(panel.locator('.verification-record')).toContainText('합성 E2E 검토자');
  const csvPromise = page.waitForEvent('download');
  await panel.getByRole('button', { name: '검증 이력 CSV', exact: true }).click();
  const csv = (await downloadBytes(await csvPromise)).toString('utf8');
  expect(csv).toContain(first.acceptance);
  expect(csv).toContain('프로토타입 시뮬레이션');
  await navigate(page, '/advanced');
  const editor = page.locator('.requirement-editor').filter({ has: page.getByText(first.id, { exact: true }) });
  await editor.getByRole('textbox', { name: '수용 기준', exact: true }).fill(first.acceptance + ' 새 조건을 추가한다.');
  await expect.poll(async () => (await activeProject(page)).requirements[0].acceptance).toBe(first.acceptance + ' 새 조건을 추가한다.');
  await expect.poll(async () => (await activeProject(page)).verifications?.[0].invalidated).toBe(true);
  await navigate(page, '/trace');
  await expect(panel.locator('.verification-record')).toContainText('재검증 필요');
  expect((await activeProject(page)).verifications?.[0].acceptance).toBe(first.acceptance);
  await panel.screenshot({ path: testInfo.outputPath('verification-desktop.png') });
  const backupDownload = await exportFromMenu(page, '프로젝트 백업 JSON');
  const backup = await downloadBytes(backupDownload);
  await page.locator('input[type=file][accept=".json"]').setInputFiles({ name: 'review-backup.json', mimeType: 'application/json', buffer: backup });
  await expect(page.getByRole('status')).toContainText('백업을 새 프로젝트로 가져왔습니다');
  const imported = await activeProject(page);
  expect(imported.id).not.toBe(original.id);
  expect(imported.verifications).toEqual((JSON.parse(backup.toString('utf8')) as Project).verifications);
  await navigate(page, '/trace');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.locator('.sidebar').evaluate(el => el.getBoundingClientRect().right)).toBeLessThanOrEqual(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await expect(panel.getByRole('button', { name: '검증 기록 추가' })).toBeVisible();
  await panel.screenshot({ path: testInfo.outputPath('verification-mobile.png') });
});

test('failed snapshot prevents acceptance review mutation', async ({ page }) => {
  await navigate(page, '/trace');
  const before = await activeProject(page);
  await page.evaluate(() => {
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key.startsWith('ax-agent-studio:history:')) throw new DOMException('quota', 'QuotaExceededError');
      return set.call(this, key, value);
    };
  });
  const panel = page.getByRole('region', { name: '수용 기준 검증 기록' });
  await panel.getByLabel('확인자', { exact: true }).fill('합성 검토자');
  await panel.getByLabel('관찰 근거 · 실행 방법과 결과').fill('미실행 사유를 기록');
  await panel.getByRole('button', { name: '검증 기록 추가', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('변경을 중단');
  expect(await activeProject(page)).toEqual(before);
  await expect(panel.locator('.verification-record')).toHaveCount(0);
});

test('four explicit workflow jobs require review, preserve failures, and propagate evidence', async ({ page, bridge, browserErrors }, testInfo) => {
  await page.goto('/');
  await page.locator('input[type=file][accept=".json"]').setInputFiles({ name: 'synthetic-rfp.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(workflowProject())) });
  await expect(page.getByRole('status')).toContainText('백업을 새 프로젝트로 가져왔습니다');
  await navigate(page, '/prototype');
  bridge.allowGeneration = true;
  bridge.failNext = true;
  const before = await activeProject(page);
  await page.getByRole('button', { name: 'RFP 분석 생성', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('명시적 합성 실패');
  await expect.poll(() => browserErrors).toEqual(['console: Failed to load resource: the server responded with a status of 503 (Service Unavailable)']);
  browserErrors.splice(0); // This deliberately injected HTTP failure is expected; later errors still fail the fixture.
  expect(await activeProject(page)).toEqual(before);
  for (const [index, title] of ['RFP 분석', '근거 기반 전략', 'Wylie 제안서', '연결된 화면설계'].entries()) {
    const stage = page.getByRole('region', { name: title, exact: true });
    await stage.getByRole('button', { name: index === 0 ? '이 단계 다시 생성' : `${title} 생성`, exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '생성 결과 검토' });
    await expect(dialog).toBeVisible();
    const unchanged = await activeProject(page);
    expect(Object.keys(unchanged.workflow ?? {})).toHaveLength(index);
    await dialog.getByRole('button', { name: '프로젝트에 반영', exact: true }).click();
    await expect(stage).toContainText('검토·반영됨');
  }
  expect(bridge.requests.map((r) => r.task)).toEqual(['rfp', 'rfp', 'strategy', 'proposal', 'design']);
  const p = await activeProject(page);
  expect(p.rfp?.items[0].sourceId).toBe('SRC-RFP');
  expect(p.strategies?.[0].requirementIds).toEqual(['internal:REQ-1']);
  expect(p.proposal.slides[0].strategyIds).toEqual(['internal:STR-1']);
  expect(p.screens[0].functionIds).toEqual(['internal:FN-1']);
  expect(p.generationHistory).toHaveLength(4);
  await page.screenshot({ path: testInfo.outputPath('workflow-local.png'), fullPage: true });
  // Use the supported whole-project editor to change source text while preserving all existing outputs.
  await navigate(page, '/advanced');
  await page.getByRole('button', { name: '전체 JSON', exact: true }).click();
  const revised = structuredClone(p); revised.sources[0].text += ' 추가 조건';
  await page.getByLabel('프로젝트 JSON').fill(JSON.stringify(revised));
  await page.getByRole('button', { name: '검증하고 반영', exact: true }).click();
  await navigate(page, '/prototype');
  await expect(page.getByRole('region', { name: '근거 기반 전략', exact: true })).toContainText('입력 변경 · 재검토 필요');
});
