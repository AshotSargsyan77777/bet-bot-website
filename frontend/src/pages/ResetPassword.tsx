import { useMutation } from "@tanstack/react-query";
import { PasswordInput } from "../components/PasswordInput";
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import { LangSwitcher, useT } from "../i18n";

export function ResetPassword() {
  const { t } = useT();
  const [params] = useSearchParams();
  const uid = params.get("uid") ?? "";
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [err, setErr] = useState("");
  const save = useMutation({
    mutationFn: () =>
      api<{ ok: boolean; username: string }>("/api/auth/password-reset/confirm/", {
        method: "POST",
        json: { uid, token, new_password: password },
        auth: false,
      }),
    onError: (e: Error) => setErr(e.message),
  });

  return (
    <div className="auth-page">
      <div className="auth-card animate-fade-in">
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <LangSwitcher />
        </div>
        <h2 className="gradient-text">{t("reset.newTitle")}</h2>
        {!uid || !token ? (
          <p className="field__error">{t("reset.badLink")}</p>
        ) : save.isSuccess ? (
          <>
            <p>{t("reset.done", { username: save.data.username })}</p>
            <Link to="/login" className="btn" style={{ display: "inline-block", marginTop: "1rem" }}>{t("common.login")}</Link>
          </>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setErr("");
              if (password !== repeat) setErr(t("reset.mismatch"));
              else save.mutate();
            }}
          >
            <label>
              {t("status.newPassword")}
              <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete="new-password" />
            </label>
            <label style={{ display: "block", marginTop: "0.75rem" }}>
              {t("reset.repeat")}
              <PasswordInput value={repeat} onChange={(e) => setRepeat(e.target.value)} required minLength={8} autoComplete="new-password" />
            </label>
            <p className="field__hint">{t("login.passwordHint")}</p>
            {err && <p className="field__error">{err}</p>}
            <button type="submit" disabled={save.isPending} style={{ marginTop: "1.25rem", width: "100%" }}>
              {save.isPending ? t("common.sending") : t("reset.save")}
            </button>
          </form>
        )}
        <p style={{ marginTop: "1.25rem", textAlign: "center" }}>
          <Link to="/forgot-password">{t("reset.requestNew")}</Link>
        </p>
      </div>
    </div>
  );
}
