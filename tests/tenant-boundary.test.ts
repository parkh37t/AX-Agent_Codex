import { describe, it, expect, vi } from "vitest";
import { TenantWorkspace, type IdentityAdapter } from "../server/tenant-boundary";
import { workflowProject } from "./fixtures/workflow";

function fixture() {
  const sessions = new Map([['a', { subject: 'alice', sessionId: 'a', expiresAt: Date.now() + 60000 }], ['b', { subject: 'bob', sessionId: 'b', expiresAt: Date.now() + 60000 }]]);
  const identity: IdentityAdapter = { kind: 'test', resolve: async handle => sessions.get(handle) ?? null, revoke: async handle => { sessions.delete(handle); } };
  return { store: new TenantWorkspace(identity), sessions, identity };
}
describe('future hosted identity boundary (test doubles only)', () => {
  it('fails closed when unconfigured and rejects test identities in production', async () => {
    await expect(new TenantWorkspace().getProject('a', 'id')).rejects.toMatchObject({ status: 503 });
    const { identity } = fixture();
    vi.stubEnv('NODE_ENV', 'production');
    try { expect(() => new TenantWorkspace(identity)).toThrow(/테스트 인증/); } finally { vi.unstubAllEnvs(); }
  });
  it('isolates projects with identical IDs using resolved server identity', async () => {
    const { store } = fixture(); const p = workflowProject();
    await store.saveProject('a', p);
    await expect(store.getProject('b', p.id)).rejects.toMatchObject({ status: 404 });
    await store.saveProject('b', { ...p, title: '다른 사용자', ownerId: 'alice' });
    expect((await store.getProject('a', p.id)).title).toBe(p.title);
    expect((await store.getProject('b', p.id)).title).toBe('다른 사용자');
  });
  it('blocks cross-user job cancellation and cancels only the logging-out session', async () => {
    const { store } = fixture(); const a = await store.registerJob('a'), b = await store.registerJob('b');
    await expect(store.cancelJob('b', a.id)).rejects.toMatchObject({ status: 404 });
    expect(a.signal.aborted).toBe(false);
    await store.logout('a');
    expect(a.signal.aborted).toBe(true); expect(b.signal.aborted).toBe(false);
    await expect(store.registerJob('a')).rejects.toMatchObject({ status: 401 });
  });
  it('rejects expired sessions and signals cancellation of their jobs', async () => {
    const { store, sessions } = fixture(); const job = await store.registerJob('a');
    sessions.get('a')!.expiresAt = 0;
    await expect(store.getProject('a', 'id')).rejects.toMatchObject({ status: 401 });
    expect(job.signal.aborted).toBe(true);
  });
});
