import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { z } from "zod";

/**
 * Zod schema for contact form validation
 */
const contactFormSchema = z.object({
  name: z.string().min(1, "Name is required").max(100, "Name is too long"),
  email: z.string().email("Please enter a valid email address"),
  phone: z.string().min(10, "Please enter a valid phone number").max(15, "Phone number is too long"),
  message: z.string().min(10, "Please enter a message of at least 10 characters").max(1000, "Message is too long"),
});

type ContactFormData = z.infer<typeof contactFormSchema>;

/**
 * Props for the ContactDialog component
 */
interface ContactDialogProps {
  carMake: string;
  carModel: string;
  carYear: number;
  carPrice: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Contact seller dialog for inquiring about cars for sale.
 * Pre-fills car details and allows users to send customized messages to sellers.
 * 
 * @param {ContactDialogProps} props - Component props
 * @returns {JSX.Element} The rendered contact dialog
 * 
 * @example
 * ```tsx
 * <ContactDialog
 *   carMake="Maruti"
 *   carModel="Swift"
 *   carYear={2020}
 *   carPrice={550000}
 *   open={isOpen}
 *   onOpenChange={setIsOpen}
 * />
 * ```
 */
export function ContactDialog({ 
  carMake, 
  carModel, 
  carYear, 
  carPrice,
  open, 
  onOpenChange 
}: ContactDialogProps) {
  const { toast } = useToast();

  const form = useForm<ContactFormData>({
    resolver: zodResolver(contactFormSchema),
    mode: "onChange",
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      message: `I'm interested in the ${carMake} ${carModel} (${carYear}) listed for ₹${carPrice.toLocaleString('en-IN')}. Please contact me with more details.`,
    },
  });

  const sendContactMutation = useMutation({
    mutationFn: async (data: ContactFormData) => {
      const subject = `Car Inquiry: ${carMake} ${carModel} (${carYear})`;
      return apiRequest("POST", "/api/contacts", {
        ...data,
        subject,
      });
    },
    onSuccess: () => {
      toast({
        title: "Message Sent Successfully!",
        description: `Your inquiry about the ${carMake} ${carModel} has been sent. We'll contact you soon.`,
      });
      
      // Reset form and close dialog
      form.reset();
      onOpenChange(false);
    },
    onError: (error: Error) => {
      console.error("Error sending contact message:", error);
      const errorMessage = error?.message || "Failed to send message. Please try again.";
      toast({
        title: "Message Failed",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: ContactFormData) => {
    sendContactMutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-sm md:max-w-lg max-h-[90vh] overflow-y-auto" data-testid="dialog-contact" aria-describedby="contact-dialog-description">
        <DialogHeader>
          <DialogTitle id="contact-dialog-title" data-testid="text-contact-title">
            Contact Seller
          </DialogTitle>
          <p id="contact-dialog-description" className="sr-only">
            Fill out this form to inquire about the car
          </p>
        </DialogHeader>

        <div className="space-y-4 max-h-[60vh] overflow-y-auto">
          <div className="rounded-lg border p-3 bg-muted/50">
            <h4 className="font-medium text-sm">Car Details</h4>
            <p className="text-sm text-muted-foreground">
              {carMake} {carModel} ({carYear})
            </p>
            <p className="text-sm font-medium">
              ₹{carPrice.toLocaleString('en-IN')}
            </p>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel htmlFor="name">Full Name *</FormLabel>
                    <FormControl>
                      <Input 
                        id="name"
                        placeholder="Enter your full name" 
                        {...field}
                        data-testid="input-contact-name"
                        aria-invalid={form.formState.errors.name ? "true" : "false"}
                        aria-describedby={form.formState.errors.name ? "name-error" : undefined}
                      />
                    </FormControl>
                    <FormMessage id="name-error" role="alert" />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel htmlFor="email">Email Address *</FormLabel>
                    <FormControl>
                      <Input 
                        id="email"
                        type="email"
                        placeholder="Enter your email address" 
                        {...field}
                        data-testid="input-contact-email"
                        aria-invalid={form.formState.errors.email ? "true" : "false"}
                        aria-describedby={form.formState.errors.email ? "email-error" : undefined}
                      />
                    </FormControl>
                    <FormMessage id="email-error" role="alert" />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel htmlFor="phone">Phone Number *</FormLabel>
                    <FormControl>
                      <Input 
                        id="phone"
                        type="tel"
                        placeholder="Enter your phone number" 
                        {...field}
                        data-testid="input-contact-phone"
                        aria-invalid={form.formState.errors.phone ? "true" : "false"}
                        aria-describedby={form.formState.errors.phone ? "phone-error" : undefined}
                      />
                    </FormControl>
                    <FormMessage id="phone-error" role="alert" />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="message"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel htmlFor="message">Message *</FormLabel>
                    <FormControl>
                      <Textarea
                        id="message"
                        placeholder="Enter your message..."
                        className="min-h-[100px] resize-none"
                        {...field}
                        data-testid="textarea-contact-message"
                        aria-invalid={form.formState.errors.message ? "true" : "false"}
                        aria-describedby={form.formState.errors.message ? "message-error" : undefined}
                      />
                    </FormControl>
                    <FormMessage id="message-error" role="alert" />
                  </FormItem>
                )}
              />

              <div className="flex flex-col gap-2 sm:flex-row">
                <Button 
                  type="button"
                  variant="outline" 
                  onClick={() => onOpenChange(false)}
                  disabled={sendContactMutation.isPending}
                  data-testid="button-contact-cancel"
                >
                  Cancel
                </Button>
                <Button 
                  type="submit"
                  disabled={sendContactMutation.isPending || !form.formState.isValid}
                  data-testid="button-contact-send"
                >
                  {sendContactMutation.isPending ? "Sending..." : "Send Message"}
                </Button>
              </div>
            </form>
          </Form>
        </div>
      </DialogContent>
    </Dialog>
  );
}