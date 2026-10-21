import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function Login() {
  const { login, register } = useAuth();
  const nav = useNavigate();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      if (mode === "login") await login(username, password);
      else await register(username, email, password);
      nav("/checks");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Սխալ");
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card animate-fade-in">
        <h2 className="gradient-text">{mode === "login" ? "Մուտք Goalking" : "Գրանցում"}</h2>
        <form onSubmit={submit}>
          <div className="field">
            <span className="field__label">Օգտանուն (ոչ email)</span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoComplete="username"
              placeholder="օր. Ashot Sargsyan "
            />
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
            </div>
          )}
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete={mode === "login" ? "current-password" : "new-password"}
            />
          </label>
          {error && <p className="field__error">{error}</p>}
          {mode === "register" && (
            <p className="field__hint">
              Պահանջվում է աշխատող Django API (պորտ 8000). Root-ից՝ npm run dev:all
            </p>
          )}
          <button type="submit" style={{ marginTop: "1.25rem", width: "100%" }}>
            {mode === "login" ? "Մուտք" : "Գրանցվել"}
          </button>
        </form>
        <p style={{ marginTop: "1.25rem", textAlign: "center" }}>
          <button type="button" className="secondary" onClick={() => setMode(mode === "login" ? "register" : "login")}>
            {mode === "login" ? "Գրանցում" : "Մուտք"}
          </button>
          {" · "}
          <Link to="/">Գլխավոր</Link>
        </p>
      </div>
    </div>
  );
}
