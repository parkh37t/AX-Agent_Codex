import { z } from "zod";

export const claimSchema = z.enum([
  "verified_fact",
  "source_claim",
  "proposal",
  "hypothesis",
  "unresolved",
  "placeholder",
]);
export type Claim = z.infer<typeof claimSchema>;
export const claimLabels: Record<Claim, string> = {
  verified_fact: "직접 확인",
  source_claim: "자료의 주장",
  proposal: "제안",
  hypothesis: "가설",
  unresolved: "미확정",
  placeholder: "작성 예정",
};
const id = z.string().trim().min(1).max(100);
const text = z.string().max(20000);
export const sourceSchema = z.object({
  id,
  name: z.string().min(1).max(250),
  kind: z.enum(["rfp", "meeting", "asis", "reference", "other"]),
  text: z.string().max(300000),
  readScope: z.string().max(1000),
});
export const requirementSchema = z.object({
  id,
  text,
  priority: z.enum(["must", "should", "could"]),
  status: z.enum(["draft", "confirmed", "deferred"]),
  claim: claimSchema,
  sourceIds: z.array(id).max(50),
  acceptance: text,
});
export const iaSchema = z.object({ id, label: text, parentId: id.nullable() });
export const functionSchema = z.object({
  id,
  name: text,
  requirementIds: z.array(id).max(50),
  iaId: id,
});
export const fieldSchema = z.object({
  name: z.string().max(200),
  type: z.enum(["text", "number", "select", "date", "textarea", "checkbox"]),
  required: z.boolean(),
  rule: z.string().max(2000),
});
export const screenSchema = z.object({
  id,
  title: text,
  route: z.string().max(300),
  kind: z.enum(["dashboard", "list", "detail", "form"]),
  functionIds: z.array(id).max(50),
  sections: z.array(z.string().max(500)).max(20),
  fields: z.array(fieldSchema).max(30),
  states: z
    .array(z.enum(["normal", "empty", "error", "loading", "permission"]))
    .max(5),
  roles: z.array(z.string().max(100)).max(10),
  notes: text,
});
export const slideSchema = z.object({
  id,
  title: z.string().max(300),
  message: z.string().max(1500),
  bullets: z.array(z.string().max(1000)).max(8),
  diagram: z.enum([
    "statement",
    "comparison",
    "strategy",
    "process",
    "roadmap",
    "evidence",
  ]),
  requirementIds: z.array(id).max(50),
  evidenceIds: z.array(id).max(50),
  claim: claimSchema,
});
export const proposalSchema = z.object({
  summary: text,
  winThemes: z.array(z.string().max(1500)).max(8),
  slides: z.array(slideSchema).max(60),
});
export const findingSchema = z.object({
  id,
  current: text,
  impact: text,
  recommendation: text,
  sourceIds: z.array(id).max(50),
  claim: claimSchema,
});
export const artifactSchema = z.object({
  proposal: proposalSchema,
  analysis: z.array(findingSchema).max(80),
  requirements: z.array(requirementSchema).max(200),
  ia: z.array(iaSchema).max(200),
  functions: z.array(functionSchema).max(200),
  screens: z.array(screenSchema).max(100),
  assumptions: z.array(z.string().max(2000)).max(100),
});
export const handoffSchema = z.object({
  requirementId: id,
  decision: z.enum(["adopt", "change", "defer", "exclude"]),
  reason: z.string().min(1).max(2000),
});
export const projectSchema = artifactSchema.extend({
  version: z.literal(1),
  id,
  title: z.string().min(1).max(200),
  client: z.string().max(200),
  brief: text,
  stage: z.enum(["proposal", "delivery"]),
  sources: z.array(sourceSchema).max(50),
  handoff: z.array(handoffSchema).max(200),
  updatedAt: z.string(),
  isDemo: z.boolean(),
});
export type Project = z.infer<typeof projectSchema>;
export type Artifacts = z.infer<typeof artifactSchema>;
export type Source = z.infer<typeof sourceSchema>;
export type Requirement = z.infer<typeof requirementSchema>;
export type Screen = z.infer<typeof screenSchema>;
export type Slide = z.infer<typeof slideSchema>;
export const taskSchema = z.enum(["proposal", "analysis", "design", "all"]);
export type Task = z.infer<typeof taskSchema>;
export const generateRequestSchema = z.object({
  project: projectSchema,
  task: taskSchema,
  instruction: z.string().max(10000),
});
export type GenerateRequest = z.infer<typeof generateRequestSchema>;
export type ConnectionStatus = {
  installed: boolean;
  authenticated: boolean;
  authMode: "chatgpt" | "api-key" | "none" | "unknown";
  version: string;
  message: string;
  generationReady?: boolean;
};
export type Job = {
  id: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  stage: string;
  startedAt: string;
  result?: Artifacts;
  error?: string;
  usage?: { inputTokens: number; outputTokens: number };
};

