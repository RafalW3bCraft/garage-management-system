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

/**
 * Zod schema for booking form validation with future date validation
 */
const bookingSchema = z.object({
  carDetails: z.string()
    .min(5, "Please provide car details (make, model, year, registration)")
    .max(500, "Car details cannot exceed 500 characters"),
  dateTime: z.date({ required_error: "Please select a date and time" })
    .refine((date) => date > new Date(), {
      message: "Appointment date must be in the future",
    }),
  timeSlot: z.string()
    .min(1, "Please select a time slot")
    .regex(/^(0[9]|1[0-8]):[0-3]0$/, "Invalid time slot format"),
  locationId: z.string().min(1, "Please select a location"),
  notes: z.string()
    .max(1000, "Notes cannot exceed 1000 characters")
    .optional(),
});

type BookingData = z.infer<typeof bookingSchema>;

/**
 * Props for the BookingDialog component
 */
interface BookingDialogProps {
  children: React.ReactNode;
  service: Service;
}

/**
 * Service appointment booking dialog with real-time availability checking.
 * Features date/time selection, location choice, car details input, and conflict detection.
 * Shows available time slots with visual indicators for booked vs. available times.
 * 
 * @param {BookingDialogProps} props - Component props
 * @param {React.ReactNode} props.children - Trigger element for opening the dialog
 * @param {Service} props.service - The service to book an appointment for
 * @returns {JSX.Element} The rendered booking dialog
 * 
 * @example
 * ```tsx
 * <BookingDialog service={selectedService}>
 *   <Button>Book Now</Button>
 * </BookingDialog>
 * ```
 */
