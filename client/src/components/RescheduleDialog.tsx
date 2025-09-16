import { useState } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { CalendarIcon, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Location } from "@shared/schema";

const rescheduleSchema = z.object({
  dateTime: z.date({ required_error: "Please select a new date and time" }),
  timeSlot: z.string().min(1, "Please select a time slot"),
  locationId: z.string().min(1, "Please select a location"),
});

type RescheduleData = z.infer<typeof rescheduleSchema>;

interface RescheduleDialogProps {
  children: React.ReactNode;
  appointmentId: string;
  currentDateTime: string;
  currentLocationId: string;
}

export function RescheduleDialog({ 
  children, 
  appointmentId, 
  currentDateTime,
  currentLocationId 
}: RescheduleDialogProps) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch available locations
  const { data: locations = [] } = useQuery<Location[]>({
    queryKey: ["/api/locations"],
    enabled: open,
  });

  const form = useForm<RescheduleData>({
    resolver: zodResolver(rescheduleSchema),
    defaultValues: {
      timeSlot: "",
      locationId: currentLocationId,
    },
  });

  // Available time slots
  const timeSlots = [
    "09:00", "09:30", "10:00", "10:30", "11:00", "11:30",
    "12:00", "12:30", "14:00", "14:30", "15:00", "15:30",
    "16:00", "16:30", "17:00", "17:30", "18:00"
  ];

  const rescheduleAppointmentMutation = useMutation({
    mutationFn: async (data: RescheduleData) => {
      // Combine date and time
      const [hours, minutes] = data.timeSlot.split(':').map(Number);
      const appointmentDateTime = new Date(data.dateTime);
      appointmentDateTime.setHours(hours, minutes, 0, 0);

      const rescheduleData = {
        dateTime: appointmentDateTime.toISOString(),
        locationId: data.locationId,
      };

      return apiRequest("PATCH", `/api/appointments/${appointmentId}/reschedule`, rescheduleData);
    },
    onSuccess: () => {
      toast({
        title: "Appointment Rescheduled!",
        description: "Your appointment has been rescheduled successfully.",
      });
      
      // Invalidate appointments cache to refresh the list
      queryClient.invalidateQueries({ 
        predicate: (query) => 
          typeof query.queryKey?.[0] === 'string' && 
          (query.queryKey[0] as string).startsWith('/api/appointments')
      });
      
      // Close dialog and reset form
      setOpen(false);
      form.reset();
    },
    onError: (error: any) => {
      toast({
        title: "Reschedule Failed",
        description: error.message || "Failed to reschedule appointment. Please try again.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: RescheduleData) => {
    rescheduleAppointmentMutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Reschedule Appointment</DialogTitle>
          <DialogDescription>
            Select a new date, time, and location for your appointment.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Date Selection */}
            <FormField
              control={form.control}
              name="dateTime"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>New Appointment Date</FormLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant="outline"
                          className={cn(
                            "pl-3 text-left font-normal",
                            !field.value && "text-muted-foreground"
                          )}
                          data-testid="button-reschedule-date-picker"
                        >
                          {field.value ? (
                            format(field.value, "PPP")
                          ) : (
                            <span>Pick a new date</span>
                          )}
                          <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={field.value}
                        onSelect={field.onChange}
                        disabled={(date) =>
                          date < new Date() || date < new Date("1900-01-01")
                        }
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Time Slot */}
            <FormField
              control={form.control}
              name="timeSlot"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>New Time Slot</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-reschedule-time-slot">
                        <SelectValue placeholder="Select a new time" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {timeSlots.map((time) => (
                        <SelectItem key={time} value={time}>
                          <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4" />
                            {time}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Location */}
            <FormField
              control={form.control}
              name="locationId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Service Location</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-reschedule-location">
                        <SelectValue placeholder="Select a location" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {locations.map((location) => (
                        <SelectItem key={location.id} value={location.id}>
                          <div className="flex items-center gap-2">
                            <span>{location.name} - {location.address}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={rescheduleAppointmentMutation.isPending}
                data-testid="button-confirm-reschedule"
              >
                {rescheduleAppointmentMutation.isPending ? "Rescheduling..." : "Reschedule Appointment"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}