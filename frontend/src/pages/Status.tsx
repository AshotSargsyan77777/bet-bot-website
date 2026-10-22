import { useMutation, useQuery } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import { api, type Paginated } from "../api/client";
import { PageHeader } from "../components/PageHeader";
import { TelegramLoginButton, type TelegramUser } from "../components/TelegramLoginButton";
import { CheckPreview } from "../components/stats/CheckPreview";
import { useAuth } from "../context/AuthContext";
import type { MyCheck } from "../types/catalog";
import { paymentStatusLabel } from "../utils/packageMeta";

type PaymentRow = { id: number; status: string; package_key: string; package_label: string; created_at: string };
type StatusPayload = {
  has_active_check: boolean;
  package?: { label: string } | null;
  valid_date?: string | null;
  is_vip: boolean;
  pending_payment: PaymentRow | null;
};

function ProfileCard() {
  const { user, refreshMe } = useAuth();
  const [email, setEmail] = useState(user?.email ?? "");
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [msg, setMsg] = useState("");

  const saveEmail = useMutation({
    mutationFn: () => api("/api/me/", { method: "PATCH", json: { email } }),
    onSuccess: async () => {
      setMsg("✅ Email-ը թարմացվեց");
      await refreshMe();
    },
  });
  const changePassword = useMutation({
    mutationFn: () =>
      api("/api/auth/password/", { method: "POST", json: { current_password: current, new_password: next } }),
    onSuccess: async () => {
      setCurrent("");
      setNext("");
      setMsg("✅ Գաղտնաբառը պահպանվեց");
      await refreshMe();
    },
  });

  return (
    <div className="card card--interactive">
      <h3>Պրոֆիլ</h3>
      <p className="muted">{user?.username}</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setMsg("");
          saveEmail.mutate();
        }}
      >
        <div className="field">
          <span className="field__label">Email</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        </div>
        {saveEmail.isError && <p className="field__error">{saveEmail.error.message}</p>}
        <button type="submit" className="secondary" disabled={saveEmail.isPending || email === user?.email}>
          Պահպանել email-ը
        </button>
      </form>
      <form
        style={{ marginTop: "1.25rem" }}
        onSubmit={(e) => {
          e.preventDefault();
          setMsg("");
          changePassword.mutate();
        }}
      >
        {user?.has_password ? (
          <div className="field">
            <span className="field__label">Ընթացիկ գաղտնաբառ</span>
            <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} required autoComplete="current-password" />
          </div>
        ) : (
          <p className="field__hint">Դուք մուտք եք գործել Telegram-ով. սահմանեք գաղտնաբառ՝ օգտանունով մուտքի համար։</p>
        )}
        <div className="field">
          <span className="field__label">Նոր գաղտնաբառ (min 8)</span>
          <input type="password" value={next} onChange={(e) => setNext(e.target.value)} required minLength={8} autoComplete="new-password" />
        </div>
        {changePassword.isError && <p className="field__error">{changePassword.error.message}</p>}
        <button type="submit" className="secondary" disabled={changePassword.isPending}>
          {user?.has_password ? "Փոխել գաղտնաբառը" : "Սահմանել գաղտնաբառ"}
        </button>
      </form>
      {msg && <p style={{ marginTop: "0.75rem" }}>{msg}</p>}
    </div>
  );
}

