import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Boxes,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  ClipboardList,
  Code2,
  Columns3,
  Copy,
  FileText,
  FolderOpen,
  GitBranch,
  LayoutDashboard,
  Layers3,
  LoaderCircle,
  Menu,
  Monitor,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Smartphone,
  Sparkles,
  SquareArrowOutUpRight,
  Trash2,
  Upload,
  WandSparkles,
  X,
  Zap,
} from "lucide-react";
import {
  claimLabels,
  createProject,
  inspectProject,
  preserveScopeDecisions,
  mergeArtifacts,
  projectSchema,
  traceRows,
  type Artifacts,
  type Claim,
  type ConnectionStatus,
  type Job,
  type Project,
  type Screen,
  type Task,
} from "../shared/domain";
import { api } from "./lib/api";
import { makeDemoProject } from "./lib/demo";
import { applyHandoff, planFromMenu } from "./lib/planning";
import {
  downloadFile,
  exportProjectJson,
  exportProposalPptx,
  projectMarkdown,
  prototypeHtml,
  traceCsv,
} from "./lib/exports";
import {
  getSnapshots,
  readProjects,
  saveProjects,
  saveSnapshot,
} from "./lib/storage";

const navGroups = [
  {
    title: "WORKSPACE",
    items: [
      ["/", "프로젝트 개요", LayoutDashboard],
      ["/sources", "자료 보관함", FolderOpen],
    ],
  },
  {
    title: "THINK → MAKE",
    items: [
      ["/proposal", "제안 스튜디오", FileText],
      ["/handoff", "수주 · 범위 전환", CheckCheck],
      ["/asis", "AS-IS 분석", Search],
      ["/plan", "화면 설계", Columns3],
      ["/trace", "연결 · 검수", GitBranch],
    ],
  },
  {
    title: "TOOLS",
    items: [
      ["/prototype", "전체 설계 실행", Zap],
      ["/references", "레퍼런스", BookOpen],
      ["/advanced", "작업대", Code2],
    ],
  },
] as const;
const routeNames: Record<string, string> = {
  "/": "프로젝트 개요",
  "/sources": "자료 보관함",
  "/proposal": "제안 스튜디오",
  "/handoff": "수주 · 범위 전환",
  "/asis": "AS-IS 분석",
  "/plan": "화면 설계",
  "/trace": "연결 · 검수",
  "/prototype": "전체 설계 실행",
  "/references": "레퍼런스",
  "/advanced": "작업대",
  "/settings": "ChatGPT 연결",
  "/new": "새 프로젝트",
};
const stageLabels: Record<Task, string> = {
  proposal: "제안 설계",
  analysis: "현황 분석",
  design: "화면 설계",
  all: "전체 설계",
};
const stateLabels: Record<string, string> = {
  normal: "정상",
  empty: "빈 결과",
  error: "오류",
  loading: "로딩",
  permission: "권한 없음",
};
const kindLabels = {
  dashboard: "대시보드",
  list: "목록",
  detail: "상세",
  form: "입력 폼",
};
const uid = (prefix: string) => `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
const formatDate = (date: string) =>
  new Date(date).toLocaleString("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

function Button({
  children,
  onClick,
  variant = "primary",
  disabled = false,
  title,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  disabled?: boolean;
  title?: string;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      className={`btn ${variant}`}
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      {children}
    </button>
  );
}
function Tag({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return <span className={`tag ${tone}`}>{children}</span>;
}
function ClaimTag({ claim }: { claim: Claim }) {
  return (
    <Tag
      tone={
        claim === "verified_fact"
          ? "green"
          : claim === "unresolved" || claim === "hypothesis"
            ? "amber"
            : "neutral"
      }
    >
      {claimLabels[claim]}
    </Tag>
  );
}
function Empty({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Layers3 size={24} />
      </div>
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}
function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
function SectionHead({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <div className="section-head">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {actions && <div className="head-actions">{actions}</div>}
    </div>
  );
}
function SourceChips({ ids, project }: { ids: string[]; project: Project }) {
  return (
    <div className="chips">
      {ids.length ? (
        ids.map((id) => (
          <span
            key={id}
            className="source-chip"
            title={project.sources.find((s) => s.id === id)?.name}
          >
            {id}
          </span>
        ))
      ) : (
        <span className="muted small">근거 미연결</span>
      )}
    </div>
  );
}

export default function App() {
  const initial = useMemo(readProjects, []);
  const [projects, setProjects] = useState<Project[]>(() =>
    initial.projects.length ? initial.projects : [makeDemoProject()],
  );
  const [activeId, setActiveId] = useState(() => {
    try {
      return (
        localStorage.getItem("ax-agent-studio:active") ||
        initial.projects[0]?.id ||
        ""
      );
    } catch {
      return initial.projects[0]?.id || "";
    }
  });
  const [route, setRoute] = useState(() => location.hash.slice(1) || "/");
  const [toast, setToast] = useState("");
  const [storageError, setStorageError] = useState(initial.error || "");
  const [sidebar, setSidebar] = useState(false);
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [exportMenu, setExportMenu] = useState(false);
  const [selectedScreen, setSelectedScreen] = useState("");
  const savedJob = useMemo(() => {
    try {
      const raw = JSON.parse(
        sessionStorage.getItem("ax-agent-studio:active-job") || "null",
      );
      if (
        typeof raw?.id === "string" &&
        typeof raw.context?.projectId === "string" &&
        typeof raw.context.updatedAt === "string" &&
        ["proposal", "analysis", "design", "all"].includes(raw.context.task)
      )
        return raw as {
          id: string;
          context: { projectId: string; task: Task; updatedAt: string };
        };
    } catch {
      /* A malformed task bookmark does not affect project data. */
    }
    return null;
  }, []);
  const [job, setJob] = useState<Job | null>(() =>
    savedJob
      ? {
          id: savedJob.id,
          status: "queued",
          stage: "이전 작업 상태 확인 중",
          startedAt: new Date().toISOString(),
        }
      : null,
  );
  const [jobContext, setJobContext] = useState<{
    projectId: string;
    task: Task;
    updatedAt: string;
  } | null>(savedJob?.context ?? null);
  const [pending, setPending] = useState<{
    result: Artifacts;
    context: NonNullable<typeof jobContext>;
  } | null>(null);
  const [generating, setGenerating] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const project = projects.find((p) => p.id === activeId) || projects[0];
  const issues = useMemo(() => inspectProject(project), [project]);
  const trace = useMemo(() => traceRows(project), [project]);
  const busy =
    generating || job?.status === "running" || job?.status === "queued";

  function notify(message: string) {
    setToast(message);
  }
  function navigate(path: string) {
    location.hash = path;
    setSidebar(false);
  }
  function update(next: Project | ((p: Project) => Project)) {
    setProjects((all) =>
      all.map((p) => {
        if (p.id !== project.id) return p;
        const parsed = projectSchema.safeParse({
          ...(typeof next === "function" ? next(p) : next),
          updatedAt: new Date().toISOString(),
        });
        if (!parsed.success) {
          const first = parsed.error.issues[0];
          queueMicrotask(() =>
            notify(
              `저장 한도 또는 입력 형식을 확인하세요 (${first.path.join(".")}). 기존 내용은 유지했습니다.`,
            ),
          );
          return p;
        }
        return JSON.stringify(parsed.data.handoff) === JSON.stringify(p.handoff)
          ? { ...parsed.data, handoff: preserveScopeDecisions(p, parsed.data) }
          : parsed.data;
      }),
    );
  }
  function snapshot(p: Project, label: string): boolean {
    try {
      saveSnapshot(p, label);
      return true;
    } catch {
      notify(
        "이전 버전을 보관하지 못해 변경을 중단했습니다. JSON 백업 후 저장 공간을 확보해 주세요.",
      );
      return false;
    }
  }
  async function refreshStatus() {
    setChecking(true);
    try {
      setStatus(await api.status());
    } catch {
      setStatus(null);
    } finally {
      setChecking(false);
    }
  }
  useEffect(() => {
    const h = () => setRoute(location.hash.slice(1) || "/");
    window.addEventListener("hashchange", h);
    refreshStatus();
    return () => window.removeEventListener("hashchange", h);
  }, []);
  useEffect(() => {
    if (initial.recoveryRequired) {
      setStorageError(
        initial.error ||
          "기존 데이터 복구가 필요합니다. JSON 백업을 다운로드해 주세요.",
      );
      return;
    }
    try {
      saveProjects(projects);
      setStorageError("");
    } catch {
      setStorageError(
        "브라우저 저장 공간이 부족합니다. 변경 내용을 잃지 않도록 JSON 백업을 다운로드하세요.",
      );
    }
  }, [projects, initial.recoveryRequired, initial.error]);
  useEffect(() => {
    try {
      localStorage.setItem("ax-agent-studio:active", project.id);
    } catch {
      /* Storage status is displayed above. */
    }
  }, [project.id]);
  useEffect(() => {
    try {
      if (
        job &&
        jobContext &&
        ["queued", "running", "completed"].includes(job.status)
      )
        sessionStorage.setItem(
          "ax-agent-studio:active-job",
          JSON.stringify({ id: job.id, context: jobContext }),
        );
      else sessionStorage.removeItem("ax-agent-studio:active-job");
    } catch {
      /* Project backups remain available when session storage is unavailable. */
    }
  }, [job?.id, job?.status, jobContext]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 6500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (!job || !["running", "queued"].includes(job.status) || !jobContext)
      return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const next = await api.job(job!.id);
        if (stopped) return;
        setJob(next);
        if (next.status === "completed" && next.result) {
          setPending({ result: next.result, context: jobContext! });
          notify(
            "생성 결과가 도착했습니다. 내용을 확인하고 프로젝트에 반영하세요.",
          );
        } else if (next.status === "failed")
          notify(next.error || "생성에 실패했습니다. 기존 결과는 유지됩니다.");
        else if (next.status === "running" || next.status === "queued")
          timer = setTimeout(poll, 1500);
      } catch (e) {
        if (!stopped) {
          notify((e as Error).message);
          setJob((j) =>
            j
              ? { ...j, status: "failed", error: "작업 연결이 끊겼습니다." }
              : null,
          );
        }
      }
    }
    timer = setTimeout(poll, 750);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [job?.id, job?.status, jobContext]);

  async function generate(task: Task, instruction = "") {
    if (busy) return;
    if (
      !status?.authenticated ||
      status.authMode !== "chatgpt" ||
      status.generationReady === false
    ) {
      navigate("/settings");
      notify(
        status?.generationReady === false
          ? status.message
          : "ChatGPT 계정으로 로그인한 Codex 연결이 필요합니다.",
      );
      return;
    }
    if (!project.brief.trim() && !project.sources.length) {
      notify("프로젝트 목표나 원문 자료를 먼저 추가해 주세요.");
      return;
    }
    setGenerating(true);
    setPending(null);
    const context = {
      projectId: project.id,
      task,
      updatedAt: project.updatedAt,
    };
    try {
      const { id } = await api.generate({ project, task, instruction });
      setJobContext(context);
      setJob({
        id,
        status: "queued",
        stage: "Codex 작업 준비",
        startedAt: new Date().toISOString(),
      });
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setGenerating(false);
    }
  }
  function applyResult() {
    if (!pending) return;
    const target = projects.find((p) => p.id === pending.context.projectId);
    if (!target) {
      notify("대상 프로젝트가 없습니다.");
      return;
    }
    let next: Project;
    try {
      next = mergeArtifacts(target, pending.result, pending.context.task);
    } catch {
      notify(
        "현재 프로젝트에 반영할 수 없는 결과입니다. 결과 JSON을 보관해 주세요.",
      );
      return;
    }
    const invalid = inspectProject(next).filter(
      (issue) => issue.level === "error",
    );
    if (invalid.length) {
      notify(
        `현재 자료와 맞지 않아 반영을 중단했습니다: ${invalid[0].target} · ${invalid[0].message}`,
      );
      return;
    }
    if (!snapshot(target, `${stageLabels[pending.context.task]} 반영 전`))
      return;
    setProjects((ps) => ps.map((p) => (p.id === target.id ? next : p)));
    setActiveId(target.id);
    setPending(null);
    setJob(null);
    setJobContext(null);
    navigate(
      pending.context.task === "proposal"
        ? "/proposal"
        : pending.context.task === "analysis"
          ? "/asis"
          : "/plan",
    );
    notify("생성 결과를 반영했습니다. 근거와 연결 검수를 확인해 주세요.");
  }
  function newProject(p: Project) {
    setProjects((ps) => [p, ...ps]);
    setActiveId(p.id);
    navigate("/proposal");
    notify("프로젝트를 만들었습니다. 자료를 추가하고 첫 제안을 설계해 보세요.");
  }
  async function exportAs(kind: string) {
    setExportMenu(false);
    try {
      const name = project.title.replace(/[\\/:*?"<>|]/g, "_");
      if (kind === "json") exportProjectJson(project);
      if (kind === "md")
        downloadFile(
          `${name}-설계명세.md`,
          projectMarkdown(project),
          "text/markdown;charset=utf-8",
        );
      if (kind === "csv")
        downloadFile(
          `${name}-연결표.csv`,
          "\uFEFF" + traceCsv(project),
          "text/csv;charset=utf-8",
        );
      if (kind === "html")
        downloadFile(
          `${name}-프로토타입.html`,
          prototypeHtml(project),
          "text/html;charset=utf-8",
        );
      if (kind === "pptx") {
        if (!project.proposal.slides.length)
          throw new Error("제안 장표를 먼저 작성해 주세요.");
        await exportProposalPptx(project);
      }
      notify("파일 다운로드를 시작했습니다.");
    } catch (e) {
      notify((e as Error).message);
    }
  }
  async function importProject(file?: File) {
    if (!file) return;
    try {
      if (file.size > 15 * 1024 * 1024)
        throw new Error("15MB 이하 JSON을 선택해 주세요.");
      const p = projectSchema.parse(JSON.parse(await file.text()));
      p.id = crypto.randomUUID();
      p.updatedAt = new Date().toISOString();
      setProjects((ps) => [p, ...ps]);
      setActiveId(p.id);
      navigate("/");
      notify("백업을 새 프로젝트로 가져왔습니다.");
    } catch {
      notify(
        "올바른 AX Agent 프로젝트 JSON 파일이 아닙니다. 기존 프로젝트는 유지했습니다.",
      );
    }
    if (importRef.current) importRef.current.value = "";
  }
  const common = { project, update, notify };
  return (
    <div className="app-shell">
      {sidebar && (
        <button
          className="sidebar-scrim"
          aria-label="메뉴 닫기"
          onClick={() => setSidebar(false)}
        />
      )}
      <aside className={`sidebar ${sidebar ? "open" : ""}`}>
        <a className="brand" href="#/">
          <span className="brand-mark">
            ax
            <span />
          </span>
          <div>
            AX Agent<span>STUDIO</span>
          </div>
        </a>
        <div className="workspace-label">
          나의 작업 공간 <span className="tiny-badge">LOCAL</span>
        </div>
        <label className="project-switch">
          <Layers3 size={17} />
          <select
            aria-label="프로젝트 선택"
            value={project.id}
            onChange={(e) => {
              setActiveId(e.target.value);
              setSelectedScreen("");
            }}
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
          <ChevronDown size={14} />
        </label>
        <nav>
          {navGroups.map((g) => (
            <div className="nav-group" key={g.title}>
              <p>{g.title}</p>
              {g.items.map(([path, name, Icon]) => (
                <a
                  key={path}
                  href={`#${path}`}
                  className={route === path ? "active" : ""}
                  onClick={() => setSidebar(false)}
                >
                  <Icon size={17} />
                  <span>{name}</span>
                  {path === "/trace" && issues.length > 0 && (
                    <b>{issues.length}</b>
                  )}
                  {route === path && <span className="nav-dot" />}
                </a>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <a
            href="#/settings"
            className={route === "/settings" ? "active" : ""}
          >
            <Settings2 size={17} />
            연결 설정
            <CircleHelp size={14} />
          </a>
          <div className="profile">
            <span className="avatar">W</span>
            <div>
              나의 AX 스튜디오
              <small>
                <i className={status?.authenticated ? "online" : ""} />
                {status?.authenticated
                  ? "ChatGPT 계정 연결됨"
                  : "로컬 작업 공간"}
              </small>
            </div>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-btn mobile-menu"
              aria-label="메뉴 열기"
              onClick={() => setSidebar(true)}
            >
              <Menu size={20} />
            </button>
            <span>워크스페이스</span>
            <ChevronRight size={14} />
            <strong>{routeNames[route] || "프로젝트 개요"}</strong>
          </div>
          <div className="top-actions">
            <span className="save-indicator">
              <i />
              {storageError ? "저장 확인 필요" : "브라우저에 저장됨"}
            </span>
            <button
              className="icon-btn"
              title="JSON 백업 가져오기"
              aria-label="JSON 백업 가져오기"
              onClick={() => importRef.current?.click()}
            >
              <Upload size={18} />
            </button>
            <div className="export-wrap">
              <Button
                variant="secondary"
                onClick={() => setExportMenu((v) => !v)}
              >
                <ArrowDownToLine size={15} />
                내보내기
                <ChevronDown size={13} />
              </Button>
              {exportMenu && (
                <div className="dropdown">
                  {[
                    ["pptx", "제안서 PPTX"],
                    ["md", "전체 명세 Markdown"],
                    ["csv", "ID 연결표 CSV"],
                    ["html", "오프라인 프로토타입 HTML"],
                    ["json", "프로젝트 백업 JSON"],
                  ].map(([id, label]) => (
                    <button key={id} onClick={() => exportAs(id)}>
                      {label}
                      <ArrowDownToLine size={14} />
                    </button>
                  ))}
                </div>
              )}
            </div>
            <Button onClick={() => navigate("/new")}>
              <Plus size={16} />새 프로젝트
            </Button>
          </div>
        </header>
        <input
          ref={importRef}
          type="file"
          accept=".json"
          hidden
          onChange={(e) => importProject(e.target.files?.[0])}
        />
        {initial.recoveryKey && (
          <div className="recovery-strip">
            일부 저장 데이터에 문제가 있어 원본을 별도로 보관했습니다. 정상
            프로젝트는 복구했습니다.
            <button
              onClick={() => {
                try {
                  const raw = localStorage.getItem(initial.recoveryKey!);
                  if (raw)
                    downloadFile(
                      "AX-원본데이터-복구.json",
                      raw,
                      "application/json",
                    );
                } catch {
                  notify("복구 원본을 읽지 못했습니다.");
                }
              }}
            >
              원본 복구 파일 다운로드
            </button>
          </div>
        )}
        {storageError && (
          <div className="error-strip">
            {storageError}
            <button onClick={() => exportAs("json")}>백업 다운로드</button>
          </div>
        )}
        <main className="content" key={project.id}>
          {route !== "/new" && route !== "/settings" && project.isDemo && (
            <div className="demo-notice">
              <span className="demo-dot" />
              체험 프로젝트 · 합성 자료로 구성된 예시입니다.
              <button onClick={() => navigate("/new")}>
                내 프로젝트 시작하기 <ArrowRight size={13} />
              </button>
            </div>
          )}
          {(route === "/" || !routeNames[route]) && (
            <Dashboard
              {...common}
              navigate={navigate}
              issues={issues}
              trace={trace}
              status={status}
            />
          )}
          {route === "/new" && (
            <NewProject
              onCreate={newProject}
              onDemo={() => {
                const p = makeDemoProject();
                p.id = crypto.randomUUID();
                setProjects((ps) => [p, ...ps]);
                setActiveId(p.id);
                navigate("/");
              }}
            />
          )}
          {route === "/sources" && <Sources {...common} />}
          {route === "/proposal" && (
            <Proposal
              {...common}
              generate={() => generate("proposal")}
              busy={!!busy}
              onPptx={() => exportAs("pptx")}
              onSources={() => navigate("/sources")}
            />
          )}
          {route === "/asis" && (
            <Analysis
              {...common}
              generate={() => generate("analysis")}
              busy={!!busy}
              onSources={() => navigate("/sources")}
            />
          )}
          {route === "/handoff" && (
            <Handoff
              {...common}
              beforeChange={() => snapshot(project, "수주 · 범위 전환 전")}
            />
          )}
          {route === "/plan" && (
            <Design
              {...common}
              selected={selectedScreen}
              setSelected={setSelectedScreen}
              generate={() => generate("design")}
              busy={!!busy}
              beforeChange={() =>
                snapshot(project, "메뉴 구조로 초안 만들기 전")
              }
            />
          )}
          {route === "/trace" && (
            <Trace
              {...common}
              issues={issues}
              rows={trace}
              onScreen={(id) => {
                setSelectedScreen(id);
                navigate("/plan");
              }}
              onEdit={() => navigate("/advanced")}
              onExport={() => exportAs("csv")}
            />
          )}
          {route === "/prototype" && (
            <Pipeline
              {...common}
              busy={!!busy}
              job={job}
              generate={() => generate("all")}
              onPreview={() => exportAs("html")}
            />
          )}
          {route === "/references" && (
            <References
              onUse={(kind) => {
                const result = planFromMenu(
                  project,
                  kind === "dashboard"
                    ? "업무 대시보드"
                    : kind === "list"
                      ? "요청 목록"
                      : "요청 등록",
                );
                if (!snapshot(project, "레퍼런스 적용 전")) return;
                update(result.project);
                setSelectedScreen(result.project.screens.at(-1)?.id || "");
                navigate("/plan");
                notify("패턴을 적용한 편집 가능한 화면 초안을 만들었습니다.");
              }}
            />
          )}
          {route === "/advanced" && (
            <Workbench
              {...common}
              beforeChange={() => snapshot(project, "작업대 변경 전")}
              onBackup={() => exportAs("json")}
            />
          )}
          {route === "/settings" && (
            <Settings
              status={status}
              checking={checking}
              refresh={refreshStatus}
              notify={notify}
            />
          )}
        </main>
        <footer className="workspace-footer">
          <span>
            AX AGENT STUDIO <i /> FROM INTENT TO IMPACT
          </span>
          <span>자료와 설계는 이 브라우저에 저장됩니다.</span>
        </footer>
      </div>
      {busy && (
        <div className="job-bar">
          <LoaderCircle className="spin" size={20} />
          <div>
            <strong>{stageLabels[jobContext?.task || "all"]} 진행 중</strong>
            <small>
              {job?.stage || "작업 연결 중"} · 현재 결과는 유지됩니다.
            </small>
          </div>
          <Button
            variant="ghost"
            onClick={async () => {
              if (job) {
                try {
                  await api.cancel(job.id);
                  setJob((j) => (j ? { ...j, status: "cancelled" } : j));
                  notify("작업을 중단했습니다.");
                } catch (e) {
                  notify((e as Error).message);
                }
              }
            }}
          >
            중단
          </Button>
        </div>
      )}
      {!pending && job?.status === "completed" && job.result && jobContext && (
        <div className="job-bar">
          <CheckCheck size={20} />
          <div>
            <strong>생성한 결과가 준비됐습니다.</strong>
            <small>프로젝트에 반영하기 전에 내용을 확인하세요.</small>
          </div>
          <Button
            variant="secondary"
            onClick={() =>
              setPending({ result: job.result!, context: jobContext })
            }
          >
            결과 검토
          </Button>
          <button
            className="icon-btn"
            aria-label="생성 결과 버리기"
            onClick={() => {
              if (
                confirm(
                  "반영하지 않은 생성 결과를 닫을까요? 프로젝트 원본은 유지됩니다.",
                )
              ) {
                setJob(null);
                setJobContext(null);
              }
            }}
          >
            <X size={15} />
          </button>
        </div>
      )}
      {pending && (
        <div className="modal-backdrop">
          <section
            className="modal result-modal"
            role="dialog"
            aria-modal="true"
            aria-label="생성 결과 검토"
          >
            <button
              className="modal-close icon-btn"
              aria-label="결과 닫기"
              onClick={() => setPending(null)}
            >
              <X size={20} />
            </button>
            <span className="eyebrow">READY TO REVIEW</span>
            <h2>생각이 설계로 연결됐습니다.</h2>
            <p>
              생성 결과를 검토한 후 프로젝트에 반영하세요. 이전 버전은 작업대에
              보관합니다.
            </p>
            <div className="result-counts">
              <span>
                <b>{pending.result.proposal.slides.length}</b>제안 장표
              </span>
              <span>
                <b>{pending.result.requirements.length}</b>요구사항
              </span>
              <span>
                <b>{pending.result.screens.length}</b>화면 설계
              </span>
            </div>
            <div className="result-summary">
              {pending.result.proposal.summary ||
                pending.result.analysis[0]?.recommendation ||
                "산출물의 근거와 연결을 확인해 주세요."}
            </div>
            {projects.find((p) => p.id === pending.context.projectId)
              ?.updatedAt !== pending.context.updatedAt && (
              <div className="callout amber">
                생성 중 프로젝트가 수정됐습니다. 반영하면 해당 단계의 산출물이
                생성 결과로 교체됩니다. 반영 전 버전은 보관합니다.
              </div>
            )}
            <ul className="assumptions">
              {pending.result.assumptions.slice(0, 5).map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
            <div className="modal-actions">
              <Button
                variant="secondary"
                onClick={() => {
                  downloadFile(
                    "AX-생성결과.json",
                    JSON.stringify(pending.result, null, 2),
                    "application/json",
                  );
                }}
              >
                결과 JSON 저장
              </Button>
              <Button onClick={applyResult}>
                <Check size={16} />
                프로젝트에 반영
              </Button>
            </div>
          </section>
        </div>
      )}
      {toast && (
        <div role="status" className="toast">
          <Check size={17} />
          <span>{toast}</span>
          <button aria-label="알림 닫기" onClick={() => setToast("")}>
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}

type Common = {
  project: Project;
  update: (next: Project | ((p: Project) => Project)) => void;
  notify: (s: string) => void;
};

function Dashboard({
  project,
  navigate,
  issues,
  trace,
  status,
}: Common & {
  navigate: (s: string) => void;
  issues: ReturnType<typeof inspectProject>;
  trace: ReturnType<typeof traceRows>;
  status: ConnectionStatus | null;
}) {
  const linked = trace.filter((t) => t.complete).length;
  return (
    <>
      <div className="dashboard-greeting">
        <div>
          <span className="eyebrow">YOUR NEXT CHAPTER</span>
          <h1>생각을 모으고, 실행을 설계하세요.</h1>
          <p>
            제안부터 화면 설계까지, 하나의 흐름으로 이어지는 나의 AX 작업 공간.
          </p>
        </div>
        <div className="date-stamp">
          <span>
            {project.stage === "proposal"
              ? "기회 · 제안 단계"
              : "수주 후 · 수행 단계"}
          </span>
          <b>{formatDate(project.updatedAt)} 수정</b>
        </div>
      </div>
      <section className="hero">
        <div className="hero-copy">
          <span className="hero-eyebrow">
            <i /> IDEAS INTO WORKING PLANS
          </span>
          <h2>
            좋은 제안의 다음은,
            <br />
            <em>실행 가능한 설계</em>입니다.
          </h2>
          <p>
            흩어진 자료에서 핵심을 찾고,
            <br />
            설득력 있는 제안과 구체적인 화면으로 연결하세요.
          </p>
          <div className="hero-buttons">
            <Button onClick={() => navigate("/proposal")}>
              제안 이어서 만들기
              <ArrowUpRight size={17} />
            </Button>
            <button
              className="hero-link"
              onClick={() => navigate("/prototype")}
            >
              전체 흐름 살펴보기
              <ArrowRight size={15} />
            </button>
          </div>
          <div className="hero-footnote">
            <ShieldCheck size={14} />
            원문 근거부터 화면 ID까지 이어지는 작업
          </div>
        </div>
        <div
          className="hero-visual"
          aria-label="자료에서 제안과 화면으로 연결되는 흐름"
        >
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="visual-grid" />
          <div className="floating-doc doc-source">
            <div className="tiny-icon">
              <FileText size={17} />
            </div>
            <span>시작은 한 장의 자료</span>
            <div className="skeleton w80" />
            <div className="skeleton w60" />
            <div className="source-pill">RFP · 회의록 · AS-IS</div>
          </div>
          <div className="visual-connector connector-one" />
          <div className="agent-node">
            <Sparkles size={25} />
            <span>AX</span>
          </div>
          <div className="visual-connector connector-two" />
          <div className="floating-doc doc-screen">
            <div className="mini-browser">
              <i />
              <i />
              <i />
              <span>YOUR NEXT EXPERIENCE</span>
            </div>
            <div className="mini-layout">
              <div className="mini-side">
                <i />
                <i />
                <i />
              </div>
              <div className="mini-main">
                <div className="mini-heading" />
                <div className="mini-stats">
                  <i />
                  <i />
                  <i />
                </div>
                <div className="mini-chart">
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                </div>
              </div>
            </div>
            <div className="visual-check">
              <Check size={12} />
              실행 가능한 화면 명세
            </div>
          </div>
          <div className="floating-label">
            <GitBranch size={13} />
            REQ → IA → FN → SCR
          </div>
        </div>
      </section>
      <div className="metrics-grid">
        {[
          {
            label: "제안 장표",
            value: project.proposal.slides.length,
            sub: "메시지와 실행 전략",
            icon: FileText,
            path: "/proposal",
          },
          {
            label: "요구사항",
            value: project.requirements.length,
            sub: `${project.sources.length}개 자료와 함께 관리`,
            icon: ClipboardList,
            path: "/sources",
          },
          {
            label: "화면 설계",
            value: project.screens.length,
            sub: "편집 가능한 화면 명세",
            icon: Columns3,
            path: "/plan",
          },
          {
            label: "근거 · 설계 연결",
            value: `${linked}/${trace.length}`,
            sub: trace.length
              ? "원문–요구–메뉴–기능–화면"
              : "요구사항 등록 후 산정",
            icon: GitBranch,
            path: "/trace",
          },
        ].map(({ label, value, sub, icon: Icon, path }) => (
          <button
            className="metric-card"
            key={label}
            onClick={() => navigate(path)}
          >
            <div>
              <span>{label}</span>
              <Icon size={17} />
            </div>
            <strong>{value}</strong>
            <small>
              {sub}
              <ArrowUpRight size={14} />
            </small>
          </button>
        ))}
      </div>
      <div className="dashboard-columns">
        <section className="panel journey-panel">
          <div className="panel-heading">
            <div>
              <h2>프로젝트의 다음 한 걸음</h2>
              <p>{project.title}</p>
            </div>
            <Tag tone="green">
              {project.stage === "proposal" ? "제안 중" : "수행 설계"}
            </Tag>
          </div>
          <div className="journey">
            {[
              {
                n: "01",
                title: "자료에서 맥락 찾기",
                desc: "RFP, 회의록, 현재 서비스를 한곳에",
                path: "/sources",
                icon: FolderOpen,
                ready: !!project.sources.length,
              },
              {
                n: "02",
                title: "설득력 있는 제안 만들기",
                desc: "고객 과제와 전략, 실행 근거 연결",
                path: "/proposal",
                icon: FileText,
                ready: !!project.proposal.slides.length,
              },
              {
                n: "03",
                title: "수주 후 범위 정리하기",
                desc: "채택 · 변경 · 보류 · 제외 기록",
                path: "/handoff",
                icon: CheckCheck,
                ready: project.stage === "delivery",
              },
              {
                n: "04",
                title: "동작하는 경험 설계하기",
                desc: "요구사항에서 화면 명세와 프로토타입까지",
                path: "/plan",
                icon: Columns3,
                ready: !!project.screens.length,
              },
            ].map((s) => (
              <button
                className="journey-row"
                key={s.n}
                onClick={() => navigate(s.path)}
              >
                <span className={`journey-number ${s.ready ? "ready" : ""}`}>
                  {s.ready ? <Check size={17} /> : s.n}
                </span>
                <div>
                  <strong>{s.title}</strong>
                  <small>{s.desc}</small>
                </div>
                <ArrowRight size={17} />
              </button>
            ))}
          </div>
        </section>
        <div className="dashboard-side">
          <section className="panel attention-panel">
            <div className="panel-heading">
              <h2>함께 확인할 것</h2>
              <span className="count-chip">{issues.length}</span>
            </div>
            {issues.slice(0, 3).map((issue, i) => (
              <button
                className="attention-row"
                key={i}
                onClick={() => navigate("/trace")}
              >
                <span className={`issue-dot ${issue.level}`} />
                <div>
                  <strong>{issue.message}</strong>
                  <small>{issue.target}</small>
                </div>
                <ChevronRight size={15} />
              </button>
            ))}
            {!issues.length && (
              <p className="small muted">
                구조 검수에서 발견된 문제가 없습니다. 사실·시각 검수는 별도로
                진행하세요.
              </p>
            )}
            <button className="text-link" onClick={() => navigate("/trace")}>
              전체 연결 검수 보기
              <ArrowRight size={14} />
            </button>
          </section>
          <section className="connection-card">
            <div className="connection-symbol">
              <Sparkles size={22} />
            </div>
            <div>
              <h3>나의 ChatGPT로 연결</h3>
              <p>
                {status?.authenticated
                  ? "Codex의 ChatGPT 계정 로그인이 확인됐습니다."
                  : "API 키 입력 없이 Codex 계정 로그인으로 시작하세요."}
              </p>
              <button onClick={() => navigate("/settings")}>
                {status?.authenticated ? "연결 상태 확인" : "연결 설정하기"}
                <ArrowUpRight size={14} />
              </button>
            </div>
          </section>
        </div>
      </div>
      <div className="bottom-note">
        <span>한 장의 제안이, 하나의 서비스가 되도록.</span>
        <div>
          <span className="line" /> YOUR IDEAS. YOUR STUDIO.
        </div>
      </div>
    </>
  );
}

function NewProject({
  onCreate,
  onDemo,
}: {
  onCreate: (p: Project) => void;
  onDemo: () => void;
}) {
  const [title, setTitle] = useState("");
  const [client, setClient] = useState("");
  const [brief, setBrief] = useState("");
  return (
    <>
      <SectionHead
        eyebrow="START WITH AN INTENT"
        title="어떤 변화를 만들고 싶으세요?"
        description="한 문장으로 시작하고, 자료와 근거를 붙이며 구체화하세요."
      />
      <div className="new-layout">
        <form
          className="panel new-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (brief.trim())
              onCreate(
                createProject(
                  title.trim() || brief.trim().slice(0, 32),
                  brief,
                  client,
                ),
              );
          }}
        >
          <span className="big-spark">
            <Sparkles size={28} />
          </span>
          <Field label="프로젝트의 목표">
            <textarea
              className="brief-input"
              required
              maxLength={20000}
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              placeholder="예: 고객이 대출 진행 상황을 쉽게 이해하고, 서류를 반복 제출하지 않는 금융 앱을 만들고 싶어요."
              rows={5}
            />
          </Field>
          <div className="example-chips">
            {[
              "B2B 수발주 시스템을 재설계하고 싶어요.",
              "고객의 가입 여정을 개선하는 앱을 제안하려고 해요.",
              "사내 지식 검색과 승인 업무를 연결하고 싶어요.",
            ].map((s) => (
              <button type="button" key={s} onClick={() => setBrief(s)}>
                {s}
                <Plus size={12} />
              </button>
            ))}
          </div>
          <div className="form-grid">
            <Field
              label="프로젝트 이름"
              hint="비워 두면 목표의 첫 문장을 사용합니다."
            >
              <input
                value={title}
                maxLength={200}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="예: 모아 앱 경험 리뉴얼"
              />
            </Field>
            <Field label="고객 · 조직">
              <input
                value={client}
                maxLength={200}
                onChange={(e) => setClient(e.target.value)}
                placeholder="선택 입력"
              />
            </Field>
          </div>
          <div className="form-footer">
            <span>
              <ShieldCheck size={15} />
              생성한 프로젝트는 이 브라우저에 보관됩니다.
            </span>
            <Button type="submit" disabled={!brief.trim()}>
              프로젝트 만들기
              <ArrowRight size={16} />
            </Button>
          </div>
        </form>
        <aside className="new-aside">
          <span className="eyebrow">ONE CONNECTED WORKFLOW</span>
          <h2>
            제안은 설득력 있게.
            <br />
            설계는 구체적으로.
          </h2>
          {[
            ["01", "자료를 모으세요", "RFP · PDF · Word · PowerPoint · 회의록"],
            [
              "02",
              "나의 GPT와 설계하세요",
              "ChatGPT 계정으로 로그인한 Codex 사용",
            ],
            [
              "03",
              "직접 수정하고 내보내세요",
              "PPTX · HTML · Markdown · CSV · JSON",
            ],
          ].map(([n, t, d]) => (
            <div className="new-step" key={n}>
              <b>{n}</b>
              <div>
                <strong>{t}</strong>
                <p>{d}</p>
              </div>
            </div>
          ))}
          <button className="text-link" onClick={onDemo}>
            먼저 체험 프로젝트 둘러보기
            <ArrowUpRight size={15} />
          </button>
        </aside>
      </div>
    </>
  );
}

