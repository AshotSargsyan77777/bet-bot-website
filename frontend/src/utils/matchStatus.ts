import type { Key } from "../i18n";

/** API-Football status codes (NS, 1H, HT, FT…) grouped into what people understand. */
const GROUPS: [Key, string[]][] = [
  ["st.upcoming", ["NS", "TBD"]],
  ["st.halftime", ["HT"]],
  ["st.live", ["1H", "2H", "ET", "BT", "P", "LIVE"]],
  ["st.finished", ["FT", "AET", "PEN", "AWD", "WO"]],
  ["st.postponed", ["PST"]],
  ["st.cancelled", ["CANC"]],
  ["st.interrupted", ["SUSP", "INT", "ABD"]],
];

export function statusKey(code: string | null | undefined): Key | null {
  for (const [key, codes] of GROUPS) if (code && codes.includes(code)) return key;
  return null;
}

export const isUpcoming = (code: string | null | undefined) => !code || code === "NS" || code === "TBD";

export function kickoffTime(iso: string | null | undefined): string {
  return iso ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false }) : "—";
}
