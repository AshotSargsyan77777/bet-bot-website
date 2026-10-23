import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { LangSwitcher, useT } from "../i18n";

export function ForgotPassword() {
  const { t } = useT();
  const [login, setLogin] = useState("");
  const send = useMutation({
    mutationFn: () => api("/api/auth/password-reset/", { method: "POST", json: { login }, auth: false }),
  });

  return (
    <div className="auth-page">
      <div className="auth-card animate-fade-in">
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <LangSwitcher />
        </div>
        <h2 className="gradient-text">{t("reset.title")}</h2>
        {send.isSuccess ? (
          <>
            <p>{t("reset.sent")}</p>
            <p className="field__hint">{t("reset.noChannel")} <Link to="/help">Support</Link></p>
          </>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (login.trim()) send.mutate();
            }}
          >
            <p className="muted">{t("reset.hint")}</p>
            <div className="field">
              <span className="field__label">{t("reset.login")}</span>
              <input value={login} onChange={(e) => setLogin(e.target.value)} required autoComplete="username" maxLength={254} />
            </div>
            {send.isError && <p className="field__error">{send.error.message}</p>}
            <button type="submit" disabled={send.isPending || !login.trim()} style={{ marginTop: "1.25rem", width: "100%" }}>
              {send.isPending ? t("common.sending") : t("reset.send")}
            </button>
          </form>
        )}
        <p style={{ marginTop: "1.25rem", textAlign: "center" }}>
          <Link to="/login">{t("reset.backToLogin")}</Link>
        </p>
      </div>
    </div>
  );
}
