import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createProject, type Project } from "../shared/domain";
import {
  getSnapshots,
  readProjects,
  RECOVERY_KEY_PREFIX,
  saveProjects,
  saveSnapshot,
  STORE_KEY,
  type Snapshot,
} from "../src/lib/storage";

class MemoryStorage implements Storage {
  readonly values = new Map<string, string>();
  readError: Error | null = null;
  writeError: ((key: string) => Error | null) | null = null;

  get length() {
    return this.values.size;
  }
  clear = vi.fn(() => this.values.clear());
  key = vi.fn((index: number) => [...this.values.keys()][index] ?? null);
  getItem = vi.fn((key: string) => {
    if (this.readError) throw this.readError;
    return this.values.get(key) ?? null;
  });
  removeItem = vi.fn((key: string) => {
    this.values.delete(key);
  });
  setItem = vi.fn((key: string, value: string) => {
    const error = this.writeError?.(key);
    if (error) throw error;
    this.values.set(String(key), String(value));
  });
}

let storage: MemoryStorage;

beforeEach(() => {
  storage = new MemoryStorage();
  vi.stubGlobal("localStorage", storage);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function project(id = "project-a"): Project {
  return {
    ...createProject(`합성 프로젝트 ${id}`),
    id,
    updatedAt: "2026-10-10T00:00:00.000Z",
  };
}

function snapshot(owner: Project, id = "snapshot-1", day = 1): Snapshot {
  return {
    id,
    label: `합성 버전 ${id}`,
    createdAt: `2026-10-${String(day).padStart(2, "0")}T00:00:00.000Z`,
    project: owner,
  };
}

const historyKey = (id: string) => `ax-agent-studio:history:${id}`;
const backups = () =>
  [...storage.values.entries()].filter(([key]) =>
    key.startsWith(RECOVERY_KEY_PREFIX),
  );
const quotaError = () =>
  new DOMException("Synthetic storage quota failure", "QuotaExceededError");

describe("readProjects", () => {
  it("returns an empty healthy result when nothing has been saved", () => {
    const result = readProjects();
    expect(result).toEqual({ projects: [], recoveryRequired: false });
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("reads every valid project without creating a recovery backup", () => {
    const expected = [project("first"), project("second")];
    storage.values.set(STORE_KEY, JSON.stringify(expected));
    const result = readProjects();
    expect(result.projects).toEqual(expected);
    expect(result.recoveryRequired).toBe(false);
    expect(result.error).toBeUndefined();
    expect(result.recoveryKey).toBeUndefined();
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("recovers valid rows separately and keeps the first occurrence of a project ID", () => {
    const first = project("first");
    const second = project("second");
    const raw = JSON.stringify(
      [
        first,
        null,
        { ...second, title: 42 },
        { ...first, title: "제외할 중복 프로젝트" },
        17,
        second,
      ],
      null,
      2,
    );
    storage.values.set(STORE_KEY, raw);
    const result = readProjects();
    expect(result.projects).toEqual([first, second]);
    expect(result.recoveryRequired).toBe(false);
    expect(result.error).toEqual(expect.any(String));
    expect(result.recoveryKey).toEqual(
      expect.stringMatching(new RegExp(`^${RECOVERY_KEY_PREFIX}`)),
    );
    expect(storage.values.get(result.recoveryKey!)).toBe(raw);
    expect(storage.values.get(STORE_KEY)).toBe(raw);
    expect(backups()).toHaveLength(1);
  });

  it.each([
    ["malformed JSON", '\n {"unfinished": [ \n'],
    ["an empty stored string", ""],
    ["a non-array object", ' { "unexpected": true } '],
    ["a JSON null", "null"],
  ])("preserves the exact original string for %s", (_, raw) => {
    storage.values.set(STORE_KEY, raw);
    const result = readProjects();
    expect(result.projects).toEqual([]);
    expect(result.recoveryRequired).toBe(false);
    expect(result.error).toEqual(expect.any(String));
    expect(result.recoveryKey).toBeDefined();
    expect(storage.values.get(result.recoveryKey!)).toBe(raw);
    expect(storage.values.get(STORE_KEY)).toBe(raw);
  });

  it("reuses an existing exact backup on repeated reads without extra writes", () => {
    const raw = "[null]";
    const existingKey = `${RECOVERY_KEY_PREFIX}older-session`;
    storage.values.set(existingKey, raw);
    storage.values.set(STORE_KEY, raw);
    const first = readProjects();
    const second = readProjects();
    expect(first.recoveryKey).toBe(existingKey);
    expect(second.recoveryKey).toBe(existingKey);
    expect(first.recoveryRequired).toBe(false);
    expect(second.recoveryRequired).toBe(false);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("does not confuse a similar backup with the exact original bytes", () => {
    const raw = " [ null ] \n";
    const oldKey = `${RECOVERY_KEY_PREFIX}older-session`;
    storage.values.set(oldKey, "[null]");
    storage.values.set(STORE_KEY, raw);
    const result = readProjects();
    expect(result.recoveryKey).not.toBe(oldKey);
    expect(storage.values.get(oldKey)).toBe("[null]");
    expect(storage.values.get(result.recoveryKey!)).toBe(raw);
    expect(backups()).toHaveLength(2);
  });

  it("never overwrites a recovery key even when timestamp and UUID collide", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-10T12:00:00.000Z"));
    vi.spyOn(crypto, "randomUUID").mockReturnValue(
      "00000000-0000-4000-8000-000000000001",
    );
    const firstRaw = '{"first":true}';
    const secondRaw = '{"second":true}';
    storage.values.set(STORE_KEY, firstRaw);
    const first = readProjects();
    storage.values.set(STORE_KEY, secondRaw);
    const second = readProjects();
    expect(first.recoveryKey).toBeDefined();
    expect(second.recoveryKey).toBeDefined();
    expect(second.recoveryKey).not.toBe(first.recoveryKey);
    expect(storage.values.get(first.recoveryKey!)).toBe(firstRaw);
    expect(storage.values.get(second.recoveryKey!)).toBe(secondRaw);
    expect(backups()).toHaveLength(2);
  });

  it("returns recovered valid projects while blocking saving if backup quota is exhausted", () => {
    const valid = project();
    const raw = JSON.stringify([valid, null]);
    storage.values.set(STORE_KEY, raw);
    storage.writeError = (key) =>
      key.startsWith(RECOVERY_KEY_PREFIX) ? quotaError() : null;
    const result = readProjects();
    expect(result.projects).toEqual([valid]);
    expect(result.recoveryRequired).toBe(true);
    expect(result.error).toEqual(expect.any(String));
    expect(result.recoveryKey).toBeUndefined();
    expect(storage.values.get(STORE_KEY)).toBe(raw);
    expect(backups()).toEqual([]);
    expect(() => saveProjects([valid])).toThrow(/복구|백업|저장|원본/);
    expect(storage.values.get(STORE_KEY)).toBe(raw);
    expect(storage.setItem.mock.calls.some(([key]) => key === STORE_KEY)).toBe(
      false,
    );
  });

  it("reports storage access failure as requiring recovery without writing", () => {
    storage.readError = new DOMException(
      "Synthetic access failure",
      "SecurityError",
    );
    const result = readProjects();
    expect(result.projects).toEqual([]);
    expect(result.recoveryRequired).toBe(true);
    expect(result.error).toEqual(expect.any(String));
    expect(storage.setItem).not.toHaveBeenCalled();
  });
});

describe("saveProjects", () => {
  it("validates all incoming projects before making any storage mutation", () => {
    const raw = "[null]";
    const valid = project();
    storage.values.set(STORE_KEY, raw);
    const invalid = {
      ...project("bad"),
      sources: [{ invalid: true }],
    } as unknown as Project;
    expect(() => saveProjects([valid, invalid])).toThrow(
      /형식|항목|저장|프로젝트/,
    );
    expect(storage.values.get(STORE_KEY)).toBe(raw);
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(backups()).toEqual([]);
  });

  it("rejects duplicate incoming project IDs instead of persisting future data loss", () => {
    const valid = project();
    const previous = JSON.stringify([valid]);
    storage.values.set(STORE_KEY, previous);
    expect(() => saveProjects([valid, { ...valid, title: "중복" }])).toThrow(
      /중복|ID/,
    );
    expect(storage.values.get(STORE_KEY)).toBe(previous);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("backs up a corrupt current store before replacement even without an initial read", () => {
    const raw = "  {broken original}\n";
    const next = [project()];
    storage.values.set(STORE_KEY, raw);
    saveProjects(next);
    expect(JSON.parse(storage.values.get(STORE_KEY)!)).toEqual(next);
    expect(backups()).toHaveLength(1);
    expect(backups()[0][1]).toBe(raw);
    const keys = storage.setItem.mock.calls.map(([key]) => key);
    expect(
      keys.findIndex((key) => key.startsWith(RECOVERY_KEY_PREFIX)),
    ).toBeLessThan(keys.indexOf(STORE_KEY));
  });

  it("preserves the original if only recovery writes fail while primary writes would succeed", () => {
    const raw = "[null]";
    storage.values.set(STORE_KEY, raw);
    storage.writeError = (key) =>
      key.startsWith(RECOVERY_KEY_PREFIX) ? quotaError() : null;
    expect(() => saveProjects([project()])).toThrow(/복구|백업|저장|원본/);
    expect(storage.values.get(STORE_KEY)).toBe(raw);
    expect(storage.setItem.mock.calls.some(([key]) => key === STORE_KEY)).toBe(
      false,
    );
  });

  it("can retry successfully after backup storage becomes available", () => {
    const valid = project();
    const raw = JSON.stringify([null, valid]);
    storage.values.set(STORE_KEY, raw);
    storage.writeError = (key) =>
      key.startsWith(RECOVERY_KEY_PREFIX) ? quotaError() : null;
    expect(readProjects().recoveryRequired).toBe(true);
    storage.writeError = null;
    saveProjects([valid]);
    expect(JSON.parse(storage.values.get(STORE_KEY)!)).toEqual([valid]);
    expect(backups().map(([, value]) => value)).toEqual([raw]);
  });

  it("backs up the current corrupt value if it changed after the initial recovery read", () => {
    storage.values.set(STORE_KEY, '{"old":true}');
    const first = readProjects();
    const current = '{"new":true}';
    storage.values.set(STORE_KEY, current);
    saveProjects([project()]);
    expect(storage.values.get(first.recoveryKey!)).toBe('{"old":true}');
    expect(backups().map(([, raw]) => raw)).toContain(current);
  });

  it("rechecks that the backup still exists before overwriting a corrupt store", () => {
    const raw = "[null]";
    storage.values.set(STORE_KEY, raw);
    const result = readProjects();
    storage.values.delete(result.recoveryKey!);
    storage.setItem.mockClear();
    storage.writeError = (key) =>
      key.startsWith(RECOVERY_KEY_PREFIX) ? quotaError() : null;
    expect(() => saveProjects([project()])).toThrow(/복구|백업|저장|원본/);
    expect(storage.values.get(STORE_KEY)).toBe(raw);
    expect(storage.setItem.mock.calls.some(([key]) => key === STORE_KEY)).toBe(
      false,
    );
  });

  it("refuses to save when the current store cannot be read", () => {
    const raw = JSON.stringify([project("previous")]);
    storage.values.set(STORE_KEY, raw);
    storage.readError = new Error("Synthetic access failure");
    expect(() => saveProjects([project("next")])).toThrow(/읽|저장|접근|복구/);
    expect(storage.values.get(STORE_KEY)).toBe(raw);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it("propagates primary-write quota errors and leaves the existing valid store unchanged", () => {
    const previous = JSON.stringify([project("previous")]);
    const quota = quotaError();
    storage.values.set(STORE_KEY, previous);
    storage.writeError = (key) => (key === STORE_KEY ? quota : null);
    expect(() => saveProjects([project("next")])).toThrow(quota);
    expect(storage.values.get(STORE_KEY)).toBe(previous);
  });
});

describe("getSnapshots", () => {
  it("validates each row and isolates malformed, foreign, and duplicate snapshots", () => {
    const owner = project();
    const first = snapshot(owner, "first");
    const second = snapshot(owner, "second", 2);
    storage.values.set(
      historyKey(owner.id),
      JSON.stringify([
        first,
        null,
        { ...first, id: "", label: "빈 ID" },
        { ...first, id: "   ", label: "공백 ID" },
        { ...first, id: "bad-label", label: 42 },
        { ...first, id: "empty-label", label: "   " },
        { ...first, id: "bad-date", createdAt: "not-a-date" },
        { ...first, id: "date-only", createdAt: "2026-10-10" },
        {
          ...first,
          id: "bad-project",
          project: { ...owner, requirements: null },
        },
        { ...first, id: "missing-project", project: null },
        snapshot(project("another-project"), "foreign"),
        { ...first, label: "제외할 중복 버전" },
        second,
      ]),
    );
    expect(getSnapshots(owner.id)).toEqual([first, second]);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it.each(["malformed JSON", "{}", "null"])(
    "returns no snapshots for malformed history: %s",
    (raw) => {
      storage.values.set(historyKey("project-a"), raw);
      expect(getSnapshots("project-a")).toEqual([]);
      expect(storage.setItem).not.toHaveBeenCalled();
    },
  );

  it("returns no snapshots when storage cannot be read", () => {
    storage.readError = new Error("Synthetic access failure");
    expect(getSnapshots("project-a")).toEqual([]);
  });
});

describe("saveSnapshot", () => {
  it("prepends a valid snapshot and keeps only the eight newest saved versions", () => {
    const owner = project();
    const previous = Array.from({ length: 10 }, (_, index) =>
      snapshot(owner, `old-${10 - index}`, 10 - index),
    );
    storage.values.set(historyKey(owner.id), JSON.stringify(previous));
    const otherKey = historyKey("other-project");
    storage.values.set(otherKey, "[]");
    saveSnapshot(owner, "설계 검토 전");
    const rows = getSnapshots(owner.id);
    expect(rows).toHaveLength(8);
    expect(rows[0]).toMatchObject({ label: "설계 검토 전", project: owner });
    expect(rows[0].id).toEqual(expect.any(String));
    expect(Number.isNaN(Date.parse(rows[0].createdAt))).toBe(false);
    expect(rows.slice(1)).toEqual(previous.slice(0, 7));
    expect(storage.values.get(otherKey)).toBe("[]");
  });

  it("validates the whole project before writing a snapshot", () => {
    const invalid = { ...project(), screens: [null] } as unknown as Project;
    expect(() => saveSnapshot(invalid, "잘못된 프로젝트")).toThrow(
      /형식|프로젝트|정보|보관/,
    );
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it.each(["", "   ", 42, null])(
    "rejects an invalid snapshot label: %s",
    (label) => {
      expect(() => saveSnapshot(project(), label as string)).toThrow(
        /형식|프로젝트|정보|보관/,
      );
      expect(storage.setItem).not.toHaveBeenCalled();
    },
  );

  it("uses the validated canonical project ID for the history key", () => {
    const owner = { ...project(), id: "  project-a  " };
    saveSnapshot(owner, "정규화된 식별자");
    expect(getSnapshots("project-a")).toHaveLength(1);
    expect(getSnapshots("project-a")[0].project.id).toBe("project-a");
    expect(storage.values.has(historyKey(owner.id))).toBe(false);
  });

  it("propagates quota failures without replacing previously saved versions", () => {
    const owner = project();
    const key = historyKey(owner.id);
    const previous = JSON.stringify([snapshot(owner)]);
    const quota = quotaError();
    storage.values.set(key, previous);
    storage.writeError = (target) => (target === key ? quota : null);
    expect(() => saveSnapshot(owner, "저장 실패 버전")).toThrow(quota);
    expect(storage.values.get(key)).toBe(previous);
  });

  it("does not replace unreadable or malformed existing snapshot history with an empty list", () => {
    const owner = project();
    const key = historyKey(owner.id);
    for (const raw of ["broken JSON", "{}", "null"]) {
      storage.values.set(key, raw);
      expect(() => saveSnapshot(owner, "원본 보존")).toThrow();
      expect(storage.values.get(key)).toBe(raw);
    }
    const original = JSON.stringify([snapshot(owner)]);
    storage.values.set(key, original);
    storage.readError = new Error("Synthetic access failure");
    expect(() => saveSnapshot(owner, "접근 실패")).toThrow();
    expect(storage.values.get(key)).toBe(original);
    expect(storage.setItem).not.toHaveBeenCalled();
  });
});
