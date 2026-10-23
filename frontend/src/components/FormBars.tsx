import type { FormSlice } from "../types/game";
import { useT } from "../i18n";

export function FormBars({ form, label }: { form?: FormSlice | null; label: string }) {
  const { t } = useT();
  if (!form) return <span className="muted">—</span>;
  return (
    <div className="form-bars">
      <span className="form-bars__label">{label}</span>
      <div className="form-bars__track">
        <div className="form-bars__fill form-bars__fill--win" style={{ width: `${form.win_pct}%` }} />
      </div>
      <span className="form-bars__stat">{t("games.formStat", { w: form.win_pct, g: form.avg_goals_for })}</span>
    </div>
  );
}
