import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { api } from "./api/client";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { Layout } from "./components/Layout";
import { Home } from "./pages/Home";
import { Login } from "./pages/Login";
import { Checks } from "./pages/Checks";
import { Pay } from "./pages/Pay";
import { Status } from "./pages/Status";
import { Promo } from "./pages/Promo";
import { Vip } from "./pages/Vip";
import { Help } from "./pages/Help";
import { Admin } from "./pages/Admin";
import { Games } from "./pages/Games";
import { GameDetail } from "./pages/GameDetail";
import { Combinator } from "./pages/Combinator";
import "./styles.css";

const qc = new QueryClient();

function Private({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <p>…</p>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function VipOnly({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const vip = useQuery({
    queryKey: ["vip", user?.id],
    queryFn: () => api<{ is_vip: boolean }>("/api/vip/status/"),
    enabled: !!user,
  });
  if (loading || (user && vip.isLoading)) return <p className="muted">…</p>;
  if (!user) return <Navigate to="/login" replace />;
  if (!vip.data?.is_vip) return <Navigate to="/vip" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route element={<Layout />}>
              <Route index element={<Home />} />
              <Route path="checks" element={<Checks />} />
              <Route path="pay/:packageKey" element={<Private><Pay /></Private>} />
              <Route path="status" element={<Status />} />
              <Route path="promo" element={<Promo />} />
              <Route path="vip" element={<Vip />} />
              <Route path="help" element={<Help />} />
              <Route path="admin" element={<Admin />} />
              <Route path="games" element={<Games />} />
              <Route path="games/:id" element={<GameDetail />} />
              <Route path="combinator" element={<VipOnly><Combinator /></VipOnly>} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
