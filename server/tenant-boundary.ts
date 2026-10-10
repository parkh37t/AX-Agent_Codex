import { projectSchema, type Project } from "../shared/domain";

export type IdentitySession = { subject: string; sessionId: string; expiresAt: number };
/** A future official SIWC adapter must validate server-side sessions; never accept owner IDs from a browser. */
export interface IdentityAdapter {
  kind: "official_siwc" | "test";
  resolve(sessionHandle: string): Promise<IdentitySession | null>;
  revoke(sessionHandle: string): Promise<void>;
}
export class TenantAccessError extends Error {
  constructor(public status: 401 | 404 | 503, message: string) { super(message); }
}

/** Isolated foundation only: not mounted on the local bridge and not an operational hosted service. */
export class TenantWorkspace {
  private projects = new Map<string, Project>();
  private jobs = new Map<string, { subject: string; sessionId: string; controller: AbortController }>();
  private revoked = new Set<string>();
  constructor(private identity?: IdentityAdapter) {
    if (identity?.kind === "test" && process.env.NODE_ENV !== "test")
      throw new TenantAccessError(503, "테스트 인증은 운영 환경에서 사용할 수 없습니다.");
  }
  private cancelSession(sessionId: string) {
    for (const job of this.jobs.values()) if (job.sessionId === sessionId) job.controller.abort();
  }
  private async authenticate(handle: string) {
    if (!this.identity) throw new TenantAccessError(503, "공식 사용자별 로그인 어댑터가 설정되지 않았습니다.");
    if (this.revoked.has(handle)) throw new TenantAccessError(401, "로그아웃된 세션입니다.");
    const session = await this.identity.resolve(handle);
    if (!session?.subject || !session.sessionId || !Number.isFinite(session.expiresAt) || session.expiresAt <= Date.now()) {
      if (session?.sessionId) this.cancelSession(session.sessionId);
      throw new TenantAccessError(401, "유효한 사용자 세션이 필요합니다.");
    }
    return session;
  }
  async saveProject(handle: string, value: unknown) {
    const session = await this.authenticate(handle);
    const project = projectSchema.parse(value);
    this.projects.set(JSON.stringify([session.subject, project.id]), structuredClone(project));
  }
  async getProject(handle: string, id: string) {
    const session = await this.authenticate(handle);
    const project = this.projects.get(JSON.stringify([session.subject, id]));
    if (!project) throw new TenantAccessError(404, "프로젝트를 찾을 수 없습니다.");
    return structuredClone(project);
  }
  async registerJob(handle: string) {
    const session = await this.authenticate(handle);
    const id = crypto.randomUUID(), controller = new AbortController();
    this.jobs.set(id, { subject: session.subject, sessionId: session.sessionId, controller });
    return { id, signal: controller.signal };
  }
  async cancelJob(handle: string, id: string) {
    const session = await this.authenticate(handle);
    const job = this.jobs.get(id);
    if (!job || job.subject !== session.subject) throw new TenantAccessError(404, "작업을 찾을 수 없습니다.");
    job.controller.abort();
  }
  async logout(handle: string) {
    const session = await this.authenticate(handle);
    this.revoked.add(handle);
    this.cancelSession(session.sessionId);
    await this.identity!.revoke(handle);
  }
}
