import { z } from "zod";
import { projectSchema, type Project } from "../../shared/domain";

export const STORE_KEY = "ax-agent-studio:projects:v1";
export const RECOVERY_KEY_PREFIX = `${STORE_KEY}:recovery:`;
export type Snapshot = {
  id: string;
  label: string;
  createdAt: string;
  project: Project;
};
export type ProjectReadResult = {
  projects: Project[];
  error?: string;
  recoveryRequired: boolean;
  recoveryKey?: string;
};

const snapshotSchema = z.object({
  id: z.string().trim().min(1).max(100),
  label: z.string().trim().min(1).max(200),
  createdAt: z.string().datetime({ offset: true }),
  project: projectSchema,
});

function preserveOriginal(raw: string): string {
  // Reuse an exact backup on repeated reads, including after a page reload.
  // Only storage values are compared; document contents never enter logs.
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (
      key?.startsWith(RECOVERY_KEY_PREFIX) &&
      localStorage.getItem(key) === raw
    )
      return key;
  }
  const stem = `${RECOVERY_KEY_PREFIX}${Date.now()}-${crypto.randomUUID()}`;
  for (let suffix = 0; suffix < 100; suffix++) {
    const key = `${stem}-${suffix}`;
    if (localStorage.getItem(key) !== null) continue;
    localStorage.setItem(key, raw);
    if (localStorage.getItem(key) !== raw)
      throw new Error("복구 원본을 보관하지 못했습니다.");
    return key;
  }
  throw new Error("새 복구 보관 위치를 만들지 못했습니다.");
}

function recoveredResult(
  raw: string,
  projects: Project[],
  rejected: number | null,
): ProjectReadResult {
  const message =
    rejected === null
      ? "저장 데이터 형식이 손상되어 프로젝트 목록을 읽지 못했습니다."
      : `손상되었거나 ID가 중복된 항목 ${rejected}개를 제외하고 프로젝트 ${projects.length}개를 복구했습니다.`;
  try {
    const recoveryKey = preserveOriginal(raw);
    return {
      projects,
      recoveryRequired: false,
      recoveryKey,
      error: `${message} 수정 전 원본 전체를 별도 복구 백업에 보관했습니다.`,
    };
  } catch {
    return {
      projects,
      recoveryRequired: true,
      error: `${message} 원본 복구 백업을 만들지 못해 저장을 중단했습니다. 원본은 덮어쓰지 않았습니다. 브라우저 저장 공간과 접근 권한을 확인하세요.`,
    };
  }
}

export function readProjects(): ProjectReadResult {
  let raw: string | null;
  try {
    raw = localStorage.getItem(STORE_KEY);
  } catch {
    return {
      projects: [],
      recoveryRequired: true,
      error:
        "브라우저 저장소를 읽지 못해 저장을 중단했습니다. 접근 권한을 확인하고 JSON 백업으로 작업을 보관하세요.",
    };
  }
  if (raw === null) return { projects: [], recoveryRequired: false };
  let records: unknown;
  try {
    records = JSON.parse(raw);
  } catch {
    return recoveredResult(raw, [], null);
  }
  if (!Array.isArray(records)) return recoveredResult(raw, [], null);
  const projects: Project[] = [];
  const ids = new Set<string>();
  let rejected = 0;
  for (const record of records) {
    const parsed = projectSchema.safeParse(record);
    if (!parsed.success || ids.has(parsed.data.id)) {
      rejected++;
      continue;
    }
    ids.add(parsed.data.id);
    projects.push(parsed.data);
  }
  return rejected
    ? recoveredResult(raw, projects, rejected)
    : { projects, recoveryRequired: false };
}

export function saveProjects(projects: Project[]): void {
  const parsed = projectSchema.array().safeParse(projects);
  if (!parsed.success)
    throw new Error(
      "프로젝트 형식이나 항목 한도가 올바르지 않아 저장하지 않았습니다.",
    );
  if (
    new Set(parsed.data.map((project) => project.id)).size !==
    parsed.data.length
  )
    throw new Error("프로젝트 ID가 중복되어 저장하지 않았습니다.");
  // A caller cannot accidentally overwrite a corrupt store by skipping the
  // initial read or by creating a fresh project after a recovery error.
  const current = readProjects();
  if (current.recoveryRequired)
    throw new Error(
      current.error || "기존 저장 데이터의 원본 복구가 필요합니다.",
    );
  localStorage.setItem(STORE_KEY, JSON.stringify(parsed.data));
}

function readSnapshotHistory(id: string): Snapshot[] {
  const rows: unknown = JSON.parse(
    localStorage.getItem(`ax-agent-studio:history:${id}`) ?? "[]",
  );
  if (!Array.isArray(rows))
    throw new Error("버전 보관함 형식이 올바르지 않습니다.");
  const snapshots: Snapshot[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const parsed = snapshotSchema.safeParse(row);
    if (
      !parsed.success ||
      parsed.data.project.id !== id ||
      seen.has(parsed.data.id)
    )
      continue;
    seen.add(parsed.data.id);
    snapshots.push(parsed.data);
  }
  return snapshots;
}

export function getSnapshots(id: string): Snapshot[] {
  try {
    return readSnapshotHistory(id);
  } catch {
    return [];
  }
}

export function saveSnapshot(project: Project, label: string): void {
  const parsed = snapshotSchema.safeParse({
    id: crypto.randomUUID(),
    label,
    createdAt: new Date().toISOString(),
    project,
  });
  if (!parsed.success)
    throw new Error(
      "프로젝트 또는 버전 정보가 올바르지 않아 보관하지 않았습니다.",
    );
  // Unlike the read-only history view, writes cannot treat an unreadable
  // history as empty and erase the previously stored versions.
  let history: Snapshot[];
  try {
    history = readSnapshotHistory(parsed.data.project.id);
  } catch {
    throw new Error(
      "기존 버전 보관함을 읽지 못해 새 버전을 저장하지 않았습니다.",
    );
  }
  const rows = [parsed.data, ...history].slice(0, 8);
  // Quota/access errors must reach callers before they replace current work.
  localStorage.setItem(
    `ax-agent-studio:history:${parsed.data.project.id}`,
    JSON.stringify(rows),
  );
}
