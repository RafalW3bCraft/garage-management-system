import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Link } from "wouter";
import { AppointmentCard } from "@/components/AppointmentCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar, Clock, Plus, Loader2 } from "lucide-react";
import type { AppointmentWithDetails, Customer } from "@shared/schema";

export default function Appointments() {
  const [activeTab, setActiveTab] = useState("upcoming");
  const { user, isLoading: authLoading } = useAuth();

  const { data: customer, isLoading: customerLoading } = useQuery<Customer>({
    queryKey: ["/api/customer/by-user", user?.id],
    enabled: !!user?.id,
    retry: 1,
    staleTime: 5 * 60 * 1000
  });

  const { data: appointments = [], isLoading: appointmentsLoading, error } = useQuery<AppointmentWithDetails[]>({
    queryKey: ["/api/appointments/customer", customer?.id],
    enabled: !!customer?.id,
    retry: 3,
    staleTime: 30 * 1000
  });

  const isLoading = customerLoading || appointmentsLoading;

  const upcomingAppointments = appointments.filter(apt => 
    apt.status === "pending" || apt.status === "confirmed"
  );
  
  const pastAppointments = appointments.filter(apt => 
    apt.status === "completed" || apt.status === "cancelled"
  );

  const getStatusStats = () => {
    const stats = appointments.reduce((acc, apt) => {
      acc[apt.status] = (acc[apt.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    return stats;
  };

  const stats = getStatusStats();

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex items-center gap-2">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span>Loading...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background">
        <section className="py-16 bg-muted/50">
          <div className="container mx-auto px-4 text-center">
            <h1 className="text-4xl font-bold mb-4">My Appointments</h1>
            <p className="text-xl text-muted-foreground mb-8">
              Please log in to view your appointments
            </p>
            <Button size="lg">
              Login to Continue
            </Button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <section className="py-16 bg-muted/50">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <h1 className="text-4xl font-bold mb-4">My Appointments</h1>
              <p className="text-xl text-muted-foreground">
                Manage your vehicle service appointments and track their progress
              </p>
            </div>
            <Button 
              size="lg" 
              asChild
              data-testid="button-book-new-appointment"
            >
              <Link href="/services">
                <Plus className="mr-2 h-5 w-5" />
                Book New Service
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="py-8">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Total Appointments</CardDescription>
                <CardTitle className="text-2xl">{appointments.length}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Upcoming</CardDescription>
                <CardTitle className="text-2xl text-blue-600">
                  {(stats.pending || 0) + (stats.confirmed || 0)}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Completed</CardDescription>
                <CardTitle className="text-2xl text-green-600">
                  {stats.completed || 0}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>This Month</CardDescription>
                <CardTitle className="text-2xl">
                  {appointments.filter(apt => {
                    const now = new Date();
                    const appointmentDate = new Date(apt.dateTime);
                    return appointmentDate.getMonth() === now.getMonth() && 
                           appointmentDate.getFullYear() === now.getFullYear();
                  }).length}
                </CardTitle>
              </CardHeader>
            </Card>
          </div>
        </div>
      </section>

      <section className="py-8">
        <div className="container mx-auto px-4">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2 max-w-md mx-auto mb-8">
              <TabsTrigger value="upcoming" data-testid="tab-upcoming">
                <Calendar className="mr-2 h-4 w-4" />
                Upcoming ({upcomingAppointments.length})
              </TabsTrigger>
              <TabsTrigger value="past" data-testid="tab-past">
                <Clock className="mr-2 h-4 w-4" />
                Past ({pastAppointments.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="upcoming">
              {upcomingAppointments.length > 0 ? (
                <div className="space-y-6">
                  <div className="flex justify-between items-center">
                    <h2 className="text-2xl font-semibold">Upcoming Appointments</h2>
                    <div className="flex gap-2">
                      <Badge variant="outline" className="text-yellow-600 border-yellow-600">
                        {stats.pending || 0} Pending
                      </Badge>
                      <Badge variant="outline" className="text-blue-600 border-blue-600">
                        {stats.confirmed || 0} Confirmed
                      </Badge>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {upcomingAppointments.map((appointment) => (
                      <AppointmentCard 
                        key={appointment.id}
                        id={appointment.id}
                        serviceType={appointment.serviceName}
                        carDetails={appointment.carDetails}
                        dateTime={new Date(appointment.dateTime).toLocaleString()}
                        status={appointment.status as "pending" | "confirmed" | "in-progress" | "completed" | "cancelled"}
                        mechanicName={appointment.mechanicName || "TBD"}
                        estimatedDuration={appointment.estimatedDuration}
                        location={appointment.locationName}
                        locationId={appointment.locationId}
                        price={appointment.price || undefined}
                      />
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-center py-16">
                  <Calendar className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-xl font-semibold mb-2">No upcoming appointments</h3>
                  <p className="text-muted-foreground mb-6">
                    Book a service appointment to keep your vehicle in top condition
                  </p>
                  <Button 
                    asChild
                    data-testid="button-book-first-appointment"
                  >
                    <Link href="/services">
                      <Plus className="mr-2 h-4 w-4" />
                      Book Your First Service
                    </Link>
                  </Button>
                </div>
              )}
            </TabsContent>

            <TabsContent value="past">
              {pastAppointments.length > 0 ? (
                <div className="space-y-6">
                  <div className="flex justify-between items-center">
                    <h2 className="text-2xl font-semibold">Past Appointments</h2>
                    <div className="flex gap-2">
                      <Badge variant="outline" className="text-green-600 border-green-600">
                        {stats.completed || 0} Completed
                      </Badge>
                      {stats.cancelled && (
                        <Badge variant="outline" className="text-red-600 border-red-600">
                          {stats.cancelled} Cancelled
                        </Badge>
                      )}
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {pastAppointments.map((appointment) => (
                      <AppointmentCard 
                        key={appointment.id}
                        id={appointment.id}
                        serviceType={appointment.serviceName}
                        carDetails={appointment.carDetails}
                        dateTime={new Date(appointment.dateTime).toLocaleString()}
                        status={appointment.status as "pending" | "confirmed" | "in-progress" | "completed" | "cancelled"}
                        mechanicName={appointment.mechanicName || "TBD"}
                        estimatedDuration={appointment.estimatedDuration}
                        location={appointment.locationName}
                        locationId={appointment.locationId}
                        price={appointment.price || undefined}
                      />
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-center py-16">
                  <Clock className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-xl font-semibold mb-2">No past appointments</h3>
                  <p className="text-muted-foreground">
                    Your service history will appear here after completing appointments
                  </p>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </section>

      <section className="py-16 bg-muted/50">
        <div className="container mx-auto px-4">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold mb-4">Need Service?</h2>
            <p className="text-lg text-muted-foreground">
              Quick actions to keep your vehicle running smoothly
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            <Link href="/services" data-testid="link-emergency-service">
              <Card className="text-center p-6 hover-elevate cursor-pointer">
                <CardHeader>
                  <div className="h-12 w-12 bg-red-100 dark:bg-red-900 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Calendar className="h-6 w-6 text-red-600" />
                  </div>
                  <CardTitle>Emergency Service</CardTitle>
                  <CardDescription>
                    Need urgent repairs? Book emergency service
                  </CardDescription>
                </CardHeader>
              </Card>
            </Link>

            <Link href="/services" data-testid="link-regular-maintenance">
              <Card className="text-center p-6 hover-elevate cursor-pointer">
                <CardHeader>
                  <div className="h-12 w-12 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Clock className="h-6 w-6 text-blue-600" />
                  </div>
                  <CardTitle>Regular Maintenance</CardTitle>
                  <CardDescription>
                    Schedule routine maintenance for your vehicle
                  </CardDescription>
                </CardHeader>
              </Card>
            </Link>

            <Link href="/services" data-testid="link-service-reminder">
              <Card className="text-center p-6 hover-elevate cursor-pointer">
                <CardHeader>
                  <div className="h-12 w-12 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Plus className="h-6 w-6 text-green-600" />
                  </div>
                  <CardTitle>Service Reminder</CardTitle>
                  <CardDescription>
                    Set up automatic service reminders
                  </CardDescription>
                </CardHeader>
              </Card>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
