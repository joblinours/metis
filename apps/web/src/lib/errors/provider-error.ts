export type ErrorProvider =
  | "google"
  | "microsoft"
  | "zoho"
  | "s3"
  | "webdav"
  | "ftp"
  | "sftp"
  | "phishing"
  | "llm";

export class ProviderError extends Error {
  readonly provider: ErrorProvider;
  readonly status: number;
  readonly body: string;

  constructor(provider: ErrorProvider, status: number, body = "", label: string = provider) {
    super(`${label} ${status}${body ? `: ${body.slice(0, 200)}` : ""}`);
    this.name = "ProviderError";
    this.provider = provider;
    this.status = status;
    this.body = body;
  }
}

export function statusOf(err: unknown): number | undefined {
  if (err instanceof ProviderError) return err.status;

  if (typeof err === "object" && err !== null) {
    const e = err as {
      status?: unknown;
      code?: unknown;
      response?: { status?: unknown };
    };
    if (typeof e.status === "number") return e.status;
    if (typeof e.response?.status === "number") return e.response.status;
    if (typeof e.code === "number") return e.code;
  }
  return undefined;
}

export function failureStatus(err: unknown): number {
  const status = statusOf(err);
  const passThrough =
    status !== undefined && status >= 400 && status < 500 && status !== 401 && status !== 407;
  return passThrough ? status : 502;
}
