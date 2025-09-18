import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Calendar, Clock, MapPin, User, Car, IndianRupee, X, CheckCircle, AlertCircle } from "lucide-react";
import { RescheduleDialog } from "./RescheduleDialog";

interface AppointmentCardProps {
  id: string;
  serviceType: string;
  carDetails: string;
  dateTime: string;
  status: "pending" | "confirmed" | "in-progress" | "completed" | "cancelled";
  mechanicName: string;
  estimatedDuration: string;
  location: string;
  locationId: string;
  price?: number;
}

const getStatusColor = (status: string) => {
  switch (status) {
    case 'confirmed': return 'bg-blue-100 text-blue-800 border-blue-200';
    case 'pending': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    case 'in-progress': return 'bg-purple-100 text-purple-800 border-purple-200';
    case 'completed': return 'bg-green-100 text-green-800 border-green-200';
    case 'cancelled': return 'bg-red-100 text-red-800 border-red-200';
    default: return 'bg-gray-100 text-gray-800 border-gray-200';
  }
};

const getStatusIcon = (status: string) => {
  switch (status) {
    case 'confirmed': return <CheckCircle className="h-4 w-4" />;
    case 'pending': return <Clock className="h-4 w-4" />;
    case 'in-progress': return <AlertCircle className="h-4 w-4" />;
    case 'completed': return <CheckCircle className="h-4 w-4" />;
    case 'cancelled': return <X className="h-4 w-4" />;
    default: return <Clock className="h-4 w-4" />;
  }
};

export function AppointmentCard({
  id,
  serviceType,
  carDetails,
  dateTime,
  status,
  mechanicName,
  estimatedDuration,
  location,
  locationId,
  price
}: AppointmentCardProps) {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handleStatusUpdate = async (newStatus: string) => {
    setIsLoading(true);
    try {
      await apiRequest("PATCH", `/api/appointments/${id}/status`, { status: newStatus });

      toast({
        title: "Success",
        description: `Appointment ${newStatus} successfully.`,
      });

      // Refresh appointments
      queryClient.invalidateQueries({ 
        predicate: (query) => 
          typeof query.queryKey?.[0] === 'string' && 
          (query.queryKey[0] as string).startsWith('/api/appointments')
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || `Failed to ${newStatus} appointment.`,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const canCancel = status === 'pending' || status === 'confirmed';
  const canReschedule = status === 'confirmed';
  const isPast = new Date(dateTime) < new Date();

  return (
    <Card className="relative overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">{serviceType}</CardTitle>
          <Badge className={`${getStatusColor(status)} flex items-center gap-1`}>
            {getStatusIcon(status)}
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </Badge>
        </div>
        <CardDescription className="flex items-center gap-1">
          <Car className="h-4 w-4" />
          {carDetails}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 gap-2 text-sm">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span>{dateTime}</span>
          </div>

          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span>{estimatedDuration}</span>
          </div>

          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-muted-foreground" />
            <span>{location}</span>
          </div>

          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-muted-foreground" />
            <span>{mechanicName}</span>
          </div>

          {price && (
            <div className="flex items-center gap-2">
              <IndianRupee className="h-4 w-4 text-muted-foreground" />
              <span>₹{price.toLocaleString('en-IN')}</span>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        {!isPast && (status === 'pending' || status === 'confirmed') && (
          <div className="flex gap-2 pt-2 border-t">
            {canReschedule && (
              <RescheduleDialog appointmentId={id} locationId={locationId}>
                <Button variant="outline" size="sm" disabled={isLoading}>
                  Reschedule
                </Button>
              </RescheduleDialog>
            )}

            {canCancel && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" disabled={isLoading}>
                    <X className="h-4 w-4 mr-1" />
                    Cancel
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Cancel Appointment</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to cancel this appointment? This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Keep Appointment</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => handleStatusUpdate('cancelled')}
                      className="bg-red-600 hover:bg-red-700"
                    >
                      Cancel Appointment
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}