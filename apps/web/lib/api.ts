const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    public retryAfterSeconds?: number,
  ) {
    super(code);
  }
}

export async function api<T>(path: string, init: RequestInit & { token?: string | null } = {}): Promise<T> {
  const { token, ...rest } = init;
  const headers = new Headers(rest.headers);
  if (rest.body) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { ...rest, headers, cache: "no-store", credentials: "omit" });
  } catch {
    throw new ApiError(0, "network");
  }
  const body = (await res.json().catch(() => ({}))) as {
    error?: string;
    retryAfterSeconds?: number;
  };
  if (!res.ok) {
    const retry = body.retryAfterSeconds ?? Number(res.headers.get("Retry-After")) ?? undefined;
    throw new ApiError(res.status, body.error ?? "error", retry || undefined);
  }
  return body as T;
}
