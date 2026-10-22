/** Current UI language, readable outside React (the API client sends it as Accept-Language). */
export type Lang = "hy" | "en" | "ru";
export const LANGS: { code: Lang; label: string }[] = [
  { code: "hy", label: "ՀԱՅ" },
  { code: "en", label: "ENG" },
  { code: "ru", label: "РУС" },
];
const STORAGE_KEY = "lang";

function detect(): Lang {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === "hy" || saved === "en" || saved === "ru") return saved;
  } catch {
    // storage unavailable (private mode): fall through to the default
  }
  return "hy";
}

let current: Lang = detect();

export function getLang(): Lang {
  return current;
}

export function storeLang(lang: Lang) {
  current = lang;
  try {
    window.localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // not persisted; the choice still applies until reload
  }
}