function Sources({ project, update, notify }: Common) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [kind, setKind] = useState<Project["sources"][0]["kind"]>("rfp");
  const [opened, setOpened] = useState("");
  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    const added: Project["sources"] = [];
    for (const file of Array.from(files)) {
      try {
        const result = await api.extract(file);
        if (!result.text.trim())
          throw new Error(
            `${file.name}: 추출된 텍스트가 없습니다. OCR은 수행하지 않습니다.`,
          );
        added.push({
          id: uid("SRC"),
          name: result.name,
          kind,
          text: result.text,
          readScope: `${result.pageCount === null ? "문단·표 텍스트" : `${result.pageCount}페이지 텍스트`}${result.warnings.length ? " · " + result.warnings.join(" / ") : " · 이미지와 도형의 시각 판독은 미실행"}`,
        });
      } catch (e) {
        notify((e as Error).message);
      }
    }
    if (added.length) {
      update((p) => ({ ...p, sources: [...p.sources, ...added] }));
      notify(
        `${added.length}개 자료에서 텍스트를 읽었습니다. 읽기 범위를 확인하세요.`,
      );
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  }
  return (
    <>
      <SectionHead
        eyebrow="SOURCE OF TRUTH"
        title="좋은 결과는 정확한 맥락에서."
        description="자료의 문장과 우리의 해석을 구분하고, 어디까지 읽었는지 기록합니다."
        actions={<Tag>{project.sources.length}개 자료</Tag>}
      />
      <div className="sources-layout">
        <div>
          <div
            className="dropzone"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (!uploading) upload(e.dataTransfer.files);
            }}
          >
            <div className="upload-symbol">
              {uploading ? (
                <LoaderCircle className="spin" size={26} />
              ) : (
                <Upload size={26} />
              )}
            </div>
            <h3>
              {uploading
                ? "자료를 읽고 있습니다"
                : "프로젝트 자료를 여기에 놓으세요"}
            </h3>
            <p>PDF · DOCX · PPTX · TXT · MD · CSV · JSON · 파일당 15MB</p>
            <Button
              variant="secondary"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
            >
              파일 선택
            </Button>
            <small>
              로컬 연결에서 텍스트를 추출합니다. 스캔 이미지 OCR은 지원하지
              않습니다.
            </small>
            <input
              ref={fileRef}
              type="file"
              multiple
              hidden
              accept=".pdf,.docx,.pptx,.txt,.md,.csv,.json"
              onChange={(e) => upload(e.target.files)}
            />
          </div>
          <div className="source-list">
            {project.sources.map((s) => (
              <article className="panel source-card" key={s.id}>
                <div className="source-card-head">
                  <span className="file-icon">
                    <FileText size={20} />
                  </span>
                  <button
                    className="source-name"
                    onClick={() => setOpened(opened === s.id ? "" : s.id)}
                  >
                    <strong>{s.name}</strong>
                    <small>
                      {s.id} · {s.text.length.toLocaleString()}자
                    </small>
                  </button>
                  <Tag>
                    {
                      {
                        rfp: "RFP",
                        meeting: "회의록",
                        asis: "현행 자료",
                        reference: "레퍼런스",
                        other: "기타",
                      }[s.kind]
                    }
                  </Tag>
                  <button
                    className="icon-btn"
                    aria-label={`${s.name} 삭제`}
                    onClick={() => {
                      if (
                        confirm(
                          "자료를 삭제하면 연결된 근거가 끊길 수 있습니다. 삭제할까요?",
                        )
                      )
                        update((p) => ({
                          ...p,
                          sources: p.sources.filter((x) => x.id !== s.id),
                        }));
                    }}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
                <div className="read-scope">
                  <ShieldCheck size={13} />
                  {s.readScope}
                </div>
                {opened === s.id ? (
                  <textarea
                    className="source-content"
                    defaultValue={s.text}
                    rows={12}
                    onBlur={(e) =>
                      update((p) => ({
                        ...p,
                        sources: p.sources.map((x) =>
                          x.id === s.id ? { ...x, text: e.target.value } : x,
                        ),
                      }))
                    }
                  />
                ) : (
                  <p className="source-excerpt">
                    {s.text.slice(0, 150)}
                    {s.text.length > 150 ? "…" : ""}
                  </p>
                )}
              </article>
            ))}
            {!project.sources.length && (
              <Empty title="첫 번째 근거를 추가하세요">
                추출한 문장은 제안·분석·설계의 공통 맥락이 됩니다.
              </Empty>
            )}
          </div>
        </div>
        <form
          className="panel source-note-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim() || !text.trim()) return;
            update((p) => ({
              ...p,
              sources: [
                ...p.sources,
                {
                  id: uid("SRC"),
                  name,
                  kind,
                  text,
                  readScope:
                    "사용자가 붙여 넣은 텍스트 · 원문 전체 여부 미확인",
                },
              ],
            }));
            setName("");
            setText("");
            notify("자료를 추가했습니다.");
          }}
        >
          <h3>메모 · 원문 직접 추가</h3>
          <p className="small muted">
            인터뷰 내용이나 RFP의 중요한 문장을 붙여 넣으세요.
          </p>
          <Field label="자료 유형">
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as typeof kind)}
            >
              <option value="rfp">RFP · 요구사항</option>
              <option value="meeting">회의록 · 인터뷰</option>
              <option value="asis">AS-IS 자료</option>
              <option value="reference">레퍼런스</option>
              <option value="other">기타</option>
            </select>
          </Field>
          <Field label="자료 이름">
            <input
              required
              maxLength={250}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 1차 킥오프 회의록"
            />
          </Field>
          <Field label="내용">
            <textarea
              required
              rows={9}
              maxLength={150000}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="원문과 출처·날짜를 함께 입력하세요."
            />
          </Field>
          <Button type="submit" disabled={!name.trim() || !text.trim()}>
            <Plus size={16} />
            자료 추가
          </Button>
        </form>
      </div>
    </>
  );
}

