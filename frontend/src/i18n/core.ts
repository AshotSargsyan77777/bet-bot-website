import { createContext, useCallback, useContext } from "react";
import { en } from "./en";
import { hy, type Key } from "./hy";
import { getLang, type Lang } from "./lang";
import { ru } from "./ru";

const DICTS: Record<Lang, Record<Key, string>> = { hy, en, ru };
export type Vars = Record<string, string | number>;

/** Translation outside React components (e.g. the API client). */
export function translate(key: Key, vars?: Vars, lang: Lang = getLang()): string {
  let text: string = DICTS[lang][key] ?? hy[key];
  if (vars) for (const [k, v] of Object.entries(vars)) text = text.split(`{${k}}`).join(String(v));
  return text;
}

export type LangCtx = { lang: Lang; setLang: (l: Lang) => void; t: (key: Key, vars?: Vars) => string };
export const LangContext = createContext<LangCtx | null>(null);

export function useT(): LangCtx {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error("useT must be used inside LangProvider");
  return ctx;
}

/** Package / combinator tier name in the current language (falls back to the server's label). */
export function usePkgLabel() {
  const { t } = useT();
  return useCallback(
    (key: string, fallback = ""): string => {
      if (key.startsWith("combo_")) return t("pkg.combo", { x: key.replace("combo_", "") });
      const k = `pkg.${key}` as Key;
      if (k in hy) return t(k);
      return fallback || key; // league package names (Champions / Europa) are the same in every language
    },
    [t]
  );
}
