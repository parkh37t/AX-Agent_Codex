import { spawn } from "node:child_process";
import { constants } from "node:fs";
import {
  access,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { zodToJsonSchema } from "zod-to-json-schema";
import {
  artifactSchema,
  inspectProject,
  mergeArtifacts,
  type Artifacts,
  type ConnectionStatus,
  type GenerateRequest,
} from "../shared/domain";
import { buildPrompt } from "./prompt";

export class BridgeError extends Error {
  constructor(
    message: string,
    public readonly code = "generation_failed",
  ) {
    super(message);
    this.name = "BridgeError";
  }
}
export type RunResult = {
  result: Artifacts;
  usage?: { inputTokens: number; outputTokens: number };
};
export type RunOptions = {
  signal: AbortSignal;
  onProgress: (stage: string) => void;
};
export interface CodexRunner {
  status(): Promise<ConnectionStatus>;
  run(request: GenerateRequest, options: RunOptions): Promise<RunResult>;
}

// Only a child-process copy is changed. Never inspect auth.json, token storage, or key contents.
export function subscriptionEnvironment(
  base: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const env = { ...base };
  const blocked = new Set([
    "OPENAI_API_KEY",
    "CODEX_API_KEY",
    "CODEX_ACCESS_TOKEN",
    "OPENAI_BASE_URL",
    "OPENAI_API_BASE",
  ]);
  for (const key of Object.keys(env))
    if (blocked.has(key.toUpperCase())) delete env[key];
  return env;
}

export function normalizeAuthStatus(
  output: string,
  exitCode: number,
): Pick<ConnectionStatus, "authenticated" | "authMode"> {
  // login status emits API key prefixes/suffixes on stderr. Do not return or log raw output.
  const lines = output.split(/\r?\n/).map((line) => line.trim());
  if (lines.some((line) => /^Logged in using (?:an? )?API key\b/i.test(line)))
    return { authenticated: false, authMode: "api-key" };
  if (
    exitCode === 0 &&
    lines.some((line) => line === "Logged in using ChatGPT")
  )
    return { authenticated: true, authMode: "chatgpt" };
  if (lines.some((line) => /not logged in/i.test(line)))
    return { authenticated: false, authMode: "none" };
  return { authenticated: false, authMode: "unknown" };
}

/** Classify in memory; never put the original CLI error, URL, headers, or token fragments in an API response. */
export function classifyCodexFailure(
  stderr: string,
  eventErrors: string[] = [],
): BridgeError {
  // This warning is nonfatal and can accompany an unrelated model/network failure.
  const diagnostic = [
    stderr.replace(
      /^\s*WARNING: proceeding, even though we could not create PATH aliases:.*$/gim,
      "",
    ),
    ...eventErrors,
  ].join("\n");
  if (
    /read.only file system|readonly database|read-only database/i.test(
      diagnostic,
    )
  ) {
    return new BridgeError(
      "Codex 런타임 저장 위치가 읽기 전용이어서 실행을 시작하지 못했습니다. Codex가 정상 실행되는 로컬 사용자 환경에서 앱을 실행하거나 관리형 환경의 쓰기 권한 설정을 확인하세요.",
      "codex_storage_readonly",
    );
  }
  if (
    /network.policy|egress.*(?:denied|blocked)|proxy.*(?:denied|forbidden|blocked)|(?:host|domain).*not.*allow|policy.*(?:denied|blocked)/i.test(
      diagnostic,
    )
  ) {
    return new BridgeError(
      "환경의 네트워크 정책 또는 프록시가 Codex 연결을 차단했습니다. 허용된 네트워크 설정을 확인하세요. 앱은 보호 설정을 우회하지 않습니다.",
      "codex_network_policy",
    );
  }
  if (
    /rate.limit|usage.limit|quota|insufficient.*(?:credit|balance)|\b429\b/i.test(
      diagnostic,
    )
  ) {
    return new BridgeError(
      "ChatGPT 계정의 Codex 사용량 또는 요청 한도에 도달했습니다. 계정의 한도와 재사용 가능 시간을 확인하세요.",
      "codex_usage_limit",
    );
  }
  if (
    /unauthorized|not authenticated|invalid.*(?:token|authentication)|authentication.*(?:failed|error)|\b401\b/i.test(
      diagnostic,
    )
  ) {
    return new BridgeError(
      "Codex가 ChatGPT 인증을 확인하지 못했습니다. 같은 사용자 환경에서 npm run codex:login으로 로그인 상태를 갱신하세요.",
      "codex_auth_failed",
    );
  }
  if (
    /invalid.*schema|schema.*(?:invalid|unsupported)|response_format.*(?:error|invalid)/i.test(
      diagnostic,
    )
  ) {
    return new BridgeError(
      "Codex 또는 선택된 모델이 요청한 JSON 출력 형식을 지원하지 않습니다. CLI와 모델의 구조화 출력 지원을 확인하세요.",
      "codex_output_schema",
    );
  }
  if (
    /unexpected argument|unknown (?:option|argument|feature)|unrecognized option|invalid (?:config|value|type)|failed to (?:load|parse) config|feature.*(?:requires|must|depend|incompatible)|requires? (?:the )?(?:feature|flag)/i.test(
      diagnostic,
    )
  ) {
    return new BridgeError(
      "Codex CLI 옵션 또는 기능 설정이 현재 버전과 맞지 않습니다. 공식 CLI를 업데이트하고 앱을 다시 시작하세요.",
      "codex_configuration",
    );
  }
  if (/sandbox.*(?:failed|error)|bwrap|landlock|seccomp/i.test(diagnostic)) {
    return new BridgeError(
      "현재 실행 환경에서 Codex의 보호된 실행 환경을 초기화하지 못했습니다. 지원되는 로컬 환경에서 Codex 설치 상태를 확인하세요.",
      "codex_sandbox",
    );
  }
  if (
    /model.*(?:not found|not supported|unavailable|does not exist|unsupported)/i.test(
      diagnostic,
    )
  ) {
    return new BridgeError(
      "현재 ChatGPT 계정에서 Codex가 선택한 모델을 사용할 수 없습니다. 계정의 모델 이용 권한과 CLI 버전을 확인하세요.",
      "codex_model_unavailable",
    );
  }
  if (
    /connection (?:refused|reset)|failed to connect|error sending request|dns|tls|certificate|timed out|stream disconnected/i.test(
      diagnostic,
    )
  ) {
    return new BridgeError(
      "Codex 서비스와의 네트워크 연결을 완료하지 못했습니다. 인터넷·프록시·인증서 설정을 확인한 뒤 다시 시도하세요.",
      "codex_network",
    );
  }
  if (/permission denied|operation not permitted/i.test(diagnostic)) {
    return new BridgeError(
      "Codex 실행에 필요한 로컬 권한이 없어 시작하지 못했습니다. 해당 사용자 환경의 파일·실행 권한을 확인하세요.",
      "codex_permission",
    );
  }
  return new BridgeError(
    "Codex 생성을 완료하지 못했습니다. CLI 상태와 구독·네트워크 설정을 확인하고 다시 시도하세요.",
    "codex_failed",
  );
}

/** Metadata only: no write probes, auth file reads, credential copying, or config changes. */
export async function runtimeStorageIssue(
  env: NodeJS.ProcessEnv,
  checkAccess: (filename: string) => Promise<void> = (filename) =>
    access(filename, constants.W_OK),
): Promise<BridgeError | undefined> {
  const runtimeDirectory = env.CODEX_HOME || path.join(homedir(), ".codex");
  // Current official exec initializes installation_id even in ephemeral sessions.
  for (const filename of [
    runtimeDirectory,
    path.join(runtimeDirectory, "installation_id"),
  ]) {
    try {
      await checkAccess(filename);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "EROFS")
        return classifyCodexFailure("Read-only file system");
      if (code === "EACCES" || code === "EPERM")
        return classifyCodexFailure("Permission denied");
      // Absent paths may be created by Codex; unknown metadata does not prove readiness.
    }
  }
  return undefined;
}

