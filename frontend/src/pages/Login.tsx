import { useCallback, useState } from "react";
import { PasswordInput } from "../components/PasswordInput";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { ApiError } from "../api/client";
import { TelegramLoginButton, type TelegramUser } from "../components/TelegramLoginButton";
import { useAuth } from "../context/AuthContext";
import { LangSwitcher, useT } from "../i18n";

export function Login() {
  const { user, login, register, loginWithTelegram } = useAuth();
  const { t } = useT();
  const nav = useNavigate();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);

  const onTelegram = useCallback(
    async (tg: TelegramUser) => {
      setError("");
      try {
        await loginWithTelegram(tg);
        nav("/checks");
      } catch (err) {
        setError(err instanceof Error ? err.message : t("login.telegramFailed"));
      }
    },
    [loginWithTelegram, nav, t]
  );

  if (user) return <Navigate to="/checks" replace />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setFieldErrors({});
    setBusy(true);
    try {
      if (mode === "login") await login(username, password);
      else await register(username, email, password);
      nav("/checks");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) setError(t("login.wrong"));
      else setError(err instanceof Error ? err.message : t("common.error"));
      if (err instanceof ApiError && err.fields) setFieldErrors(err.fields);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card animate-fade-in">
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <LangSwitcher />
        </div>
        <h2 className="gradient-text">{mode === "login" ? t("login.titleLogin") : t("login.titleRegister")}</h2>
        <form onSubmit={submit}>
          <div className="field">
            <span className="field__label">{mode === "login" ? t("login.username") : t("login.usernameRegister")}</span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoComplete="username"
              placeholder={t("login.usernamePh")}
            />
            {fieldErrors.username && <span className="field__error">{fieldErrors.username[0]}</span>}
          </div>
          {mode === "register" && (
            <div className="field">
              <span className="field__label">Email</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
                placeholder="example@gmail.com"
              />
              {fieldErrors.email && <span className="field__error">{fieldErrors.email[0]}</span>}
            </div>
          )}
          <label>
            {t("login.password")}
            <PasswordInput value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={mode === "register" ? 8 : undefined}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
            />
          </label>
          {mode === "login" && (
            <p style={{ textAlign: "right", marginTop: "0.5rem" }}>
              <Link to="/forgot-password" className="muted" style={{ fontSize: "0.85rem" }}>{t("reset.forgot")}</Link>
            </p>
          )}
          {error && <p className="field__error">{error}</p>}
          {mode === "register" && (
            <p className="field__hint">{t("login.passwordHint")}</p>
          )}
          <button type="submit" disabled={busy} style={{ marginTop: "1.25rem", width: "100%" }}>
            {busy ? "…" : mode === "login" ? t("login.submitLogin") : t("login.submitRegister")}
          </button>
        </form>
        <div style={{ marginTop: "1.25rem", textAlign: "center" }}>
          <p className="muted" style={{ marginBottom: "0.5rem" }}>{t("login.or")}</p>
          <TelegramLoginButton onAuth={onTelegram} />
        </div>
        <p style={{ marginTop: "1.25rem", textAlign: "center" }}>
          <button type="button" className="secondary" onClick={() => {
              setMode(mode === "login" ? "register" : "login");
              setError("");
              setFieldErrors({});
            }}>
            {mode === "login" ? t("login.toRegister") : t("login.toLogin")}
          </button>
          {" · "}
          <Link to="/">{t("common.home")}</Link>
        </p>
      </div>
    </div>
  );
}