function TelegramCard() {
  const { user, refreshMe } = useAuth();
  const tg = user?.telegram;
  const link = useMutation({
    mutationFn: (data: TelegramUser) => api("/api/me/telegram/", { method: "POST", json: data }),
    onSuccess: () => refreshMe(),
  });
  const toggle = useMutation({
    mutationFn: (notifications: boolean) => api("/api/me/telegram/", { method: "PATCH", json: { notifications } }),
    onSuccess: () => refreshMe(),
  });
  const unlink = useMutation({
    mutationFn: () => api("/api/me/telegram/", { method: "DELETE" }),
    onSuccess: () => refreshMe(),
  });
  const onAuth = useCallback((data: TelegramUser) => link.mutate(data), [link]);
  const error = link.error ?? toggle.error ?? unlink.error;

  return (
    <div className="card card--interactive">
      <h3>✈️ Telegram</h3>
      {tg ? (
        <>
          <p>Կապված է՝ <strong>{tg.username ? `@${tg.username}` : tg.first_name}</strong></p>
          <label style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <input
              type="checkbox"
              checked={tg.notifications}
              disabled={toggle.isPending}
              onChange={(e) => toggle.mutate(e.target.checked)}
              style={{ width: "auto" }}
            />
            Ծանուցումներ Telegram-ով (վճարում, պատասխաններ, օրվա չեկեր)
          </label>
          <button type="button" className="secondary" style={{ marginTop: "0.75rem" }} disabled={unlink.isPending} onClick={() => unlink.mutate()}>
            Անջատել Telegram-ը
          </button>
        </>
      ) : (
        <>
          <p className="muted">Կապեք Telegram-ը՝ վճարման հաստատման, support-ի պատասխանների և օրվա չեկերի մասին ծանուցումներ ստանալու համար։</p>
          <TelegramLoginButton onAuth={onAuth} />
        </>
      )}
      {error && <p className="field__error">{error.message}</p>}
    </div>
  );
}

export function Status() {
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const status = useQuery({
    queryKey: ["status"],
    queryFn: () => api<StatusPayload>("/api/status/"),
    enabled: !!user,
  });
  const mine = useQuery({
    queryKey: ["mine-check"],
    queryFn: () => api<MyCheck>("/api/checks/mine/"),
    enabled: !!user,
  });
  const payments = useQuery({
    queryKey: ["payments", page],
    queryFn: () => api<Paginated<PaymentRow>>(`/api/payments/?page=${page}&page_size=10`),
    enabled: !!user,
  });

  if (!user) {
    return (
      <div className="card">
        <PageHeader title="👤 Կարգավիճակ" subtitle="Մուտք գործեք հաշիվ դիտելու համար" />
        <Link to="/login" className="btn">Մուտք</Link>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="👤 Կարգավիճակ" />
      <div className="grid">
        <div className="card card--interactive">
          {status.isLoading && <div className="loading-shimmer" />}
          {status.isError && <p className="field__error">{status.error.message}</p>}
          {status.data &&
            (status.data.has_active_check ? (
              <p>✅ Ակտիվ չեկ: <strong>{status.data.package?.label}</strong>{status.data.valid_date ? ` (${status.data.valid_date})` : ""}</p>
            ) : (
              <p>❌ Ակտիվ չեկ չունես — <Link to="/checks">ընտրել փաթեթ</Link></p>
            ))}
          {status.data?.pending_payment && (
            <p>⏳ Վճարումը ({status.data.pending_payment.package_label}) սպասում է ադմինի հաստատման</p>
          )}
          {status.data?.is_vip && <p>👑 VIP Կանալ: Ակտիվ է — <Link to="/vip">հղում</Link></p>}
        </div>
        <div className="card card--interactive">
          <h3>Վճարումներ</h3>
          {payments.isError && <p className="field__error">{payments.error.message}</p>}
          <ul className="match-list">
            {(payments.data?.results || []).map((p) => (
              <li key={p.id}>
                {p.package_label} · {new Date(p.created_at).toLocaleDateString()} —{" "}
                <span className="gradient-text">{paymentStatusLabel[p.status] ?? p.status}</span>
              </li>
            ))}
            {payments.data && !payments.data.results.length && <li className="muted">Դեռ վճարումներ չկան</li>}
          </ul>
          {payments.data && payments.data.total_pages > 1 && (
            <div className="filters-toolbar">
              <button type="button" className="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>←</button>
              <span className="filters-count">{page} / {payments.data.total_pages}</span>
              <button type="button" className="secondary" disabled={page >= payments.data.total_pages} onClick={() => setPage((p) => p + 1)}>→</button>
            </div>
          )}
        </div>
        <ProfileCard />
        <TelegramCard />
      </div>
      {mine.data?.active && mine.data.text && (
        <div className="card">
          <h3>Ձեր չեկը</h3>
          <CheckPreview text={mine.data.text} />
        </div>
      )}
    </div>
  );
}
