import {
  handoffSchema,
  projectSchema,
  type Project,
  type Screen,
} from "../../shared/domain";
import type { z } from "zod";

type HandoffDecision = z.infer<typeof handoffSchema>;

const canonicalLabel = (label: string) =>
  label.normalize("NFC").trim().replace(/\s+/g, " ");
const menuKey = (parentId: string | null, label: string) =>
  JSON.stringify([parentId, canonicalLabel(label)]);

function allocateIds(project: Project) {
  const used = new Set(
    [
      ...project.sources,
      ...project.requirements,
      ...project.ia,
      ...project.functions,
      ...project.screens,
      ...project.proposal.slides,
      ...project.analysis,
    ].map((item) => item.id),
  );
  const next = new Map<string, bigint>();
  return (prefix: string) => {
    let index = next.get(prefix);
    if (index === undefined) {
      const pattern = new RegExp(`^${prefix}-(\\d+)$`);
      index = 1n;
      for (const existing of used) {
        const match = pattern.exec(existing);
        if (match) {
          const value = BigInt(match[1]);
          // Imported identifiers can exceed Number.MAX_SAFE_INTEGER.
          if (value >= index) index = value + 1n;
        }
      }
    }
    let candidate = `${prefix}-${String(index).padStart(3, "0")}`;
    while (used.has(candidate))
      candidate = `${prefix}-${String(++index).padStart(3, "0")}`;
    used.add(candidate);
    next.set(prefix, index + 1n);
    return candidate;
  };
}

function screenKind(label: string): Screen["kind"] {
  if (/(상세|상세보기|detail)/i.test(label)) return "detail";
  if (/(신청|등록|작성|입력|수정|이체|송금|신규|create|form)/i.test(label))
    return "form";
  if (/(대시보드|홈|메인|요약|dashboard|^home$)/i.test(label))
    return "dashboard";
  return "list";
}

function draftFields(kind: Screen["kind"]): Screen["fields"] {
  if (kind === "form")
    return [
      {
        name: "입력 항목 (정의 필요)",
        type: "text",
        required: false,
        rule: "규칙 기반 자리표시자입니다. 실제 항목·필수 여부·허용 형식·오류 문구를 확인한 뒤 교체하세요.",
      },
    ];
  if (kind === "detail")
    return [
      {
        name: "조회 식별자 (정의 필요)",
        type: "text",
        required: false,
        rule: "상위 화면에서 전달할 식별자와 조회 권한·데이터 없음 처리 규칙을 확인하세요.",
      },
    ];
  if (kind === "dashboard")
    return [
      {
        name: "조회 기준 (정의 필요)",
        type: "select",
        required: false,
        rule: "요약할 데이터와 기간·집계 단위·접근 권한을 확인하세요. 실제 선택값은 미정입니다.",
      },
    ];
  return [
    {
      name: "검색 조건 (정의 필요)",
      type: "text",
      required: false,
      rule: "실제 검색 대상·기본값·허용 길이·조건 간 검증을 확인하세요. 검색 동작이 구현된 것은 아닙니다.",
    },
  ];
}

function draftSections(kind: Screen["kind"], label: string): string[] {
  if (kind === "form")
    return [`${label} 입력`, "입력 검증·내용 확인", "요청 결과·실패 안내"];
  if (kind === "detail")
    return [`${label} 정보`, "연결된 기록", "이전 화면으로 돌아가기"];
  if (kind === "dashboard") return [`${label} 요약`, "최근 항목", "다음 행동"];
  return ["검색·필터", `${label} 결과 목록`, "결과 없음·오류 안내"];
}

