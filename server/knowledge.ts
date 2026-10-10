import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { Task } from "../shared/domain";

const root = fileURLToPath(new URL("../.agents/skills/wylie-proposal/", import.meta.url));
const common = ["SKILL.md", "references/proposal-story-and-process.md", "templates/review-rubric.md"];

/** Fixed, local reference files only. No uploaded paths, scripts, network or credentials. */
export async function loadWylieKnowledge(task: Task) {
  const paths = task === "proposal" || task === "all"
    ? [...common, "references/visual-system.md", "references/diagram-recipes.md"] : common;
  const texts: string[] = [];
  const references: Array<{ path: string; sha256: string }> = [];
  let bytes = 0;
  for (const relative of paths) {
    const content = await readFile(path.join(root, relative), "utf8");
    bytes += Buffer.byteLength(content);
    if (bytes > 160000) throw new Error("제작 스킬 자료가 허용 크기를 초과했습니다.");
    texts.push(`REFERENCE ${relative}\n${content}`);
    references.push({ path: `.agents/skills/wylie-proposal/${relative}`, sha256: createHash("sha256").update(content).digest("hex") });
  }
  return { text: texts.join("\n\n"), references };
}
