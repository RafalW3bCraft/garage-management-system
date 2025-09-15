import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, Clock, Car, MapPin, User } from "lucide-react";

interface AppointmentCardProps {
  id: string;
  serviceType: string;
  carDetails: string;
  dateTime: string;
  status: "pending" | "confirmed" | "in-progress" | "completed" | "cancelled";
  mechanicName: string;
  estimatedDuration: string;
  location: string;
  price?: number;
}

export function AppointmentCard({
  id,
  serviceType,
  carDetails,
  dateTime,
  status,
  mechanicName,
  estimatedDuration,
  location,
  price
}: AppointmentCardProps) {
  
  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending": return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
      case "confirmed": return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
      case "in-progress": return "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200";
      case "completed": return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
      case "cancelled": return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
      default: return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200";
    }
  };

  const getStatusActions = () => {
    switch (status) {
      case "pending":
        return (
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => console.log(`Cancelling appointment ${id}`)}
              data-testid={`button-cancel-${id}`}
            >
              Cancel
            </Button>
            <Button 
              size="sm"
              onClick={() => console.log(`Confirming appointment ${id}`)}
              data-testid={`button-confirm-${id}`}
            >
              Confirm
            </Button>
          </div>
        );
      case "confirmed":
        return (
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => console.log(`Rescheduling appointment ${id}`)}
              data-testid={`button-reschedule-${id}`}
            >
              Reschedule
            </Button>
            <Button 
              size="sm"
              onClick={() => console.log(`Viewing details for appointment ${id}`)}
              data-testid={`button-details-${id}`}
            >
              View Details
            </Button>
          </div>
        );
      case "completed":
        return (
          <Button 
            size="sm"
            onClick={() => console.log(`Leaving feedback for appointment ${id}`)}
            data-testid={`button-feedback-${id}`}
          >
            Leave Feedback
          </Button>
        );
      default:
        return (
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => console.log(`Viewing appointment ${id}`)}
            data-testid={`button-view-${id}`}
          >
            View
          </Button>
        );
    }
  };

  return (
    <Card className="hover-elevate">
      <CardHeader>
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="text-lg">{serviceType}</CardTitle>
            <CardDescription className="flex items-center gap-1 mt-1">
              <Car className="h-4 w-4" />
              {carDetails}
            </CardDescription>
          </div>
          <Badge className={getStatusColor(status)}>
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </Badge>
        </div>
      </CardHeader>

      <CardContent>
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span>{dateTime}</span>
          </div>
          
          <div className="flex items-center gap-2 text-sm">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span>Duration: {estimatedDuration}</span>
          </div>
          
          <div className="flex items-center gap-2 text-sm">
            <User className="h-4 w-4 text-muted-foreground" />
            <span>Mechanic: {mechanicName}</span>
          </div>
          
          <div className="flex items-center gap-2 text-sm">
            <MapPin className="h-4 w-4 text-muted-foreground" />
            <span>{location}</span>
          </div>

          {price && (
            <div className="text-lg font-semibold text-accent">
              ₹{price.toLocaleString('en-IN')}
            </div>
          )}
        </div>
      </CardContent>

      <CardFooter>
        {getStatusActions()}
      </CardFooter>
    </Card>
  );
}