type ProcessResult = { stdout: string; stderr: string; code: number };
type ProcessOptions = {
  cwd?: string;
  input?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  maxBytes?: number;
  onLine?: (line: string) => void;
};
export type ProcessExecutor = (
  args: string[],
  options?: ProcessOptions,
) => Promise<ProcessResult>;

function createProcessExecutor(
  binary: string,
  env: NodeJS.ProcessEnv,
): ProcessExecutor {
  return (args, options = {}) =>
    new Promise((resolve, reject) => {
      if (options.signal?.aborted) {
        reject(new BridgeError("작업이 취소되었습니다.", "cancelled"));
        return;
      }
      const child = spawn(binary, args, {
        cwd: options.cwd,
        env,
        shell: false,
        windowsHide: true,
        detached: process.platform !== "win32",
        stdio: ["pipe", "pipe", "pipe"],
      });
      let stdout = "",
        stderr = "",
        pendingLine = "",
        bytes = 0,
        settled = false;
      let failure: BridgeError | undefined;
      let forceTimer: NodeJS.Timeout | undefined;
      let finalTimer: NodeJS.Timeout | undefined;
      const signalChild = (signal: NodeJS.Signals) => {
        try {
          if (process.platform !== "win32" && child.pid)
            process.kill(-child.pid, signal);
          else if (child.pid) {
            // Native Windows has no POSIX process groups. Use fixed argv, never a shell command.
            const systemRoot =
              env.SystemRoot ?? env.SYSTEMROOT ?? "C:\\Windows";
            const killer = spawn(
              path.win32.join(systemRoot, "System32", "taskkill.exe"),
              ["/PID", String(child.pid), "/T", "/F"],
              { shell: false, windowsHide: true, stdio: "ignore" },
            );
            killer.on("error", () => {
              child.kill();
            });
          } else child.kill(signal);
        } catch {
          /* Child already exited. */
        }
      };
      const finish = (result?: ProcessResult, error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        clearTimeout(forceTimer);
        clearTimeout(finalTimer);
        options.signal?.removeEventListener("abort", abort);
        if (error) reject(error);
        else resolve(result!);
      };
      const stop = (error: BridgeError) => {
        if (failure || settled) return;
        failure = error;
        signalChild("SIGTERM");
        forceTimer = setTimeout(() => signalChild("SIGKILL"), 1000);
        finalTimer = setTimeout(() => finish(undefined, failure), 4000);
      };
      const abort = () =>
        stop(new BridgeError("작업이 취소되었습니다.", "cancelled"));
      const timer = setTimeout(
        () =>
          stop(
            new BridgeError("Codex 응답 제한 시간을 초과했습니다.", "timeout"),
          ),
        options.timeoutMs ?? 15000,
      );
      options.signal?.addEventListener("abort", abort, { once: true });
      child.on("error", () =>
        finish(
          undefined,
          new BridgeError(
            "Codex 실행 파일을 시작할 수 없습니다. 설치와 실행 경로를 확인하세요.",
            "cli_unavailable",
          ),
        ),
      );
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      const receive = (chunk: string, kind: "stdout" | "stderr") => {
        bytes += Buffer.byteLength(chunk);
        if (bytes > (options.maxBytes ?? 128 * 1024)) {
          stop(
            new BridgeError(
              "Codex 출력 용량 제한을 초과했습니다.",
              "output_limit",
            ),
          );
          return;
        }
        if (kind === "stderr") {
          stderr += chunk;
          return;
        }
        stdout += chunk;
        if (options.onLine) {
          pendingLine += chunk;
          const lines = pendingLine.split("\n");
          pendingLine = lines.pop()!;
          for (const line of lines) if (line.trim()) options.onLine(line);
        }
      };
      child.stdout.on("data", (chunk) => receive(chunk, "stdout"));
      child.stderr.on("data", (chunk) => receive(chunk, "stderr"));
      child.stdin.on("error", () => {
        /* Spawn/exit handlers report closed-pipe failures. */
      });
      child.on("close", (code) => {
        if (pendingLine.trim()) options.onLine?.(pendingLine);
        if (failure) signalChild("SIGKILL");
        finish({ stdout, stderr, code: code ?? -1 }, failure);
      });
      child.stdin.end(options.input ?? "");
    });
}

