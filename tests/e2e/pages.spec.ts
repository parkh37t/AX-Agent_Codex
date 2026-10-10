import { test, expect, type Page, type Download } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { Project, Task } from '../../shared/domain';
import { workflowProject, workflowResult } from '../fixtures/workflow';
const STORE = 'ax-agent-studio:projects:v1';
async function active(page: Page): Promise<Project> {
  return page.evaluate(key => {
    const ps = JSON.parse(localStorage.getItem(key) || '[]');
    return ps.find((p: Project) => p.id === localStorage.getItem('ax-agent-studio:active')) || ps[0];
  }, STORE);
}
async function bytes(d: Download) { expect(await d.failure()).toBeNull(); return readFile((await d.path())!); }
async function seed(page: Page) {
  await page.goto('./');
  await page.getByLabel('프로젝트 백업 파일').setInputFiles({ name: 'synthetic.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(workflowProject())) });
  await expect(page.getByRole('status')).toContainText('백업을 새 프로젝트로 가져왔습니다');
}

test('static four-stage manual flow works without API requests, preserves edits and downloads', async ({ page }, testInfo) => {
  const forbidden: string[] = [], errors: string[] = [];
  page.on('request', r => { if (r.url().includes('/api/') || /https?:\/\/(?!127\.0\.0\.1:5184)/.test(r.url())) forbidden.push(r.url()); });
  page.on('pageerror', e => errors.push(e.message));
  await seed(page);
  await expect(page.getByText('입력 묶음 다운로드 → 본인 ChatGPT에서 실행 → 결과 가져오기로 진행하세요.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '새 프로젝트', exact: true }).click();
  await expect(page.getByText('입력 묶음 다운로드 → 본인 ChatGPT 실행 → 결과 가져오기', { exact: true })).toBeVisible();
  await page.goto('./#/prototype');
  await expect(page.locator('.static-notice')).toContainText('미연결');
  await expect(page.getByRole('button', { name: 'RFP 분석 생성', exact: true })).toHaveCount(0);
  const pairs: Array<[Task, string]> = [['rfp', 'RFP 분석'], ['strategy', '근거 기반 전략'], ['proposal', 'Wylie 제안서'], ['design', '연결된 화면설계']];
  for (const [task, title] of pairs) {
    const p = await active(page);
    const stage = page.getByRole('region', { name: title, exact: true });
    const wait = page.waitForEvent('download');
    await stage.getByRole('button', { name: 'ChatGPT 입력 묶음', exact: true }).click();
    const prompt = (await bytes(await wait)).toString('utf8');
    expect(prompt).toContain('모델 재학습이 아님');
    expect(prompt).toContain('OUTPUT_SCHEMA');
    const ticket = await page.evaluate(({ id, task }) => JSON.parse(sessionStorage.getItem(`ax:manual:${id}:${task}`)!), { id: p.id, task });
    expect(ticket.knowledge[0].sha256).toMatch(/^[a-f0-9]{64}$/);
    const result = workflowResult(p, task);
    if (task === 'rfp') {
      const bad = structuredClone(result); bad.rfp!.items[0].quote = '원문에 없는 인용';
      await stage.getByLabel(`${title} 결과 JSON`).setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ requestId: ticket.id, task, artifacts: bad })) });
      await expect(page.getByRole('status')).toContainText('인용문');
      expect(await active(page)).toEqual(p);
    }
    await stage.getByLabel(`${title} 결과 JSON`).setInputFiles({ name: `${task}.json`, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ requestId: ticket.id, task, artifacts: result })) });
    const dialog = page.getByRole('dialog', { name: '생성 결과 검토' });
    await expect(dialog).toBeVisible();
    expect(await active(page)).toEqual(p);
    if (task === 'rfp') {
      const savedWait = page.waitForEvent('download');
      await dialog.getByRole('button', { name: '결과 JSON 저장', exact: true }).click();
      const saved = await bytes(await savedWait);
      expect(JSON.parse(saved.toString('utf8'))).toEqual({ requestId: ticket.id, task, artifacts: result });
      await page.reload();
      await expect(dialog).toHaveCount(0);
      await stage.getByLabel(`${title} 결과 JSON`).setInputFiles({ name: 'saved-result.json', mimeType: 'application/json', buffer: saved });
      await expect(dialog).toBeVisible();
      expect(await active(page)).toEqual(p);
    }
    await dialog.getByRole('button', { name: '프로젝트에 반영', exact: true }).click();
    await expect(stage).toContainText('검토·반영됨');
  }
  const final = await active(page);
  expect(final.generationHistory?.every(h => h.method === 'manual_chatgpt')).toBe(true);
  expect(final.generationHistory?.every(h => h.knowledge.length === 1)).toBe(true);
  await page.reload();
  await expect(page.getByRole('region', { name: '연결된 화면설계', exact: true })).toContainText('검토·반영됨');
  const htmlWait = page.waitForEvent('download');
  await page.getByRole('button', { name: 'HTML 프로토타입', exact: true }).click();
  expect((await bytes(await htmlWait)).toString('utf8')).toContain('요청 등록');
  await page.getByRole('button', { name: '내보내기', exact: true }).click();
  const backupWait = page.waitForEvent('download');
  await page.getByRole('button', { name: '프로젝트 백업 JSON', exact: true }).click();
  const backup = await bytes(await backupWait);
  expect((JSON.parse(backup.toString('utf8')) as Project).rfp?.items[0].sourceId).toBe('SRC-RFP');
  await page.getByLabel('프로젝트 백업 파일').setInputFiles({ name: 'restore.json', mimeType: 'application/json', buffer: backup });
  await expect(page.getByRole('status')).toContainText('백업을 새 프로젝트로 가져왔습니다');
  expect((await active(page)).id).not.toBe(final.id);
  expect((await active(page)).screens).toEqual(final.screens);
  await page.goto('./#/prototype');
  if (await page.getByLabel('알림 닫기').isVisible()) await page.getByLabel('알림 닫기').click();
  await page.screenshot({ path: testInfo.outputPath('pages-workflow.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.locator('.sidebar').evaluate(el => el.getBoundingClientRect().right)).toBeLessThanOrEqual(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('pages-mobile.png'), fullPage: true });
  await page.goto('./#/settings');
  await expect(page.getByRole('heading', { name: '공개 웹의 실행 범위' })).toBeVisible();
  expect(forbidden).toEqual([]); expect(errors).toEqual([]);
});

test('static RFP text and PDF extraction stays in the browser and never visits PDF links', async ({ page }) => {
  const api: string[] = [];
  page.on('request', r => { if (r.url().includes('/api/') || r.url().includes('example.invalid')) api.push(r.url()); });
  await seed(page);
  await page.goto('./#/sources');
  const input = page.locator('input[type=file][accept=".pdf,.txt,.md,.csv,.json"]');
  await input.setInputFiles({ name: 'synthetic-rfp.md', mimeType: 'text/markdown', buffer: Buffer.from('합성 요구: 요청의 상태를 조회한다.') });
  await expect(page.getByRole('status')).toContainText('1개 자료');
  expect((await active(page)).sources.some(s => s.text.includes('합성 요구: 요청의 상태'))).toBe(true);
  await input.setInputFiles({ name: 'synthetic-rfp.pdf', mimeType: 'application/pdf', buffer: pdf(['Synthetic RFP: request submission'], true) });
  await expect.poll(async () => (await active(page)).sources.some(s => s.name === 'synthetic-rfp.pdf')).toBe(true);
  const source = (await active(page)).sources.find(s => s.name === 'synthetic-rfp.pdf')!;
  expect(source.text).toContain('Synthetic RFP: request submission');
  expect(source.readScope).toContain('이 브라우저에서만');
  expect(api).toEqual([]);
});

function pdf(pages: string[], externalLink = false) {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, index) => `${4 + index * 2} 0 R`).join(" ")}] >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  for (const text of pages) {
    const contentObject = objects.length + 2;
    const escaped = text
      .replaceAll("\\", "\\\\")
      .replaceAll("(", "\\(")
      .replaceAll(")", "\\)");
    const stream = text ? `BT /F1 12 Tf 20 200 Td (${escaped}) Tj ET` : "";
    const annotation = externalLink
      ? "/Annots [<< /Type /Annot /Subtype /Link /Rect [10 10 100 30] /A << /S /URI /URI (https://example.invalid/private-source) >> >>]"
      : "";
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObject} 0 R ${annotation} >>`,
    );
    objects.push(
      `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    );
  }
  let output = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(output));
    output += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(output);
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  output += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("");
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(output, "ascii");
}