/** Converts an indented menu outline into editable, rule-based hypotheses. No model is called. */
export function planFromMenu(
  project: Project,
  outline: string,
): { project: Project; added: number } {
  const next = structuredClone(project);
  const allocate = allocateIds(project);
  const menus = new Map(
    next.ia.map((menu) => [menuKey(menu.parentId, menu.label), menu]),
  );
  const stack: { indent: number; id: string }[] = [];
  let added = 0;

  for (const rawLine of outline.split(/\r?\n/)) {
    if (!rawLine.trim()) continue;
    const leading = rawLine.match(/^[\t ]*/)?.[0] ?? "";
    const indent = [...leading].reduce(
      (width, char) => width + (char === "\t" ? 4 : 1),
      0,
    );
    const label = canonicalLabel(
      rawLine.slice(leading.length).replace(/^(?:[-*•]\s*|\d+[.)]\s+)/, ""),
    );
    if (!label) continue;
    while (stack.length && stack[stack.length - 1].indent >= indent)
      stack.pop();
    const parentId = stack.length ? stack[stack.length - 1].id : null;
    const key = menuKey(parentId, label);
    const existing = menus.get(key);
    if (existing) {
      stack.push({ indent, id: existing.id });
      continue;
    }

    const iaId = allocate("IA");
    const requirementId = allocate("REQ");
    const functionId = allocate("FN");
    const screenId = allocate("SCR");
    const kind = screenKind(label);
    const menu = { id: iaId, label, parentId };
    next.ia.push(menu);
    menus.set(key, menu);
    stack.push({ indent, id: iaId });
    next.requirements.push({
      id: requirementId,
      text: `${label} 메뉴에서 필요한 업무를 수행한다. 사용자·업무 범위·입출력은 확인이 필요하다.`,
      priority: "should",
      status: "draft",
      claim: "hypothesis",
      sourceIds: [],
      acceptance:
        "수용 기준 초안: 대상 사용자·입력·기대 결과를 확인하고 정상·빈값·오류 시나리오를 정의한다. 메뉴 이름만으로 만든 규칙 기반 가설이며 고객 확인·실행 검증 전이다.",
    });
    next.functions.push({
      id: functionId,
      name: `${label} 업무 (정의 필요)`,
      requirementIds: [requirementId],
      iaId,
    });
    next.screens.push({
      id: screenId,
      title: label,
      route: `/screens/${screenId.toLowerCase()}`,
      kind,
      functionIds: [functionId],
      sections: draftSections(kind, label),
      fields: draftFields(kind),
      states: ["normal", "empty", "error"],
      roles: ["사용자 역할 미정"],
      notes:
        "규칙 기반 초안이며 AI 생성 결과가 아닙니다. 메뉴 이름으로 화면 유형을 추정했습니다. 역할·입출력·필수값·검증 규칙·상태 전이를 확인하고 자리표시자를 교체하세요. 원문 근거와 실제 동작 검증은 연결되지 않았습니다.",
    });
    added++;
  }

  if (!added) return { project, added: 0 };
  const assumption =
    "메뉴에서 추가한 요구·기능·화면은 규칙 기반 초안입니다. AI 생성·고객 합의·동작 검증을 거치지 않았으며 원문 근거를 연결해야 합니다.";
  if (!next.assumptions.includes(assumption)) next.assumptions.push(assumption);
  next.updatedAt = new Date().toISOString();
  return { project: projectSchema.parse(next), added };
}

/** Records every scope decision without promoting a claim to a verified fact. */
export function applyHandoff(
  project: Project,
  decisions: HandoffDecision[],
): Project {
  if (!project.requirements.length)
    throw new Error("수행 범위로 검토할 요구사항을 먼저 작성하세요.");
  const known = new Set(
    project.requirements.map((requirement) => requirement.id),
  );
  if (known.size !== project.requirements.length)
    throw new Error("요구사항 ID가 중복되어 범위를 전환할 수 없습니다.");
  const seen = new Set<string>();
  const parsed = decisions.map((input) => {
    const decision = handoffSchema.parse(input);
    if (!known.has(decision.requirementId))
      throw new Error(
        `존재하지 않는 요구사항입니다: ${decision.requirementId}`,
      );
    if (seen.has(decision.requirementId))
      throw new Error(
        `요구사항의 결정이 중복되었습니다: ${decision.requirementId}`,
      );
    if (!decision.reason.trim())
      throw new Error(`${decision.requirementId}의 결정 사유를 입력하세요.`);
    seen.add(decision.requirementId);
    return { ...decision, reason: decision.reason.trim() };
  });
  const missing = project.requirements.filter(
    (requirement) => !seen.has(requirement.id),
  );
  if (missing.length)
    throw new Error(
      `모든 요구사항의 범위를 결정해야 합니다. 미결정: ${missing.map((requirement) => requirement.id).join(", ")}`,
    );
  const byRequirement = new Map(
    parsed.map((decision) => [decision.requirementId, decision]),
  );
  return projectSchema.parse({
    ...project,
    stage: "delivery",
    handoff: parsed,
    requirements: project.requirements.map((requirement) => ({
      ...requirement,
      status: ["defer", "exclude"].includes(
        byRequirement.get(requirement.id)!.decision,
      )
        ? "deferred"
        : "confirmed",
    })),
    updatedAt: new Date().toISOString(),
  });
}