const REQUIRED_FLAGS = [
  "--ignore-user-config",
  "--ephemeral",
  "--output-schema",
  "--json",
  "--sandbox",
  "--skip-git-repo-check",
];
const DISABLE_FEATURES = [
  "shell_tool",
  "unified_exec",
  "unified_exec_tty",
  "apps",
  "plugins",
  "hooks",
  "plugin_hooks",
  "remote_plugin",
  "browser_use",
  "browser_use_external",
  "browser_use_full_cdp_access",
  "computer_use",
  "image_generation",
  "imagegenext",
  "view_image",
  "multi_agent",
  "multi_agent_v2",
  "code_mode",
  "code_mode_host",
  "js_repl",
  "memories",
  "memory_tool",
  "skill_search",
  "skill_mcp_dependency_install",
  "tool_suggest",
  "recommended_plugins",
  "in_app_browser",
  "in_app_local_automation",
  "workspace_dependencies",
];

export function validateArtifacts(
  value: unknown,
  request: GenerateRequest,
): Artifacts {
  const parsed = artifactSchema.safeParse(value);
  if (!parsed.success)
    throw new BridgeError(
      "생성 결과가 산출물 형식과 맞지 않습니다. 내용을 줄이거나 다시 시도하세요.",
      "invalid_output",
    );
  const claimGroups = [
    [parsed.data.requirements, request.project.requirements],
    [parsed.data.analysis, request.project.analysis],
    [parsed.data.proposal.slides, request.project.proposal.slides],
  ] as const;
  for (const [generated, existing] of claimGroups)
    for (const item of generated) {
      if (item.claim !== "verified_fact") continue;
      const previous = existing.find((prior) => prior.id === item.id);
      if (
        previous?.claim !== "verified_fact" ||
        !isDeepStrictEqual(previous, item)
      ) {
        throw new BridgeError(
          "AI가 새로 만들거나 변경한 내용을 직접 확인한 사실로 표시하여 반영하지 않았습니다. 자료의 주장·제안·가설 등으로 구분해 다시 생성하세요.",
          "unverified_claim",
        );
      }
    }
  for (const item of parsed.data.requirements)
    if (item.status === "confirmed") {
      const previous = request.project.requirements.find(
        (prior) => prior.id === item.id,
      );
      if (
        previous?.status !== "confirmed" ||
        !isDeepStrictEqual(previous, item)
      ) {
        throw new BridgeError(
          "AI가 새로 만들거나 변경한 요구를 확정 상태로 표시하여 반영하지 않았습니다. 초안으로 생성한 뒤 사람이 확인하세요.",
          "unconfirmed_requirement",
        );
      }
    }
  // The shared merge invalidates delivery decisions whose original requirement changed or disappeared.
  const fullErrors = inspectProject(
    mergeArtifacts(request.project, parsed.data, "all"),
  ).filter((issue) => issue.level === "error");
  const mergedErrors = inspectProject(
    mergeArtifacts(request.project, parsed.data, request.task),
  ).filter((issue) => issue.level === "error");
  if (fullErrors.length || mergedErrors.length)
    throw new BridgeError(
      "생성 결과에 중복 ID, 없는 출처·요구·화면 참조 또는 메뉴 순환이 있어 반영하지 않았습니다.",
      "invalid_references",
    );
  return parsed.data;
}

