import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/ThemeProvider";
import { DialogProvider, AuthPreferencesProvider } from "@/contexts";
import { Navigation } from "@/components/Navigation";
import ErrorBoundary from "@/components/ErrorBoundary";
import { lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";

/**
 * Bundle Optimization Strategy:
 * - All pages are lazy loaded for automatic code splitting
 * - Admin pages are in separate chunks (only loaded when accessed)
 * - Vite automatically performs tree shaking in production builds
 * - Dynamic imports create separate bundle chunks per route
 * - This reduces initial bundle size and improves load times
 */

// Lazy load page components for better code splitting
const Home = lazy(() => import("@/pages/Home"));
const Services = lazy(() => import("@/pages/Services"));
const ServiceDetail = lazy(() => import("@/pages/ServiceDetail"));
const Cars = lazy(() => import("@/pages/Cars"));
const CarDetail = lazy(() => import("@/pages/CarDetail"));
const Appointments = lazy(() => import("@/pages/Appointments"));
const Contact = lazy(() => import("@/pages/Contact"));
const Profile = lazy(() => import("@/pages/Profile"));
const VerifyEmail = lazy(() => import("@/pages/VerifyEmail"));

// Admin pages - separate chunk
const AdminDashboard = lazy(() => import("@/pages/admin/Dashboard"));
const AdminAppointments = lazy(() => import("@/pages/admin/Appointments"));
const AdminServices = lazy(() => import("@/pages/admin/Services"));
const AdminLocations = lazy(() => import("@/pages/admin/Locations"));
const AdminCars = lazy(() => import("@/pages/admin/Cars"));
const AdminUsers = lazy(() => import("@/pages/admin/Users"));

const NotFound = lazy(() => import("@/pages/not-found"));

function Router() {
  return (
    <div className="min-h-screen flex flex-col">
      <a href="#main-content" className="sr-only" data-testid="link-skip-to-content">
        Skip to main content
      </a>
      <Navigation />
      <main className="flex-1" id="main-content" role="main" aria-label="Main content">
        <Suspense fallback={
          <div className="flex items-center justify-center min-h-[200px] gap-2" role="status" aria-live="polite">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">Loading page...</p>
          </div>
        }>
          <Switch>
            <Route path="/" component={Home} />
            <Route path="/services" component={Services} />
            <Route path="/services/:id" component={ServiceDetail} />
            <Route path="/cars" component={Cars} />
            <Route path="/cars/:id" component={CarDetail} />
            <Route path="/appointments" component={Appointments} />
            <Route path="/contact" component={Contact} />
            <Route path="/profile" component={Profile} />
            <Route path="/verify-email" component={VerifyEmail} />
            <Route path="/admin" component={AdminDashboard} />
            <Route path="/admin/appointments" component={AdminAppointments} />
            <Route path="/admin/services" component={AdminServices} />
            <Route path="/admin/locations" component={AdminLocations} />
            <Route path="/admin/cars" component={AdminCars} />
            <Route path="/admin/users" component={AdminUsers} />
            <Route component={NotFound} />
          </Switch>
        </Suspense>
      </main>
    </div>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <ThemeProvider defaultTheme="light" storageKey="ronak-garage-theme">
            <AuthPreferencesProvider>
              <DialogProvider>
                <Router />
                <Toaster />
              </DialogProvider>
            </AuthPreferencesProvider>
          </ThemeProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
