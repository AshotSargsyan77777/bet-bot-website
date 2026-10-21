/** Formatted check text for users — never raw JSON. */
export function CheckPreview({ text, className }: { text: string; className?: string }) {
  return <pre className={`check-preview ${className ?? ""}`}>{text}</pre>;
}