function Proposal({
  project,
  update,
  notify,
  generate,
  busy,
  onPptx,
  onSources,
}: Common & {
  generate: () => void;
  busy: boolean;
  onPptx: () => void;
  onSources: () => void;
}) {
  const [selected, setSelected] = useState("");
  const slide =
    project.proposal.slides.find((s) => s.id === selected) ||
    project.proposal.slides[0];
  function setSlide(part: Partial<NonNullable<typeof slide>>) {
    if (slide)
      update((p) => ({
        ...p,
        proposal: {
          ...p.proposal,
          slides: p.proposal.slides.map((s) =>
            s.id === slide.id ? { ...s, ...part } : s,
          ),
        },
      }));
  }
  function add() {
    const id = uid("SLD");
    update((p) => ({
      ...p,
      proposal: {
        ...p.proposal,
        slides: [
          ...p.proposal.slides,
          {
            id,
            title: "새 제안 메시지",
            message: "",
            bullets: [],
            diagram: "statement",
            requirementIds: [],
            evidenceIds: [],
            claim: "placeholder",
          },
        ],
      },
    }));
    setSelected(id);
  }
  return (
    <>
      <SectionHead
        eyebrow="PERSUADE WITH PURPOSE"
        title="고객의 과제를, 우리의 제안으로."
        description="한 장에 하나의 결론. 메시지·전략·실행 근거가 연결된 제안서를 만듭니다."
        actions={
          <>
            <Button
              variant="secondary"
              onClick={onPptx}
              disabled={!project.proposal.slides.length}
            >
              <ArrowDownToLine size={15} />
              PPTX
            </Button>
            <Button disabled={busy} onClick={generate}>
              <Sparkles size={16} />
              Codex로 제안 설계
            </Button>
          </>
        }
      />
      <div className="proposal-context">
        <div>
          <span>PROJECT BRIEF</span>
          <p>{project.brief || "작업대에서 프로젝트 목표를 작성해 주세요."}</p>
        </div>
        <button onClick={onSources}>
          <FolderOpen size={15} />
          자료 {project.sources.length}개<ArrowUpRight size={14} />
        </button>
      </div>
      {project.proposal.winThemes.length > 0 && (
        <div className="theme-grid">
          {project.proposal.winThemes.map((t, i) => (
            <div className="theme-card" key={i}>
              <span>STRATEGY 0{i + 1}</span>
              <strong>{t}</strong>
            </div>
          ))}
        </div>
      )}
      <div className="proposal-workspace">
        <aside className="panel slide-nav">
          <div className="panel-heading">
            <h3>스토리보드</h3>
            <button className="icon-btn" aria-label="장표 추가" onClick={add}>
              <Plus size={18} />
            </button>
          </div>
          {project.proposal.slides.map((s, i) => (
            <button
              key={s.id}
              className={`slide-nav-item ${slide?.id === s.id ? "selected" : ""}`}
              onClick={() => setSelected(s.id)}
            >
              <span>{String(i + 1).padStart(2, "0")}</span>
              <div>
                <strong>{s.title}</strong>
                <small>{s.diagram}</small>
              </div>
            </button>
          ))}
          {!project.proposal.slides.length && (
            <p className="muted small">
              장표를 추가하거나 Codex로 초안을 만드세요.
            </p>
          )}
          <Button variant="ghost" onClick={add}>
            <Plus size={15} />
            장표 추가
          </Button>
        </aside>
        <div>
          {slide ? (
            <>
              <div className="proposal-slide">
                <div className="slide-kicker">
                  <span>
                    {project.client || "PROPOSAL"} / {slide.id}
                  </span>
                  <span>AX STUDIO</span>
                </div>
                <h2>{slide.title}</h2>
                <p className="slide-message">
                  {slide.message || "이 장표가 전달할 한 줄 결론을 입력하세요."}
                </p>
                <div className={`slide-bullets layout-${slide.diagram}`}>
                  {slide.bullets.map((b, i) => (
                    <div key={i}>
                      <span>{String(i + 1).padStart(2, "0")}</span>
                      <p>{b}</p>
                    </div>
                  ))}
                  {!slide.bullets.length && (
                    <div className="slide-placeholder">
                      주장을 뒷받침할 내용과 근거를 채워 주세요.
                    </div>
                  )}
                </div>
                <div className="slide-footer">
                  <ClaimTag claim={slide.claim} />
                  <SourceChips ids={slide.evidenceIds} project={project} />
                  <span>{project.proposal.slides.indexOf(slide) + 1}</span>
                </div>
              </div>
              <div className="panel slide-editor">
                <div className="panel-heading">
                  <h3>메시지 다듬기</h3>
                  <button
                    className="icon-btn"
                    aria-label="선택 장표 삭제"
                    onClick={() => {
                      update((p) => ({
                        ...p,
                        proposal: {
                          ...p.proposal,
                          slides: p.proposal.slides.filter(
                            (s) => s.id !== slide.id,
                          ),
                        },
                      }));
                      notify("장표를 삭제했습니다.");
                    }}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
                <div className="form-grid">
                  <Field label="결론 제목">
                    <input
                      value={slide.title}
                      maxLength={300}
                      onChange={(e) => setSlide({ title: e.target.value })}
                    />
                  </Field>
                  <Field label="도식 유형">
                    <select
                      value={slide.diagram}
                      onChange={(e) =>
                        setSlide({
                          diagram: e.target.value as typeof slide.diagram,
                        })
                      }
                    >
                      {Object.entries({
                        statement: "핵심 주장",
                        comparison: "비교",
                        strategy: "전략 체계",
                        process: "프로세스",
                        roadmap: "로드맵",
                        evidence: "근거",
                      }).map(([v, l]) => (
                        <option value={v} key={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
                <Field label="한 줄 메시지">
                  <textarea
                    rows={2}
                    value={slide.message}
                    maxLength={1500}
                    onChange={(e) => setSlide({ message: e.target.value })}
                  />
                </Field>
                <Field label="핵심 내용 · 한 줄에 하나씩">
                  <textarea
                    rows={4}
                    value={slide.bullets.join("\n")}
                    onChange={(e) =>
                      setSlide({
                        bullets: e.target.value.split("\n").slice(0, 8),
                      })
                    }
                  />
                </Field>
                <div className="form-grid">
                  <Field label="근거 상태">
                    <select
                      value={slide.claim}
                      onChange={(e) =>
                        setSlide({ claim: e.target.value as Claim })
                      }
                    >
                      {Object.entries(claimLabels).map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="자료 ID · 쉼표로 구분">
                    <input
                      key={`${slide.id}-evidence`}
                      defaultValue={slide.evidenceIds.join(", ")}
                      onBlur={(e) =>
                        setSlide({
                          evidenceIds: e.target.value
                            .split(",")
                            .map((x) => x.trim())
                            .filter(Boolean),
                        })
                      }
                    />
                  </Field>
                </div>
              </div>
            </>
          ) : (
            <Empty
              title="첫 장표를 시작해 보세요"
              action={
                <Button onClick={add}>
                  <Plus size={16} />
                  장표 직접 작성
                </Button>
              }
            >
              자료를 바탕으로 Codex가 초안을 만들거나, 직접 메시지를 작성할 수
              있습니다.
            </Empty>
          )}
        </div>
      </div>
    </>
  );
}

function Analysis({
  project,
  update,
  notify,
  generate,
  busy,
  onSources,
}: Common & { generate: () => void; busy: boolean; onSources: () => void }) {
  return (
    <>
      <SectionHead
        eyebrow="UNDERSTAND BEFORE YOU DESIGN"
        title="현재의 불편에서, 다음 경험의 단서를."
        description="관찰한 현상과 영향, 개선 방향을 근거와 함께 기록합니다."
        actions={
          <>
            <Button variant="secondary" onClick={onSources}>
              <FolderOpen size={16} />
              현행 자료 추가
            </Button>
            <Button onClick={generate} disabled={busy}>
              <Sparkles size={16} />
              Codex로 분석
            </Button>
          </>
        }
      />
      <div className="analysis-summary">
        <div>
          <span>현행 분석 항목</span>
          <strong>{project.analysis.length}</strong>
        </div>
        <div>
          <span>출처가 연결된 항목</span>
          <strong>
            {project.analysis.filter((a) => a.sourceIds.length).length}
          </strong>
        </div>
        <p>
          제공된 텍스트를 기준으로 분석합니다.
          <br />
          URL 실사·사용자 테스트를 수행한 결과로 간주하지 않습니다.
        </p>
      </div>
      <div className="analysis-grid">
        {project.analysis.map((a, i) => (
          <article className="panel finding" key={a.id}>
            <header>
              <span className="finding-no">0{i + 1}</span>
              <ClaimTag claim={a.claim} />
            </header>
            <h3>{a.current}</h3>
            <div className="finding-block">
              <span>IMPACT</span>
              <p>{a.impact}</p>
            </div>
            <div className="finding-block recommendation">
              <span>NEXT OPPORTUNITY</span>
              <p>{a.recommendation}</p>
            </div>
            <SourceChips ids={a.sourceIds} project={project} />
            <button
              className="text-link"
              onClick={() => {
                const id = uid("REQ");
                update((p) => ({
                  ...p,
                  requirements: [
                    ...p.requirements,
                    {
                      id,
                      text: a.recommendation,
                      priority: "should",
                      status: "draft",
                      claim: "proposal",
                      sourceIds: a.sourceIds,
                      acceptance: "",
                    },
                  ],
                }));
                notify(
                  `${id} 요구 초안을 추가했습니다. 수용 기준을 보완하세요.`,
                );
              }}
            >
              요구사항 초안으로 연결
              <Plus size={14} />
            </button>
          </article>
        ))}
      </div>
      {!project.analysis.length && (
        <Empty
          title="현행 자료에서 출발하세요"
          action={
            <Button variant="secondary" onClick={onSources}>
              자료 추가하기
              <ArrowRight size={15} />
            </Button>
          }
        >
          화면 설명, 인터뷰, 업무 절차를 넣으면 현상 → 영향 → 개선 방향으로
          정리할 수 있습니다.
        </Empty>
      )}
      <div className="panel manual-finding">
        <h3>분석 항목 직접 추가</h3>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            update((p) => ({
              ...p,
              analysis: [
                ...p.analysis,
                {
                  id: uid("ASIS"),
                  current: String(fd.get("current")),
                  impact: String(fd.get("impact")),
                  recommendation: String(fd.get("next")),
                  sourceIds: [],
                  claim: "hypothesis",
                },
              ],
            }));
            e.currentTarget.reset();
            notify("분석 가설을 추가했습니다. 작업대에서 근거를 연결하세요.");
          }}
        >
          <div className="form-grid three">
            <Field label="현상">
              <input name="current" required placeholder="현재 겪는 문제" />
            </Field>
            <Field label="영향">
              <input
                name="impact"
                required
                placeholder="누구에게 어떤 영향이 있는지"
              />
            </Field>
            <Field label="개선 방향">
              <input
                name="next"
                required
                placeholder="어떤 경험을 바꿀 것인지"
              />
            </Field>
          </div>
          <Button variant="secondary" type="submit">
            <Plus size={15} />
            분석 가설 추가
          </Button>
        </form>
      </div>
    </>
  );
}

function Handoff({
  project,
  update,
  notify,
  beforeChange,
}: Common & { beforeChange: () => boolean }) {
  const [decisions, setDecisions] = useState<
    Record<
      string,
      { decision: "adopt" | "change" | "defer" | "exclude"; reason: string }
    >
  >({});
  useEffect(() => {
    setDecisions(
      Object.fromEntries(
        project.handoff.map((h) => [
          h.requirementId,
          { decision: h.decision, reason: h.reason },
        ]),
      ),
    );
  }, [project.id, project.handoff]);
  const done = project.requirements.filter((r) =>
    decisions[r.id]?.reason.trim(),
  ).length;
  return (
    <>
      <SectionHead
        eyebrow="TURN PROMISES INTO SCOPE"
        title="수주의 약속을, 수행의 기준으로."
        description="요구별 채택 · 변경 · 보류 · 제외를 기록합니다. 근거 상태는 자동으로 사실이 되지 않습니다."
        actions={
          <Tag tone={project.stage === "delivery" ? "green" : "amber"}>
            {project.stage === "delivery" ? "수행 설계 단계" : "제안 단계"}
          </Tag>
        }
      />
      <div className="callout">
        <CheckCheck size={20} />
        <div>
          <strong>제안 버전을 보관하고 범위 전환을 기록합니다.</strong>
          <p>
            ‘변경’으로 결정한 내용은 사유에 적고 요구사항도 직접 수정하세요.
            계약 체결·고객 승인을 대신하는 기능은 아닙니다.
          </p>
        </div>
      </div>
      <div className="panel handoff-table">
        <div className="panel-heading">
          <h3>범위 결정</h3>
          <span className="muted small">
            {done} / {project.requirements.length}개 사유 작성
          </span>
        </div>
        {project.requirements.map((r) => (
          <div className="handoff-row" key={r.id}>
            <div>
              <span className="mono">{r.id}</span>
              <p>{r.text}</p>
              <ClaimTag claim={r.claim} />
            </div>
            <Field label="결정">
              <select
                value={decisions[r.id]?.decision || "adopt"}
                onChange={(e) =>
                  setDecisions((ds) => ({
                    ...ds,
                    [r.id]: {
                      reason: ds[r.id]?.reason || "",
                      decision: e.target.value as "adopt",
                    },
                  }))
                }
              >
                <option value="adopt">채택</option>
                <option value="change">변경</option>
                <option value="defer">보류</option>
                <option value="exclude">제외</option>
              </select>
            </Field>
            <Field label="합의 내용 · 근거">
              <textarea
                rows={2}
                placeholder="결정 사유와 관련 자료를 입력하세요."
                value={decisions[r.id]?.reason || ""}
                onChange={(e) =>
                  setDecisions((ds) => ({
                    ...ds,
                    [r.id]: {
                      decision: ds[r.id]?.decision || "adopt",
                      reason: e.target.value,
                    },
                  }))
                }
              />
            </Field>
          </div>
        ))}
        {!project.requirements.length && (
          <Empty title="먼저 범위를 정의하세요">
            제안 또는 작업대에서 요구사항을 등록하면 전환할 범위가 표시됩니다.
          </Empty>
        )}
        <div className="form-footer">
          <span className="small muted">
            모든 요구에 결정 사유가 필요합니다.
          </span>
          <Button
            disabled={
              !project.requirements.length ||
              done !== project.requirements.length
            }
            onClick={() => {
              try {
                const next = applyHandoff(
                  project,
                  project.requirements.map((r) => ({
                    requirementId: r.id,
                    ...decisions[r.id],
                  })),
                );
                if (!beforeChange()) return;
                update(next);
                notify(
                  "수행 범위를 기록했습니다. 제안 이전 버전은 작업대에서 확인하세요.",
                );
              } catch (e) {
                notify((e as Error).message);
              }
            }}
          >
            <CheckCheck size={16} />
            수행 범위로 전환
          </Button>
        </div>
      </div>
    </>
  );
}

function Design({
  project,
  update,
  notify,
  selected,
  setSelected,
  generate,
  busy,
  beforeChange,
}: Common & {
  selected: string;
  setSelected: (id: string) => void;
  generate: () => void;
  busy: boolean;
  beforeChange: () => boolean;
}) {
  const [outline, setOutline] = useState("");
  const [showMenu, setShowMenu] = useState(false);
  const [tab, setTab] = useState<"preview" | "spec">("preview");
  const [device, setDevice] = useState("desktop");
  const screen =
    project.screens.find((s) => s.id === selected) || project.screens[0];
  const html = useMemo(
    () => (screen ? prototypeHtml({ ...project, screens: [screen] }) : ""),
    [project, screen],
  );
  function edit(part: Partial<Screen>) {
    if (screen)
      update((p) => ({
        ...p,
        screens: p.screens.map((s) =>
          s.id === screen.id ? { ...s, ...part } : s,
        ),
      }));
  }
  return (
    <>
      <SectionHead
        eyebrow="DESIGN THE EXPERIENCE"
        title="메뉴에서 화면으로, 의도에서 동작으로."
        description="명세를 편집하면 같은 데이터로 미리보기와 HTML 프로토타입을 만듭니다."
        actions={
          <>
            <Button variant="secondary" onClick={() => setShowMenu((v) => !v)}>
              <Plus size={16} />
              메뉴로 초안 만들기
            </Button>
            <Button disabled={busy} onClick={generate}>
              <Sparkles size={16} />
              Codex로 화면 설계
            </Button>
          </>
        }
      />
      {showMenu && (
        <section className="panel menu-planner">
          <div>
            <h3>메뉴 구조를 붙여 넣으세요.</h3>
            <p>
              한 줄에 한 메뉴, 하위 메뉴는 두 칸 들여쓰기.
              <br />
              입력 구조에 맞춘 규칙 기반 초안입니다. AI 분석 결과가 아닙니다.
            </p>
            <textarea
              aria-label="메뉴 구조"
              rows={5}
              value={outline}
              onChange={(e) => setOutline(e.target.value)}
              placeholder={
                "대시보드\n거래 관리\n  거래 내역\n  거래 상세\n요청 등록"
              }
            />
          </div>
          <Button
            disabled={!outline.trim()}
            onClick={() => {
              try {
                const result = planFromMenu(project, outline);
                if (!beforeChange()) return;
                update(result.project);
                setSelected(result.project.screens.at(-1)?.id || "");
                notify(
                  `${result.added}개 메뉴와 연결된 화면 초안을 만들었습니다.`,
                );
                setShowMenu(false);
                setOutline("");
              } catch (e) {
                notify((e as Error).message);
              }
            }}
          >
            <WandSparkles size={16} />
            연결된 화면 초안 만들기
          </Button>
        </section>
      )}
      <div className="design-workspace">
        <aside className="panel screen-nav">
          <div className="panel-heading">
            <h3>화면 목록</h3>
            <Tag>{project.screens.length}</Tag>
          </div>
          {project.screens.map((s) => (
            <button
              className={`screen-nav-item ${screen?.id === s.id ? "selected" : ""}`}
              key={s.id}
              onClick={() => setSelected(s.id)}
            >
              <span className="screen-kind-icon">
                {s.kind === "dashboard" ? (
                  <LayoutDashboard size={17} />
                ) : s.kind === "form" ? (
                  <FileText size={17} />
                ) : (
                  <Columns3 size={17} />
                )}
              </span>
              <div>
                <strong>{s.title}</strong>
                <small>
                  {s.id} · {kindLabels[s.kind]}
                </small>
              </div>
            </button>
          ))}
          {!project.screens.length && (
            <p className="muted small">
              메뉴를 입력하거나 Codex로 화면을 설계하세요.
            </p>
          )}
          <div className="screen-count-note">
            <GitBranch size={14} />
            {project.ia.length} IA · {project.functions.length} FN
          </div>
        </aside>
        <section className="panel design-main">
          {screen ? (
            <>
              <div className="design-toolbar">
                <div className="tabs">
                  <button
                    className={tab === "preview" ? "selected" : ""}
                    onClick={() => setTab("preview")}
                  >
                    화면 미리보기
                  </button>
                  <button
                    className={tab === "spec" ? "selected" : ""}
                    onClick={() => setTab("spec")}
                  >
                    화면 명세 편집
                  </button>
                </div>
                <div className="device-switch">
                  <button
                    aria-label="데스크톱 미리보기"
                    className={device === "desktop" ? "selected" : ""}
                    onClick={() => setDevice("desktop")}
                  >
                    <Monitor size={17} />
                  </button>
                  <button
                    aria-label="모바일 미리보기"
                    className={device === "mobile" ? "selected" : ""}
                    onClick={() => setDevice("mobile")}
                  >
                    <Smartphone size={17} />
                  </button>
                </div>
              </div>
              {tab === "preview" ? (
                <div className={`preview-stage ${device}`}>
                  <div className="preview-address">
                    <span>
                      <i />
                      <i />
                      <i />
                    </span>
                    <code>{screen.route}</code>
                    <Tag>목업</Tag>
                  </div>
                  <iframe
                    title={`${screen.title} 프로토타입`}
                    srcDoc={html}
                    sandbox="allow-scripts allow-forms"
                  />
                </div>
              ) : (
                <div className="screen-editor">
                  <div className="form-grid">
                    <Field label="화면 이름">
                      <input
                        value={screen.title}
                        onChange={(e) => edit({ title: e.target.value })}
                      />
                    </Field>
                    <Field label="경로">
                      <input
                        value={screen.route}
                        onChange={(e) => edit({ route: e.target.value })}
                      />
                    </Field>
                    <Field label="화면 유형">
                      <select
                        value={screen.kind}
                        onChange={(e) =>
                          edit({ kind: e.target.value as Screen["kind"] })
                        }
                      >
                        {Object.entries(kindLabels).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="사용자 역할 · 쉼표로 구분">
                      <input
                        key={`${screen.id}-roles`}
                        defaultValue={screen.roles.join(", ")}
                        onBlur={(e) =>
                          edit({
                            roles: e.target.value
                              .split(",")
                              .map((x) => x.trim())
                              .filter(Boolean),
                          })
                        }
                      />
                    </Field>
                  </div>
                  <Field label="레이아웃 영역 · 한 줄에 하나">
                    <textarea
                      rows={3}
                      key={`${screen.id}-sections`}
                      defaultValue={screen.sections.join("\n")}
                      onBlur={(e) =>
                        edit({
                          sections: e.target.value.split("\n").filter(Boolean),
                        })
                      }
                    />
                  </Field>
                  <div className="field">
                    <span>적용할 화면 상태</span>
                    <div className="state-checkboxes">
                      {Object.entries(stateLabels).map(([key, label]) => (
                        <label key={key}>
                          <input
                            type="checkbox"
                            checked={screen.states.includes(
                              key as Screen["states"][number],
                            )}
                            onChange={(e) =>
                              edit({
                                states: e.target.checked
                                  ? [
                                      ...screen.states,
                                      key as Screen["states"][number],
                                    ]
                                  : screen.states.filter((s) => s !== key),
                              })
                            }
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="panel-heading">
                    <h3>입력 필드와 검증 규칙</h3>
                    <Button
                      variant="ghost"
                      onClick={() =>
                        edit({
                          fields: [
                            ...screen.fields,
                            {
                              name: "새 입력",
                              type: "text",
                              required: false,
                              rule: "",
                            },
                          ],
                        })
                      }
                    >
                      <Plus size={14} />
                      필드 추가
                    </Button>
                  </div>
                  {screen.fields.map((f, i) => (
                    <div className="field-edit-row" key={i}>
                      <input
                        aria-label={`필드 ${i + 1} 이름`}
                        value={f.name}
                        onChange={(e) =>
                          edit({
                            fields: screen.fields.map((x, n) =>
                              n === i ? { ...x, name: e.target.value } : x,
                            ),
                          })
                        }
                      />
                      <select
                        aria-label={`필드 ${i + 1} 유형`}
                        value={f.type}
                        onChange={(e) =>
                          edit({
                            fields: screen.fields.map((x, n) =>
                              n === i
                                ? {
                                    ...x,
                                    type: e.target.value as typeof f.type,
                                  }
                                : x,
                            ),
                          })
                        }
                      >
                        {[
                          "text",
                          "number",
                          "select",
                          "date",
                          "textarea",
                          "checkbox",
                        ].map((t) => (
                          <option key={t}>{t}</option>
                        ))}
                      </select>
                      <input
                        aria-label={`필드 ${i + 1} 검증 규칙`}
                        placeholder="검증 규칙"
                        value={f.rule}
                        onChange={(e) =>
                          edit({
                            fields: screen.fields.map((x, n) =>
                              n === i ? { ...x, rule: e.target.value } : x,
                            ),
                          })
                        }
                      />
                      <label className="checkbox-label">
                        <input
                          type="checkbox"
                          checked={f.required}
                          onChange={(e) =>
                            edit({
                              fields: screen.fields.map((x, n) =>
                                n === i
                                  ? { ...x, required: e.target.checked }
                                  : x,
                              ),
                            })
                          }
                        />
                        필수
                      </label>
                      <button
                        className="icon-btn"
                        aria-label={`필드 ${i + 1} 삭제`}
                        onClick={() =>
                          edit({
                            fields: screen.fields.filter((_, n) => n !== i),
                          })
                        }
                      >
                        <X size={15} />
                      </button>
                    </div>
                  ))}
                  <Field label="설계 설명 · 예외 · 정책">
                    <textarea
                      rows={4}
                      value={screen.notes}
                      onChange={(e) => edit({ notes: e.target.value })}
                    />
                  </Field>
                  <Field label="연결된 기능 ID · 쉼표로 구분">
                    <input
                      key={`${screen.id}-functions`}
                      defaultValue={screen.functionIds.join(", ")}
                      onBlur={(e) =>
                        edit({
                          functionIds: e.target.value
                            .split(",")
                            .map((x) => x.trim())
                            .filter(Boolean),
                        })
                      }
                    />
                  </Field>
                </div>
              )}
              <div className="design-status">
                <span>
                  <span className="mono">{screen.id}</span> ·{" "}
                  {screen.states.length}개 상태 · {screen.fields.length}개 필드
                </span>
                <span>명세 기반 목업 · 실제 서비스 연결 없음</span>
              </div>
            </>
          ) : (
            <Empty
              title="첫 번째 화면을 그려보세요"
              action={
                <Button onClick={() => setShowMenu(true)}>
                  <Plus size={16} />
                  메뉴 구조 입력
                </Button>
              }
            >
              메뉴 구조부터 시작하거나 요구사항을 바탕으로 Codex와 설계할 수
              있습니다.
            </Empty>
          )}
        </section>
      </div>
    </>
  );
}

function Trace({
  project,
  update,
  notify,
  issues,
  rows,
  onScreen,
  onEdit,
  onExport,
}: Common & {
  issues: ReturnType<typeof inspectProject>;
  rows: ReturnType<typeof traceRows>;
  onScreen: (id: string) => void;
  onEdit: () => void;
  onExport: () => void;
}) {
  const [filter, setFilter] = useState("all");
  const [editing, setEditing] = useState("");
  const selectedFn = project.functions.find((f) => f.id === editing);
  const shown = rows.filter((r) => filter === "all" || !r.complete);
  const complete = rows.filter((r) => r.complete).length;
  return (
    <>
      <SectionHead
        eyebrow="EVERY SCREEN HAS A REASON"
        title="이 화면이 필요한 이유를 추적하세요."
        description="자료 → 요구사항 → 메뉴 → 기능 → 화면의 연결을 검사합니다. RFP 충족이나 사실 검증률과는 다릅니다."
        actions={
          <Button variant="secondary" onClick={onExport}>
            <ArrowDownToLine size={15} />
            CSV 다운로드
          </Button>
        }
      />
      <div className="trace-summary">
        <div>
          <span className="eyebrow">SOURCE → REQ → IA → FN → SCR</span>
          <h2>
            {rows.length
              ? Math.round((complete / rows.length) * 100) + "%"
              : "—"}
            <small>구조 연결</small>
          </h2>
          <p>
            {complete} / {rows.length}개 전체 요구 · 원문 및 설계 연결 기준
          </p>
        </div>
        <div className="trace-summary-metrics">
          <span>
            <strong>{issues.filter((i) => i.level === "error").length}</strong>
            참조 오류
          </span>
          <span>
            <strong>
              {issues.filter((i) => i.level === "warning").length}
            </strong>
            보완 항목
          </span>
          <span>
            <strong>미실행</strong>실서비스 동작 검증
          </span>
        </div>
      </div>
      <div className="panel trace-panel">
        <div className="table-toolbar">
          <div className="tabs">
            <button
              className={filter === "all" ? "selected" : ""}
              onClick={() => setFilter("all")}
            >
              전체 요구 {rows.length}
            </button>
            <button
              className={filter === "gap" ? "selected" : ""}
              onClick={() => setFilter("gap")}
            >
              연결 공백 {rows.length - complete}
            </button>
          </div>
          <Button variant="ghost" onClick={onEdit}>
            <Code2 size={14} />
            요구사항 편집
          </Button>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>요구사항 REQ</th>
                <th>자료</th>
                <th>메뉴 IA</th>
                <th>기능 FN</th>
                <th>화면 SCR</th>
                <th>상태</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => (
                <tr key={row.requirement.id}>
                  <td>
                    <span className="mono">{row.requirement.id}</span>
                    <p>{row.requirement.text}</p>
                    <ClaimTag claim={row.requirement.claim} />
                  </td>
                  <td>
                    <SourceChips
                      ids={row.requirement.sourceIds}
                      project={project}
                    />
                  </td>
                  <td>
                    {row.ia.map((i) => (
                      <span className="trace-id" key={i.id}>
                        {i.id}
                        <small>{i.label}</small>
                      </span>
                    ))}
                    {!row.ia.length && <span className="missing">미연결</span>}
                  </td>
                  <td>
                    {row.functions.map((f) => (
                      <button
                        className="trace-id link"
                        key={f.id}
                        onClick={() => setEditing(f.id)}
                      >
                        {f.id}
                        <small>{f.name}</small>
                      </button>
                    ))}
                    {!row.functions.length && (
                      <span className="missing">미연결</span>
                    )}
                  </td>
                  <td>
                    {row.screens.map((s) => (
                      <button
                        className="trace-id link"
                        key={s.id}
                        onClick={() => onScreen(s.id)}
                      >
                        {s.id}
                        <small>
                          {s.title}
                          <ArrowUpRight size={11} />
                        </small>
                      </button>
                    ))}
                    {!row.screens.length && (
                      <span className="missing">미연결</span>
                    )}
                  </td>
                  <td>
                    <Tag tone={row.complete ? "green" : "amber"}>
                      {row.complete ? "연결됨" : "보완 필요"}
                    </Tag>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!shown.length && (
            <Empty
              title={
                filter === "gap"
                  ? "연결 공백이 없습니다"
                  : "등록된 요구사항이 없습니다"
              }
            >
              요구사항과 근거를 등록하면 연결 상태가 표시됩니다.
            </Empty>
          )}
        </div>
      </div>
      {selectedFn && (
        <div className="panel trace-edit">
          <h3>{selectedFn.id} 연결 편집</h3>
          <div className="form-grid">
            <Field label="메뉴">
              <select
                value={selectedFn.iaId}
                onChange={(e) =>
                  update((p) => ({
                    ...p,
                    functions: p.functions.map((f) =>
                      f.id === selectedFn.id
                        ? { ...f, iaId: e.target.value }
                        : f,
                    ),
                  }))
                }
              >
                {project.ia.map((i) => (
                  <option value={i.id} key={i.id}>
                    {i.id} · {i.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="요구사항 · Ctrl/Command로 복수 선택">
              <select
                multiple
                value={selectedFn.requirementIds}
                onChange={(e) => {
                  const ids = Array.from(
                    e.target.selectedOptions,
                    (o) => o.value,
                  );
                  update((p) => ({
                    ...p,
                    functions: p.functions.map((f) =>
                      f.id === selectedFn.id
                        ? { ...f, requirementIds: ids }
                        : f,
                    ),
                  }));
                }}
              >
                {project.requirements.map((r) => (
                  <option value={r.id} key={r.id}>
                    {r.id} · {r.text}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Button
            variant="secondary"
            onClick={() => {
              setEditing("");
              notify("연결 변경 내용을 저장했습니다.");
            }}
          >
            닫기
          </Button>
        </div>
      )}
      <section className="panel issue-list">
        <div className="panel-heading">
          <h3>보완 항목</h3>
          <Tag>실시간 구조 검사</Tag>
        </div>
        {issues.map((issue, i) => (
          <div className="issue-row" key={i}>
            <span className={`issue-dot ${issue.level}`} />
            <code>{issue.target}</code>
            <p>{issue.message}</p>
            <Tag tone={issue.level === "error" ? "red" : "amber"}>
              {issue.level === "error" ? "오류" : "확인"}
            </Tag>
          </div>
        ))}
        {!issues.length && (
          <p className="muted">
            구조 오류가 없습니다. 내용의 사실성·렌더링·실서비스 동작은 별도로
            확인해야 합니다.
          </p>
        )}
      </section>
    </>
  );
}

function Pipeline({
  project,
  busy,
  job,
  generate,
  onPreview,
}: Common & {
  busy: boolean;
  job: Job | null;
  generate: () => void;
  onPreview: () => void;
}) {
  const issues = inspectProject(project);
  return (
    <>
      <SectionHead
        eyebrow="ONE BRIEF. CONNECTED OUTPUTS."
        title="한 번의 맥락으로, 연결된 전체 설계."
        description="같은 자료와 ID 체계로 제안·현황 분석·화면 명세를 함께 생성하고 결과를 검토합니다."
      />
      <div className="pipeline-hero">
        <div className="pipeline-icon">
          <Zap size={30} />
        </div>
        <h2>자료의 의도가 화면까지 이어집니다.</h2>
        <p>
          현재 프로젝트의 브리프와 자료 {project.sources.length}개를 Codex에
          전달합니다.
          <br />
          생성 결과는 검토 후 반영하며, 기존 버전은 보관합니다.
        </p>
        <Button disabled={busy} onClick={generate}>
          <Sparkles size={17} />
          {busy ? "설계 진행 중" : "전체 설계 실행"}
          <ArrowRight size={17} />
        </Button>
      </div>
      <div className="pipeline-steps">
        {[
          {
            n: "01",
            name: "맥락 준비",
            desc: "브리프와 제공 자료를 한 작업으로 구성",
            value: `${project.sources.length}개 자료`,
            ready: !!(project.brief || project.sources.length),
            icon: FolderOpen,
          },
          {
            n: "02",
            name: "제안 · 분석",
            desc: "메시지와 현행 과제를 근거로 연결",
            value: `${project.proposal.slides.length}개 장표 · ${project.analysis.length}개 분석`,
            ready: !!project.proposal.slides.length,
            icon: FileText,
          },
          {
            n: "03",
            name: "설계 구체화",
            desc: "REQ · IA · FN · SCR와 화면 상태 생성",
            value: `${project.screens.length}개 화면`,
            ready: !!project.screens.length,
            icon: Columns3,
          },
          {
            n: "04",
            name: "연결 검수",
            desc: "참조 오류와 누락 항목을 별도로 확인",
            value: `${issues.length}개 보완 항목`,
            ready: !!project.screens.length && !issues.length,
            icon: ShieldCheck,
          },
        ].map((s) => (
          <div className="pipeline-step" key={s.n}>
            <div>
              <span>{s.n}</span>
              <s.icon size={22} />
            </div>
            <h3>{s.name}</h3>
            <p>{s.desc}</p>
            <Tag tone={s.ready ? "green" : "neutral"}>{s.value}</Tag>
          </div>
        ))}
      </div>
      {job && (
        <div className="callout">
          <LoaderCircle size={18} className={busy ? "spin" : ""} />
          <span>
            최근 작업 · {job.stage} · {job.status}
            {job.error ? ` · ${job.error}` : ""}
          </span>
        </div>
      )}
      <div className="panel deliver-panel">
        <div>
          <h3>설계가 준비됐다면 직접 경험해 보세요.</h3>
          <p>
            화면 상태 전환·검색·폼 검증을 가진 오프라인 HTML을 내보냅니다. 실제
            업무 서버에는 연결되지 않습니다.
          </p>
        </div>
        <Button
          variant="secondary"
          disabled={!project.screens.length}
          onClick={onPreview}
        >
          <ArrowDownToLine size={16} />
          HTML 프로토타입
        </Button>
      </div>
    </>
  );
}

function References({ onUse }: { onUse: (kind: Screen["kind"]) => void }) {
  return (
    <>
      <SectionHead
        eyebrow="PATTERNS WITH A PURPOSE"
        title="좋은 패턴을, 내 프로젝트의 문법으로."
        description="고객 화면을 복제하지 않는 합성 레퍼런스입니다. 목적에 맞는 구조에서 시작하세요."
      />
      <div className="reference-grid">
        {[
          {
            kind: "dashboard",
            label: "업무 대시보드",
            en: "OVERVIEW & ACTION",
            desc: "중요한 현황과 다음 행동을 한눈에 연결합니다.",
            tags: ["상태 요약", "우선순위", "빠른 실행"],
          },
          {
            kind: "list",
            label: "목록과 탐색",
            en: "FIND & REFINE",
            desc: "검색·필터·빈 결과·오류를 함께 설계합니다.",
            tags: ["검색", "결과 비교", "상세 이동"],
          },
          {
            kind: "form",
            label: "신청과 입력",
            en: "INPUT & CONFIDENCE",
            desc: "입력 의도와 검증 규칙, 오류 회복을 명확히 합니다.",
            tags: ["필수 입력", "검증", "상태 피드백"],
          },
        ].map((p, index) => (
          <article className="panel reference-card" key={p.kind}>
            <div className={`reference-art art-${p.kind}`}>
              <div className="reference-frame">
                <div className="ref-top">
                  <i />
                  <i />
                  <i />
                </div>
                <div className="ref-body">
                  <div className="ref-sidebar">
                    <i />
                    <i />
                    <i />
                  </div>
                  <div className="ref-content">
                    <div className="ref-title" />
                    {index === 0 ? (
                      <>
                        <div className="ref-stats">
                          <i />
                          <i />
                          <i />
                        </div>
                        <div className="ref-chart">
                          <i />
                          <i />
                          <i />
                          <i />
                          <i />
                        </div>
                      </>
                    ) : index === 1 ? (
                      <>
                        <div className="ref-search" />
                        {[0, 1, 2, 3].map((x) => (
                          <div className="ref-row" key={x}>
                            <i />
                            <i />
                            <i />
                          </div>
                        ))}
                      </>
                    ) : (
                      <>
                        {[0, 1, 2].map((x) => (
                          <div className="ref-field" key={x}>
                            <i />
                            <span />
                          </div>
                        ))}
                        <div className="ref-button" />
                      </>
                    )}
                  </div>
                </div>
              </div>
              <span className="reference-number">0{index + 1}</span>
            </div>
            <div className="reference-copy">
              <span className="eyebrow">{p.en}</span>
              <h2>{p.label}</h2>
              <p>{p.desc}</p>
              <div className="chips">
                {p.tags.map((t) => (
                  <Tag key={t}>{t}</Tag>
                ))}
              </div>
              <Button
                variant="secondary"
                onClick={() => onUse(p.kind as Screen["kind"])}
              >
                이 패턴으로 시작
                <ArrowUpRight size={16} />
              </Button>
            </div>
          </article>
        ))}
      </div>
      <div className="panel principles">
        <span className="eyebrow">OUR DESIGN PRINCIPLES</span>
        <div className="principle-grid">
          {[
            [
              "01",
              "결론부터 보이게",
              "핵심 과제와 다음 행동을 먼저 보여줍니다.",
            ],
            [
              "02",
              "상태까지 설계하기",
              "정상뿐 아니라 빈값·오류·권한을 고려합니다.",
            ],
            [
              "03",
              "근거로 연결하기",
              "화면마다 요구사항과 기능의 출처를 남깁니다.",
            ],
            [
              "04",
              "수정 가능한 결과",
              "명세·도형·텍스트를 다시 편집할 수 있게 합니다.",
            ],
          ].map(([n, t, d]) => (
            <div key={n}>
              <span>{n}</span>
              <h3>{t}</h3>
              <p>{d}</p>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function Workbench({
  project,
  update,
  notify,
  beforeChange,
  onBackup,
}: Common & { beforeChange: () => boolean; onBackup: () => void }) {
  const [tab, setTab] = useState("requirements");
  const [json, setJson] = useState(() => JSON.stringify(project, null, 2));
  const [error, setError] = useState("");
  const [historyKey, setHistoryKey] = useState(0);
  useEffect(() => {
    setJson(JSON.stringify(project, null, 2));
    setError("");
  }, [project.id]);
  const snapshots = useMemo(
    () => getSnapshots(project.id),
    [project.id, historyKey],
  );
  function editReq(id: string, part: Partial<Project["requirements"][number]>) {
    update((p) => ({
      ...p,
      requirements: p.requirements.map((r) =>
        r.id === id ? { ...r, ...part } : r,
      ),
    }));
  }
  return (
    <>
      <SectionHead
        eyebrow="KEEP YOUR HAND ON THE WORK"
        title="생성한 결과도, 직접 만든 명세도."
        description="요구사항을 다듬고 전체 데이터를 편집하며 주요 변경 전 버전을 보관합니다."
        actions={
          <Button variant="secondary" onClick={onBackup}>
            <ArrowDownToLine size={15} />
            JSON 백업
          </Button>
        }
      />
      <div className="panel workbench-tabs tabs">
        <button
          className={tab === "requirements" ? "selected" : ""}
          onClick={() => setTab("requirements")}
        >
          요구사항
        </button>
        <button
          className={tab === "brief" ? "selected" : ""}
          onClick={() => setTab("brief")}
        >
          프로젝트 브리프
        </button>
        <button
          className={tab === "json" ? "selected" : ""}
          onClick={() => {
            setTab("json");
            setJson(JSON.stringify(project, null, 2));
          }}
        >
          전체 JSON
        </button>
        <button
          className={tab === "history" ? "selected" : ""}
          onClick={() => {
            setTab("history");
            setHistoryKey((v) => v + 1);
          }}
        >
          버전 보관함
        </button>
      </div>
      {tab === "requirements" && (
        <div>
          <div className="workbench-actions">
            <span className="muted small">
              요구사항 {project.requirements.length}개
            </span>
            <Button
              variant="secondary"
              onClick={() =>
                update((p) => ({
                  ...p,
                  requirements: [
                    ...p.requirements,
                    {
                      id: uid("REQ"),
                      text: "새 요구사항",
                      priority: "should",
                      status: "draft",
                      claim: "unresolved",
                      sourceIds: [],
                      acceptance: "",
                    },
                  ],
                }))
              }
            >
              <Plus size={15} />
              요구 추가
            </Button>
          </div>
          {project.requirements.map((r) => (
            <div className="panel requirement-editor" key={r.id}>
              <div className="panel-heading">
                <span className="mono">{r.id}</span>
                <button
                  className="icon-btn"
                  aria-label={`${r.id} 삭제`}
                  onClick={() => {
                    if (
                      confirm(
                        "연결된 기능에 공백이 생길 수 있습니다. 요구사항을 삭제할까요?",
                      )
                    )
                      update((p) => ({
                        ...p,
                        requirements: p.requirements.filter(
                          (x) => x.id !== r.id,
                        ),
                      }));
                  }}
                >
                  <Trash2 size={15} />
                </button>
              </div>
              <Field label="요구 내용">
                <textarea
                  value={r.text}
                  rows={2}
                  onChange={(e) => editReq(r.id, { text: e.target.value })}
                />
              </Field>
              <div className="form-grid three">
                <Field label="우선순위">
                  <select
                    value={r.priority}
                    onChange={(e) =>
                      editReq(r.id, {
                        priority: e.target.value as typeof r.priority,
                      })
                    }
                  >
                    <option value="must">필수</option>
                    <option value="should">중요</option>
                    <option value="could">선택</option>
                  </select>
                </Field>
                <Field label="진행 상태">
                  <select
                    value={r.status}
                    onChange={(e) =>
                      editReq(r.id, {
                        status: e.target.value as typeof r.status,
                      })
                    }
                  >
                    <option value="draft">초안</option>
                    <option value="confirmed">확정</option>
                    <option value="deferred">보류 · 제외</option>
                  </select>
                </Field>
                <Field label="근거 성격">
                  <select
                    value={r.claim}
                    onChange={(e) =>
                      editReq(r.id, { claim: e.target.value as Claim })
                    }
                  >
                    {Object.entries(claimLabels).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <div className="form-grid">
                <Field label="수용 기준">
                  <textarea
                    rows={2}
                    value={r.acceptance}
                    onChange={(e) =>
                      editReq(r.id, { acceptance: e.target.value })
                    }
                    placeholder="무엇을 확인하면 충족했다고 판단하나요?"
                  />
                </Field>
                <Field label="자료 연결 · Ctrl/Command로 복수 선택">
                  <select
                    multiple
                    value={r.sourceIds}
                    onChange={(e) =>
                      editReq(r.id, {
                        sourceIds: Array.from(
                          e.target.selectedOptions,
                          (o) => o.value,
                        ),
                      })
                    }
                  >
                    {project.sources.map((s) => (
                      <option value={s.id} key={s.id}>
                        {s.id} · {s.name}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            </div>
          ))}
        </div>
      )}
      {tab === "brief" && (
        <div className="panel brief-editor">
          <Field label="프로젝트 이름">
            <input
              maxLength={200}
              value={project.title}
              onChange={(e) => {
                if (e.target.value.trim())
                  update((p) => ({ ...p, title: e.target.value }));
              }}
            />
          </Field>
          <Field label="고객 · 조직">
            <input
              maxLength={200}
              value={project.client}
              onChange={(e) =>
                update((p) => ({ ...p, client: e.target.value }))
              }
            />
          </Field>
          <Field label="목표 · 범위 · 제약">
            <textarea
              rows={10}
              value={project.brief}
              maxLength={20000}
              onChange={(e) => update((p) => ({ ...p, brief: e.target.value }))}
            />
          </Field>
          <Field label="가정 · 확인할 사항 · 한 줄에 하나">
            <textarea
              rows={6}
              key={`${project.id}-assumptions`}
              defaultValue={project.assumptions.join("\n")}
              onBlur={(e) =>
                update((p) => ({
                  ...p,
                  assumptions: e.target.value.split("\n").filter(Boolean),
                }))
              }
            />
          </Field>
        </div>
      )}
      {tab === "json" && (
        <div className="panel json-editor">
          <div className="callout">
            스키마를 검증한 뒤 현재 프로젝트를 교체합니다. 잘못된 JSON은
            반영하지 않습니다. ID 참조 오류는 연결 검수에서 확인하세요.
          </div>
          <textarea
            aria-label="프로젝트 JSON"
            spellCheck={false}
            rows={30}
            value={json}
            onChange={(e) => setJson(e.target.value)}
          />
          {error && (
            <p className="error-text" role="alert">
              {error}
            </p>
          )}
          <div className="form-footer">
            <Button
              variant="secondary"
              onClick={() => {
                setJson(JSON.stringify(project, null, 2));
                setError("");
              }}
            >
              현재 데이터로 되돌리기
            </Button>
            <Button
              onClick={() => {
                try {
                  const next = projectSchema.parse(JSON.parse(json));
                  if (next.id !== project.id)
                    throw new Error(
                      "프로젝트 ID는 바꿀 수 없습니다. 별도 프로젝트는 백업 가져오기를 사용하세요.",
                    );
                  if (!beforeChange()) return;
                  update(next);
                  setError("");
                  notify("JSON 명세를 검증하고 반영했습니다.");
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              <Check size={15} />
              검증하고 반영
            </Button>
          </div>
        </div>
      )}
      {tab === "history" && (
        <div className="panel history-panel">
          <div className="panel-heading">
            <h3>최근 8개 주요 버전</h3>
            <Button
              variant="secondary"
              onClick={() => {
                try {
                  saveSnapshot(project, "직접 보관");
                  setHistoryKey((v) => v + 1);
                  notify("현재 버전을 보관했습니다.");
                } catch {
                  notify("저장 공간이 부족합니다. JSON을 다운로드하세요.");
                }
              }}
            >
              <Plus size={15} />
              현재 버전 보관
            </Button>
          </div>
          {snapshots.map((s) => (
            <div className="history-row" key={s.id}>
              <div>
                <strong>{s.label}</strong>
                <small>
                  {formatDate(s.createdAt)} · 요구{" "}
                  {s.project.requirements.length} / 화면{" "}
                  {s.project.screens.length}
                </small>
              </div>
              <Button
                variant="ghost"
                onClick={() => exportProjectJson(s.project)}
              >
                <ArrowDownToLine size={15} />
                JSON
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  if (confirm("현재 버전을 보관하고 이 버전으로 복원할까요?")) {
                    if (!beforeChange()) return;
                    update(s.project);
                    setHistoryKey((v) => v + 1);
                    notify("버전을 복원했습니다.");
                  }
                }}
              >
                복원
              </Button>
            </div>
          ))}
          {!snapshots.length && (
            <Empty title="아직 보관된 버전이 없습니다">
              AI 결과 반영·수주 전환·메뉴 초안 생성 전에 이전 버전을 자동으로
              보관합니다.
            </Empty>
          )}
        </div>
      )}
    </>
  );
}

function Settings({
  status,
  checking,
  refresh,
  notify,
}: {
  status: ConnectionStatus | null;
  checking: boolean;
  refresh: () => void;
  notify: (s: string) => void;
}) {
  async function copy(s: string) {
    try {
      await navigator.clipboard.writeText(s);
      notify("명령을 복사했습니다.");
    } catch {
      notify("복사하지 못했습니다. 명령을 직접 선택해 복사해 주세요.");
    }
  }
  const connected =
    status?.authenticated &&
    status.authMode === "chatgpt" &&
    status.generationReady !== false;
  return (
    <>
      <SectionHead
        eyebrow="YOUR ACCOUNT. YOUR WORKFLOW."
        title="나의 ChatGPT를 작업 환경에 연결하세요."
        description="공식 Codex 로그인으로 구독 계정을 사용합니다. 별도 API 키를 입력하지 않습니다."
        actions={
          <Button variant="secondary" onClick={refresh} disabled={checking}>
            <RefreshCw size={15} className={checking ? "spin" : ""} />
            연결 확인
          </Button>
        }
      />
      <div className="settings-grid">
        <section className="panel connection-status-panel">
          <span
            className={`connection-big-icon ${connected ? "connected" : ""}`}
          >
            <Sparkles size={30} />
          </span>
          <h2>
            {checking
              ? "연결 확인 중"
              : connected
                ? "ChatGPT 계정이 연결됐습니다."
                : status?.generationReady === false
                  ? "로그인 확인 · 실행 환경 점검 필요"
                  : status?.installed
                    ? "ChatGPT 로그인이 필요합니다."
                    : "로컬 Codex 연결을 준비하세요."}
          </h2>
          <p>
            {status?.message ||
              "로컬 실행 서버에 연결되지 않았습니다. 프로젝트 폴더에서 npm run dev 또는 npm start를 실행해 주세요."}
          </p>
          <div className="status-lines">
            <div>
              <span>실행 연결</span>
              <Tag tone={status ? "green" : "amber"}>
                {status ? "로컬 서버 연결됨" : "서버 연결 필요"}
              </Tag>
            </div>
            <div>
              <span>Codex CLI</span>
              <strong>
                {status?.installed
                  ? status.version || "설치됨"
                  : "확인되지 않음"}
              </strong>
            </div>
            <div>
              <span>로그인 방식</span>
              <strong>
                {status?.authMode === "chatgpt"
                  ? "ChatGPT 계정"
                  : status?.authMode === "api-key"
                    ? "API 키 방식 · 이 앱에서 실행 불가"
                    : "미확인"}
              </strong>
            </div>
          </div>
          <div className="callout">
            <ShieldCheck size={18} />
            <span>
              로그인 자격증명은 Codex가 관리합니다. 앱과 브라우저는 토큰을
              저장하거나 표시하지 않습니다.
            </span>
          </div>
        </section>
        <section className="panel setup-steps">
          <h3>내 컴퓨터에서 시작하기</h3>
          <p className="muted small">
            Node.js 22.12 이상을 설치한 뒤 터미널에서 실행하세요.
          </p>
          {[
            ["1", "앱과 공식 Codex CLI 설치", "npm ci"],
            ["2", "ChatGPT 계정으로 로그인", "npm run codex:login"],
            ["3", "AX Agent Studio 시작", "npm run dev"],
          ].map(([n, title, command]) => (
            <div className="setup-step" key={n}>
              <span>{n}</span>
              <div>
                <strong>{title}</strong>
                <div className="command">
                  <pre>{command}</pre>
                  <button
                    className="icon-btn"
                    aria-label={`${title} 명령 복사`}
                    onClick={() => copy(command)}
                  >
                    <Copy size={15} />
                  </button>
                </div>
              </div>
            </div>
          ))}
          <p className="small muted">
            브라우저가 열리지 않는 환경은{" "}
            <code>npm exec -- codex login --device-auth</code>를 사용할 수
            있습니다. 제공 여부는 설치한 Codex 버전과 계정 설정에 따릅니다.
          </p>
        </section>
      </div>
      <div className="panel account-explainer">
        <h3>‘GPT 토큰 사용’은 어떻게 동작하나요?</h3>
        <div className="form-grid">
          <div>
            <h4>ChatGPT 구독의 Codex 사용량</h4>
            <p>
              이 앱은 로그인한 Codex CLI에 작업을 전달합니다. 사용 가능 여부와
              한도는 ChatGPT 요금제 및 Codex 정책에 따릅니다. ChatGPT 구독을
              범용 API 크레딧으로 전환하는 기능은 아닙니다.
            </p>
          </div>
          <div>
            <h4>실행은 내 컴퓨터에서</h4>
            <p>
              정적 웹페이지가 계정 토큰을 직접 읽지 않습니다. 로컬 서버가 공식
              CLI를 호출하며, AI 실행을 누르면 선택한 프로젝트 자료가 해당
              계정의 Codex 서비스로 전달됩니다. 이 클라우드의 연결 상태는 다른
              컴퓨터의 로그인 상태와 별개입니다.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
