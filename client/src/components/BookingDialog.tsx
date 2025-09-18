import { useState, useEffect } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { apiRequestJson, apiRequestVoid } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
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
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { CalendarIcon, Clock, MapPin, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Service, Location, Customer, Appointment } from "@shared/schema";

const bookingSchema = z.object({
  carDetails: z.string().min(5, "Please provide car details (make, model, year, registration)"),
  dateTime: z.date({ required_error: "Please select a date and time" }),
  timeSlot: z.string().min(1, "Please select a time slot"),
  locationId: z.string().min(1, "Please select a location"),
  notes: z.string().optional(),
});

type BookingData = z.infer<typeof bookingSchema>;

interface BookingDialogProps {
  children: React.ReactNode;
  service: Service;
}

export function BookingDialog({ children, service }: BookingDialogProps) {
  const [open, setOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date>();
  const [checkingAvailability, setCheckingAvailability] = useState(false);
  const [timeSlotAvailability, setTimeSlotAvailability] = useState<Record<string, boolean>>({});
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch available locations with loading state
  const { 
    data: locations = [], 
    isLoading: locationsLoading,
    error: locationsError 
  } = useQuery<Location[]>({
    queryKey: ["/api/locations"],
    enabled: open,
  });

  const form = useForm<BookingData>({
    resolver: zodResolver(bookingSchema),
    defaultValues: {
      carDetails: "",
      notes: "",
      timeSlot: "",
      locationId: "",
    },
  });

  // Available time slots
  const timeSlots = [
    "09:00", "09:30", "10:00", "10:30", "11:00", "11:30",
    "12:00", "12:30", "14:00", "14:30", "15:00", "15:30",
    "16:00", "16:30", "17:00", "17:30", "18:00"
  ];

  // Real-time availability checking when date/location changes
  useEffect(() => {
    const checkTimeSlotAvailability = async () => {
      const selectedLocation = form.watch("locationId");
      const currentDate = selectedDate;
      
      if (!currentDate || !selectedLocation) {
        setTimeSlotAvailability({});
        return;
      }

      setCheckingAvailability(true);
      
      try {
        // Check availability for all time slots
        const availabilityChecks = await Promise.all(
          timeSlots.map(async (timeSlot) => {
            const [hours, minutes] = timeSlot.split(':').map(Number);
            const checkDateTime = new Date(currentDate);
            checkDateTime.setHours(hours, minutes, 0, 0);

            try {
              const result = await apiRequestJson<{ hasConflict: boolean }>("POST", "/api/appointments/check-conflict", {
                locationId: selectedLocation,
                dateTime: checkDateTime.toISOString()
              });
              
              return { timeSlot, available: !result.hasConflict };
            } catch (error) {
              console.warn(`Failed to check availability for ${timeSlot}:`, error);
              return { timeSlot, available: true }; // Assume available if check fails
            }
          })
        );

        const availability = availabilityChecks.reduce((acc, { timeSlot, available }) => {
          acc[timeSlot] = available;
          return acc;
        }, {} as Record<string, boolean>);

        setTimeSlotAvailability(availability);
      } catch (error) {
        console.error("Failed to check time slot availability:", error);
        // Reset availability on error
        setTimeSlotAvailability({});
      } finally {
        setCheckingAvailability(false);
      }
    };

    // Debounce the availability check
    const timeoutId = setTimeout(checkTimeSlotAvailability, 300);
    return () => clearTimeout(timeoutId);
  }, [selectedDate, form.watch("locationId")]);

  const createAppointmentMutation = useMutation({
    mutationFn: async (data: BookingData) => {
      if (!user) throw new Error("User not authenticated");
      
      // Ensure customer exists for authenticated user (secure endpoint)
      const customer = await apiRequestJson<Customer>("POST", "/api/customers/ensure-own", {});
      
      // Combine date and time
      const [hours, minutes] = data.timeSlot.split(':').map(Number);
      const appointmentDateTime = new Date(data.dateTime);
      appointmentDateTime.setHours(hours, minutes, 0, 0);

      // Check for conflicts before creating appointment
      const conflictCheck = await apiRequestJson<{ hasConflict: boolean }>("POST", "/api/appointments/check-conflict", {
        locationId: data.locationId,
        dateTime: appointmentDateTime.toISOString()
      });

      if (conflictCheck.hasConflict) {
        throw new Error("This time slot is no longer available. Please choose a different time.");
      }

      const appointmentData = {
        customerId: customer.id,
        serviceId: service.id,
        locationId: data.locationId,
        carDetails: data.carDetails,
        dateTime: appointmentDateTime.toISOString(),
        estimatedDuration: service.duration,
        price: service.price,
        notes: data.notes || undefined,
      };

      return apiRequestJson<Appointment>("POST", "/api/appointments", appointmentData);
    },
    onSuccess: () => {
      toast({
        title: "Appointment Booked!",
        description: `Your ${service.title} appointment has been scheduled successfully.`,
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
      setSelectedDate(undefined);
    },
    onError: (error: any) => {
      console.error("Booking error:", error);
      
      let errorMessage = "Failed to book appointment. Please try again.";
      
      if (error.message) {
        if (error.message.includes("time slot")) {
          errorMessage = error.message;
        } else if (error.message.includes("conflict")) {
          errorMessage = "This time slot is no longer available. Please choose a different time.";
        } else if (error.message.includes("authentication")) {
          errorMessage = "Please log in to book an appointment.";
        } else if (error.message.includes("validation")) {
          errorMessage = "Please check all required fields and try again.";
        } else {
          errorMessage = error.message;
        }
      }
      
      toast({
        title: "Booking Failed",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: BookingData) => {
    createAppointmentMutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Book {service.title}</DialogTitle>
          <DialogDescription>
            Schedule your service appointment. We'll confirm the details with you shortly.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Car Details */}
            <FormField
              control={form.control}
              name="carDetails"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Car Details</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g., Maruti Swift 2020 (MH-01-AB-1234)"
                      {...field}
                      data-testid="input-car-details"
                    />
                  </FormControl>
                  <FormDescription>
                    Include make, model, year, and registration number
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Date Selection */}
            <FormField
              control={form.control}
              name="dateTime"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Appointment Date</FormLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant="outline"
                          className={cn(
                            "pl-3 text-left font-normal",
                            !field.value && "text-muted-foreground"
                          )}
                          data-testid="button-date-picker"
                        >
                          {field.value ? (
                            format(field.value, "PPP")
                          ) : (
                            <span>Pick a date</span>
                          )}
                          <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={field.value}
                        onSelect={(date) => {
                          field.onChange(date);
                          setSelectedDate(date);
                        }}
                        disabled={(date) => {
                          const today = new Date();
                          today.setHours(0, 0, 0, 0);
                          return date < today;
                        }}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Time Slot with Availability Indicators */}
            <FormField
              control={form.control}
              name="timeSlot"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center">
                    Time Slot
                    {checkingAvailability && (
                      <Loader2 className="inline w-4 h-4 ml-2 animate-spin text-muted-foreground" />
                    )}
                  </FormLabel>
                  {checkingAvailability ? (
                    <Skeleton className="h-10 w-full" data-testid="skeleton-time-slots" />
                  ) : (
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-time-slot">
                          <SelectValue placeholder="Select a time" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {timeSlots.map((time) => {
                          const isAvailable = timeSlotAvailability[time] !== false;
                          const hasAvailabilityInfo = time in timeSlotAvailability;
                          
                          return (
                            <SelectItem 
                              key={time} 
                              value={time}
                              disabled={hasAvailabilityInfo && !isAvailable}
                              className={cn(
                                "flex items-center justify-between",
                                !isAvailable && hasAvailabilityInfo && "opacity-50"
                              )}
                            >
                              <div className="flex items-center gap-2 flex-1">
                                <Clock className="h-4 w-4" />
                                {time}
                              </div>
                              {hasAvailabilityInfo && (
                                isAvailable ? (
                                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                                ) : (
                                  <XCircle className="w-4 h-4 text-red-600" />
                                )
                              )}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  )}
                  {selectedDate && form.watch("locationId") && !checkingAvailability && (
                    <FormDescription className="text-xs flex items-center gap-3">
                      <span className="flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-green-600" />
                        Available
                      </span>
                      <span className="flex items-center gap-1">
                        <XCircle className="w-3 h-3 text-red-600" />
                        Unavailable
                      </span>
                    </FormDescription>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Location with Loading State */}
            <FormField
              control={form.control}
              name="locationId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Service Location</FormLabel>
                  {locationsLoading ? (
                    <Skeleton className="h-10 w-full" data-testid="skeleton-locations" />
                  ) : locationsError ? (
                    <div className="text-sm text-destructive p-2 border border-destructive/50 rounded-md">
                      Failed to load locations. Please refresh and try again.
                    </div>
                  ) : (
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-location">
                          <SelectValue placeholder="Select a location" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {locations.map((location) => (
                          <SelectItem key={location.id} value={location.id}>
                            <div className="flex items-center gap-2">
                              <MapPin className="h-4 w-4" />
                              {location.name} - {location.address}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Notes */}
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Additional Notes (Optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Any specific requirements or concerns..."
                      {...field}
                      data-testid="textarea-notes"
                    />
                  </FormControl>
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
                disabled={createAppointmentMutation.isPending}
                data-testid="button-confirm-booking"
              >
                {createAppointmentMutation.isPending ? "Booking..." : "Book Appointment"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}