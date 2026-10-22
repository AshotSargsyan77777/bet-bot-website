import { translate } from "../i18n";
import { getLang } from "../i18n/lang";

const API_BASE = import.meta.env.VITE_API_URL || "";

const ACCESS_KEY = "access_token";
const REFRESH_KEY = "refresh_token";

export type Paginated<T> = {
  count: number;
  page: number;
  page_size: number;
  total_pages: number;
  results: T[];
};

/** Error thrown for every non-2xx API response; `fields` holds per-field validation messages. */
export class ApiError extends Error {
  status: number;
  code?: string;
  fields?: Record<string, string[]>;

  constructor(message: string, status: number, code?: string, fields?: Record<string, string[]>) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function getToken(): string | null {
  return storage()?.getItem(ACCESS_KEY) ?? null;
}

export function getRefreshToken(): string | null {
  return storage()?.getItem(REFRESH_KEY) ?? null;
}

export function setTokens(access: string, refresh?: string) {
  storage()?.setItem(ACCESS_KEY, access);
  if (refresh) storage()?.setItem(REFRESH_KEY, refresh);
}

export function clearTokens() {
  storage()?.removeItem(ACCESS_KEY);
  storage()?.removeItem(REFRESH_KEY);
}

let refreshing: Promise<boolean> | null = null;

/** Exchanges the refresh token for a new pair; concurrent callers share one request. */
async function refreshAccessToken(): Promise<boolean> {
  const refresh = getRefreshToken();
  if (!refresh) return false;
  if (!refreshing) {
    refreshing = (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/auth/token/refresh/`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh }),
        });
        if (!res.ok) {
          clearTokens();
          return false;
        }
        const data = (await res.json()) as { access: string; refresh?: string };
        setTokens(data.access, data.refresh);
        return true;
      } catch {
        return false;
      } finally {
        refreshing = null;
      }
    })();
  }
  return refreshing;
}

type RequestOptions = RequestInit & { json?: unknown; auth?: boolean };

async function request(path: string, options: RequestOptions = {}, retry = true): Promise<Response> {
  const { json, auth = true, ...init } = options;
  const headers: Record<string, string> = { "Accept-Language": getLang(), ...(init.headers as Record<string, string>) };
  const token = auth ? getToken() : null;
  if (token) headers.Authorization = `Bearer ${token}`;
  let body = init.body;
  if (json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(json);
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...init, headers, body });
  } catch {
    throw new ApiError(translate("api.network"), 0, "network");
  }

  if (res.status === 401 && token && retry && (await refreshAccessToken())) {
    return request(path, options, false);
  }
  if (res.status === 401 && token) {
    clearTokens();
    window.dispatchEvent(new Event("auth:logout"));
  }
  if (!res.ok) throw await toApiError(res);
  return res;
}

async function toApiError(res: Response): Promise<ApiError> {
  if (res.status === 502 || res.status === 504) {
    return new ApiError(translate("api.unavailable"), res.status, "unavailable");
  }
  const text = await res.text();
  try {
    const data = JSON.parse(text) as { error?: string; detail?: string; code?: string; fields?: Record<string, string[]> };
    const message = data.error || data.detail || res.statusText || translate("common.error");
    return new ApiError(String(message), res.status, data.code, data.fields);
  } catch {
    return new ApiError(res.status >= 500 ? translate("api.server") : res.statusText || translate("common.error"), res.status);
  }
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const res = await request(path, options);
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

/** Authenticated binary download (e.g. private receipt images) as an object URL. */
export async function apiBlobUrl(path: string): Promise<string> {
  const res = await request(path);
  return URL.createObjectURL(await res.blob());
}

export function errorMessage(err: unknown, fallback?: string): string {
  return err instanceof Error && err.message ? err.message : fallback ?? translate("common.error");
}
