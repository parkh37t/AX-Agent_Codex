import { describe, expect, it } from "vitest";
import {
  inspectProject,
  preserveScopeDecisions,
  mergeArtifacts,
} from "../shared/domain";
import { makeDemoProject } from "../src/lib/demo";

describe("AI revisions and delivery scope", () => {
  it("keeps a decision only for the unchanged requirement that was reviewed", () => {
    const p = makeDemoProject();
    p.stage = "delivery";
    p.handoff = p.requirements.map((r) => ({
      requirementId: r.id,
      decision: "adopt" as const,
      reason: "검토한 범위",
    }));
    const result = structuredClone(p);
    result.requirements[0].text += " 변경된 요구";
    const next = mergeArtifacts(p, result, "analysis");
    expect(next.handoff).toHaveLength(p.handoff.length - 1);
    expect(
      next.handoff.some((h) => h.requirementId === p.requirements[0].id),
    ).toBe(false);
    expect(
      inspectProject(next).some(
        (i) => i.code === "handoff" && i.target === p.requirements[0].id,
      ),
    ).toBe(true);
    expect(p.handoff).toHaveLength(p.requirements.length);
  });
  it("drops decisions for requirements removed in an AI rewrite", () => {
    const p = makeDemoProject();
    p.stage = "delivery";
    p.handoff = [
      {
        requirementId: p.requirements[0].id,
        decision: "adopt",
        reason: "기존 범위",
      },
    ];
    const result = structuredClone(p);
    result.requirements = [];
    result.functions = [];
    result.screens = [];
    result.proposal.slides = [];
    const next = mergeArtifacts(p, result, "all");
    expect(next.handoff).toEqual([]);
  });
  it("flags orphan and duplicate scope decisions instead of reporting a clean check", () => {
    const p = makeDemoProject();
    p.stage = "delivery";
    p.handoff = [
      { requirementId: "UNKNOWN", decision: "adopt", reason: "오류 예제" },
      { requirementId: "UNKNOWN", decision: "adopt", reason: "중복 예제" },
    ];
    const errors = inspectProject(p).filter(
      (i) => i.code === "handoff" && i.level === "error",
    );
    expect(errors.length).toBeGreaterThanOrEqual(2);
  });
});

describe("manual requirement edits", () => {
  it("invalidates reviewed scope after acceptance criteria or content changes", () => {
    const before = makeDemoProject();
    before.handoff = before.requirements.map((r) => ({
      requirementId: r.id,
      decision: "adopt" as const,
      reason: "검토함",
    }));
    const after = structuredClone(before);
    after.requirements[0].acceptance += " 추가 검증";
    expect(preserveScopeDecisions(before, after)).toHaveLength(
      before.handoff.length - 1,
    );
    after.requirements = [];
    expect(preserveScopeDecisions(before, after)).toEqual([]);
  });
  it("keeps reviewed scope when only unrelated project or screen content changes", () => {
    const before = makeDemoProject();
    before.handoff = before.requirements.map((r) => ({
      requirementId: r.id,
      decision: "adopt" as const,
      reason: "검토함",
    }));
    const after = structuredClone(before);
    after.brief += " 편집";
    after.screens[0].notes += " 편집";
    expect(preserveScopeDecisions(before, after)).toEqual(before.handoff);
  });
});
