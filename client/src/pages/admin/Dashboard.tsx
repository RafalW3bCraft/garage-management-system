import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Users, Car, Calendar, Settings, MapPin, Wrench, AlertCircle } from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useEffect } from "react";
import type { Appointment, Service, Location, Car as CarType } from "@shared/schema";

export default function AdminDashboard() {
  const { user, isAuthenticated } = useAuth();
  const { toast } = useToast();

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

  // Fetch consolidated admin statistics
  const { data: stats, isLoading, isError, error } = useQuery<{
    totalUsers: number;
    totalAppointments: number;
    pendingAppointments: number;
    confirmedAppointments: number;
    completedAppointments: number;
    cancelledAppointments: number;
    totalServices: number;
    popularServices: number;
    totalLocations: number;
    totalCars: number;
    activeCars: number;
    auctionCars: number;
    activeAuctions: number;
    recentAppointments: number;
  }>({
    queryKey: ["/api/admin/stats"],
  });

  // Error logging and user notification
  useEffect(() => {
    if (isError && error) {
      console.error(`[Admin Dashboard] Failed to load statistics:`, error);
      toast({
        title: "Failed to load dashboard statistics",
        description: error instanceof Error ? error.message : "Unable to fetch dashboard data",
        variant: "destructive",
      });
    }
  }, [isError, error, toast]);

  // Provide default values if data is not loaded yet
  const dashboardStats = stats || {
    totalUsers: 0,
    totalAppointments: 0,
    pendingAppointments: 0,
    confirmedAppointments: 0,
    completedAppointments: 0,
    cancelledAppointments: 0,
    totalServices: 0,
    popularServices: 0,
    totalLocations: 0,
    totalCars: 0,
    activeCars: 0,
    auctionCars: 0,
    activeAuctions: 0,
    recentAppointments: 0,
  };

  const adminActions = [
    {
      title: "Manage Appointments",
      description: "View and update appointment statuses",
      icon: Calendar,
      href: "/admin/appointments",
      count: dashboardStats.totalAppointments,
      color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
    },
    {
      title: "Manage Services",
      description: "Add, edit, and organize service offerings",
      icon: Wrench,
      href: "/admin/services",
      count: dashboardStats.totalServices,
      color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
    },
    {
      title: "Manage Locations",
      description: "Service center locations and details",
      icon: MapPin,
      href: "/admin/locations",
      count: dashboardStats.totalLocations,
      color: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300",
    },
    {
      title: "Manage Cars",
      description: "Car inventory and auction management",
      icon: Car,
      href: "/admin/cars",
      count: dashboardStats.totalCars,
      color: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300",
    },
    {
      title: "User Management",
      description: "Manage customer accounts and permissions",
      icon: Users,
      href: "/admin/users",
      count: dashboardStats.totalUsers,
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

  // Show error alert if statistics failed to load
  const errorComponent = isError ? (
    <Alert variant="destructive" className="mb-4">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>Dashboard Data Error</AlertTitle>
      <AlertDescription>
        Failed to load dashboard statistics. Please try refreshing the page.
      </AlertDescription>
    </Alert>
  ) : null;

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Error Alert */}
      {errorComponent && (
        <div className="mb-6">
          {errorComponent}
        </div>
      )}

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
            <div className="text-2xl font-bold" data-testid="stat-total-appointments">{dashboardStats.totalAppointments}</div>
            <div className="flex gap-2 mt-2">
              <Badge variant="secondary" className="text-xs">
                {dashboardStats.pendingAppointments} pending
              </Badge>
              <Badge variant="outline" className="text-xs">
                {dashboardStats.confirmedAppointments} confirmed
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
            <div className="text-2xl font-bold" data-testid="stat-total-services">{dashboardStats.totalServices}</div>
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
            <div className="text-2xl font-bold" data-testid="stat-total-locations">{dashboardStats.totalLocations}</div>
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
            <div className="text-2xl font-bold" data-testid="stat-active-cars">{dashboardStats.activeCars}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {dashboardStats.totalCars} total inventory
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