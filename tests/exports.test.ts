import { afterEach, describe, expect, it, vi } from "vitest";
import JSZip from "jszip";
import { createProject, type Project } from "../shared/domain";
import {
  downloadFile,
  exportProjectJson,
  exportProposalPptx,
  projectMarkdown,
  prototypeHtml,
  traceCsv,
} from "../src/lib/exports";

function fixture(): Project {
  const project = createProject(
    "프로젝트 제안",
    "업무 입력과 검토 흐름 개선",
    "샘플 고객",
  );
  project.sources = [
    {
      id: "SRC-01",
      name: "고객 회의록",
      kind: "meeting",
      text: "문서의 진술은 직접 검증 사실이 아닙니다.",
      readScope: "본문 전체",
    },
  ];
  project.requirements = [
    {
      id: "REQ-01",
      text: "사용자가 신청 내역을 확인한다.",
      priority: "must",
      status: "confirmed",
      claim: "source_claim",
      sourceIds: ["SRC-01"],
      acceptance: "신청 내역을 목록에서 검색할 수 있다.",
    },
  ];
  project.ia = [{ id: "IA-01", label: "신청 관리", parentId: null }];
  project.functions = [
    {
      id: "FN-01",
      name: "신청 조회",
      requirementIds: ["REQ-01"],
      iaId: "IA-01",
    },
  ];
  project.screens = [
    {
      id: "SCREEN-01",
      title: "신청 목록",
      route: "/requests",
      kind: "list",
      functionIds: ["FN-01"],
      sections: ["최근 신청", "검토 내역"],
      fields: [],
      states: ["normal", "empty", "error"],
      roles: ["담당자"],
      notes: "검색과 목록을 확인합니다.",
    },
    {
      id: "SCREEN-02",
      title: "신청 등록",
      route: "/requests/new",
      kind: "form",
      functionIds: ["FN-01"],
      sections: [],
      fields: [
        { name: "신청 이름", type: "text", required: true, rule: "필수 입력" },
      ],
      states: ["normal", "empty", "error", "loading", "permission"],
      roles: ["담당자"],
      notes: "입력값은 전송되지 않습니다.",
    },
  ];
  project.proposal = {
    summary: "목표와 근거를 연결합니다.",
    winThemes: ["사용자 흐름 개선"],
    slides: [
      {
        id: "SLIDE-01",
        title: "신청 흐름의 일관성 확보",
        message: "명확한 기준으로 사용자가 신청을 마치게 합니다.",
        bullets: ["입력 기준 정리", "진행 상태 표시"],
        diagram: "strategy",
        requirementIds: ["REQ-01"],
        evidenceIds: ["SRC-01"],
        claim: "source_claim",
      },
    ],
  };
  project.handoff = [
    { requirementId: "REQ-01", decision: "adopt", reason: "과업 범위에 포함" },
  ];
  return project;
}

