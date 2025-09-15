import { useState } from "react";
import { AppointmentCard } from "@/components/AppointmentCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar, Clock, Plus } from "lucide-react";

export default function Appointments() {
  const [activeTab, setActiveTab] = useState("upcoming");

  // Mock data - todo: remove mock functionality
  const appointments = [
    {
      id: "apt-1",
      serviceType: "Oil Change Service",
      carDetails: "Maruti Swift 2020 (MH-01-AB-1234)",
      dateTime: "Dec 20, 2024 at 10:00 AM",
      status: "confirmed" as const,
      mechanicName: "Rajesh Kumar",
      estimatedDuration: "30 minutes",
      location: "RonakMotorGarage, Mumbai",
      price: 2500
    },
    {
      id: "apt-2",
      serviceType: "Complete Vehicle Service",
      carDetails: "Hyundai Creta 2019 (DL-08-CD-5678)",
      dateTime: "Dec 22, 2024 at 2:00 PM",
      status: "pending" as const,
      mechanicName: "Suresh Sharma",
      estimatedDuration: "3 hours",
      location: "RonakMotorGarage, Delhi",
      price: 8500
    },
    {
      id: "apt-3",
      serviceType: "AC Service",
      carDetails: "Tata Nexon 2021 (KA-03-EF-9012)",
      dateTime: "Dec 18, 2024 at 11:30 AM",
      status: "completed" as const,
      mechanicName: "Anil Patel",
      estimatedDuration: "1 hour",
      location: "RonakMotorGarage, Bangalore",
      price: 3500
    },
    {
      id: "apt-4",
      serviceType: "Brake Service",
      carDetails: "Honda City 2018 (MH-12-GH-3456)",
      dateTime: "Dec 25, 2024 at 9:00 AM",
      status: "confirmed" as const,
      mechanicName: "Vikram Singh",
      estimatedDuration: "1.5 hours",
      location: "RonakMotorGarage, Pune",
      price: 4500
    },
    {
      id: "apt-5",
      serviceType: "Engine Diagnostics",
      carDetails: "Ford EcoSport 2019 (WB-04-JK-7890)",
      dateTime: "Nov 28, 2024 at 3:00 PM",
      status: "completed" as const,
      mechanicName: "Ramesh Gupta",
      estimatedDuration: "1 hour",
      location: "RonakMotorGarage, Kolkata",
      price: 1500
    },
    {
      id: "apt-6",
      serviceType: "Battery Replacement",
      carDetails: "Mahindra XUV500 2017 (TN-09-LM-2345)",
      dateTime: "Dec 15, 2024 at 4:00 PM",
      status: "cancelled" as const,
      mechanicName: "Karthik Raj",
      estimatedDuration: "30 minutes",
      location: "RonakMotorGarage, Chennai",
      price: 5500
    }
  ];

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

  const handleBookNewAppointment = () => {
    console.log("Booking new appointment");
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
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
              onClick={handleBookNewAppointment}
              data-testid="button-book-new-appointment"
            >
              <Plus className="mr-2 h-5 w-5" />
              Book New Service
            </Button>
          </div>
        </div>
      </section>

      {/* Stats Cards */}
      <section className="py-8">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
                  {appointments.filter(apt => apt.dateTime.includes("Dec")).length}
                </CardTitle>
              </CardHeader>
            </Card>
          </div>
        </div>
      </section>

      {/* Appointments Tabs */}
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
                      <AppointmentCard key={appointment.id} {...appointment} />
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
                    onClick={handleBookNewAppointment}
                    data-testid="button-book-first-appointment"
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Book Your First Service
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
                      <AppointmentCard key={appointment.id} {...appointment} />
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

      {/* Quick Actions */}
      <section className="py-16 bg-muted/50">
        <div className="container mx-auto px-4">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold mb-4">Need Service?</h2>
            <p className="text-lg text-muted-foreground">
              Quick actions to keep your vehicle running smoothly
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            <Card className="text-center p-6 hover-elevate cursor-pointer" 
                  onClick={() => console.log("Emergency service")}>
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

            <Card className="text-center p-6 hover-elevate cursor-pointer"
                  onClick={() => console.log("Regular maintenance")}>
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

            <Card className="text-center p-6 hover-elevate cursor-pointer"
                  onClick={() => console.log("Service reminder")}>
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
          </div>
        </div>
      </section>
    </div>
  );
}