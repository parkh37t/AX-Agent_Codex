import { createProject, emptyArtifacts, mergeArtifacts, type Project, type Task, type Artifacts } from "../../shared/domain";
export function workflowProject() {
  const p = createProject("합성 협력사 요청 시스템", "RFP에서 제안과 화면까지 추적", "가상 조직");
  p.sources = [{ id: "SRC-RFP", kind: "rfp", name: "합성 RFP", text: "협력사는 요청 제목을 입력하고 요청을 등록한다. 등록 실패 시 재시도 안내를 제공한다. 자동 결제는 이번 범위에서 제외한다. 예산은 미확정이다. 제출 기한은 본문 6일과 부록 8일이 상충한다.", readScope: "합성 원문 전체" }];
  return p;
}
export function workflowResult(p: Project, task: Task): Artifacts {
  const result: Artifacts = { ...emptyArtifacts(), rfp: p.rfp, strategies: p.strategies, proposal: p.proposal, analysis: p.analysis, requirements: p.requirements, ia: p.ia, functions: p.functions, screens: p.screens, assumptions: ["합성 테스트 대역. 실제 모델 호출 아님."] };
  if (task === "rfp") {
    result.requirements = [{ id: "internal:REQ-1", text: "협력사 요청 등록", priority: "must", status: "draft", claim: "source_claim", sourceIds: ["SRC-RFP"], acceptance: "필수 제목 누락을 안내하고 등록 오류 시 재시도할 수 있다." }];
    result.requirements.push({ id: "internal:REQ-EXCLUDED", text: "자동 결제는 이번 범위에서 제외", priority: "could", status: "deferred", claim: "source_claim", sourceIds: ["SRC-RFP"], acceptance: "이번 제안에서 제공 완료로 표시하지 않는다." });
    result.rfp = { summary: "합성 RFP의 요청 등록 요구를 분석", items: [{ id: "internal:RFP-1", kind: "requirement", text: "요청 등록과 오류 복구", sourceId: "SRC-RFP", quote: p.sources[0].text, requirementIds: ["internal:REQ-1", "internal:REQ-EXCLUDED"] }], questions: ["고객 승인 절차는 미확인", "예산은 미확정이며 본문 6일/부록 8일 중 정본 기한 확인 필요"] };
  }
  if (task === "strategy") {
    result.strategies = [{ id: "internal:STR-1", title: "등록과 오류 복구를 함께 설계", rationale: "원문의 재시도 요구를 일관된 상태 설계로 대응", requirementIds: ["internal:REQ-1"], evidenceIds: ["SRC-RFP"], claim: "proposal" }];
  }
  if (task === "proposal") {
    result.proposal = { summary: "합성 제안서", winThemes: ["오류 복구"], slides: [{ id: "internal:SLD-1", title: "요청 오류에서도 작업을 이어갑니다", message: "필수값과 재시도를 일관되게 안내", bullets: ["입력 검증", "재시도"], diagram: "process", requirementIds: ["internal:REQ-1"], evidenceIds: ["SRC-RFP"], strategyIds: ["internal:STR-1"], claim: "proposal" }] };
  }
  if (task === "design") {
    result.ia = [{ id: "internal:IA-1", label: "요청", parentId: null }];
    result.functions = [{ id: "internal:FN-1", name: "요청 등록", iaId: "internal:IA-1", requirementIds: ["internal:REQ-1"] }];
    result.screens = [{ id: "internal:SCR-1", title: "요청 등록", route: "/requests/new", kind: "form", functionIds: ["internal:FN-1"], fields: [{ name: "제목", type: "text", required: true, rule: "1자 이상" }], sections: ["입력", "등록"], states: ["normal", "empty", "error"], roles: ["협력사"], notes: "합성 명세, 실제 업무 서버 미연결" }];
  }
  return result;
}
export function throughProposal() {
  let p = workflowProject();
  p = mergeArtifacts(p, workflowResult(p, "rfp"), "rfp");
  p = mergeArtifacts(p, workflowResult(p, "strategy"), "strategy");
  return mergeArtifacts(p, workflowResult(p, "proposal"), "proposal");
}
