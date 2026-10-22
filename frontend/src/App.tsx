import { BrowserRouter, Link, Navigate, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { api, ApiError } from "./api/client";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { Layout } from "./components/Layout";
import { PageHeader } from "./components/PageHeader";
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
import { Results } from "./pages/Results";
import "./styles.css";

const qc = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30000,
      // Client errors (4xx) will not fix themselves; only retry network/server failures.
      retry: (count, err) => count < 2 && !(err instanceof ApiError && err.status >= 400 && err.status < 500),
    },
  },
});

function Private({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading-shimmer" />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AdminOnly({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading-shimmer" />;
  if (!user) return <Navigate to="/login" replace />;
  if (!user.is_admin) {
    return (
      <div className="card">
        <PageHeader title="Admin" subtitle="Մուտք միայն ադմինի համար" />
      </div>
    );
  }
  return <>{children}</>;
}

function VipOnly({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  // Fresh VIP status (it changes when an admin approves a VIP payment).
  const vip = useQuery({
    queryKey: ["vip", user?.id],
    queryFn: () => api<{ is_vip: boolean }>("/api/vip/status/"),
    enabled: !!user,
  });
  if (loading || (user && vip.isLoading)) return <div className="loading-shimmer" />;
  if (!user) return <Navigate to="/login" replace />;
  if (!vip.data?.is_vip && !user.is_admin) return <Navigate to="/vip" replace />;
  return <>{children}</>;
}

function NotFound() {
  return (
    <div className="card">
      <PageHeader title="404" subtitle="Էջը չի գտնվել" />
      <Link to="/" className="btn">Գլխավոր</Link>
    </div>
  );
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
              <Route path="results" element={<Results />} />
              <Route path="pay/:packageKey" element={<Private><Pay /></Private>} />
              <Route path="status" element={<Status />} />
              <Route path="promo" element={<Promo />} />
              <Route path="vip" element={<Vip />} />
              <Route path="help" element={<Help />} />
              <Route path="admin" element={<AdminOnly><Admin /></AdminOnly>} />
              <Route path="games" element={<Games />} />
              <Route path="games/:id" element={<GameDetail />} />
              <Route path="combinator" element={<VipOnly><Combinator /></VipOnly>} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
