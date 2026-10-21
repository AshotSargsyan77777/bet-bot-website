import { useState } from "react";
import { api } from "../api/client";
import { PageHeader } from "../components/PageHeader";
import { useAuth } from "../context/AuthContext";

export function Help() {
  const { user } = useAuth();
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);

  if (!user) {
    return (
      <div className="card">
        <PageHeader title="🆘 Օգնություն" />
        <a href="/login">Մուտք</a>
      </div>
    );
  }

  const send = async () => {
    await api("/api/support/", { method: "POST", json: { message } });
    setSent(true);
  };

  return (
    <div>
      <PageHeader title="🆘 Օգնություն" subtitle="Հարցը հասնում է ադմինին" />
      <div className="card card--glass" style={{ maxWidth: 560 }}>
        {sent ? (
          <p>✅ Ուղարկվեց</p>
        ) : (
          <>
            <label>
              Հարց
              <textarea rows={5} value={message} onChange={(e) => setMessage(e.target.value)} />
            </label>
            <button type="button" style={{ marginTop: "1rem" }} onClick={send}>Ուղարկել</button>
          </>
        )}
      </div>
    </div>
  );
}
