import { projectSchema, type Project } from "../shared/domain";

export type IdentitySession = {
  subject: string; accountId: string; workspaceId: string; sessionId: string; expiresAt: number;
};
/** All scope fields must come from a verified server-side session, never browser owner IDs. */
export interface IdentityAdapter {
  kind: "official_siwc" | "test";
  resolve(sessionHandle: string): Promise<IdentitySession | null>;
  revoke(sessionHandle: string): Promise<void>;
}
export class TenantAccessError extends Error {
  constructor(public status: 401 | 404 | 503, message: string) { super(message); }
}
const ownerKey = (s: IdentitySession) => JSON.stringify([s.subject, s.accountId, s.workspaceId]);
const sessionKey = (s: IdentitySession) => JSON.stringify([s.subject, s.accountId, s.workspaceId, s.sessionId]);
type OwnedJob = { owner: string; session: string; handle: string; controller: AbortController; timer: ReturnType<typeof setTimeout> };

/** Unmounted, in-memory foundation. Production runners must honor signal and call assertRunnable before execution/checkpoints. */
export class TenantWorkspace {
  private projects = new Map<string, Project>();
  private jobs = new Map<string, OwnedJob>();
  private revoked = new Set<string>();
  private sessions = new Map<string, IdentitySession>();
  constructor(private identity?: IdentityAdapter) {
    if (identity?.kind === "test" && process.env.NODE_ENV !== "test")
      throw new TenantAccessError(503, "테스트 인증은 운영 환경에서 사용할 수 없습니다.");
  }
  private abort(job: OwnedJob) { clearTimeout(job.timer); job.controller.abort(); }
  private cancelSession(key: string) {
    for (const job of this.jobs.values()) if (job.session === key) this.abort(job);
  }
  private cancelHandle(handle: string) {
    for (const job of this.jobs.values()) if (job.handle === handle) this.abort(job);
    const cached = this.sessions.get(handle);
    if (cached) this.cancelSession(sessionKey(cached));
  }
  private async authenticate(handle: string) {
    if (!this.identity) throw new TenantAccessError(503, "공식 사용자별 로그인 어댑터가 설정되지 않았습니다.");
    if (this.revoked.has(handle)) throw new TenantAccessError(401, "로그아웃된 세션입니다.");
    let session: IdentitySession | null;
    try { session = await this.identity.resolve(handle); }
    catch (error) { this.cancelHandle(handle); throw error; }
    // Logout may happen while the adapter is resolving the session.
    if (this.revoked.has(handle)) {
      this.cancelHandle(handle);
      throw new TenantAccessError(401, "로그아웃된 세션입니다.");
    }
    if (!session?.subject || !session.accountId || !session.workspaceId || !session.sessionId || !Number.isFinite(session.expiresAt) || session.expiresAt <= Date.now()) {
      this.cancelHandle(handle);
      if (session?.subject && session.accountId && session.workspaceId && session.sessionId) this.cancelSession(sessionKey(session));
      throw new TenantAccessError(401, "유효한 사용자 세션이 필요합니다.");
    }
    const previous = this.sessions.get(handle);
    if (previous && sessionKey(previous) !== sessionKey(session)) this.cancelHandle(handle);
    this.sessions.set(handle, { ...session });
    return session;
  }
  async saveProject(handle: string, value: unknown) {
    const session = await this.authenticate(handle);
    const project = projectSchema.parse(value);
    this.projects.set(JSON.stringify([ownerKey(session), project.id]), structuredClone(project));
  }
  async getProject(handle: string, id: string) {
    const session = await this.authenticate(handle);
    const project = this.projects.get(JSON.stringify([ownerKey(session), id]));
    if (!project) throw new TenantAccessError(404, "프로젝트를 찾을 수 없습니다.");
    return structuredClone(project);
  }
  async registerJob(handle: string) {
    const session = await this.authenticate(handle);
    const id = crypto.randomUUID(), controller = new AbortController();
    const job: OwnedJob = {
      owner: ownerKey(session), session: sessionKey(session), handle, controller,
      timer: setTimeout(() => controller.abort(), Math.max(0, Math.min(session.expiresAt - Date.now(), 2147483647))),
    };
    job.timer.unref?.();
    this.jobs.set(id, job);
    return { id, signal: controller.signal };
  }
  async assertRunnable(handle: string, id: string) {
    const session = await this.authenticate(handle);
    const job = this.jobs.get(id);
    if (!job || job.owner !== ownerKey(session) || job.session !== sessionKey(session))
      throw new TenantAccessError(404, "작업을 찾을 수 없습니다.");
    if (job.controller.signal.aborted) throw new TenantAccessError(401, "취소되거나 만료된 작업입니다.");
    return job.controller.signal;
  }
  async cancelJob(handle: string, id: string) {
    const session = await this.authenticate(handle);
    const job = this.jobs.get(id);
    if (!job || job.owner !== ownerKey(session)) throw new TenantAccessError(404, "작업을 찾을 수 없습니다.");
    this.abort(job);
  }
  async logout(handle: string) {
    if (!this.identity) throw new TenantAccessError(503, "공식 사용자별 로그인 어댑터가 설정되지 않았습니다.");
    this.revoked.add(handle); // Block in-flight resolve before awaiting any adapter operation.
    this.cancelHandle(handle);
    const session = this.sessions.get(handle) ?? await this.identity.resolve(handle);
    if (session) this.cancelSession(sessionKey(session));
    await this.identity.revoke(handle);
    this.sessions.delete(handle);
  }
  /** Call when the future worker finishes; no credentials or project data are returned. */
  finishJob(id: string) { const job = this.jobs.get(id); if (job) clearTimeout(job.timer); this.jobs.delete(id); }
  dispose() { for (const job of this.jobs.values()) this.abort(job); this.jobs.clear(); this.sessions.clear(); }
}
