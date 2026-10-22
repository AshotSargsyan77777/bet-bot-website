import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../../api/client";
import { useT } from "../../i18n";

const MAX_MB = 5;

export function AnalysisBuyBox({ id, price, cardNumber, onDone }: { id: number; price: number; cardNumber: string; onDone: () => void }) {
  const { t } = useT();
  const [file, setFile] = useState<File | null>(null);
  const [err, setErr] = useState("");
  const buy = useMutation({
    mutationFn: () => {
      const fd = new FormData();
      fd.append("receipt", file as File);
      return api(`/api/analysis/${id}/buy/`, { method: "POST", body: fd });
    },
    onSuccess: onDone,
    onError: (e: Error) => setErr(e.message),
  });
  return (
    <div style={{ marginTop: "0.75rem" }}>
      <p className="muted">{t("an.buyHint", { price: price.toLocaleString() })}</p>
      {cardNumber && (
        <p>
          {t("common.card")}: <code className="check-preview" style={{ display: "inline", padding: "0.2rem 0.5rem" }}>{cardNumber}</code>
        </p>
      )}
      <div className="field">
        <span className="field__label">{t("common.receipt", { mb: MAX_MB })}</span>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          onChange={(e) => {
            const f = e.target.files?.[0] || null;
            setErr(f && f.size > MAX_MB * 1024 * 1024 ? t("common.tooBig", { mb: MAX_MB }) : "");
            setFile(f);
          }}
        />
      </div>
      {err && <p className="field__error">{err}</p>}
      <button type="button" disabled={!file || buy.isPending || !!err} onClick={() => buy.mutate()}>
        {buy.isPending ? t("common.sending") : t("comb.sendForApproval")}
      </button>
    </div>
  );
}
