const API_BASE = import.meta.env.VITE_API_URL || "";

export function getToken(): string | null {
  return localStorage.getItem("access_token");
}

export function setTokens(access: string, refresh?: string) {
  localStorage.setItem("access_token", access);
  if (refresh) localStorage.setItem("refresh_token", refresh);
}

export function clearTokens() {
  localStorage.removeItem("access_token");
  localStorage.removeItem("refresh_token");
}

export async function api<T>(
  path: string,
  options: RequestInit & { json?: unknown } = {}
): Promise<T> {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  let body = options.body;
  if (options.json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.json);
  }
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...options, headers, body });
  } catch {
    throw new Error(
      "Չի հաջողվում միանալ սերվերին. Գործարկեք backend՝ cd backend, ապա python manage.py runserver (պորտ 8000)."
    );
  }
  if (!res.ok) {
    const text = await res.text();
    if (res.status === 502 || res.status === 503 || /bad gateway/i.test(text)) {
      throw new Error(
        "API-ն չի աշխատում (Bad Gateway). Բացեք երկրորդ տերմինալում՝ cd backend && python manage.py runserver"
      );
    }
    let err: Record<string, unknown> = {};
    try {
      err = JSON.parse(text) as Record<string, unknown>;
    } catch {
      throw new Error(text.slice(0, 200) || res.statusText);
    }
    const detail = err.detail;
    if (typeof detail === "string") throw new Error(detail);
    if (Array.isArray(detail)) throw new Error(detail.map(String).join(" "));
    const username = err.username;
    if (Array.isArray(username)) throw new Error(String(username[0]));
    throw new Error(String(err.error || err.message || res.statusText));
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
