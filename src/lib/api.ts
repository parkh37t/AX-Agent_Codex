import type {
  ConnectionStatus,
  GenerateRequest,
  Job,
} from "../../shared/domain";
let sessionToken = "";
async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.method && options.method !== "GET"
        ? { "X-AX-Session": sessionToken }
        : {}),
      ...options.headers,
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(
      typeof body.error === "string"
        ? body.error
        : "요청을 처리하지 못했습니다. 로컬 연결을 확인해 주세요.",
    );
  return body as T;
}
async function session() {
  if (!sessionToken)
    sessionToken = (await request<{ token: string }>("/api/session")).token;
}
export const api = {
  status: () => request<ConnectionStatus>("/api/status"),
  async generate(data: GenerateRequest) {
    await session();
    return request<{ id: string }>("/api/jobs", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
  job: (id: string) => request<Job>(`/api/jobs/${encodeURIComponent(id)}`),
  async cancel(id: string) {
    await session();
    return request(`/api/jobs/${encodeURIComponent(id)}/cancel`, {
      method: "POST",
      body: "{}",
    });
  },
  async extract(file: File) {
    if (file.size > 15 * 1024 * 1024)
      throw new Error("파일당 15MB 이하로 나눠 주세요.");
    const base64 = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(",")[1]);
      r.onerror = () => reject(new Error("파일을 읽지 못했습니다."));
      r.readAsDataURL(file);
    });
    await session();
    return request<{
      name: string;
      text: string;
      pageCount: number | null;
      warnings: string[];
    }>("/api/documents", {
      method: "POST",
      body: JSON.stringify({ name: file.name, dataBase64: base64 }),
    });
  },
};
