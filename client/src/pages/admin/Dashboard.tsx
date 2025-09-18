import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Users, Car, Calendar, Settings, MapPin, Wrench } from "lucide-react";
import { Link } from "wouter";
import type { Appointment, Service, Location, Car as CarType } from "@shared/schema";

export default function AdminDashboard() {
  const { user, isAuthenticated } = useAuth();

  // Redirect non-admin users
  if (!isAuthenticated || user?.role !== "admin") {
    return (
      <div className="container mx-auto px-4 py-8 text-center">
        <h1 className="text-2xl font-bold text-destructive mb-4">Access Denied</h1>
        <p className="text-muted-foreground mb-4">You need admin privileges to access this page.</p>
        <Link href="/">
          <Button>Return Home</Button>
        </Link>
      </div>
    );
  }

  // Fetch admin statistics with loading/error states
  const { data: appointments = [], isLoading: appointmentsLoading, isError: appointmentsError } = useQuery<Appointment[]>({
    queryKey: ["/api/admin/appointments"],
  });

  const { data: services = [], isLoading: servicesLoading, isError: servicesError } = useQuery<Service[]>({
    queryKey: ["/api/services"],
  });

  const { data: locations = [], isLoading: locationsLoading, isError: locationsError } = useQuery<Location[]>({
    queryKey: ["/api/locations"],
  });

  const { data: cars = [], isLoading: carsLoading, isError: carsError } = useQuery<CarType[]>({
    queryKey: ["/api/cars"],
  });

  const isLoading = appointmentsLoading || servicesLoading || locationsLoading || carsLoading;
  const hasErrors = appointmentsError || servicesError || locationsError || carsError;

  // Calculate statistics
  const stats = {
    totalAppointments: appointments.length,
    pendingAppointments: appointments.filter(a => a.status === "pending").length,
    confirmedAppointments: appointments.filter(a => a.status === "confirmed").length,
    completedAppointments: appointments.filter(a => a.status === "completed").length,
    totalServices: services.length,
    totalLocations: locations.length,
    totalCars: cars.length,
    activeCars: cars.filter(c => !c.isAuction).length, // Non-auction cars are "available"
  };

  const adminActions = [
    {
      title: "Manage Appointments",
      description: "View and update appointment statuses",
      icon: Calendar,
      href: "/admin/appointments",
      count: stats.totalAppointments,
      color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
    },
    {
      title: "Manage Services",
      description: "Add, edit, and organize service offerings",
      icon: Wrench,
      href: "/admin/services",
      count: stats.totalServices,
      color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
    },
    {
      title: "Manage Locations",
      description: "Service center locations and details",
      icon: MapPin,
      href: "/admin/locations",
      count: stats.totalLocations,
      color: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300",
    },
    {
      title: "Manage Cars",
      description: "Car inventory and auction management",
      icon: Car,
      href: "/admin/cars",
      count: stats.totalCars,
      color: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300",
    },
    {
      title: "User Management",
      description: "Manage customer accounts and permissions",
      icon: Users,
      href: "/admin/users",
      count: 0, // Will add user count when API is available
      color: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-300",
    },
  ];

  // Show loading state
  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight mb-2">Admin Dashboard</h1>
          <p className="text-muted-foreground">Loading dashboard data...</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="pb-2">
                <div className="h-4 bg-muted rounded w-3/4"></div>
              </CardHeader>
              <CardContent>
                <div className="h-8 bg-muted rounded w-1/2 mb-2"></div>
                <div className="h-3 bg-muted rounded w-2/3"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  // Show error state
  if (hasErrors) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-destructive mb-4">Dashboard Error</h1>
          <p className="text-muted-foreground mb-4">
            Failed to load dashboard data. Please try refreshing the page.
          </p>
          <Button onClick={() => window.location.reload()}>Refresh Page</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight mb-2" data-testid="heading-admin-dashboard">
          Admin Dashboard
        </h1>
        <p className="text-muted-foreground">
          Welcome back, {user?.name}. Manage your car service business from here.
        </p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Appointments</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-total-appointments">{stats.totalAppointments}</div>
            <div className="flex gap-2 mt-2">
              <Badge variant="secondary" className="text-xs">
                {stats.pendingAppointments} pending
              </Badge>
              <Badge variant="outline" className="text-xs">
                {stats.confirmedAppointments} confirmed
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Services</CardTitle>
            <Wrench className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-total-services">{stats.totalServices}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Service offerings available
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Service Locations</CardTitle>
            <MapPin className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-total-locations">{stats.totalLocations}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Branches operating
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Cars Available</CardTitle>
            <Car className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-active-cars">{stats.activeCars}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {stats.totalCars} total inventory
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Admin Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {adminActions.map((action) => {
          const IconComponent = action.icon;
          return (
            <Card key={action.href} className="hover-elevate transition-all duration-200">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className={`p-3 rounded-lg ${action.color}`}>
                    <IconComponent className="h-6 w-6" />
                  </div>
                  <Badge variant="outline" data-testid={`count-${action.href.replace('/admin/', '')}`}>
                    {action.count}
                  </Badge>
                </div>
                <CardTitle className="text-lg">{action.title}</CardTitle>
                <CardDescription>{action.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <Link href={action.href}>
                  <Button className="w-full" data-testid={`button-${action.href.replace('/admin/', '')}`}>
                    Manage
                  </Button>
                </Link>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}