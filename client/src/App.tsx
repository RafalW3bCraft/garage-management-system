import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/ThemeProvider";
import { Navigation } from "@/components/Navigation";
import Home from "@/pages/Home";
import Services from "@/pages/Services";
import ServiceDetail from "@/pages/ServiceDetail";
import Cars from "@/pages/Cars";
import Appointments from "@/pages/Appointments";
import Contact from "@/pages/Contact";
import Profile from "@/pages/Profile";
import AdminDashboard from "@/pages/admin/Dashboard";
import AdminAppointments from "@/pages/admin/Appointments";
import AdminServices from "@/pages/admin/Services";
import AdminLocations from "@/pages/admin/Locations";
import AdminCars from "@/pages/admin/Cars";
import AdminUsers from "@/pages/admin/Users";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navigation />
      <main className="flex-1">
        <Switch>
          <Route path="/" component={Home} />
          <Route path="/services" component={Services} />
          <Route path="/services/:id" component={ServiceDetail} />
          <Route path="/cars" component={Cars} />
          <Route path="/appointments" component={Appointments} />
          <Route path="/contact" component={Contact} />
          <Route path="/profile" component={Profile} />
          <Route path="/admin" component={AdminDashboard} />
          <Route path="/admin/appointments" component={AdminAppointments} />
          <Route path="/admin/services" component={AdminServices} />
          <Route path="/admin/locations" component={AdminLocations} />
          <Route path="/admin/cars" component={AdminCars} />
          <Route path="/admin/users" component={AdminUsers} />
          <Route component={NotFound} />
        </Switch>
      </main>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ThemeProvider defaultTheme="light" storageKey="ronak-garage-theme">
          <Router />
          <Toaster />
        </ThemeProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
