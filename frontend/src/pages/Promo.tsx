import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { PageHeader } from "../components/PageHeader";
import { useAuth } from "../context/AuthContext";

export function Promo() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState("");

  if (!user) {
    return (
      <div className="card">
        <PageHeader title="🎁 Պրոմոկոդ" />
        <a href="/login">Մուտք</a>
      </div>
    );
  }

  const redeem = async () => {
    setMsg("");
    try {
      const r = await api<{ ok: boolean; message?: string }>("/api/promo/redeem/", {
        method: "POST",
        json: { code },
      });
      if (r.ok) {
        setMsg("🎉 Պրոմոկոդը ակտիվացվեց!");
        nav("/checks");
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Սխալ");
    }
  };

  return (
    <div>
      <PageHeader title="🎁 Պրոմոկոդ" subtitle="Մեկ օգտագործման 5-նիշ կոդ → պրոմո չեկ մինչև x5" />
      <div className="card card--glass" style={{ maxWidth: 420 }}>
        <label>
          Կոդ
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="ABCDE" />
        </label>
        <button type="button" style={{ marginTop: "1rem" }} onClick={redeem}>Ակտիվացնել</button>
        {msg && <p style={{ marginTop: "1rem" }}>{msg}</p>}
      </div>
    </div>
  );
}
