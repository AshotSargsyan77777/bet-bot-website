import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { useT } from "../../i18n";

/** Checks the Brevo email setup used for password reset: sends a test email and shows Brevo's answer. */
export function EmailTestPanel() {
  const { t } = useT();
  const { user } = useAuth();
  const [to, setTo] = useState(user?.email ?? "");
  const send = useMutation({
    mutationFn: () => api<{ ok: boolean; to: string }>("/api/admin/test-email/", { method: "POST", json: { to } }),
  });
  return (
    <div className="card">
      <h3>{t("admin.emailTitle")}</h3>
      <p className="muted">{t("admin.emailHint")}</p>
      <form
        className="filters-toolbar"
        onSubmit={(e) => {
          e.preventDefault();
          send.mutate();
        }}
      >
        <input type="email" value={to} onChange={(e) => setTo(e.target.value)} required style={{ maxWidth: 320 }} />
        <button type="submit" disabled={send.isPending}>{send.isPending ? t("common.sending") : t("admin.emailSend")}</button>
      </form>
      {send.isSuccess && <p>{t("admin.emailOk", { to: send.data.to })}</p>}
      {send.isError && <p className="field__error">❌ {send.error.message}</p>}
    </div>
  );
}
