import express, { type ErrorRequestHandler } from "express";
import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { generateRequestSchema, workflowBlocker, type Job } from "../shared/domain";
import {
  BridgeError,
  createCodexRunner,
  validateArtifacts,
  type CodexRunner,
} from "./codex";
import { extractDocument } from "./documents";

const ORIGINS = new Set([
  "http://127.0.0.1:5173",
  "http://localhost:5173",
  "http://127.0.0.1:4318",
  "http://localhost:4318",
]);
const HOSTS = new Set([
  "127.0.0.1:5173",
  "localhost:5173",
  "127.0.0.1:4318",
  "localhost:4318",
]);
const documentRequest = z
  .object({
    name: z.string().min(1).max(250),
    dataBase64: z
      .string()
      .min(1)
      .max(24 * 1024 * 1024),
  })
  .strict();
type Extractor = typeof extractDocument;
export type BridgeOptions = {
  runner?: CodexRunner;
  extract?: Extractor;
  timeoutMs?: number;
  distDir?: string;
};

export function createBridge(options: BridgeOptions = {}) {
  const app = express();
  app.disable("x-powered-by");
  const runner = options.runner ?? createCodexRunner();
  const extract = options.extract ?? extractDocument;
  const token = randomBytes(32).toString("hex");
  const jobs = new Map<string, Job>();
  const controllers = new Map<string, AbortController>();
  let activeId: string | undefined;

  app.use((req, res, next) => {
    // Bind address alone does not prevent browser CSRF or DNS rebinding.
    if (!HOSTS.has(req.headers.host ?? "")) {
      res.status(403).json({ error: "허용되지 않은 로컬 주소입니다." });
      return;
    }
    const origin = req.headers.origin;
    if (origin && !ORIGINS.has(origin)) {
      res.status(403).json({ error: "허용되지 않은 요청 출처입니다." });
      return;
    }
    if (req.headers["sec-fetch-site"] === "cross-site" && !origin) {
      res
        .status(403)
        .json({ error: "외부 사이트의 요청은 허용하지 않습니다." });
      return;
    }
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Cross-Origin-Resource-Policy", "same-site");
    res.setHeader("Cache-Control", "no-store");
    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type, X-AX-Session",
      );
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    }
    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }
    if (!["GET", "HEAD"].includes(req.method)) {
      if (!origin || !ORIGINS.has(origin)) {
        res.status(403).json({ error: "로컬 앱에서 다시 요청하세요." });
        return;
      }
      const supplied = req.header("X-AX-Session") ?? "";
      const a = Buffer.from(supplied),
        b = Buffer.from(token);
      if (a.length !== b.length || !timingSafeEqual(a, b)) {
        res
          .status(403)
          .json({ error: "앱 연결이 만료되었습니다. 화면을 새로고침하세요." });
        return;
      }
      if (!req.is("application/json")) {
        res.status(415).json({ error: "JSON 요청만 허용됩니다." });
        return;
      }
    }
    next();
  });
  app.use(express.json({ limit: "24mb", strict: true }));
  app.get("/api/session", (_req, res) => {
    res.json({ token });
  });
  app.get("/api/status", async (_req, res) => {
    res.json(await runner.status());
  });
  app.post("/api/documents", async (req, res) => {
    const input = documentRequest.safeParse(req.body);
    if (!input.success) {
      res
        .status(400)
        .json({ error: "파일 이름과 Base64 데이터를 확인하세요." });
      return;
    }
    try {
      res.json(await extract(input.data));
    } catch (error) {
      res
        .status(422)
        .json({
          error:
            error instanceof Error
              ? error.message.slice(0, 500)
              : "문서 내용을 추출하지 못했습니다.",
        });
    }
  });
  app.post("/api/jobs", (req, res) => {
    const parsed = generateRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: "프로젝트 또는 생성 요청 형식이 올바르지 않습니다." });
      return;
    }
    if (activeId) {
      res
        .status(409)
        .json({
          error: "현재 작업이 끝나거나 취소 처리가 완료된 뒤 다시 생성하세요.",
        });
      return;
    }
    const blocker = parsed.data.workflow || parsed.data.task === "rfp"
      ? workflowBlocker(parsed.data.project, parsed.data.task) : undefined;
    if (blocker) { res.status(400).json({ error: blocker }); return; }
    while (jobs.size >= 12) {
      const oldest = jobs.keys().next().value;
      if (!oldest) break;
      jobs.delete(oldest);
    }
    const id = randomUUID();
    const job: Job = {
      id,
      status: "queued",
      stage: "ChatGPT 연결 확인 중",
      startedAt: new Date().toISOString(),
    };
    const controller = new AbortController();
    jobs.set(id, job);
    controllers.set(id, controller);
    activeId = id;
    res.status(202).json({ id });
    void (async () => {
      let timedOut = false;
      const timeout = setTimeout(() => {
        timedOut = true;
        if (job.status !== "cancelled") {
          job.status = "failed";
          job.stage = "제한 시간 초과";
          job.error =
            "생성 제한 시간 5분을 초과했습니다. 입력 범위를 줄여 다시 시도하세요.";
        }
        controller.abort();
      }, options.timeoutMs ?? 300_000);
      try {
        const status = await runner.status();
        if (controller.signal.aborted) return;
        if (!status.authenticated || status.authMode !== "chatgpt")
          throw new BridgeError(status.message, "auth_required");
        job.status = "running";
        const result = await runner.run(parsed.data, {
          signal: controller.signal,
          onProgress: (stage) => {
            if (job.status === "running") job.stage = stage;
          },
        });
        if (controller.signal.aborted) return;
        job.result = validateArtifacts(result.result, parsed.data);
        job.usage = result.usage;
        job.knowledge = result.knowledge;
        job.status = "completed";
        job.stage = "생성 및 연결 검수 완료";
      } catch (error) {
        if (job.status !== "cancelled" && !timedOut) {
          job.status = "failed";
          job.stage = "생성 중단";
          job.error =
            error instanceof BridgeError
              ? error.message
              : "생성 중 오류가 발생했습니다. 입력 내용과 Codex 연결을 확인하세요.";
        }
      } finally {
        clearTimeout(timeout);
        controllers.delete(id);
        if (activeId === id) activeId = undefined;
      }
    })();
  });
  app.get("/api/jobs/:id", (req, res) => {
    const job = jobs.get(String(req.params.id));
    if (!job) {
      res
        .status(404)
        .json({
          error:
            "작업을 찾을 수 없습니다. 브리지를 재시작했다면 다시 생성하세요.",
        });
      return;
    }
    res.json(job);
  });
  app.post("/api/jobs/:id/cancel", (req, res) => {
    const job = jobs.get(String(req.params.id));
    if (!job) {
      res.status(404).json({ error: "작업을 찾을 수 없습니다." });
      return;
    }
    if (job.status === "queued" || job.status === "running") {
      job.status = "cancelled";
      job.stage = "취소됨";
      controllers.get(job.id)?.abort();
    }
    res.json(job);
  });
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "API 경로를 찾을 수 없습니다." });
  });
  const dist =
    options.distDir ?? fileURLToPath(new URL("../dist", import.meta.url));
  if (existsSync(path.join(dist, "index.html"))) {
    app.use(
      express.static(dist, { dotfiles: "deny", index: false, redirect: false }),
    );
    app.get("/{*route}", (_req, res) => {
      res.sendFile(path.join(dist, "index.html"));
    });
  } else {
    app.get("/", (_req, res) => {
      res
        .type("text")
        .send(
          "AX Agent bridge 실행 중. 개발 화면: http://127.0.0.1:5173 (npm run dev)",
        );
    });
  }
  const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
    const tooLarge = error?.type === "entity.too.large";
    res
      .status(tooLarge ? 413 : 400)
      .json({
        error: tooLarge
          ? "요청 용량 제한을 초과했습니다."
          : "요청을 처리하지 못했습니다. JSON 형식을 확인하세요.",
      });
  };
  app.use(errorHandler);
  return {
    app,
    shutdown: () => {
      for (const controller of controllers.values()) controller.abort();
    },
  };
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const bridge = createBridge();
  const server = bridge.app.listen(4318, "127.0.0.1", () => {
    console.log("AX Agent 로컬 브리지: http://127.0.0.1:4318");
  });
  server.on("error", () => {
    console.error(
      "4318 포트를 사용할 수 없습니다. 기존 AX Agent 실행 여부를 확인하세요.",
    );
    process.exitCode = 1;
  });
  const close = () => {
    bridge.shutdown();
    server.close();
  };
  process.once("SIGINT", close);
  process.once("SIGTERM", close);
}
