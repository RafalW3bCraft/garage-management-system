import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { 
  MapPin, 
  Phone, 
  Mail, 
  Clock, 
  Star,
  Send,
  Loader2
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useErrorHandler } from "@/lib/error-utils";
import type { Location } from "@shared/schema";

/**
 * Zod schema for contact form validation
 */
const contactFormSchema = z.object({
  name: z.string()
    .min(2, "Name must be at least 2 characters")
    .max(100, "Name cannot exceed 100 characters"),
  email: z.string()
    .email("Please enter a valid email address"),
  phone: z.string()
    .min(10, "Phone number must be at least 10 digits")
    .max(15, "Phone number cannot exceed 15 digits")
    .regex(/^[0-9+\-\s()]*$/, "Please enter a valid phone number"),
  subject: z.string()
    .min(5, "Subject must be at least 5 characters")
    .max(200, "Subject cannot exceed 200 characters"),
  message: z.string()
    .min(10, "Message must be at least 10 characters")
    .max(1000, "Message cannot exceed 1000 characters"),
});

type ContactFormData = z.infer<typeof contactFormSchema>;

/**
 * Contact page component providing a contact form, quick contact information,
 * service locations display, and frequently asked questions section.
 * 
 * @returns {JSX.Element} The rendered contact page
 * 
 * @example
 * ```tsx
 * <Route path="/contact" component={Contact} />
 * ```
 */
