import { describe, expect, it } from 'vitest';
import { createProject, projectSchema, recordVerification, invalidateVerifications, invalidateImportedVerifications, mergeArtifacts } from '../shared/domain';
import { verificationCsv, projectMarkdown } from '../src/lib/exports';
import { makeDemoProject } from '../src/lib/demo';

function reviewed() {
  const p = makeDemoProject();
  return recordVerification(p, { requirementId: p.requirements[0].id, result: 'pass', method: 'prototype', reviewer: '합성 검토자', evidence: '정상·빈값·오류 탭을 수동 확인한 합성 기록' });
}

describe('acceptance verification lifecycle', () => {
  it('loads old backups without inventing execution evidence', () => {
    const p = projectSchema.parse(createProject('기존 프로젝트'));
    expect(p.verifications).toBeUndefined();
  });
  it('records evidence without promoting claims, requirements or scope', () => {
    const before = makeDemoProject(), after = reviewed();
    expect(after.requirements).toEqual(before.requirements);
    expect(after.handoff).toEqual(before.handoff);
    expect(after.verifications?.[0]).toMatchObject({ result: 'pass', method: 'prototype', invalidated: false, acceptance: before.requirements[0].acceptance });
    expect(projectSchema.parse(JSON.parse(JSON.stringify(after)))).toEqual(after);
  });
  it.each(['pass', 'fail', 'error', 'not_run'] as const)('preserves %s as an explicit user result', (result) => {
    const p = reviewed();
    expect(recordVerification(p, { requirementId: p.requirements[0].id, result, method: 'document_review', evidence: '사유', reviewer: '담당자' }).verifications?.[1].result).toBe(result);
  });
  it('rejects missing criteria, unknown requirements and blank evidence/reviewer', () => {
    const p = makeDemoProject();
    const input = { requirementId: p.requirements[0].id, result: 'pass' as const, method: 'live_system' as const, evidence: '확인', reviewer: '담당자' };
    expect(() => recordVerification(p, { ...input, requirementId: 'absent' })).toThrow();
    expect(() => recordVerification(p, { ...input, evidence: ' ' })).toThrow();
    expect(() => recordVerification(p, { ...input, reviewer: ' ' })).toThrow();
    p.requirements[0].acceptance = ' ';
    expect(() => recordVerification(p, input)).toThrow();
  });
  it.each(['requirement', 'acceptance', 'source', 'function', 'screen', 'menu', 'handoff', 'deletion'])('invalidates after %s changes without erasing the recorded result', (change) => {
    const before = reviewed(), after = structuredClone(before);
    if (change === 'requirement') after.requirements[0].text += ' 수정';
    if (change === 'acceptance') after.requirements[0].acceptance += ' 수정';
    if (change === 'source') after.sources.find(s => before.requirements[0].sourceIds.includes(s.id))!.text += ' 수정';
    if (change === 'function') after.functions.find(f => f.requirementIds.includes(before.requirements[0].id))!.name += ' 수정';
    if (change === 'screen') after.screens[0].notes += ' 수정';
    if (change === 'menu') after.ia[0].label += ' 수정';
    if (change === 'handoff') after.handoff.push({ requirementId: before.requirements[0].id, decision: 'adopt', reason: '범위 결정' });
    if (change === 'deletion') after.requirements.shift();
    const records = invalidateVerifications(before, after);
    expect(records?.[0]).toMatchObject({ result: 'pass', invalidated: true });
    expect(before.verifications?.[0].invalidated).toBe(false);
  });
  it('keeps records on title-only edits and never revives a stale record', () => {
    const before = reviewed(), after = structuredClone(before);
    after.title += ' 변경';
    expect(invalidateVerifications(before, after)?.[0].invalidated).toBe(false);
    before.verifications![0].invalidated = true;
    expect(invalidateVerifications(before, after)?.[0].invalidated).toBe(true);
  });
  it('invalidates imported records and AI design revisions while keeping history', () => {
    const p = reviewed(), result = structuredClone(p);
    result.screens[0].notes += ' 모델 수정';
    result.verifications = [];
    expect(mergeArtifacts(p, result, 'all').verifications?.[0].invalidated).toBe(true);
    expect(invalidateImportedVerifications(p).verifications?.[0].invalidated).toBe(true);
    expect(p.verifications?.[0].invalidated).toBe(false);
  });
  it('exports review type, historical criteria, staleness and safe formula cells', () => {
    const p = reviewed();
    p.verifications![0].evidence = '=HYPERLINK("https://example.invalid")';
    p.verifications![0].invalidated = true;
    const csv = verificationCsv(p);
    expect(csv).toContain('프로토타입 시뮬레이션');
    expect(csv).toContain('재검증 필요');
    expect(csv).toContain("'=HYPERLINK");
    expect(projectMarkdown(p)).toContain('자동 실행·고객 승인 증거가 아닙니다');
    expect(projectMarkdown(p)).toContain('재검증 필요');
  });
});
