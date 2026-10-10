import { describe, expect, it } from "vitest";
import {
  createProject,
  inspectProject,
  projectSchema,
  traceRows,
  type Project,
} from "../shared/domain";
import { makeDemoProject } from "../src/lib/demo";
import { applyHandoff, planFromMenu } from "../src/lib/planning";

const decisionsFor = (project: Project) =>
  project.requirements.map((requirement) => ({
    requirementId: requirement.id,
    decision: "adopt" as const,
    reason: "검토 범위로 채택하며 근거 상태는 유지합니다.",
  }));

describe("synthetic example", () => {
  it("has a valid connected example while retaining actionable quality gaps", () => {
    const project = makeDemoProject();
    expect(projectSchema.safeParse(project).success).toBe(true);
    expect(project.isDemo).toBe(true);
    expect(project.client).toContain("가상");
    expect(project.sources).toHaveLength(2);
    expect(
      project.sources.every((source) => source.name.includes("합성")),
    ).toBe(true);
    expect(project.proposal.slides).toHaveLength(6);
    expect(project.proposal.winThemes).toHaveLength(3);
    expect(project.analysis).toHaveLength(3);
    expect(project.requirements).toHaveLength(6);
    expect(project.ia).toHaveLength(5);
    expect(project.functions).toHaveLength(6);
    expect(project.screens).toHaveLength(4);
    expect(traceRows(project).filter((row) => row.complete)).toHaveLength(4);
    const issues = inspectProject(project);
    expect(issues.filter((issue) => issue.level === "error")).toEqual([]);
    expect(issues.some((issue) => issue.code === "evidence")).toBe(true);
    expect(issues.some((issue) => issue.code === "acceptance")).toBe(true);
    expect(issues.some((issue) => issue.code === "state")).toBe(true);
    expect(issues.some((issue) => issue.code === "coverage")).toBe(true);
    expect(
      project.requirements.some(
        (requirement) => requirement.claim === "unresolved",
      ),
    ).toBe(true);
    expect(
      project.requirements.some(
        (requirement) => requirement.claim === "verified_fact",
      ),
    ).toBe(false);
  });

  it("returns independent example objects", () => {
    const first = makeDemoProject();
    first.requirements[0].text = "changed";
    expect(makeDemoProject().requirements[0].text).not.toBe("changed");
  });
});

describe("menu planning", () => {
  it("parses hierarchy, links actual artifacts and leaves unsupported requirements as hypotheses", () => {
    const project = createProject("합성 시험");
    const before = structuredClone(project);
    const { project: planned, added } = planFromMenu(
      project,
      "-대시보드\n-거래내역\n -상세\n-이체신청",
    );
    expect(added).toBe(4);
    expect(project).toEqual(before);
    const parent = planned.ia.find((menu) => menu.label === "거래내역")!;
    expect(planned.ia.find((menu) => menu.label === "상세")?.parentId).toBe(
      parent.id,
    );
    expect(
      planned.ia.find((menu) => menu.label === "이체신청")?.parentId,
    ).toBeNull();
    expect(planned.screens.map((screen) => screen.kind)).toEqual([
      "dashboard",
      "list",
      "detail",
      "form",
    ]);
    expect(new Set(planned.screens.map((screen) => screen.route)).size).toBe(4);
    for (const row of traceRows(planned)) {
      expect(row.ia).toHaveLength(1);
      expect(row.functions).toHaveLength(1);
      expect(row.screens).toHaveLength(1);
      expect(row.complete).toBe(false); // Structural linkage is not source-backed coverage.
      expect(row.requirement).toMatchObject({
        claim: "hypothesis",
        status: "draft",
        sourceIds: [],
      });
      expect(row.requirement.acceptance).toContain("초안");
      expect(row.screens[0].states).toEqual(["normal", "empty", "error"]);
      expect(row.screens[0].roles).not.toHaveLength(0);
      expect(row.screens[0].fields).not.toHaveLength(0);
      expect(row.screens[0].notes).toContain("규칙 기반");
      expect(row.screens[0].notes).toContain("AI 생성 결과가 아닙니다");
    }
    expect(
      inspectProject(planned).filter((issue) => issue.level === "error"),
    ).toEqual([]);
  });

  it("reuses existing sibling names and changes nothing for a repeated outline", () => {
    const outline = "-거래내역\n  -상세\n-거래내역\n  -상세";
    const first = planFromMenu(createProject("합성 시험"), outline);
    expect(first.added).toBe(2);
    const again = planFromMenu(first.project, outline);
    expect(again.added).toBe(0);
    expect(again.project).toBe(first.project);
    expect(again.project.updatedAt).toBe(first.project.updatedAt);
    const child = planFromMenu(first.project, "-거래내역\n  -신청");
    expect(child.added).toBe(1);
    expect(
      child.project.ia.find((menu) => menu.label === "신청")?.parentId,
    ).toBe(first.project.ia[0].id);
  });

  it("keeps identically named destinations under different parents and handles tabs and CRLF", () => {
    const result = planFromMenu(
      createProject("합성 시험"),
      "-계좌\r\n\t-상세\r\n-카드\r\n\t-상세\r\n\r\n-",
    );
    expect(result.added).toBe(4);
    const details = result.project.ia.filter((menu) => menu.label === "상세");
    expect(details).toHaveLength(2);
    expect(details[0].parentId).not.toBe(details[1].parentId);
    expect(planFromMenu(result.project, "\n -  \n\t").project).toBe(
      result.project,
    );
  });

  it("allocates deterministic IDs beyond imported IDs and avoids cross-artifact collisions", () => {
    const project = createProject("합성 시험");
    project.sources.push({
      id: "IA-010",
      name: "합성",
      kind: "other",
      text: "",
      readScope: "",
    });
    project.requirements.push({
      id: "REQ-099",
      text: "기존 요구",
      priority: "must",
      claim: "source_claim",
      status: "draft",
      sourceIds: [],
      acceptance: "",
    });
    const one = planFromMenu(project, "-새 메뉴");
    const two = planFromMenu(project, "-새 메뉴");
    expect(one.project.ia[0].id).toBe("IA-011");
    expect(one.project.requirements[1].id).toBe("REQ-100");
    expect(one.project.ia.map((item) => item.id)).toEqual(
      two.project.ia.map((item) => item.id),
    );
    expect(one.project.functions.map((item) => item.id)).toEqual(
      two.project.functions.map((item) => item.id),
    );
    const existing = makeDemoProject();
    const next = planFromMenu(existing, "-새 메뉴").project;
    expect(next.ia.at(-1)?.id).toBe("IA-006");
    expect(next.requirements.at(-1)?.id).toBe("REQ-007");
    expect(next.functions.at(-1)?.id).toBe("FN-007");
    expect(next.screens.at(-1)?.id).toBe("SCR-005");
    expect(
      inspectProject(next).filter((issue) => issue.level === "error"),
    ).toEqual([]);
  });

  it("does not round large numeric imported IDs when allocating multiple records", () => {
    const project = createProject("합성 시험");
    project.sources.push({
      id: "IA-9007199254740992",
      name: "합성",
      kind: "other",
      text: "",
      readScope: "",
    });
    const result = planFromMenu(project, "-첫 메뉴\n-다음 메뉴");
    expect(result.project.ia.map((menu) => menu.id)).toEqual([
      "IA-9007199254740993",
      "IA-9007199254740994",
    ]);
  });
});

