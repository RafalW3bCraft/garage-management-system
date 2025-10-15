import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Users, Car, Calendar, Settings, MapPin, Wrench, AlertCircle, MessageSquare, DollarSign, Megaphone, FileText } from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useEffect } from "react";
import type { Appointment, Service, Location, Car as CarType } from "@shared/schema";

/**
 * Admin dashboard component providing an overview of key business metrics and quick access
 * to management pages. Displays statistics for appointments, services, locations, and cars.
 * Restricted to admin users only.
 * 
 * @returns {JSX.Element} The rendered admin dashboard
 * 
 * @example
 * ```tsx
 * <Route path="/admin" component={AdminDashboard} />
 * ```
 */
export default function AdminDashboard() {
  const { user, isAuthenticated } = useAuth();
  const { toast } = useToast();

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

  const { data: stats, isLoading, isError, error } = useQuery<{

    totalUsers: number | null;
    totalUsersAvailable: boolean;
    totalAppointments: number | null;
    appointmentsAvailable: boolean;
    pendingAppointments: number | null;
    confirmedAppointments: number | null;
    completedAppointments: number | null;
    cancelledAppointments: number | null;
    recentAppointments: number | null;
    totalServices: number | null;
    servicesAvailable: boolean;
    popularServices: number | null;
    totalLocations: number | null;
    locationsAvailable: boolean;
    totalCars: number | null;
    carsAvailable: boolean;
    activeCars: number | null;
    auctionCars: number | null;
    activeAuctions: number | null;

    lastUpdated: string;
    cacheStatus: {
      appointments: 'cached' | 'fresh' | 'fallback';
      users: 'cached' | 'fresh' | 'fallback';
      services: 'cached' | 'fresh' | 'fallback';
      locations: 'cached' | 'fresh' | 'fallback';
      cars: 'cached' | 'fresh' | 'fallback';
    };
    reliability: {
      totalSources: number;
      availableSources: number;
      failedSources: string[];
      reliabilityScore: number;
    };
  }>({
    queryKey: ["/api/admin/stats"],
  });

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

  const dashboardStats = {
    totalUsers: stats?.totalUsers ?? 0,
    totalAppointments: stats?.totalAppointments ?? 0,
    pendingAppointments: stats?.pendingAppointments ?? 0,
    confirmedAppointments: stats?.confirmedAppointments ?? 0,
    completedAppointments: stats?.completedAppointments ?? 0,
    cancelledAppointments: stats?.cancelledAppointments ?? 0,
    totalServices: stats?.totalServices ?? 0,
    popularServices: stats?.popularServices ?? 0,
    totalLocations: stats?.totalLocations ?? 0,
    totalCars: stats?.totalCars ?? 0,
    activeCars: stats?.activeCars ?? 0,
    auctionCars: stats?.auctionCars ?? 0,
    activeAuctions: stats?.activeAuctions ?? 0,
    recentAppointments: stats?.recentAppointments ?? 0,

    availabilityFlags: {
      usersAvailable: stats?.totalUsersAvailable ?? false,
      appointmentsAvailable: stats?.appointmentsAvailable ?? false,
      servicesAvailable: stats?.servicesAvailable ?? false,
      locationsAvailable: stats?.locationsAvailable ?? false,
      carsAvailable: stats?.carsAvailable ?? false,
    },

    reliability: stats?.reliability,
    lastUpdated: stats?.lastUpdated,
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
    {
      title: "Contact Messages",
      description: "View and respond to customer inquiries",
      icon: MessageSquare,
      href: "/admin/contacts",
      count: 0,
      color: "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-300",
    },
    {
      title: "Auction Bids",
      description: "Review and manage customer bids on vehicles",
      icon: DollarSign,
      href: "/admin/bids",
      count: 0,
      color: "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-300",
    },
    {
      title: "Promotional Messages",
      description: "Send WhatsApp & Email campaigns to customers",
      icon: Megaphone,
      href: "/admin/promotions",
      count: 0,
      color: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300",
    },
    {
      title: "Invoice Management",
      description: "Create & send invoices with Indian GST",
      icon: FileText,
      href: "/admin/invoices",
      count: 0,
      color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300",
    },
  ];

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8" role="status" aria-live="polite">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight mb-2">Admin Dashboard</h1>
          <p className="text-muted-foreground">Loading dashboard data...</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6" aria-label="Loading statistics">
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

  const errorComponent = isError ? (
    <Alert variant="destructive" className="mb-4" role="alert">
      <AlertCircle className="h-4 w-4" aria-hidden="true" />
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
      <section aria-labelledby="stats-heading" className="mb-8">
        <h2 id="stats-heading" className="sr-only">Dashboard Statistics</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Appointments</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
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
              <Wrench className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
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
              <MapPin className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
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
              <Car className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stat-active-cars">{dashboardStats.activeCars}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {dashboardStats.totalCars} total inventory
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Admin Actions */}
      <section aria-labelledby="actions-heading">
        <h2 id="actions-heading" className="sr-only">Admin Management Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {adminActions.map((action) => {
            const IconComponent = action.icon;
            return (
              <Card key={action.href} className="hover-elevate transition-all duration-200">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className={`p-3 rounded-lg ${action.color}`} aria-hidden="true">
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
                    <Button 
                      className="w-full" 
                      data-testid={`button-${action.href.replace('/admin/', '')}`}
                      aria-label={`${action.title}: ${action.description}`}
                    >
                      Manage
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>
    </div>
  );
}
