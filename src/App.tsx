import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { lazy, Suspense } from "react";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import { AuthProvider } from "./contexts/AuthContext";

// Pages load on demand so the first screen does not pull in jsPDF, XLSX and Recharts.
const Training = lazy(() => import("./pages/Training"));
const Leagues = lazy(() => import("./pages/Leagues"));
const Statistics = lazy(() => import("./pages/Statistics"));
const History = lazy(() => import("./pages/History"));
const Admin = lazy(() => import("./pages/Admin"));
const Dokumentation = lazy(() => import("./pages/Dokumentation"));
const SchweizSystem = lazy(() => import("./pages/SchweizSystem"));

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner position="top-center" />
      <BrowserRouter>
        <AuthProvider>
          <Suspense fallback={<div className="p-6 text-center text-muted-foreground">Lädt…</div>}>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/training" element={<Training />} />
              <Route path="/leagues" element={<Leagues />} />
              <Route path="/statistiken" element={<Statistics />} />
              <Route path="/history" element={<History />} />
              <Route path="/dokumentation" element={<Dokumentation />} />
              <Route path="/schweizer-system" element={<SchweizSystem />} />
              <Route path="/admin" element={<Admin />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
