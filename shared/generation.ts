import { artifactSchema, inspectProject, mergeArtifacts, type Artifacts, type Project, type Task } from "./domain";

/** Browser-side validation for an explicitly imported, manually generated result. */
export function validateManualResult(project: Project, value: unknown, task: Task): Artifacts {
  const result = artifactSchema.parse(value);
  const preserved = task === "rfp" ? ["proposal", "strategies", "analysis", "ia", "functions", "screens"]
    : task === "strategy" ? ["rfp", "proposal", "requirements", "analysis", "ia", "functions", "screens"]
    : task === "proposal" ? ["rfp", "strategies", "requirements", "analysis", "ia", "functions", "screens"]
    : task === "design" ? ["rfp", "strategies", "proposal", "requirements", "analysis"] : [];
  for (const key of preserved as Array<keyof Artifacts>) {
    if (JSON.stringify(result[key] ?? null) !== JSON.stringify(project[key] ?? null))
      throw new Error(`이번 단계에서 유지해야 하는 ${key}가 변경됐습니다. 해당 영역을 유지해 다시 생성하세요.`);
  }
  for (const [items, previous] of [[result.requirements, project.requirements], [result.analysis, project.analysis], [result.proposal.slides, project.proposal.slides]] as const) {
    for (const item of items) {
      if (item.claim === "verified_fact" && JSON.stringify(item) !== JSON.stringify(previous.find((p) => p.id === item.id)))
        throw new Error("새 내용을 직접 확인한 사실로 표시할 수 없습니다.");
    }
  }
  for (const r of result.requirements)
    if (r.status === "confirmed" && JSON.stringify(r) !== JSON.stringify(project.requirements.find((p) => p.id === r.id)))
      throw new Error("새 요구는 초안으로 작성해야 합니다.");
  if (task === "rfp" && (!result.rfp || !result.requirements.length)) throw new Error("RFP 분석과 요구사항 초안이 필요합니다.");
  if (task === "strategy" && !result.strategies?.length) throw new Error("REQ와 원문 근거를 연결한 전략이 필요합니다.");
  if (task === "proposal" && (!result.strategies?.length || !result.proposal.slides.length || result.proposal.slides.some((s) => !s.strategyIds?.length)))
    throw new Error("전략과 연결된 제안 장표가 필요합니다.");
  if (task === "design" && (!result.ia.length || !result.functions.length || !result.screens.length)) throw new Error("메뉴·기능·화면이 필요합니다.");
  for (const merged of [mergeArtifacts(project, result, "all"), mergeArtifacts(project, result, task)]) {
    const issue = inspectProject(merged).find((i) => i.level === "error");
    if (issue) throw new Error(`${issue.target}: ${issue.message}`);
  }
  return result;
}
