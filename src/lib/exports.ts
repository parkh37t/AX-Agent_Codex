import {
  claimLabels,
  traceRows,
  type Project,
  type Screen,
  type Slide,
} from "../../shared/domain";

const PPTX_MIME =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";
const html = (value: unknown): string =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ]!,
  );
const filename = (value: string): string =>
  value
    .replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, "-")
    .replace(/^\.+/, "")
    .trim()
    .slice(0, 180) || "ax-project";
const md = (value: unknown): string =>
  html(value).replace(/([\\`*_{}\[\]()#+.!|~-])/g, "\\$1");
const list = (values: string[]): string =>
  values.length ? values.map(md).join(", ") : "—";
const stateLabel = (claim: Slide["claim"]): string =>
  `${claimLabels[claim]} (${claim})`;

/** Trigger an actual local browser download; callers retain control of encoding/BOM. */
export function downloadFile(
  name: string,
  content: BlobPart,
  type: string,
): void {
  const blob =
    content instanceof Blob && content.type === type
      ? content
      : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename(name);
  anchor.hidden = true;
  try {
    document.body.appendChild(anchor);
    anchor.click();
  } finally {
    anchor.remove();
    // Revoking immediately can interrupt the download in some browsers.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

export function exportProjectJson(project: Project): void {
  downloadFile(
    `${filename(project.title)}-backup.json`,
    JSON.stringify(project, null, 2),
    "application/json;charset=utf-8",
  );
}

/** Human-readable, complete export. The JSON backup remains the import format. */
export function projectMarkdown(project: Project): string {
  const output = [
    `# ${md(project.title)}`,
    "",
    `- 고객: ${md(project.client) || "—"}`,
    `- 프로젝트 ID: ${md(project.id)}`,
    `- 버전: ${project.version} · 단계: ${md(project.stage)}`,
    `- 수정 시각: ${md(project.updatedAt)}`,
    `- 데이터: ${project.isDemo ? "데모 / 합성 예시" : "프로젝트 입력 자료"}`,
    "",
    "## 과업 개요",
    "",
    md(project.brief),
    "",
    "## 제안 요약",
    "",
    md(project.proposal.summary),
    "",
    "### 핵심 전략",
    "",
    ...project.proposal.winThemes.map((theme) => `- ${md(theme)}`),
    "",
    "## 제안 장표",
    "",
  ];
  for (const slide of project.proposal.slides) {
    output.push(
      `### ${md(slide.id)} · ${md(slide.title)}`,
      "",
      md(slide.message),
      "",
      ...slide.bullets.map((bullet) => `- ${md(bullet)}`),
      "",
      `근거 상태: ${stateLabel(slide.claim)}  `,
      `도식: ${md(slide.diagram)}  `,
      `자료: ${list(slide.evidenceIds)}  `,
      `요구사항: ${list(slide.requirementIds)}`,
      "",
    );
  }
  output.push("## 현황 분석", "");
  for (const finding of project.analysis) {
    output.push(
      `### ${md(finding.id)}`,
      "",
      `현재: ${md(finding.current)}`,
      "",
      `영향: ${md(finding.impact)}`,
      "",
      `개선 제안: ${md(finding.recommendation)}`,
      "",
      `근거 상태: ${stateLabel(finding.claim)}  `,
      `자료: ${list(finding.sourceIds)}`,
      "",
    );
  }
  output.push("## 요구사항", "");
  for (const requirement of project.requirements) {
    output.push(
      `### ${md(requirement.id)}`,
      "",
      md(requirement.text),
      "",
      `- 우선순위: ${md(requirement.priority)}`,
      `- 업무 상태: ${md(requirement.status)}`,
      `- 근거 상태: ${stateLabel(requirement.claim)}`,
      `- 자료: ${list(requirement.sourceIds)}`,
      "",
      `수용 기준: ${md(requirement.acceptance)}`,
      "",
    );
  }
  output.push("## 정보 구조", "");
  for (const item of project.ia)
    output.push(
      `- ${md(item.id)} · ${md(item.label)} · 상위: ${md(item.parentId) || "최상위"}`,
    );
  output.push("", "## 기능", "");
  for (const item of project.functions) {
    output.push(
      `### ${md(item.id)} · ${md(item.name)}`,
      "",
      `메뉴: ${md(item.iaId)}  `,
      `요구사항: ${list(item.requirementIds)}`,
      "",
    );
  }
  output.push("## 화면 명세", "");
  for (const screen of project.screens) {
    output.push(
      `### ${md(screen.id)} · ${md(screen.title)}`,
      "",
      `- 경로: ${md(screen.route)}`,
      `- 유형: ${md(screen.kind)}`,
      `- 기능: ${list(screen.functionIds)}`,
      `- 업무 역할: ${list(screen.roles)}`,
      `- 상태: ${list(screen.states)}`,
      "",
      "#### 화면 구성",
      "",
      ...screen.sections.map((section) => `- ${md(section)}`),
      "",
      "#### 입력 필드",
      "",
    );
    for (const field of screen.fields) {
      output.push(
        `- ${md(field.name)} · ${md(field.type)} · ${field.required ? "필수" : "선택"} · 규칙: ${md(field.rule) || "—"}`,
      );
    }
    output.push("", "#### 설명", "", md(screen.notes), "");
  }
  output.push("## 수행 전환 결정", "");
  for (const item of project.handoff)
    output.push(
      `- ${md(item.requirementId)} · ${md(item.decision)} · ${md(item.reason)}`,
    );
  output.push(
    "",
    "## 가정 및 확인할 내용",
    "",
    ...project.assumptions.map((assumption) => `- ${md(assumption)}`),
    "",
    "## 원문 자료",
    "",
  );
  for (const source of project.sources) {
    // A source may itself contain Markdown fences or HTML. Keep it inert and complete.
    let fenceLength = 3;
    for (const match of source.text.matchAll(/`+/g))
      fenceLength = Math.max(fenceLength, match[0].length + 1);
    const fence = "`".repeat(fenceLength);
    output.push(
      `### ${md(source.id)} · ${md(source.name)}`,
      "",
      `유형: ${md(source.kind)}  `,
      `읽은 범위: ${md(source.readScope)}`,
      "",
      `${fence}text`,
      source.text,
      fence,
      "",
    );
  }
  return `${output.join("\n")}\n`;
}

function csvCell(value: unknown): string {
  const original = String(value ?? "");
  // Quoting alone does not prevent spreadsheet formula evaluation. Include leading whitespace.
  const safe =
    /^[\t\r\n]/u.test(original) || /^[\s\uFEFF]*[=+\-@]/u.test(original)
      ? `'${original}`
      : original;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function traceCsv(project: Project): string {
  const headers = [
    "요구사항 ID",
    "요구사항",
    "우선순위",
    "업무 상태",
    "근거 상태",
    "근거 상태 설명",
    "자료 ID",
    "수용 기준",
    "메뉴 ID",
    "기능 ID",
    "화면 ID",
    "연결 상태",
    "전환 결정",
    "전환 사유",
  ];
  const rows = traceRows(project).map((row) => {
    const handoff = project.handoff.filter(
      (item) => item.requirementId === row.requirement.id,
    );
    return [
      row.requirement.id,
      row.requirement.text,
      row.requirement.priority,
      row.requirement.status,
      row.requirement.claim,
      claimLabels[row.requirement.claim],
      row.requirement.sourceIds.join(" | "),
      row.requirement.acceptance,
      row.ia.map((item) => item.id).join(" | "),
      row.functions.map((item) => item.id).join(" | "),
      row.screens.map((item) => item.id).join(" | "),
      row.complete ? "연결됨 (검증 완료를 의미하지 않음)" : "연결 확인 필요",
      handoff.map((item) => item.decision).join(" | "),
      handoff.map((item) => item.reason).join(" | "),
    ];
  });
  return [headers, ...rows]
    .map((row) => row.map(csvCell).join(","))
    .join("\r\n");
}

const prototypeStyles = `
:root{font-family:"Noto Sans CJK KR","Malgun Gothic",system-ui,sans-serif;color:#182c28;background:#f4f5f1;--jade:#245d50;--line:#dce3dd}*{box-sizing:border-box}body{margin:0}button,input,select,textarea{font:inherit}button{cursor:pointer}button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:3px solid #83bda9;outline-offset:3px}[hidden]{display:none!important}.app{display:grid;grid-template-columns:250px minmax(0,1fr);min-height:100vh}.sidebar{background:#182c28;color:white;padding:30px 20px;display:flex;flex-direction:column;gap:26px}.brand{font-weight:800;font-size:20px;letter-spacing:-.5px}.brand small{display:block;font-size:10px;letter-spacing:2px;color:#acd2c1;margin-top:8px}.project-name{font-size:13px;line-height:1.7;color:#c1d5ca;overflow-wrap:anywhere}.nav{display:grid;gap:7px}.nav button{border:0;color:#c4d7cd;background:transparent;text-align:left;padding:13px 12px;border-radius:9px;overflow-wrap:anywhere}.nav button[aria-current="page"]{background:#d8e8e1;color:#182c28;font-weight:700}.nav button span{display:block;font-size:10px;opacity:.7;margin-top:5px}.sidebar-note{margin-top:auto;color:#abc4b8;font-size:11px;line-height:1.7}.workspace{min-width:0;padding:0 38px 50px}.topbar{display:flex;justify-content:space-between;gap:20px;align-items:center;min-height:80px;border-bottom:1px solid var(--line);font-size:12px;color:#65766e}.pill{background:#e2eee7;color:var(--jade);border-radius:20px;padding:7px 12px;white-space:nowrap}.screen-header{padding:32px 0 20px}.eyebrow{font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:#728279;overflow-wrap:anywhere}h1{font-size:29px;letter-spacing:-1px;margin:10px 0;overflow-wrap:anywhere}h2{font-size:17px;line-height:1.6;margin:0 0 13px;overflow-wrap:anywhere}p{line-height:1.7;overflow-wrap:anywhere}.muted{color:#728279;font-size:12px}.state-tabs{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:25px}.state-tabs button{border:1px solid var(--line);background:white;color:#5b6f64;padding:9px 14px;border-radius:7px;font-size:12px}.state-tabs button[aria-selected="true"]{background:var(--jade);color:white;border-color:var(--jade)}.card{padding:24px;background:white;border:1px solid var(--line);border-radius:12px;margin-bottom:20px;min-width:0}.card-heading{display:flex;justify-content:space-between;align-items:center;gap:20px;margin-bottom:18px}.card-heading h2{margin:0}.sections{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,230px),1fr));gap:16px}.sections .card{margin:0 0 20px}.section-number{font-size:11px;font-weight:700;color:#458573;display:block;margin-bottom:15px}.metric{font-size:32px;font-weight:750;color:var(--jade);margin:12px 0}.field-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}.field{display:flex;flex-direction:column;gap:8px;min-width:0}.field label{font-size:13px;font-weight:650;overflow-wrap:anywhere}.required{color:#a13e35}.field input:not([type="checkbox"]),.field select,.field textarea,.filter{width:100%;min-height:43px;border:1px solid #ced8d0;border-radius:7px;padding:10px 12px;background:#fff;color:#182c28}.field textarea{resize:vertical;min-height:100px}.field input[type="checkbox"]{width:19px;height:19px;accent-color:var(--jade)}.field small{font-size:11px;color:#728279;line-height:1.6;overflow-wrap:anywhere}.actions{display:flex;align-items:center;gap:16px;flex-wrap:wrap;margin-top:22px}.primary{background:var(--jade);color:white;border:0;border-radius:7px;padding:11px 17px;font-size:13px}.secondary{background:white;border:1px solid var(--line);border-radius:7px;padding:10px 17px;color:#52675a;font-size:13px}.feedback{font-size:12px;color:var(--jade);overflow-wrap:anywhere}.table-scroll{overflow:auto}table{width:100%;border-collapse:collapse;font-size:12px;text-align:left}th{background:#f5f7f3;color:#617569;padding:13px 15px;font-weight:600}td{padding:16px 15px;border-bottom:1px solid #edf0eb;line-height:1.6;max-width:430px;overflow-wrap:anywhere}.status{display:inline-block;white-space:nowrap;border-radius:5px;background:#e8f1ec;color:#34745c;padding:5px 8px;font-size:10px}.filter-label{font-size:12px;color:#6d7d72;display:flex;align-items:center;gap:10px}.filter{max-width:260px;font-size:12px}.empty-panel{display:flex;min-height:300px;flex-direction:column;justify-content:center;align-items:center;text-align:center}.state-symbol{font-size:30px;color:#4e8972;display:grid;place-items:center;width:64px;height:64px;border-radius:50%;background:#e7f0e9;margin-bottom:20px}.notes{white-space:pre-wrap}.spec-line{overflow-wrap:anywhere;font-size:11px;color:#849187}.search-empty{text-align:center;padding:24px;color:#728279}.footer-note{font-size:11px;color:#839085;line-height:1.8;margin-top:25px}@media(max-width:900px){.app{grid-template-columns:190px minmax(0,1fr)}.workspace{padding:0 22px 35px}.sidebar{padding:25px 14px}.field-grid{grid-template-columns:1fr}}@media(max-width:620px){.app{display:block}.sidebar{padding:20px}.sidebar-note,.project-name{display:none}.nav{display:flex;overflow:auto;gap:8px}.nav button{min-width:150px;max-width:200px}.nav button span{display:none}.workspace{padding:0 16px 30px}.topbar{min-height:65px}.card{padding:18px}.card-heading{align-items:flex-start;flex-direction:column}.filter-label,.filter{width:100%;max-width:none}h1{font-size:24px}}
`;

function fieldsHtml(screen: Screen, screenIndex: number): string {
  if (!screen.fields.length) return "";
  const fields = screen.fields
    .map((field, fieldIndex) => {
      const id = `field-${screenIndex}-${fieldIndex}`;
      const required = field.required ? " required" : "";
      const attributes = `id="${id}" name="${id}"${required} aria-describedby="${id}-rule"`;
      const control =
        field.type === "textarea"
          ? `<textarea ${attributes} rows="3"></textarea>`
          : field.type === "select"
            ? `<select ${attributes}><option value="">선택해 주세요</option><option value="sample-a">예시 선택 A</option><option value="sample-b">예시 선택 B</option></select>`
            : `<input ${attributes} type="${field.type === "number" ? "number" : field.type === "date" ? "date" : field.type === "checkbox" ? "checkbox" : "text"}"${field.type === "number" ? ' step="any"' : ""}>`;
      return `<div class="field"><label for="${id}">${html(field.name)}${field.required ? ' <span class="required">*</span>' : ""}</label>${control}<small id="${id}-rule">${html(field.rule || "입력 규칙이 지정되지 않았습니다.")}</small></div>`;
    })
    .join("");
  return `<div class="card"><h2>정보 입력</h2><p class="muted">필수값과 입력 유형을 확인합니다. 상세 업무 규칙은 화면 명세를 참고해 주세요.</p><form class="prototype-form" novalidate><div class="field-grid">${fields}</div><div class="actions"><button class="primary" type="submit">입력 확인</button><button class="secondary" type="reset">초기화</button><span class="feedback" role="status" aria-live="polite"></span></div></form></div>`;
}

function tableHtml(screen: Screen, screenIndex: number): string {
  const rows = Array.from(
    { length: 6 },
    (_, index) =>
      `<tr data-example-row><td>EXAMPLE-${String(index + 1).padStart(2, "0")}</td><td>${html(screen.sections[index % Math.max(screen.sections.length, 1)] || `예시 항목 ${index + 1}`)}</td><td><span class="status">${["작성 중", "검토 대기", "확인 예시"][index % 3]}</span></td><td>샘플 담당자 ${(index % 3) + 1}</td></tr>`,
  ).join("");
  return `<div class="card table-card"><div class="card-heading"><h2>항목 목록</h2><label class="filter-label" for="filter-${screenIndex}">목록 검색<input id="filter-${screenIndex}" type="search" class="filter" placeholder="항목 또는 상태 검색"></label></div><div class="table-scroll"><table><thead><tr><th scope="col">번호</th><th scope="col">항목</th><th scope="col">상태</th><th scope="col">담당</th></tr></thead><tbody>${rows}</tbody></table></div><p class="search-empty" hidden role="status">검색 결과가 없습니다.</p><p class="muted">목록의 모든 항목은 동작 확인용 합성 데이터입니다.</p></div>`;
}

function screenHtml(screen: Screen, index: number): string {
  const states: Screen["states"] = Array.from(
    new Set<Screen["states"][number]>([
      "normal",
      "empty",
      "error",
      ...screen.states,
    ]),
  );
  const names = {
    normal: "정상",
    empty: "빈 상태",
    error: "오류",
    loading: "처리 중",
    permission: "권한 제한",
  };
  const sections = screen.sections
    .map(
      (section, sectionIndex) =>
        `<div class="card"><span class="section-number">SECTION ${String(sectionIndex + 1).padStart(2, "0")}</span><h2>${html(section)}</h2><p class="muted">화면 명세에 정의된 구성 영역입니다.</p>${screen.kind === "dashboard" ? '<div class="metric">—</div><p class="muted">실제 지표는 연결되지 않았습니다.</p>' : ""}</div>`,
    )
    .join("");
  const normal = `<div class="sections">${sections}</div>${screen.kind === "list" || screen.kind === "dashboard" ? tableHtml(screen, index) : ""}${fieldsHtml(screen, index)}${screen.notes ? `<div class="card"><h2>화면 설명</h2><p class="notes">${html(screen.notes)}</p></div>` : ""}${!screen.sections.length && !screen.fields.length && screen.kind !== "list" && screen.kind !== "dashboard" && !screen.notes ? '<div class="card"><h2>화면 구성 준비</h2><p class="muted">화면 명세에 영역이나 입력 필드를 추가하면 이곳에 표시됩니다.</p></div>' : ""}`;
  const panels: Record<Screen["states"][number], string> = {
    normal,
    empty:
      '<div class="card empty-panel"><div class="state-symbol" aria-hidden="true">○</div><h2>아직 등록된 항목이 없습니다</h2><p class="muted">빈 데이터 상태를 확인하는 예시 화면입니다.</p><button class="primary" data-return-normal>정상 상태 보기</button></div>',
    error:
      '<div class="card empty-panel"><div class="state-symbol" aria-hidden="true">!</div><h2>정보를 불러오지 못했습니다</h2><p class="muted">오류 후 재시도 흐름을 확인하는 예시 화면입니다.</p><button class="primary" data-return-normal>다시 시도</button></div>',
    loading:
      '<div class="card empty-panel" role="status"><div class="state-symbol" aria-hidden="true">…</div><h2>처리 중입니다</h2><p class="muted">대기 상태의 예시입니다. 정상 탭으로 전환할 수 있습니다.</p></div>',
    permission:
      '<div class="card empty-panel"><div class="state-symbol" aria-hidden="true">◇</div><h2>접근 권한을 확인해 주세요</h2><p class="muted">권한 제한을 표현하는 예시이며 실제 접근 권한 검증은 수행하지 않습니다.</p></div>',
  };
  return `<section class="screen" id="screen-${index}"${index ? " hidden" : ""} aria-labelledby="screen-title-${index}"><header class="screen-header"><div class="eyebrow">${html(screen.id)} · ${html(screen.kind)}</div><h1 id="screen-title-${index}">${html(screen.title)}</h1><p class="muted">${html(screen.route)} · 역할 ${html(screen.roles.join(", ") || "미지정")}</p><p class="spec-line">연결 기능 ${html(screen.functionIds.join(", ") || "없음")} · 명세 상태 ${html(screen.states.join(", ") || "미지정")}</p></header><div class="state-tabs" role="tablist" aria-label="화면 상태 미리보기">${states.map((state) => `<button id="tab-${index}-${state}" type="button" role="tab" data-state="${state}" aria-selected="${state === "normal"}" aria-controls="panel-${index}-${state}" tabindex="${state === "normal" ? 0 : -1}">${names[state]}</button>`).join("")}</div>${states.map((state) => `<div id="panel-${index}-${state}" data-state-panel="${state}" role="tabpanel" aria-labelledby="tab-${index}-${state}"${state !== "normal" ? " hidden" : ""}>${panels[state]}</div>`).join("")}<p class="footer-note">이 화면은 명세를 바탕으로 만든 오프라인 프로토타입입니다. 입력값은 전송되거나 저장되지 않습니다.</p></section>`;
}

// Fixed script only: no source text, IDs, routes or other model output enters JavaScript.
const prototypeScript = `
document.querySelectorAll('[data-screen-target]').forEach(function(button){button.addEventListener('click',function(){var target=button.getAttribute('data-screen-target');document.querySelectorAll('.screen').forEach(function(screen){screen.hidden=screen.id!==target;});document.querySelectorAll('[data-screen-target]').forEach(function(item){if(item===button){item.setAttribute('aria-current','page');}else{item.removeAttribute('aria-current');}});window.scrollTo(0,0);});});
function selectState(screen,state,focus){screen.querySelectorAll('[data-state]').forEach(function(tab){var active=tab.getAttribute('data-state')===state;tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;if(active&&focus){tab.focus();}});screen.querySelectorAll('[data-state-panel]').forEach(function(panel){panel.hidden=panel.getAttribute('data-state-panel')!==state;});}
document.querySelectorAll('.screen').forEach(function(screen){screen.querySelectorAll('[data-state]').forEach(function(tab){tab.addEventListener('click',function(){selectState(screen,tab.getAttribute('data-state'),false);});tab.addEventListener('keydown',function(event){var tabs=Array.from(screen.querySelectorAll('[data-state]'));var index=tabs.indexOf(tab);var next=event.key==='ArrowRight'?(index+1)%tabs.length:event.key==='ArrowLeft'?(index+tabs.length-1)%tabs.length:event.key==='Home'?0:event.key==='End'?tabs.length-1:-1;if(next>=0){event.preventDefault();selectState(screen,tabs[next].getAttribute('data-state'),true);}});});screen.querySelectorAll('[data-return-normal]').forEach(function(button){button.addEventListener('click',function(){selectState(screen,'normal',true);});});});
document.querySelectorAll('.filter').forEach(function(input){input.addEventListener('input',function(){var card=input.closest('.table-card');var query=input.value.toLocaleLowerCase().trim();var visible=0;card.querySelectorAll('[data-example-row]').forEach(function(row){row.hidden=!row.textContent.toLocaleLowerCase().includes(query);if(!row.hidden){visible++;}});card.querySelector('.search-empty').hidden=visible>0;});});
document.querySelectorAll('.prototype-form').forEach(function(form){var feedback=form.querySelector('.feedback');form.addEventListener('submit',function(event){event.preventDefault();if(!form.checkValidity()){feedback.textContent='필수 항목과 입력 형식을 확인해 주세요.';form.reportValidity();return;}feedback.textContent='입력 확인을 마쳤습니다. 예시 화면이므로 저장하거나 전송하지 않습니다.';});form.addEventListener('reset',function(){feedback.textContent='';});});
`;

export function prototypeHtml(project: Project): string {
  const nav = project.screens
    .map(
      (screen, index) =>
        `<button type="button" data-screen-target="screen-${index}"${index === 0 ? ' aria-current="page"' : ""}>${html(screen.title)}<span>${html(screen.id)}</span></button>`,
    )
    .join("");
  return `<!doctype html><html lang="ko"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'none'; form-action 'none'; base-uri 'none'"><title>${html(project.title)} · 화면 프로토타입</title><style>${prototypeStyles}</style></head><body><div class="app"><aside class="sidebar"><div class="brand">AX STUDIO<small>INTERACTIVE PROTOTYPE</small></div><div class="project-name">${html(project.title)}<br>${html(project.client)}</div><nav class="nav" aria-label="화면 목록">${nav}</nav><div class="sidebar-note">화면 명세 기반 미리보기<br>합성 데이터 · 외부 연결 없음</div></aside><main class="workspace"><div class="topbar"><span>작업 공간 / 화면 프로토타입</span><span class="pill">${project.screens.length} screens · offline</span></div>${project.screens.map(screenHtml).join("") || '<div class="card empty-panel"><h1>아직 화면 명세가 없습니다</h1><p class="muted">프로젝트에 화면을 추가한 뒤 다시 내보내 주세요.</p></div>'}</main></div><script>${prototypeScript}</script></body></html>`;
}

type ContentLine = { text: string; kind: "message" | "bullet" };
const units = (character: string): number =>
  /[\u0000-\u007f]/.test(character) ? 0.55 : 1;
function wrapLines(text: string, width = 43): string[] {
  const lines: string[] = [];
  for (const paragraph of text
    .replace(/\r\n?/g, "\n")
    .replace(/\t/g, "  ")
    .split("\n")) {
    let line = "";
    let length = 0;
    for (const character of Array.from(paragraph)) {
      // Closing punctuation stays with its preceding text instead of occupying a line alone.
      if (
        line &&
        length + units(character) > width &&
        (!/[.,!?;:，。！？、)\]}]/u.test(character) ||
          length + units(character) > width + 1)
      ) {
        lines.push(line);
        line = "";
        length = 0;
      }
      line += character;
      length += units(character);
    }
    lines.push(line);
  }
  return lines;
}
function shortText(
  text: string,
  width: number,
): { value: string; shortened: boolean } {
  let value = "";
  let length = 0;
  for (const character of Array.from(text.replace(/[\r\n\t]+/g, " "))) {
    if (length + units(character) > width)
      return { value: `${value}…`, shortened: true };
    value += character;
    length += units(character);
  }
  return { value, shortened: false };
}
function slidePages(slide: Slide): ContentLine[][] {
  const lines: ContentLine[] = [];
  if (slide.message)
    lines.push(
      ...wrapLines(slide.message, 40).map((text) => ({
        text,
        kind: "message" as const,
      })),
    );
  for (const bullet of slide.bullets) {
    const wrapped = wrapLines(bullet, 42);
    lines.push(
      ...wrapped.map((text, index) => ({
        text: `${index === 0 ? "• " : "  "}${text}`,
        kind: "bullet" as const,
      })),
    );
  }
  if (!lines.length)
    lines.push({
      text: "아직 장표 내용이 작성되지 않았습니다.",
      kind: "message",
    });
  const pages: ContentLine[][] = [];
  for (let index = 0; index < lines.length; index += 10)
    pages.push(lines.slice(index, index + 10));
  return pages;
}

/** Use diagrams only when every original message/node fits at a readable size. */
function diagramNodeWrap(slide: Slide): number {
  if (slide.diagram === "statement") return 14;
  if (slide.diagram === "evidence") return 31;
  const count = Math.max(slide.bullets.length, 1);
  const gap = slide.diagram === "process" ? 0.42 : 0.24;
  const innerWidth = (11.85 - (count - 1) * gap) / count - 0.48;
  return Math.max(8, Math.floor(((innerWidth * 72) / 17) * 0.88));
}
function fitsDiagram(slide: Slide): boolean {
  const nodes = slide.bullets;
  if (!slide.message || wrapLines(slide.message, 44).length > 2) return false;
  if (nodes.length > (slide.diagram === "statement" ? 3 : 4)) return false;
  if (slide.diagram !== "statement" && !nodes.length) return false;
  if (slide.diagram === "statement" && wrapLines(slide.message, 28).length > 3)
    return false;
  if (
    nodes.some(
      (node) =>
        !node.trim() || wrapLines(node, diagramNodeWrap(slide)).length > 3,
    )
  )
    return false;
  if (slide.diagram === "evidence") {
    if (nodes.flatMap((node) => wrapLines(node, 31)).length > 5) return false;
    if (
      slide.evidenceIds.length > 4 ||
      slide.evidenceIds.some((id) => wrapLines(id, 16).length > 1)
    )
      return false;
  }
  return true;
}

/** Editable text/shapes, not screenshots. Long body content continues on additional slides. */
export async function exportProposalPptx(project: Project): Promise<void> {
  const { default: PptxGenJS } = await import("pptxgenjs");
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "AX Agent Studio";
  pptx.subject = "제안 초안 · 근거 상태와 추적 ID 포함";
  pptx.title = project.title;
  pptx.company = "AX Agent Studio";
  pptx.theme = {
    headFontFace: "Noto Sans CJK KR",
    bodyFontFace: "Noto Sans CJK KR",
  };
  const textStyle = { fontFace: "Noto Sans CJK KR", lang: "ko-KR" };
  const colors = {
    ivory: "F7F7F0",
    jade: "245D50",
    accent: "D8E8E1",
    charcoal: "182C28",
    muted: "60766B",
  };
  type DeckSlide = ReturnType<typeof pptx.addSlide>;
  const box = (
    slide: DeckSlide,
    name: string,
    x: number,
    y: number,
    w: number,
    h: number,
    fill = "FFFFFF",
    border = colors.accent,
  ) => {
    slide.addShape(pptx.ShapeType.rect, {
      objectName: name,
      x,
      y,
      w,
      h,
      fill: { color: fill },
      line: { color: border, width: 1 },
    });
  };
  const label = (
    slide: DeckSlide,
    text: string,
    x: number,
    y: number,
    w: number,
    h: number,
    fontSize = 16,
    color = colors.charcoal,
    bold = false,
  ) => {
    slide.addText(text, {
      ...textStyle,
      x,
      y,
      w,
      h,
      fontSize,
      color,
      bold,
      margin: 0,
      valign: "top",
      breakLine: false,
    });
  };
  const renderDiagram = (slide: DeckSlide, item: Slide) => {
    const nodes = item.bullets;
    const nodeWrap = diagramNodeWrap(item);
    if (item.diagram === "statement") {
      box(
        slide,
        "statement-message-panel",
        0.75,
        2.32,
        11.85,
        1.98,
        colors.jade,
        colors.jade,
      );
      label(
        slide,
        wrapLines(item.message, 28).join("\n"),
        1.1,
        2.57,
        11.15,
        1.6,
        26,
        "FFFFFF",
        true,
      );
      const gap = 0.22;
      const width =
        (11.85 - Math.max(nodes.length - 1, 0) * gap) /
        Math.max(nodes.length, 1);
      nodes.forEach((node, index) => {
        const x = 0.75 + index * (width + gap);
        box(slide, `statement-support-${index + 1}`, x, 4.68, width, 1.48);
        label(
          slide,
          String(index + 1).padStart(2, "0"),
          x + 0.2,
          4.87,
          0.5,
          0.3,
          11,
          colors.jade,
          true,
        );
        label(
          slide,
          wrapLines(node, nodeWrap).join("\n"),
          x + 0.2,
          5.13,
          width - 0.4,
          0.92,
          14.5,
        );
      });
      return;
    }
    label(
      slide,
      wrapLines(item.message, 44).join("\n"),
      0.86,
      2.3,
      11.55,
      0.82,
      18,
      colors.jade,
      true,
    );
    if (item.diagram === "evidence") {
      box(slide, "evidence-content-panel", 0.75, 3.45, 7.35, 2.72);
      label(slide, "확인할 내용", 1.02, 3.67, 6.8, 0.3, 11, colors.jade, true);
      let y = 4.13;
      for (const node of nodes) {
        const wrapped = wrapLines(node, 31);
        label(
          slide,
          wrapped
            .map((line, index) => `${index ? "  " : "• "}${line}`)
            .join("\n"),
          1.02,
          y,
          6.8,
          wrapped.length * 0.31,
          16,
        );
        y += wrapped.length * 0.31 + 0.11;
      }
      box(
        slide,
        "evidence-source-panel",
        8.37,
        3.45,
        4.23,
        2.72,
        colors.accent,
      );
      label(slide, "근거 상태", 8.64, 3.7, 3.7, 0.3, 11, colors.muted, true);
      label(
        slide,
        claimLabels[item.claim],
        8.64,
        4.1,
        3.7,
        0.48,
        24,
        colors.jade,
        true,
      );
      label(
        slide,
        "연결 자료 ID",
        8.64,
        4.81,
        3.7,
        0.28,
        10,
        colors.muted,
        true,
      );
      label(
        slide,
        item.evidenceIds.join("\n") || "연결된 자료 없음",
        8.64,
        5.18,
        3.7,
        0.88,
        12,
        colors.charcoal,
      );
      return;
    }
    const gap = item.diagram === "process" ? 0.42 : 0.24;
    const width = (11.85 - (nodes.length - 1) * gap) / nodes.length;
    if (item.diagram === "roadmap") {
      slide.addShape(pptx.ShapeType.line, {
        objectName: "roadmap-timeline",
        x: 0.75 + width / 2,
        y: 3.82,
        w: 11.85 - width,
        h: 0,
        line: { color: colors.jade, width: 2 },
      });
    }
    nodes.forEach((node, index) => {
      const x = 0.75 + index * (width + gap);
      const number = String(index + 1).padStart(2, "0");
      if (item.diagram === "roadmap") {
        slide.addShape(pptx.ShapeType.ellipse, {
          objectName: `roadmap-milestone-${number}`,
          x: x + width / 2 - 0.12,
          y: 3.7,
          w: 0.24,
          h: 0.24,
          fill: { color: colors.jade },
          line: { color: colors.jade },
        });
        box(slide, `roadmap-card-${number}`, x, 4.27, width, 1.9);
        label(
          slide,
          `MILESTONE ${number}`,
          x + 0.2,
          4.48,
          width - 0.4,
          0.3,
          10,
          colors.jade,
          true,
        );
        label(
          slide,
          wrapLines(node, nodeWrap).join("\n"),
          x + 0.2,
          4.97,
          width - 0.4,
          1.02,
          17,
          colors.charcoal,
          true,
        );
      } else if (item.diagram === "process") {
        box(
          slide,
          `process-step-${number}`,
          x,
          3.58,
          width,
          2.58,
          index === 0 ? colors.accent : "FFFFFF",
        );
        label(
          slide,
          `STEP ${number}`,
          x + 0.22,
          3.88,
          width - 0.44,
          0.32,
          11,
          colors.jade,
          true,
        );
        label(
          slide,
          wrapLines(node, nodeWrap).join("\n"),
          x + 0.22,
          4.56,
          width - 0.44,
          1.2,
          17,
          colors.charcoal,
          true,
        );
        if (index < nodes.length - 1)
          slide.addShape(pptx.ShapeType.rightArrow, {
            objectName: `process-arrow-${number}`,
            x: x + width + 0.07,
            y: 4.61,
            w: 0.28,
            h: 0.28,
            fill: { color: colors.jade },
            line: { color: colors.jade },
          });
      } else if (item.diagram === "strategy") {
        box(slide, `strategy-card-${number}`, x, 3.5, width, 2.67);
        box(
          slide,
          `strategy-band-${number}`,
          x,
          3.5,
          width,
          0.09,
          colors.jade,
          colors.jade,
        );
        label(
          slide,
          number,
          x + 0.24,
          3.92,
          width - 0.48,
          0.54,
          29,
          colors.jade,
          true,
        );
        label(
          slide,
          wrapLines(node, nodeWrap).join("\n"),
          x + 0.24,
          4.85,
          width - 0.48,
          1.05,
          17,
          colors.charcoal,
          true,
        );
      } else {
        box(slide, `comparison-column-${number}`, x, 3.5, width, 2.67);
        box(
          slide,
          `comparison-header-${number}`,
          x,
          3.5,
          width,
          0.55,
          colors.accent,
        );
        label(
          slide,
          `관점 ${number}`,
          x + 0.2,
          3.64,
          width - 0.4,
          0.3,
          11,
          colors.jade,
          true,
        );
        label(
          slide,
          wrapLines(node, nodeWrap).join("\n"),
          x + 0.24,
          4.51,
          width - 0.48,
          1.3,
          17,
          colors.charcoal,
          true,
        );
      }
    });
  };
  const cover = pptx.addSlide();
  cover.background = { color: colors.ivory };
  cover.addShape(pptx.ShapeType.rect, {
    x: 10.7,
    y: 0,
    w: 2.64,
    h: 7.5,
    fill: { color: colors.accent },
    line: { color: colors.accent },
  });
  cover.addShape(pptx.ShapeType.rect, {
    x: 0.75,
    y: 0.9,
    w: 0.6,
    h: 0.08,
    fill: { color: colors.jade },
    line: { color: colors.jade },
  });
  cover.addText("PROJECT PROPOSAL", {
    ...textStyle,
    x: 0.75,
    y: 1.2,
    w: 9.6,
    h: 0.3,
    fontSize: 11,
    color: colors.jade,
    charSpacing: 2,
    margin: 0,
  });
  const coverTitle = shortText(project.title, 54);
  cover.addText(wrapLines(coverTitle.value, 25).join("\n"), {
    ...textStyle,
    x: 0.75,
    y: 2,
    w: 10,
    h: 2.1,
    fontSize: 32,
    bold: true,
    color: colors.charcoal,
    margin: 0,
    breakLine: false,
    valign: "top",
  });
  cover.addText(shortText(project.client || "프로젝트 제안", 57).value, {
    ...textStyle,
    x: 0.78,
    y: 4.6,
    w: 9.6,
    h: 0.55,
    fontSize: 17,
    color: colors.jade,
    margin: 0,
  });
  cover.addText(
    `${project.updatedAt.slice(0, 10)}  ·  ${project.isDemo ? "합성 예시" : "제안 초안"}${coverTitle.shortened ? "  ·  전체 제목은 발표자 노트에 수록" : ""}`,
    {
      ...textStyle,
      x: 0.78,
      y: 6.3,
      w: 9.7,
      h: 0.5,
      fontSize: 10,
      color: colors.muted,
      margin: 0,
    },
  );
  cover.addNotes(
    JSON.stringify(
      {
        projectId: project.id,
        title: project.title,
        client: project.client,
        brief: project.brief,
        summary: project.proposal.summary,
        winThemes: project.proposal.winThemes,
        updatedAt: project.updatedAt,
        isDemo: project.isDemo,
        titleShortened: coverTitle.shortened,
        clientShortened: shortText(project.client, 57).shortened,
        notice:
          "회사 및 고객의 주장은 별도 직접 검증 없이 사실로 승격하지 않습니다.",
      },
      null,
      2,
    ),
  );

  let physicalPage = 1;
  for (const [sourceIndex, item] of project.proposal.slides.entries()) {
    const useDiagram = fitsDiagram(item);
    const pages = useDiagram ? [[]] : slidePages(item);
    const title = shortText(item.title, 56);
    for (const [partIndex, lines] of pages.entries()) {
      physicalPage++;
      const slide = pptx.addSlide();
      slide.background = { color: colors.ivory };
      slide.addShape(pptx.ShapeType.rect, {
        x: 0.65,
        y: 0.52,
        w: 0.07,
        h: 0.28,
        fill: { color: colors.jade },
        line: { color: colors.jade },
      });
      slide.addText(
        `PROPOSAL ${String(sourceIndex + 1).padStart(2, "0")} · ${item.diagram.toUpperCase()}${useDiagram ? "" : " · TEXT CONTINUATION"}${pages.length > 1 ? ` · ${partIndex + 1}/${pages.length}` : ""}`,
        {
          ...textStyle,
          x: 0.85,
          y: 0.52,
          w: 11.7,
          h: 0.25,
          fontSize: 9,
          color: colors.jade,
          margin: 0,
        },
      );
      slide.addText(wrapLines(title.value, 31).join("\n"), {
        ...textStyle,
        x: 0.75,
        y: 1.02,
        w: 11.85,
        h: 1.12,
        fontSize: 25,
        bold: true,
        color: colors.charcoal,
        margin: 0,
        valign: "top",
      });
      if (useDiagram) renderDiagram(slide, item);
      for (const [lineIndex, line] of lines.entries()) {
        slide.addText(line.text, {
          ...textStyle,
          x: 0.86,
          y: 2.25 + lineIndex * 0.405,
          w: 11.55,
          h: 0.405,
          fontSize: line.kind === "message" ? 19 : 17,
          bold: line.kind === "message",
          color: line.kind === "message" ? colors.jade : colors.charcoal,
          margin: 0,
          valign: "middle",
          breakLine: false,
        });
      }
      slide.addShape(pptx.ShapeType.line, {
        x: 0.75,
        y: 6.66,
        w: 11.85,
        h: 0,
        line: { color: colors.accent, width: 1 },
      });
      slide.addText(
        `${stateLabel(item.claim)} · 근거 ${item.evidenceIds.length} · 요구 ${item.requirementIds.length}${title.shortened ? " · 전체 제목: 노트 참조" : ""}`,
        {
          ...textStyle,
          x: 0.75,
          y: 6.88,
          w: 10.75,
          h: 0.28,
          fontSize: 9,
          color: colors.muted,
          margin: 0,
        },
      );
      slide.addText(String(physicalPage), {
        ...textStyle,
        x: 11.85,
        y: 6.88,
        w: 0.65,
        h: 0.28,
        align: "right",
        fontSize: 10,
        color: colors.jade,
        margin: 0,
      });
      slide.addNotes(
        JSON.stringify(
          {
            projectId: project.id,
            sourceSlideId: item.id,
            title: item.title,
            message: item.message,
            bullets: item.bullets,
            diagram: item.diagram,
            renderedLayout: useDiagram ? item.diagram : "text-continuation",
            layoutFallback: useDiagram
              ? null
              : "원문을 생략하지 않고 읽기 쉬운 크기로 나누어 수록합니다.",
            claim: item.claim,
            evidenceIds: item.evidenceIds,
            requirementIds: item.requirementIds,
            pagination: { part: partIndex + 1, total: pages.length },
            titleShortened: title.shortened,
            bodyTruncated: false,
            isDemo: project.isDemo,
          },
          null,
          2,
        ),
      );
    }
  }
  const output = await pptx.write({ outputType: "blob" });
  downloadFile(
    `${filename(project.title)}-proposal.pptx`,
    output as BlobPart,
    PPTX_MIME,
  );
}
