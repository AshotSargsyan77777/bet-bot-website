const API_BASE = import.meta.env.VITE_API_URL || "";

/** Receipt/media paths from Django — use relative URL for Vite proxy. */
export function mediaUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE}${p}`;
}
