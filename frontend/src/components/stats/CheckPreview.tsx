import { translateCheck, useT } from "../../i18n";

/** Formatted check text for users — never raw JSON. Shown in the selected language. */
export function CheckPreview({ text, className }: { text: string; className?: string }) {
  const { lang } = useT();
  return <pre className={`check-preview ${className ?? ""}`}>{translateCheck(text, lang)}</pre>;
}
