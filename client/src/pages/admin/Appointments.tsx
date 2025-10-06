import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, Clock, User, MapPin, Wrench, ChevronLeft, ChevronRight } from "lucide-react";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useErrorHandler } from "@/lib/error-utils";
import type { AppointmentWithDetails } from "@shared/schema";
import { format } from "date-fns";
import { useState } from "react";

/**
 * Admin appointments management component for viewing and updating service appointments.
 * Allows admins to change appointment status (pending, confirmed, in-progress, completed, cancelled).
 * Displays detailed appointment information including customer, service, location, and timing.
 * 
 * @returns {JSX.Element} The rendered admin appointments page
 * 
 * @example
 * ```tsx
 * <Route path="/admin/appointments" component={AdminAppointments} />
 * ```
 */
export default function AdminAppointments() {
  const { user, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const { handleMutationError } = useErrorHandler();
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 20;

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

  // Fetch appointments with pagination
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["/api/admin/appointments", currentPage, pageSize],
    queryFn: async () => {
      const offset = (currentPage - 1) * pageSize;
      const response = await apiRequest("GET", `/api/admin/appointments?offset=${offset}&limit=${pageSize}`);
      return response.json();
    },
  });

  const appointments = data?.appointments || [];
  const totalCount = data?.total || 0;
  const totalPages = Math.ceil(totalCount / pageSize);
  const startIndex = (currentPage - 1) * pageSize + 1;
  const endIndex = Math.min(currentPage * pageSize, totalCount);

  // Status update mutation
  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const response = await apiRequest("PATCH", `/api/admin/appointments/${id}/status`, { status });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/appointments"] });
    },
    onError: (error: Error) => {
      handleMutationError(error, {
        title: "Update Failed",
        defaultMessage: "Failed to update appointment status. Please try again.",
      });
    },
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending": return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300";
      case "confirmed": return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300";
      case "in-progress": return "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300";
      case "completed": return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300";
      case "cancelled": return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300";
      default: return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300";
    }
  };

  const handleStatusUpdate = (appointmentId: string, newStatus: string) => {
    updateStatusMutation.mutate({ id: appointmentId, status: newStatus });
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-6">Manage Appointments</h1>
        <div className="grid gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6">
                <div className="h-4 bg-muted rounded w-1/4 mb-2"></div>
                <div className="h-6 bg-muted rounded w-1/2 mb-4"></div>
                <div className="h-3 bg-muted rounded w-3/4"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="container mx-auto px-4 py-8 text-center">
        <h1 className="text-2xl font-bold text-destructive mb-4">Error Loading Appointments</h1>
        <p className="text-muted-foreground mb-4">Failed to load appointments. Please try again.</p>
        <Button onClick={() => refetch()}>Retry</Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="heading-admin-appointments">
            Manage Appointments
          </h1>
          <p className="text-muted-foreground">
            {totalCount > 0 ? `Showing ${startIndex}-${endIndex} of ${totalCount} appointments` : 'No appointments'}
          </p>
        </div>
        <Link href="/admin">
          <Button variant="outline">Back to Dashboard</Button>
        </Link>
      </div>

      {/* Appointments List */}
      {appointments.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Appointments Found</h3>
            <p className="text-muted-foreground">There are no appointments in the system yet.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4">
            {appointments.map((appointment) => (
            <Card key={appointment.id} className="hover-elevate">
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-lg" data-testid={`appointment-title-${appointment.id}`}>
                      Service Appointment
                    </CardTitle>
                    <CardDescription>
                      ID: {appointment.id.slice(0, 8)}...
                    </CardDescription>
                  </div>
                  <Badge className={getStatusColor(appointment.status)} data-testid={`status-${appointment.id}`}>
                    {appointment.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">Customer: {appointment.customerName}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Wrench className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">Service: {appointment.serviceName}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">
                      {format(new Date(appointment.dateTime), "MMM dd, yyyy")}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">
                      {format(new Date(appointment.dateTime), "hh:mm a")}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">Location: {appointment.locationName}</span>
                  </div>
                </div>
                
                {appointment.carDetails && (
                  <div className="mb-4 p-3 bg-muted rounded-md">
                    <p className="text-sm font-medium mb-1">Car Details:</p>
                    <p className="text-sm text-muted-foreground">{appointment.carDetails}</p>
                  </div>
                )}
                
                <div className="flex gap-2 flex-wrap">
                  {["pending", "confirmed", "in-progress", "completed", "cancelled"].map((status) => (
                    <Button
                      key={status}
                      size="sm"
                      variant={appointment.status === status ? "default" : "outline"}
                      onClick={() => handleStatusUpdate(appointment.id, status)}
                      disabled={updateStatusMutation.isPending || appointment.status === status}
                      data-testid={`button-${status}-${appointment.id}`}
                    >
                      {status.charAt(0).toUpperCase() + status.slice(1).replace("-", " ")}
                    </Button>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-6">
              <div className="text-sm text-muted-foreground">
                Page {currentPage} of {totalPages}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                >
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}