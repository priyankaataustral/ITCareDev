export const API_BASE: string = process.env.NEXT_PUBLIC_API_BASE ?? "";

export function getToken(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("authToken") || "";
}

async function handle<T>(res: Response): Promise<T> {
  const contentType = res.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");

  if (res.status === 401) {
    // Only redirect to login if we're not already there (prevents double redirect)
    if (typeof window !== "undefined" && !window.location.pathname.includes('/login')) {
      window.location.href = "/login";
    }
    throw new Error("Unauthorized");
  }

  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    try {
      const body = isJson ? ((await res.json()) as unknown) : ((await res.text()) as unknown);
      if (typeof body === "object" && body !== null && "error" in (body as Record<string, unknown>)) {
        message = String((body as Record<string, unknown>)["error"]);
      } else if (typeof body === "string" && body.trim()) {
        message = body;
      }
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }

  if (res.status === 204) return undefined as unknown as T;
  const payload = isJson ? ((await res.json()) as unknown) : ((await res.text()) as unknown);
  return payload as T;
}

function withAuthHeaders(extra?: HeadersInit): Headers {
  const h = new Headers(extra);
  if (!h.has("Accept")) h.set("Accept", "application/json");
  if (!h.has("X-Requested-With")) h.set("X-Requested-With", "fetch");
  const authToken = getToken();
  if (authToken && !h.has("Authorization")) h.set("Authorization", `Bearer ${authToken}`);
  return h;
}

export async function apiGet<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "GET",
    credentials: "include",
    ...(init || {}),
    headers: withAuthHeaders(init?.headers),
  } as RequestInit);
  return handle<T>(res);
}

export async function apiPost<T>(path: string, body?: unknown, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    credentials: "include",
    body: body !== undefined ? JSON.stringify(body) : undefined,
    headers: withAuthHeaders({ "Content-Type": "application/json", ...(init?.headers || {}) }),
    ...(init || {}),
  } as RequestInit);
  return handle<T>(res);
}

export async function apiPatch<T>(path: string, body?: unknown, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "PATCH",
    body: body !== undefined ? JSON.stringify(body) : undefined,
    headers: withAuthHeaders({ "Content-Type": "application/json", ...(init?.headers || {}) }),
    ...(init || {}),
  } as RequestInit);
  return handle<T>(res);
}
