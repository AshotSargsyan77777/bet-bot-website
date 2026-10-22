import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { PageHeader } from "../components/PageHeader";
import { useAuth } from "../context/AuthContext";
import { useT } from "../i18n";

export function Promo() {
  const { user } = useAuth();
  const { t } = useT();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [code, setCode] = useState("");

  const redeem = useMutation({
    mutationFn: () => api<{ ok: boolean; package_key: string }>("/api/promo/redeem/", { method: "POST", json: { code } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mine-check"] });
      qc.invalidateQueries({ queryKey: ["status"] });
      nav("/checks");
    },
  });

  if (!user) {
    return (
      <div className="card">
        <PageHeader title={t("promo.title")} subtitle={t("promo.loginNeeded")} />
        <Link to="/login" className="btn">{t("common.login")}</Link>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title={t("promo.title")} subtitle={t("promo.subtitle")} />
      <form
        className="card card--glass"
        style={{ maxWidth: 420 }}
        onSubmit={(e) => {
          e.preventDefault();
          if (code.trim()) redeem.mutate();
        }}
      >
        <label>
          {t("promo.code")}
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="ABCDE"
            maxLength={16}
            required
            autoComplete="off"
          />
        </label>
        <button type="submit" style={{ marginTop: "1rem" }} disabled={redeem.isPending || !code.trim()}>
          {redeem.isPending ? t("promo.checking") : t("promo.activate")}
        </button>
        {redeem.isError && <p className="field__error" style={{ marginTop: "1rem" }}>{redeem.error.message}</p>}
      </form>
    </div>
  );
}