function captureDownload() {
  const blobs: Blob[] = [];
  const anchor = {
    href: "",
    download: "",
    hidden: false,
    click: vi.fn(),
    remove: vi.fn(),
  };
  vi.stubGlobal("document", {
    createElement: vi.fn(() => anchor),
    body: { appendChild: vi.fn() },
  });
  vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
    blobs.push(blob as Blob);
    return "blob:test-download";
  });
  const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  return { blobs, anchor, revoke };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("project exports", () => {
  it("downloads a complete JSON backup without promoting source claims", async () => {
    const project = fixture();
    const capture = captureDownload();
    exportProjectJson(project);
    const restored = JSON.parse(await capture.blobs[0].text());
    expect(restored).toEqual(project);
    expect(restored.requirements[0].claim).toBe("source_claim");
    expect(restored.requirements[0].status).toBe("confirmed");
    expect(capture.anchor.download).toMatch(/-backup\.json$/);
    expect(capture.anchor.click).toHaveBeenCalledOnce();
  });

  it("cleans object URLs after a download and sanitizes only the filename", () => {
    vi.useFakeTimers();
    const capture = captureDownload();
    downloadFile("../unsafe/name.json", "complete content", "application/json");
    expect(capture.anchor.download).not.toMatch(/[\\/]/);
    expect(capture.anchor.remove).toHaveBeenCalledOnce();
    expect(capture.revoke).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(capture.revoke).toHaveBeenCalledWith("blob:test-download");
  });

  it("keeps claims, reference IDs, field rules and complete source text in Markdown", () => {
    const project = fixture();
    project.sources[0].text =
      "```\n<img src=x onerror=alert(1)>\n````\n전체 원문";
    const markdown = projectMarkdown(project);
    expect(markdown).toContain("자료의 주장 (source_claim)");
    expect(markdown).toContain("SRC\\-01");
    expect(markdown).toContain("필수 입력");
    expect(markdown).toContain(
      `\n\`\`\`\`\`text\n${project.sources[0].text}\n\`\`\`\`\`\n`,
    );
    expect(markdown).toContain("수행 전환 결정");
  });

  it.each([
    '=HYPERLINK("https://example.invalid")',
    "+1+1",
    "-1+1",
    "@SUM(1)",
    "\tvalue",
    "\rvalue",
    "  =1+1",
    "\uFEFF@value",
  ])("neutralizes formula cells beginning with %j", (payload) => {
    const project = fixture();
    project.requirements[0].text = payload;
    const csv = traceCsv(project);
    expect(csv).toContain(`"'${payload.replace(/"/g, '""')}"`);
    expect(csv).toContain('"source_claim"');
    expect(csv).toContain("검증 완료를 의미하지 않음");
    expect(csv.charCodeAt(0)).not.toBe(0xfeff); // The caller adds the UTF-8 BOM once.
  });

  it("quotes commas, quotes and newlines without losing trace links", () => {
    const project = fixture();
    project.requirements[0].acceptance = '첫째, "검색"\n둘째, 결과';
    expect(traceCsv(project)).toContain('"첫째, ""검색""\n둘째, 결과"');
    expect(traceCsv(project)).toContain('"SCREEN-01 | SCREEN-02"');
  });
});