export function createCodexRunner(
  options: {
    binary?: string;
    env?: NodeJS.ProcessEnv;
    execute?: ProcessExecutor;
    runtimePreflight?: () => Promise<BridgeError | undefined>;
  } = {},
): CodexRunner {
  const env = subscriptionEnvironment(options.env);
  const execute =
    options.execute ??
    createProcessExecutor(
      options.binary ?? process.env.AX_CODEX_BIN ?? "codex",
      env,
    );
  // A fake executor has no runtime on this machine; tests may inject a separate metadata check.
  const runtimePreflight =
    options.runtimePreflight ??
    (options.execute ? async () => undefined : () => runtimeStorageIssue(env));
  let capabilities:
    | Promise<{ help: string; features: Set<string> }>
    | undefined;
  const readCapabilities = () =>
    (capabilities ??= (async () => {
      const help = await execute(["exec", "--help"]);
      if (
        help.code !== 0 ||
        REQUIRED_FLAGS.some((flag) => !help.stdout.includes(flag))
      ) {
        throw new BridgeError(
          "이 Codex CLI는 필요한 격리·JSON 출력 옵션을 지원하지 않습니다. 공식 최신 CLI로 업데이트하세요.",
          "unsupported_cli",
        );
      }
      const features = await execute(["features", "list"]);
      if (features.code !== 0)
        throw new BridgeError(
          "Codex 도구 제한 옵션을 확인하지 못했습니다. CLI 설치를 확인하세요.",
          "unsupported_cli",
        );
      const names = new Set(
        features.stdout
          .split(/\r?\n/)
          .map((line) => line.trim().split(/\s+/)[0]),
      );
      if (!names.has("shell_tool"))
        throw new BridgeError(
          "명령 실행 제한을 지원하는 Codex CLI가 필요합니다.",
          "unsupported_cli",
        );
      return { help: help.stdout, features: names };
    })().catch((error) => {
      capabilities = undefined;
      throw error;
    }));

  const status = async (): Promise<ConnectionStatus> => {
    let version = "";
    try {
      const result = await execute(["--version"]);
      if (result.code !== 0) throw new Error();
      version = result.stdout.trim().slice(0, 120);
    } catch {
      return {
        installed: false,
        authenticated: false,
        authMode: "none",
        version,
        message:
          "Codex CLI를 설치한 후 npm run codex:login으로 ChatGPT에 로그인하세요.",
      };
    }
    try {
      const result = await execute(["login", "status"]);
      const auth = normalizeAuthStatus(
        `${result.stdout}\n${result.stderr}`,
        result.code,
      );
      if (!auth.authenticated)
        return {
          installed: true,
          ...auth,
          version,
          message:
            auth.authMode === "api-key"
              ? "API 키 로그인은 사용하지 않습니다. 터미널에서 npm run codex:login으로 ChatGPT 계정에 로그인하세요."
              : "ChatGPT 로그인을 확인하지 못했습니다. 터미널에서 npm run codex:login을 실행하세요.",
        };
      await readCapabilities();
      const runtimeIssue = await runtimePreflight();
      if (runtimeIssue)
        return {
          installed: true,
          ...auth,
          version,
          generationReady: false,
          message: `ChatGPT 로그인은 확인됐지만 실행 준비가 되지 않았습니다. ${runtimeIssue.message}`,
        };
      return {
        installed: true,
        ...auth,
        version,
        message:
          "ChatGPT 로그인 확인. 생성 시 구독의 Codex 사용량과 이용 한도가 적용됩니다.",
      };
    } catch (error) {
      return {
        installed: true,
        authenticated: false,
        authMode: "unknown",
        version,
        message:
          error instanceof BridgeError
            ? error.message
            : "Codex 로그인 상태를 확인하지 못했습니다.",
      };
    }
  };

  return {
    status,
    async run(request, { signal, onProgress }) {
      const connection = await status();
      if (!connection.authenticated || connection.authMode !== "chatgpt")
        throw new BridgeError(connection.message, "auth_required");
      if (connection.generationReady === false)
        throw new BridgeError(connection.message, "runtime_unavailable");
      if (signal.aborted)
        throw new BridgeError("작업이 취소되었습니다.", "cancelled");
      const { help, features } = await readCapabilities();
      const prompt = buildPrompt(request);
      if (Buffer.byteLength(prompt) > 1_500_000)
        throw new BridgeError(
          "입력 자료가 너무 큽니다. 필요한 원문 범위로 줄여 다시 생성하세요.",
          "input_limit",
        );
      const workdir = await mkdtemp(path.join(tmpdir(), "ax-agent-"));
      let usage: RunResult["usage"];
      let streamFailed = false;
      const eventErrors: string[] = [];
      try {
        const schemaPath = path.join(workdir, "output-schema.json");
        const outputPath = path.join(workdir, "result.json");
        await writeFile(
          schemaPath,
          JSON.stringify(
            zodToJsonSchema(artifactSchema, {
              target: "openAi",
              $refStrategy: "none",
            }),
          ),
          { mode: 0o600 },
        );
        const args = [
          "-a",
          "never",
          "exec",
          "--ignore-user-config",
          "--ephemeral",
          "--skip-git-repo-check",
          "--sandbox",
          "read-only",
          "--json",
          "--color",
          "never",
          "--cd",
          workdir,
          "--output-schema",
          schemaPath,
          "--output-last-message",
          outputPath,
          "-c",
          'model_provider="openai"',
          "-c",
          'web_search="disabled"',
          "-c",
          "project_doc_max_bytes=0",
        ];
        if (help.includes("--ignore-rules")) args.push("--ignore-rules");
        for (const feature of DISABLE_FEATURES)
          if (features.has(feature)) args.push("--disable", feature);
        if (features.has("skip_host_skill_discovery"))
          args.push("--enable", "skip_host_skill_discovery");
        args.push("-");
        onProgress("ChatGPT 구독으로 산출물 작성 중");
        const response = await execute(args, {
          cwd: workdir,
          input: prompt,
          signal,
          timeoutMs: 300_000,
          maxBytes: 8 * 1024 * 1024,
          onLine: (line) => {
            try {
              const event = JSON.parse(line);
              if (event.type === "turn.failed" || event.type === "error") {
                streamFailed = true;
                const message = event.message ?? event.error?.message;
                if (typeof message === "string" && eventErrors.length < 16)
                  eventErrors.push(message.slice(0, 4096));
              }
              if (event.type === "turn.completed" && event.usage) {
                const { input_tokens, output_tokens } = event.usage;
                if (
                  Number.isFinite(input_tokens) &&
                  Number.isFinite(output_tokens)
                )
                  usage = {
                    inputTokens: input_tokens,
                    outputTokens: output_tokens,
                  };
              }
              if (
                event.type === "item.completed" &&
                event.item?.type === "agent_message"
              )
                onProgress("결과 형식과 근거 연결 확인 중");
            } catch {
              /* Non-JSON warnings must never be forwarded to the browser. */
            }
          },
        });
        if (signal.aborted)
          throw new BridgeError("작업이 취소되었습니다.", "cancelled");
        if (response.code !== 0 || streamFailed)
          throw classifyCodexFailure(response.stderr, eventErrors);
        const resultStat = await stat(outputPath).catch(() => null);
        if (!resultStat || resultStat.size > 2 * 1024 * 1024)
          throw new BridgeError(
            "생성된 JSON 결과가 없거나 용량 제한을 초과했습니다.",
            "invalid_output",
          );
        let value: unknown;
        try {
          value = JSON.parse(await readFile(outputPath, "utf8"));
        } catch {
          throw new BridgeError(
            "생성 결과를 JSON으로 읽지 못했습니다.",
            "invalid_output",
          );
        }
        return { result: validateArtifacts(value, request), usage };
      } finally {
        await rm(workdir, { recursive: true, force: true });
      }
    },
  };
}