export const emptyArtifacts = (): Artifacts => ({
  proposal: { summary: "", winThemes: [], slides: [] },
  analysis: [],
  requirements: [],
  ia: [],
  functions: [],
  screens: [],
  assumptions: [],
});
export function createProject(title: string, brief = "", client = ""): Project {
  return {
    ...emptyArtifacts(),
    version: 1,
    id: crypto.randomUUID(),
    title: title.trim() || "새 프로젝트",
    client,
    brief,
    stage: "proposal",
    sources: [],
    handoff: [],
    updatedAt: new Date().toISOString(),
    isDemo: false,
  };
}
export type Issue = {
  level: "error" | "warning";
  code: string;
  target: string;
  message: string;
};
export function inspectProject(p: Project): Issue[] {
  const issues: Issue[] = [];
  const add = (
    level: Issue["level"],
    code: string,
    target: string,
    message: string,
  ) => issues.push({ level, code, target, message });
  const maps = {
    source: new Set(p.sources.map((x) => x.id)),
    req: new Set(p.requirements.map((x) => x.id)),
    ia: new Set(p.ia.map((x) => x.id)),
    fn: new Set(p.functions.map((x) => x.id)),
  };
  for (const [kind, rows] of Object.entries({
    source: p.sources,
    req: p.requirements,
    ia: p.ia,
    fn: p.functions,
    screen: p.screens,
    slide: p.proposal.slides,
    finding: p.analysis,
  })) {
    const seen = new Set<string>();
    for (const item of rows) {
      if (seen.has(item.id))
        add("error", "duplicate", item.id, `${kind} ID가 중복됩니다.`);
      seen.add(item.id);
    }
  }
  for (const r of p.requirements) {
    if (!r.sourceIds.length)
      add("warning", "evidence", r.id, "연결된 원문 근거가 없습니다.");
    if (!r.acceptance.trim())
      add("warning", "acceptance", r.id, "수용 기준이 비어 있습니다.");
    r.sourceIds.forEach((s) => {
      if (!maps.source.has(s))
        add("error", "reference", r.id, `존재하지 않는 자료 ${s}`);
    });
    if (
      !p.functions.some((f) => f.requirementIds.includes(r.id)) &&
      r.status !== "deferred"
    )
      add("warning", "coverage", r.id, "연결된 기능이 없습니다.");
  }
  for (const f of p.functions) {
    if (!maps.ia.has(f.iaId))
      add("error", "reference", f.id, `존재하지 않는 메뉴 ${f.iaId}`);
    if (!f.requirementIds.length)
      add("warning", "orphan", f.id, "연결된 요구사항이 없습니다.");
    f.requirementIds.forEach((r) => {
      if (!maps.req.has(r))
        add("error", "reference", f.id, `존재하지 않는 요구 ${r}`);
    });
    if (!p.screens.some((s) => s.functionIds.includes(f.id)))
      add("warning", "coverage", f.id, "연결된 화면이 없습니다.");
  }
  for (const menu of p.ia) {
    if (menu.parentId && !maps.ia.has(menu.parentId))
      add(
        "error",
        "reference",
        menu.id,
        `존재하지 않는 상위 메뉴 ${menu.parentId}`,
      );
    const visited = new Set<string>([menu.id]);
    let parent = menu.parentId;
    while (parent) {
      if (visited.has(parent)) {
        add("error", "cycle", menu.id, "메뉴 상하위 관계가 순환합니다.");
        break;
      }
      visited.add(parent);
      parent = p.ia.find((x) => x.id === parent)?.parentId ?? null;
    }
  }
  for (const s of p.screens) {
    if (!s.functionIds.length)
      add("warning", "orphan", s.id, "연결된 기능이 없습니다.");
    s.functionIds.forEach((f) => {
      if (!maps.fn.has(f))
        add("error", "reference", s.id, `존재하지 않는 기능 ${f}`);
    });
    for (const state of ["normal", "empty", "error"] as const)
      if (!s.states.includes(state))
        add(
          "warning",
          "state",
          s.id,
          `${{ normal: "정상", empty: "빈값", error: "오류" }[state]} 상태가 빠졌습니다.`,
        );
    if (!s.roles.length)
      add("warning", "role", s.id, "사용자 역할이 없습니다.");
  }
  for (const slide of p.proposal.slides) {
    slide.requirementIds.forEach((r) => {
      if (!maps.req.has(r))
        add("error", "reference", slide.id, `존재하지 않는 요구 ${r}`);
    });
    slide.evidenceIds.forEach((s) => {
      if (!maps.source.has(s))
        add("error", "reference", slide.id, `존재하지 않는 자료 ${s}`);
    });
  }
  for (const finding of p.analysis)
    finding.sourceIds.forEach((s) => {
      if (!maps.source.has(s))
        add("error", "reference", finding.id, `존재하지 않는 자료 ${s}`);
    });
  const handoffIds = new Set<string>();
  for (const decision of p.handoff) {
    if (!maps.req.has(decision.requirementId))
      add(
        "error",
        "handoff",
        decision.requirementId,
        "수행 범위 결정이 존재하지 않는 요구사항을 참조합니다.",
      );
    if (handoffIds.has(decision.requirementId))
      add(
        "error",
        "handoff",
        decision.requirementId,
        "수행 범위 결정이 중복됩니다.",
      );
    handoffIds.add(decision.requirementId);
  }
  if (p.stage === "delivery")
    for (const req of p.requirements) {
      if (!handoffIds.has(req.id))
        add(
          "warning",
          "handoff",
          req.id,
          "요구사항이 새로 생기거나 변경됐습니다. 수행 범위 결정을 다시 확인하세요.",
        );
    }
  if (!p.sources.length)
    add(
      "warning",
      "evidence",
      "project",
      "자료가 없어 원문 기반 분석을 확인할 수 없습니다.",
    );
  return issues;
}
export function traceRows(p: Project) {
  return p.requirements.map((r) => {
    const functions = p.functions.filter((f) =>
      f.requirementIds.includes(r.id),
    );
    const ia = p.ia.filter((i) => functions.some((f) => f.iaId === i.id));
    const screens = p.screens.filter((s) =>
      s.functionIds.some((id) => functions.some((f) => f.id === id)),
    );
    return {
      requirement: r,
      ia,
      functions,
      screens,
      complete:
        functions.length > 0 &&
        ia.length > 0 &&
        screens.length > 0 &&
        r.sourceIds.length > 0 &&
        r.sourceIds.every((id) => p.sources.some((s) => s.id === id)),
    };
  });
}
export function mergeArtifacts(
  project: Project,
  result: Artifacts,
  task: Task,
): Project {
  const next =
    task === "all"
      ? { ...project, ...result }
      : task === "proposal"
        ? {
            ...project,
            proposal: result.proposal,
            requirements: result.requirements,
            assumptions: result.assumptions,
          }
        : task === "analysis"
          ? {
              ...project,
              analysis: result.analysis,
              requirements: result.requirements,
              assumptions: result.assumptions,
            }
          : {
              ...project,
              ia: result.ia,
              functions: result.functions,
              screens: result.screens,
              assumptions: result.assumptions,
            };
  const handoff = preserveScopeDecisions(project, next);
  return projectSchema.parse({
    ...next,
    handoff,
    updatedAt: new Date().toISOString(),
  });
}

/** A decision remains valid only for the exact requirement that was reviewed. */
export function preserveScopeDecisions(
  before: Project,
  after: Project,
): Project["handoff"] {
  return before.handoff.filter((h) => {
    const previous = before.requirements.find((r) => r.id === h.requirementId);
    const current = after.requirements.find((r) => r.id === h.requirementId);
    return (
      previous &&
      current &&
      JSON.stringify(previous) === JSON.stringify(current)
    );
  });
}