describe("offline HTML prototype", () => {
  it("includes every screen, local navigation, state tabs, filtering and form validation", () => {
    const output = prototypeHtml(fixture());
    expect(output).toContain('id="screen-0"');
    expect(output).toContain('id="screen-1" hidden');
    expect(output).toContain('data-screen-target="screen-1"');
    for (const state of ["normal", "empty", "error", "loading", "permission"])
      expect(output).toContain(`data-state="${state}"`);
    expect(output).toContain("form.checkValidity()");
    expect(output).toContain("data-example-row");
    expect(output).toContain('role="tablist"');
    expect(output).toContain("connect-src 'none'");
    expect(output).not.toMatch(
      /\bfetch\s*\(|<script[^>]+src=|<link[^>]+href=|https?:\/\//,
    );
  });

  it("escapes dynamic content in text and attributes, with no model data in the script", () => {
    const project = fixture();
    const payload =
      "</script><img src=x onerror=\"alert(1)\"><svg onload=alert(2)> & 'test'";
    project.title = payload;
    project.client = payload;
    Object.assign(project.screens[0], {
      id: payload,
      title: payload,
      route: "javascript:alert(3)",
      sections: [payload],
      notes: payload,
      roles: [payload],
    });
    project.screens[1].fields[0].name = payload;
    project.screens[1].fields[0].rule = payload;
    const output = prototypeHtml(project);
    expect(output).not.toContain("<img");
    expect(output).not.toContain("<svg");
    expect(output).not.toContain('href="javascript:');
    expect(output.match(/<script>/g)).toHaveLength(1);
    expect(output.match(/<\/script>/g)).toHaveLength(1);
    expect(output).toContain("&lt;/script&gt;&lt;img");
    expect(output).toContain("&quot;alert(1)&quot;");
    expect(output).toContain("&#39;test&#39;");
    const script = output.slice(
      output.indexOf("<script>"),
      output.indexOf("</script>"),
    );
    expect(script).not.toContain("alert(");
    expect(script).not.toContain("javascript:");
  });

  it("has an honest empty state when no screens have been designed", () => {
    const project = fixture();
    project.screens = [];
    expect(prototypeHtml(project)).toContain("아직 화면 명세가 없습니다");
  });
});

describe("editable PowerPoint export", () => {
  it("renders distinct editable diagram geometry with original nodes and claim status", async () => {
    const project = fixture();
    const template = project.proposal.slides[0];
    const types = [
      "statement",
      "comparison",
      "strategy",
      "process",
      "roadmap",
      "evidence",
    ] as const;
    project.proposal.slides = types.map((diagram, index) => ({
      ...template,
      id: `SLIDE-${index}`,
      diagram,
      message: "입력과 확인 흐름을 연결합니다.",
      bullets: ["첫 번째 항목", "두 번째 항목", "세 번째 항목"],
    }));
    project.proposal.slides[5].claim = "unresolved";
    const capture = captureDownload();
    await exportProposalPptx(project);
    const archive = await JSZip.loadAsync(await capture.blobs[0].arrayBuffer());
    const expectedGeometry = [
      "statement-message-panel",
      "comparison-column-01",
      "strategy-card-01",
      "process-arrow-01",
      "roadmap-milestone-01",
      "evidence-source-panel",
    ];
    for (const [index, marker] of expectedGeometry.entries()) {
      const xml = await archive
        .file(`ppt/slides/slide${index + 2}.xml`)!
        .async("string");
      expect(xml).toContain(marker);
      expect(xml).toContain("<p:sp>"); // Native editable shapes, not raster screenshots.
      expect(xml).not.toContain("<p:pic>");
      for (const node of project.proposal.slides[index].bullets)
        expect(xml).toContain(node);
      expect(xml).not.toContain("TEXT CONTINUATION");
    }
    const process = await archive
      .file("ppt/slides/slide5.xml")!
      .async("string");
    expect(process.match(/prst="rightArrow"/g)).toHaveLength(2);
    const roadmap = await archive
      .file("ppt/slides/slide6.xml")!
      .async("string");
    expect(roadmap.match(/prst="ellipse"/g)).toHaveLength(3);
    const evidence = await archive
      .file("ppt/slides/slide7.xml")!
      .async("string");
    expect(evidence).toContain("미확정");
    expect(evidence).toContain("SRC-01");
    expect(evidence).not.toContain("직접 확인");
  });

  it("keeps lengthy diagram nodes complete using explicit text continuations", async () => {
    const project = fixture();
    project.proposal.slides[0].diagram = "process";
    project.proposal.slides[0].bullets = [
      "긴 원문 내용 ".repeat(100) + "마지막 원문",
      "두 번째 단계",
    ];
    const capture = captureDownload();
    await exportProposalPptx(project);
    const archive = await JSZip.loadAsync(await capture.blobs[0].arrayBuffer());
    const names = Object.keys(archive.files).filter((name) =>
      /^ppt\/slides\/slide\d+\.xml$/.test(name),
    );
    const xml = (
      await Promise.all(
        names.map((name) => archive.file(name)!.async("string")),
      )
    ).join("\n");
    expect(names.length).toBeGreaterThan(2);
    expect(xml).toContain("TEXT CONTINUATION");
    expect(xml).toContain("마지막 원문");
    expect(xml).toContain("두 번째 단계");
    expect(xml).not.toContain("process-arrow-01");
  });

  it("writes real slides and notes, preserves source claims and paginates long body text", async () => {
    const project = fixture();
    project.proposal.slides[0].message = `${"근거를 확인하는 긴 문장입니다. ".repeat(75)}끝까지 보존`;
    project.proposal.slides[0].title = "긴 제목 ".repeat(50);
    const capture = captureDownload();
    await exportProposalPptx(project);
    const archive = await JSZip.loadAsync(await capture.blobs[0].arrayBuffer());
    const slides = Object.keys(archive.files).filter((name) =>
      /^ppt\/slides\/slide\d+\.xml$/.test(name),
    );
    expect(slides.length).toBeGreaterThan(2);
    const slideXml = (
      await Promise.all(
        slides.map((name) => archive.file(name)!.async("string")),
      )
    ).join("\n");
    expect(slideXml).toContain("<a:t>");
    expect(slideXml).toContain("끝까지 보존");
    expect(slideXml).toContain("245D50");
    expect(slideXml).toContain("Noto Sans CJK KR");
    const notes = Object.keys(archive.files).filter((name) =>
      /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(name),
    );
    const notesXml = (
      await Promise.all(
        notes.map((name) => archive.file(name)!.async("string")),
      )
    ).join("\n");
    expect(notesXml).toContain("source_claim");
    expect(notesXml).toContain("SRC-01");
    expect(notesXml).toContain("REQ-01");
    expect(notesXml).toContain("titleShortened");
    expect(notesXml).toContain("bodyTruncated");
    expect(notesXml).toContain("끝까지 보존");
    expect(capture.anchor.download).toMatch(/\.pptx$/);
  }, 20000);
});