export function BookingDialog({ children, service }: BookingDialogProps) {
  const [open, setOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date>();
  const [checkingAvailability, setCheckingAvailability] = useState(false);
  const [timeSlotAvailability, setTimeSlotAvailability] = useState<Record<string, boolean>>({});
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

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

  const timeSlots = [
    "09:00", "09:30", "10:00", "10:30", "11:00", "11:30",
    "12:00", "12:30", "14:00", "14:30", "15:00", "15:30",
    "16:00", "16:30", "17:00", "17:30", "18:00"
  ];

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
              return { timeSlot, available: false };
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

        toast({
          title: "Availability Check Failed",
          description: "Unable to verify time slot availability. Please refresh and try again.",
          variant: "destructive",
        });

        setTimeSlotAvailability({});
      } finally {
        setCheckingAvailability(false);
      }
    };

    const timeoutId = setTimeout(checkTimeSlotAvailability, 300);
    return () => clearTimeout(timeoutId);
  }, [selectedDate, form.watch("locationId")]);

  const createAppointmentMutation = useMutation({
    mutationFn: async (data: BookingData) => {
      if (!user) throw new Error("User not authenticated");

      const customer = await apiRequestJson<Customer>("POST", "/api/customers/ensure-own", {});

      const [hours, minutes] = data.timeSlot.split(':').map(Number);
      const appointmentDateTime = new Date(data.dateTime);
      appointmentDateTime.setHours(hours, minutes, 0, 0);

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

      queryClient.invalidateQueries({ 
        predicate: (query) => 
          typeof query.queryKey?.[0] === 'string' && 
          (query.queryKey[0] as string).startsWith('/api/appointments')
      });

      setOpen(false);
      form.reset();
      setSelectedDate(undefined);
    },
    onError: (error: Error) => {
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
      <DialogContent className="w-full max-w-sm md:max-w-lg max-h-[90vh] overflow-y-auto" aria-describedby="booking-dialog-description">
        <DialogHeader>
          <DialogTitle id="booking-dialog-title">Book {service.title}</DialogTitle>
          <DialogDescription id="booking-dialog-description">
            Schedule your service appointment. We'll confirm the details with you shortly.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Car Details */}
            <FormField
              control={form.control}
              name="carDetails"
              render={({ field }) => (
                <FormItem>
                  <FormLabel htmlFor="carDetails">Car Details</FormLabel>
                  <FormControl>
                    <Input
                      id="carDetails"
                      placeholder="e.g., Maruti Swift 2020 (MH-01-AB-1234)"
                      {...field}
                      data-testid="input-car-details"
                      aria-invalid={form.formState.errors.carDetails ? "true" : "false"}
                      aria-describedby={form.formState.errors.carDetails ? "carDetails-error car-details-description" : "car-details-description"}
                    />
                  </FormControl>
                  <FormDescription id="car-details-description">
                    Include make, model, year, and registration number
                  </FormDescription>
                  <FormMessage id="carDetails-error" role="alert" />
                </FormItem>
              )}
            />

            {/* Date Selection */}
            <FormField
              control={form.control}
              name="dateTime"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel htmlFor="dateTime">Appointment Date</FormLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          id="dateTime"
                          variant="outline"
                          className={cn(
                            "w-full sm:w-auto pl-3 text-left font-normal",
                            !field.value && "text-muted-foreground"
                          )}
                          data-testid="button-date-picker"
                          aria-label={field.value ? `Selected date: ${format(field.value, "PPP")}` : "Pick an appointment date"}
                          aria-invalid={form.formState.errors.dateTime ? "true" : "false"}
                          aria-describedby={form.formState.errors.dateTime ? "dateTime-error" : undefined}
                        >
                          {field.value ? (
                            format(field.value, "PPP")
                          ) : (
                            <span>Pick a date</span>
                          )}
                          <CalendarIcon className="ml-auto h-4 w-4 opacity-50" aria-hidden="true" />
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
                        aria-label="Choose appointment date"
                      />
                    </PopoverContent>
                  </Popover>
                  <FormMessage id="dateTime-error" role="alert" />
                </FormItem>
              )}
            />

            {/* Time Slot with Availability Indicators */}
            <FormField
              control={form.control}
              name="timeSlot"
              render={({ field }) => (
                <FormItem>
                  <FormLabel htmlFor="timeSlot" className="flex items-center">
                    Time Slot
                    {checkingAvailability && (
                      <Loader2 className="inline w-4 h-4 ml-2 animate-spin text-muted-foreground" aria-label="Checking availability" />
                    )}
                  </FormLabel>
                  {checkingAvailability ? (
                    <Skeleton className="h-10 w-full" data-testid="skeleton-time-slots" aria-label="Loading time slots" />
                  ) : (
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger 
                          data-testid="select-time-slot"
                          aria-label="Select appointment time slot"
                          aria-invalid={form.formState.errors.timeSlot ? "true" : "false"}
                          aria-describedby={form.formState.errors.timeSlot ? "timeSlot-error" : undefined}
                        >
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
                                <Clock className="h-4 w-4" aria-hidden="true" />
                                {time}
                              </div>
                              {hasAvailabilityInfo && (
                                isAvailable ? (
                                  <CheckCircle2 className="w-4 h-4 text-green-600" aria-hidden="true" />
                                ) : (
                                  <XCircle className="w-4 h-4 text-red-600" aria-hidden="true" />
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
                        <CheckCircle2 className="w-3 h-3 text-green-600" aria-hidden="true" />
                        Available
                      </span>
                      <span className="flex items-center gap-1">
                        <XCircle className="w-3 h-3 text-red-600" aria-hidden="true" />
                        Unavailable
                      </span>
                    </FormDescription>
                  )}
                  <FormMessage id="timeSlot-error" role="alert" />
                </FormItem>
              )}
            />

            {/* Location with Loading State */}
            <FormField
              control={form.control}
              name="locationId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel htmlFor="locationId">Service Location</FormLabel>
                  {locationsLoading ? (
                    <Skeleton className="h-10 w-full" data-testid="skeleton-locations" aria-label="Loading service locations" />
                  ) : locationsError ? (
                    <div className="text-sm text-destructive p-2 border border-destructive/50 rounded-md" role="alert">
                      Failed to load locations. Please refresh and try again.
                    </div>
                  ) : (
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger 
                          data-testid="select-location"
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
                              <MapPin className="h-4 w-4" aria-hidden="true" />
                              {location.name} - {location.address}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <FormMessage id="locationId-error" role="alert" />
                </FormItem>
              )}
            />

            {/* Notes */}
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel htmlFor="notes">Additional Notes (Optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      id="notes"
                      placeholder="Any specific requirements or concerns..."
                      {...field}
                      data-testid="textarea-notes"
                      aria-invalid={form.formState.errors.notes ? "true" : "false"}
                      aria-describedby={form.formState.errors.notes ? "notes-error" : undefined}
                    />
                  </FormControl>
                  <FormMessage id="notes-error" role="alert" />
                </FormItem>
              )}
            />

            <DialogFooter className="flex-col gap-2 sm:flex-row">
              <Button type="button" variant="outline" onClick={() => setOpen(false)} aria-label="Cancel booking">
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={createAppointmentMutation.isPending}
                data-testid="button-confirm-booking"
                aria-label={createAppointmentMutation.isPending ? "Booking appointment, please wait" : "Confirm booking"}
              >
                {createAppointmentMutation.isPending ? "Booking..." : "Book Appointment"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
