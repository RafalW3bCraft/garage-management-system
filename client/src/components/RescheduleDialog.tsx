import { useState } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { apiRequestVoid } from "@/lib/queryClient";
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

/**
 * Zod schema for reschedule form validation with future date validation
 */
const rescheduleSchema = z.object({
  dateTime: z.date({ required_error: "Please select a new date and time" })
    .refine((date) => date > new Date(), {
      message: "New appointment date must be in the future",
    }),
  timeSlot: z.string()
    .min(1, "Please select a time slot")
    .regex(/^(0[9]|1[0-8]):[0-3]0$/, "Invalid time slot format"),
  locationId: z.string().min(1, "Please select a location"),
});

type RescheduleData = z.infer<typeof rescheduleSchema>;

/**
 * Props for the RescheduleDialog component
 */
interface RescheduleDialogProps {
  children: React.ReactNode;
  appointmentId: string;
  currentDateTime: string;
  currentLocationId: string;
}

/**
 * Appointment rescheduling dialog for changing appointment date, time, and location.
 * Allows users to select a new date, time slot, and service location for existing appointments.
 * 
 * @param {RescheduleDialogProps} props - Component props
 * @param {React.ReactNode} props.children - Trigger element for opening the dialog
 * @param {string} props.appointmentId - ID of the appointment to reschedule
 * @param {string} props.currentDateTime - Current appointment date and time
 * @param {string} props.currentLocationId - Current location ID
 * @returns {JSX.Element} The rendered reschedule dialog
 * 
 * @example
 * ```tsx
 * <RescheduleDialog
 *   appointmentId="apt-123"
 *   currentDateTime="2024-03-15 10:00"
 *   currentLocationId="loc-1"
 * >
 *   <Button>Reschedule</Button>
 * </RescheduleDialog>
 * ```
 */
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

      return apiRequestVoid("PATCH", `/api/appointments/${appointmentId}/reschedule`, rescheduleData);
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
    onError: (error: Error) => {
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
      <DialogContent className="w-full max-w-sm md:max-w-lg max-h-[90vh] overflow-y-auto" aria-describedby="reschedule-dialog-description">
        <DialogHeader>
          <DialogTitle id="reschedule-dialog-title">Reschedule Appointment</DialogTitle>
          <DialogDescription id="reschedule-dialog-description">
            Select a new date, time, and location for your appointment.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Date Selection */}
            <FormField
              control={form.control}
              name="dateTime"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel htmlFor="dateTime">New Appointment Date</FormLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full sm:w-auto pl-3 text-left font-normal",
                            !field.value && "text-muted-foreground"
                          )}
                          data-testid="button-reschedule-date-picker"
                          aria-label={field.value ? `Selected date: ${format(field.value, "PPP")}` : "Pick a new appointment date"}
                          aria-invalid={form.formState.errors.dateTime ? "true" : "false"}
                          aria-describedby={form.formState.errors.dateTime ? "dateTime-error" : undefined}
                        >
                          {field.value ? (
                            format(field.value, "PPP")
                          ) : (
                            <span>Pick a new date</span>
                          )}
                          <CalendarIcon className="ml-auto h-4 w-4 opacity-50" aria-hidden="true" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={field.value}
                        onSelect={field.onChange}
                        disabled={(date) => {
                          const today = new Date();
                          today.setHours(0, 0, 0, 0);
                          return date < today;
                        }}
                        initialFocus
                        aria-label="Choose new appointment date"
                      />
                    </PopoverContent>
                  </Popover>
                  <FormMessage id="dateTime-error" role="alert" />
                </FormItem>
              )}
            />

            {/* Time Slot */}
            <FormField
              control={form.control}
              name="timeSlot"
              render={({ field }) => (
                <FormItem>
                  <FormLabel htmlFor="timeSlot">New Time Slot</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger 
                        data-testid="select-reschedule-time-slot"
                        aria-label="Select new time slot"
                        aria-invalid={form.formState.errors.timeSlot ? "true" : "false"}
                        aria-describedby={form.formState.errors.timeSlot ? "timeSlot-error" : undefined}
                      >
                        <SelectValue placeholder="Select a new time" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {timeSlots.map((time) => (
                        <SelectItem key={time} value={time}>
                          <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4" aria-hidden="true" />
                            {time}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage id="timeSlot-error" role="alert" />
                </FormItem>
              )}
            />

            {/* Location */}
            <FormField
              control={form.control}
              name="locationId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel htmlFor="locationId">Service Location</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger 
                        data-testid="select-reschedule-location"
                        aria-label="Select service location"
                        aria-invalid={form.formState.errors.locationId ? "true" : "false"}
                        aria-describedby={form.formState.errors.locationId ? "locationId-error" : undefined}
                      >
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
                  <FormMessage id="locationId-error" role="alert" />
                </FormItem>
              )}
            />

            <DialogFooter className="flex-col gap-2 sm:flex-row">
              <Button type="button" variant="outline" onClick={() => setOpen(false)} aria-label="Cancel rescheduling">
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={rescheduleAppointmentMutation.isPending}
                data-testid="button-confirm-reschedule"
                aria-label={rescheduleAppointmentMutation.isPending ? "Rescheduling appointment, please wait" : "Confirm reschedule"}
              >
                {rescheduleAppointmentMutation.isPending ? "Rescheduling..." : "Reschedule Appointment"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
        </div>
      </DialogContent>
    </Dialog>
  );
}