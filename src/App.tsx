import { QueryClient, QueryClientProvider, QueryCache, MutationCache } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { handleError } from "@/lib/errors";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import Home from "./pages/Home";
import PDV from "./pages/PDV";
import Fiados from "./pages/Fiados";
import Despesas from "./pages/Despesas";
import Admin from "./pages/Admin";
import PedidosOnline from "./pages/PedidosOnline";
import Relatorios from "./pages/Relatorios";
import Cardapio from "./pages/Cardapio";
import Insumos from "./pages/Insumos";
import ListaCompras from "./pages/ListaCompras";
import NotFound from "./pages/NotFound.tsx";
import Acompanhar from "./pages/Acompanhar";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
    mutations: { retry: 0 },
  },
  queryCache: new QueryCache({
    onError: (err) => handleError(err, "Falha ao carregar dados"),
  }),
  mutationCache: new MutationCache({
    onError: (err) => handleError(err, "Falha ao salvar alterações"),
  }),
});

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner position="top-center" />
        <BrowserRouter>
          <AuthProvider>
            <Routes>
              <Route path="/cardapio" element={<Cardapio />} />
              <Route path="/acompanhar/:orderId" element={<Acompanhar />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/" element={<ProtectedRoute><Home /></ProtectedRoute>} />
              <Route path="/pdv" element={<ProtectedRoute><PDV /></ProtectedRoute>} />
              <Route path="/pedidos" element={<ProtectedRoute><PedidosOnline /></ProtectedRoute>} />
              <Route path="/fiado" element={<ProtectedRoute><Fiados /></ProtectedRoute>} />
              <Route path="/despesas" element={<ProtectedRoute><Despesas /></ProtectedRoute>} />
              <Route path="/relatorios" element={<ProtectedRoute><Relatorios /></ProtectedRoute>} />
              <Route path="/admin" element={<ProtectedRoute adminOnly><Admin /></ProtectedRoute>} />
              <Route path="/insumos" element={<ProtectedRoute adminOnly><Insumos /></ProtectedRoute>} />
              <Route path="/lista-compras" element={<ProtectedRoute adminOnly><ListaCompras /></ProtectedRoute>} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