export default function Contact() {
  const { toast } = useToast();
  const { handleMutationError } = useErrorHandler();

  // Initialize form with react-hook-form and Zod validation
  const form = useForm<ContactFormData>({
    resolver: zodResolver(contactFormSchema),
    mode: "onChange",
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      subject: "",
      message: "",
    },
  });

  // Fetch locations from API
  const { data: locations, isLoading: locationsLoading, isError: locationsError, error: locationsErrorData, refetch: refetchLocations } = useQuery<Location[]>({
    queryKey: ["/api/locations"],
    staleTime: 10 * 60 * 1000, // 10 minutes
    retry: 3,
  });

  // Contact form mutation
  const contactMutation = useMutation({
    mutationFn: async (data: ContactFormData) => {
      const response = await apiRequest("POST", "/api/contacts", data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Message Sent!",
        description: "Thank you for contacting us. We'll get back to you soon.",
      });
      // Reset form
      form.reset();
    },
    onError: (error: Error) => {
      handleMutationError(error, {
        title: "Failed to Send Message",
        defaultMessage: "Could not send your message. Please try again.",
      });
    },
  });

  const onSubmit = (data: ContactFormData) => {
    contactMutation.mutate(data);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <section className="py-16 bg-muted/50">
        <div className="container mx-auto px-4">
          <div className="text-center">
            <h1 className="text-4xl font-bold mb-4">Contact Us</h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Get in touch with our expert team. We're here to help with all your automotive needs.
            </p>
          </div>
        </div>
      </section>

      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          {/* Contact Form */}
          <div>
            <Card>
              <CardHeader>
                <CardTitle className="text-2xl">Send us a Message</CardTitle>
                <CardDescription>
                  Fill out the form below and we'll get back to you as soon as possible.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel htmlFor="name">Full Name *</FormLabel>
                            <FormControl>
                              <Input
                                id="name"
                                placeholder="Your full name"
                                {...field}
                                data-testid="input-name"
                              />
                            </FormControl>
                            <FormMessage />
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
                                placeholder="+91-98765-43210"
                                {...field}
                                data-testid="input-phone"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

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
                              placeholder="your.email@example.com"
                              {...field}
                              data-testid="input-email"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="subject"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel htmlFor="subject">Subject *</FormLabel>
                          <FormControl>
                            <Input
                              id="subject"
                              placeholder="What can we help you with?"
                              {...field}
                              data-testid="input-subject"
                            />
                          </FormControl>
                          <FormMessage />
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
                              placeholder="Please describe your inquiry in detail..."
                              rows={6}
                              {...field}
                              data-testid="textarea-message"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <Button 
                      type="submit" 
                      className="w-full" 
                      disabled={contactMutation.isPending}
                      data-testid="button-send-message"
                    >
                      {contactMutation.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Sending...
                        </>
                      ) : (
                        <>
                          <Send className="mr-2 h-4 w-4" />
                          Send Message
                        </>
                      )}
                    </Button>
                  </form>
                </Form>
              </CardContent>
            </Card>
          </div>

          {/* Contact Information */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Quick Contact</CardTitle>
                <CardDescription>Reach us directly through these channels</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-3">
                  <Phone className="h-5 w-5 text-accent" />
                  <div>
                    <p className="font-medium">Emergency Hotline</p>
                    <p className="text-sm text-muted-foreground">+91-98765-43210</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Mail className="h-5 w-5 text-accent" />
                  <div>
                    <p className="font-medium">General Inquiries</p>
                    <p className="text-sm text-muted-foreground">info@ronakmotorgarage.com</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Clock className="h-5 w-5 text-accent" />
                  <div>
                    <p className="font-medium">Business Hours</p>
                    <p className="text-sm text-muted-foreground">Mon-Sat: 9:00 AM - 7:00 PM</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Location Cards */}
            <div className="space-y-4">
              <h3 className="text-xl font-semibold">Our Locations</h3>
              {locationsLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : locationsError ? (
                <div className="text-center py-8">
                  <h4 className="text-lg font-semibold mb-2">Failed to load locations</h4>
                  <p className="text-muted-foreground mb-4">
                    {locationsErrorData?.message || "Something went wrong. Please try again."}
                  </p>
                  <Button onClick={() => refetchLocations()} data-testid="button-retry-locations">
                    Try Again
                  </Button>
                </div>
              ) : locations && locations.length > 0 ? (
                locations.map((location) => (
                  <Card key={location.id} className="hover-elevate">
                    <CardHeader>
                      <div className="flex justify-between items-start">
                        <div>
                          <CardTitle className="text-lg">{location.name}</CardTitle>
                          <div className="flex items-center gap-1 mt-1">
                            <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                            <span className="text-sm font-medium">{location.rating || "4.5"}</span>
                          </div>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-start gap-2">
                        <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                        <p className="text-sm">{location.address}</p>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <Phone className="h-4 w-4 text-muted-foreground" />
                        <p className="text-sm">{location.phone}</p>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <Mail className="h-4 w-4 text-muted-foreground" />
                        <p className="text-sm">{location.email}</p>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <p className="text-sm">{location.hours}</p>
                      </div>

                      <div className="flex flex-wrap gap-1 mt-2">
                        <Badge variant="secondary" className="text-xs">
                          All Services
                        </Badge>
                        <Badge variant="secondary" className="text-xs">
                          Expert Technicians
                        </Badge>
                      </div>

                      <Button variant="outline" size="sm" className="w-full mt-3">
                        <MapPin className="mr-2 h-4 w-4" />
                        Get Directions
                      </Button>
                    </CardContent>
                  </Card>
                ))
              ) : (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">No locations available</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* FAQ Section */}
      <section className="py-16 bg-muted/50">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">Frequently Asked Questions</h2>
            <p className="text-muted-foreground">
              Quick answers to common questions about our services
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">How do I book an appointment?</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  You can book an appointment through our website, call us directly, or visit any of our locations. 
                  Online booking is available 24/7 for your convenience.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">What payment methods do you accept?</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  We accept cash, credit cards, debit cards, UPI payments, and digital wallets. 
                  Payment is due after service completion.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Do you provide warranty on services?</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Yes, we provide warranty on all our services. The warranty period varies by service type, 
                  typically ranging from 1 month to 6 months.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Can I track my service progress?</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Yes, you can track your service progress through our website or by calling the branch 
                  directly. We'll also send you updates via SMS and email.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>
    </div>
  );
}