describe("handoff scope decisions", () => {
  it("requires complete decisions and reasons before transitioning", () => {
    const project = makeDemoProject();
    const decisions = decisionsFor(project);
    expect(() => applyHandoff(project, decisions.slice(1))).toThrow(
      /모든 요구사항/,
    );
    expect(() => applyHandoff(project, [...decisions, decisions[0]])).toThrow(
      /중복/,
    );
    expect(() =>
      applyHandoff(project, [
        { ...decisions[0], requirementId: "REQ-MISSING" },
        ...decisions.slice(1),
      ]),
    ).toThrow(/존재하지 않는/);
    expect(() =>
      applyHandoff(project, [
        { ...decisions[0], reason: "   " },
        ...decisions.slice(1),
      ]),
    ).toThrow(/사유/);
    expect(() =>
      applyHandoff(project, [
        { ...decisions[0], reason: "" },
        ...decisions.slice(1),
      ]),
    ).toThrow();
    expect(() => applyHandoff(createProject("빈 프로젝트"), [])).toThrow(
      /먼저/,
    );
    expect(project.stage).toBe("proposal");
    expect(project.handoff).toEqual([]);
  });

  it("records scope decisions without upgrading claims or mutating the proposal", () => {
    const project = makeDemoProject();
    const original = structuredClone(project);
    const decisions = decisionsFor(project).map((decision, index) => ({
      ...decision,
      decision: (
        ["adopt", "change", "defer", "exclude", "adopt", "change"] as const
      )[index],
      reason: "  근거는 유지하고 수행 범위만 기록합니다.  ",
    }));
    const next = applyHandoff(project, decisions);
    expect(next.stage).toBe("delivery");
    expect(next.requirements.map((requirement) => requirement.status)).toEqual([
      "confirmed",
      "confirmed",
      "deferred",
      "deferred",
      "confirmed",
      "confirmed",
    ]);
    expect(next.requirements.map((requirement) => requirement.claim)).toEqual(
      original.requirements.map((requirement) => requirement.claim),
    );
    expect(
      next.requirements.map((requirement) => requirement.sourceIds),
    ).toEqual(
      original.requirements.map((requirement) => requirement.sourceIds),
    );
    expect(next.handoff).toHaveLength(6);
    expect(
      next.handoff.every(
        (decision) => decision.reason === decision.reason.trim(),
      ),
    ).toBe(true);
    expect(next.proposal).toEqual(original.proposal);
    expect(project).toEqual(original);
    expect(next.isDemo).toBe(true);
  });

  it("rejects ambiguous duplicated requirement IDs", () => {
    const project = makeDemoProject();
    project.requirements.push(structuredClone(project.requirements[0]));
    expect(() => applyHandoff(project, decisionsFor(project))).toThrow(/중복/);
  });
});
