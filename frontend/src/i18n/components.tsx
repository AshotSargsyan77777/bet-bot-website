import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { LangContext, translate, useT, type LangCtx } from "./core";
import { getLang, LANGS, storeLang, type Lang } from "./lang";

export function LangProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const [lang, setLangState] = useState<Lang>(getLang());

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback(
    (l: Lang) => {
      storeLang(l);
      setLangState(l);
      qc.invalidateQueries(); // server messages come back in the new language
    },
    [qc]
  );
  const value = useMemo<LangCtx>(() => ({ lang, setLang, t: (key, vars) => translate(key, vars, lang) }), [lang, setLang]);
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function LangSwitcher() {
  const { lang, setLang, t } = useT();
  return (
    <select
      className="lang-switch"
      aria-label={t("common.language")}
      value={lang}
      onChange={(e) => setLang(e.target.value as Lang)}
    >
      {LANGS.map((l) => (
        <option key={l.code} value={l.code}>{l.label}</option>
      ))}
    </select>
  );
}
