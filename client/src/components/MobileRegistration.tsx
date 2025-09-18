import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Smartphone, ArrowLeft } from "lucide-react";

// Country codes with popular countries first (India as main land + international markets)
const COUNTRY_CODES = [
  // Primary market - India as main land
  { code: "+91", country: "India", flag: "🇮🇳" },
  
  // Major English-speaking markets
  { code: "+1", country: "US/Canada", flag: "🇺🇸" },
  { code: "+44", country: "United Kingdom", flag: "🇬🇧" },
  { code: "+61", country: "Australia", flag: "🇦🇺" },
  { code: "+64", country: "New Zealand", flag: "🇳🇿" },
  
  // Gulf & Middle East (major Indian diaspora)
  { code: "+971", country: "UAE", flag: "🇦🇪" },
  { code: "+966", country: "Saudi Arabia", flag: "🇸🇦" },
  { code: "+965", country: "Kuwait", flag: "🇰🇼" },
  { code: "+973", country: "Bahrain", flag: "🇧🇭" },
  { code: "+974", country: "Qatar", flag: "🇶🇦" },
  { code: "+968", country: "Oman", flag: "🇴🇲" },
  
  // South & Southeast Asia
  { code: "+65", country: "Singapore", flag: "🇸🇬" },
  { code: "+60", country: "Malaysia", flag: "🇲🇾" },
  { code: "+66", country: "Thailand", flag: "🇹🇭" },
  { code: "+62", country: "Indonesia", flag: "🇮🇩" },
  { code: "+63", country: "Philippines", flag: "🇵🇭" },
  { code: "+84", country: "Vietnam", flag: "🇻🇳" },
  
  // Europe
  { code: "+49", country: "Germany", flag: "🇩🇪" },
  { code: "+33", country: "France", flag: "🇫🇷" },
  { code: "+39", country: "Italy", flag: "🇮🇹" },
  { code: "+34", country: "Spain", flag: "🇪🇸" },
  { code: "+31", country: "Netherlands", flag: "🇳🇱" },
  
  // Asia Pacific & Other Major Markets
  { code: "+86", country: "China", flag: "🇨🇳" },
  { code: "+81", country: "Japan", flag: "🇯🇵" },
  { code: "+82", country: "South Korea", flag: "🇰🇷" },
  { code: "+55", country: "Brazil", flag: "🇧🇷" },
  { code: "+7", country: "Russia", flag: "🇷🇺" },
];

const phoneSchema = z.object({
  phone: z
    .string()
    .min(10, "Phone number must be at least 10 digits")
    .regex(/^[0-9]+$/, "Phone number must contain only digits"),
  countryCode: z.string().min(1, "Please select a country code"),
  name: z.string().min(2, "Name must be at least 2 characters"),
  // Enhanced profile fields
  dateOfBirth: z.string().optional().refine((date) => {
    if (!date) return true;
    const dob = new Date(date);
    const today = new Date();
    const age = today.getFullYear() - dob.getFullYear();
    return age >= 16 && age <= 100;
  }, { message: "Age must be between 16 and 100 years" }),
  registrationNumbers: z.string().optional().refine((regNumbers) => {
    if (!regNumbers) return true;
    // Allow comma-separated registration numbers with basic validation
    const numbers = regNumbers.split(',').map(n => n.trim()).filter(n => n.length > 0);
    return numbers.every(n => /^[A-Z0-9\-\s]{6,20}$/i.test(n));
  }, { message: "Enter valid vehicle registration numbers (e.g., MH12AB1234)" }),
  profileImage: z.string().url().optional().or(z.literal("")),
});

const otpSchema = z.object({
  otp: z.string().length(6, "OTP must be 6 digits"),
});

type PhoneData = z.infer<typeof phoneSchema>;
type OtpData = z.infer<typeof otpSchema>;

interface MobileRegistrationProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

type Step = "phone" | "otp" | "complete";

export function MobileRegistration({ 
  open, 
  onOpenChange, 
  onSuccess 
}: MobileRegistrationProps) {
  const [step, setStep] = useState<Step>("phone");
  const [phoneData, setPhoneData] = useState<PhoneData | null>(null);
  const [otpExpiresIn, setOtpExpiresIn] = useState<number | null>(null);
  const [countdown, setCountdown] = useState(0);
  const { toast } = useToast();

  const phoneForm = useForm<PhoneData>({
    resolver: zodResolver(phoneSchema),
    defaultValues: {
      phone: "",
      countryCode: "+91", // Default to India
      name: "",
      dateOfBirth: "",
      registrationNumbers: "",
      profileImage: "",
    },
  });

  const otpForm = useForm<OtpData>({
    resolver: zodResolver(otpSchema),
    defaultValues: {
      otp: "",
    },
  });

  // Send OTP mutation
  const sendOtpMutation = useMutation({
    mutationFn: async (data: { phone: string; countryCode: string; purpose: string }) => {
      const response = await apiRequest("POST", "/api/auth/mobile/send-otp", data);
      return response.json();
    },
    onSuccess: (data) => {
      setOtpExpiresIn(data.expiresIn);
      setCountdown(data.expiresIn || 300); // Default 5 minutes
      setStep("otp");
      toast({
        title: "OTP Sent",
        description: `OTP sent to ${phoneData?.countryCode}${phoneData?.phone}`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Send OTP",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  // Mobile registration mutation (after OTP verification)
  const registerMutation = useMutation({
    mutationFn: async (data: {
      phone: string;
      countryCode: string;
      name: string;
      dateOfBirth?: string;
      registrationNumbers?: string[];
      profileImage?: string;
    }) => {
      const response = await apiRequest("POST", "/api/auth/mobile/register", data);
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Registration Complete",
        description: data.message || "Account created successfully!",
      });
      onSuccess();
      onOpenChange(false);
      // Reset form state
      setStep("phone");
      setPhoneData(null);
      phoneForm.reset();
      otpForm.reset();
    },
    onError: (error: any) => {
      toast({
        title: "Registration Failed",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  // Verify OTP mutation
  const verifyOtpMutation = useMutation({
    mutationFn: async (data: { 
      phone: string; 
      countryCode: string; 
      otpCode: string;
    }) => {
      const response = await apiRequest("POST", "/api/auth/mobile/verify-otp", data);
      return response.json();
    },
    onSuccess: (data) => {
      // OTP verified, now register the user with profile data
      if (!phoneData) return;
      
      const registrationData = {
        phone: phoneData.phone,
        countryCode: phoneData.countryCode,
        name: phoneData.name,
        dateOfBirth: phoneData.dateOfBirth ? new Date(phoneData.dateOfBirth).toISOString() : undefined,
        registrationNumbers: phoneData.registrationNumbers ? 
          phoneData.registrationNumbers.split(',').map(r => r.trim()).filter(r => r.length > 0) : [],
        profileImage: phoneData.profileImage || undefined,
      };
      
      registerMutation.mutate(registrationData);
    },
    onError: (error: any) => {
      toast({
        title: "OTP Verification Failed",
        description: error.message || "Please check your OTP and try again",
        variant: "destructive",
      });
    },
  });

  // Countdown timer effect
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (countdown > 0) {
      interval = setInterval(() => {
        setCountdown(prev => prev - 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [countdown]);

  const onPhoneSubmit = (data: PhoneData) => {
    setPhoneData(data);
    sendOtpMutation.mutate({
      phone: data.phone,
      countryCode: data.countryCode,
      purpose: "registration",
    });
  };

  const onOtpSubmit = (data: OtpData) => {
    if (!phoneData) return;
    
    verifyOtpMutation.mutate({
      phone: phoneData.phone,
      countryCode: phoneData.countryCode,
      otpCode: data.otp,
    });
  };

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const handleResendOtp = () => {
    if (!phoneData) return;
    sendOtpMutation.mutate({
      phone: phoneData.phone,
      countryCode: phoneData.countryCode,
      purpose: "registration",
    });
  };

  const handleBack = () => {
    if (step === "otp") {
      setStep("phone");
      otpForm.reset();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {step === "otp" && (
              <Button
                variant="ghost" 
                size="sm"
                onClick={handleBack}
                className="p-1 h-auto"
                data-testid="button-back"
              >
                <ArrowLeft className="w-4 h-4" />
              </Button>
            )}
            <Smartphone className="w-5 h-5" />
            {step === "phone" && "Mobile Registration"}
            {step === "otp" && "Verify OTP"}
          </DialogTitle>
          <DialogDescription>
            {step === "phone" && "Enter your phone number to get started"}
            {step === "otp" && `Enter the 6-digit code sent to ${phoneData?.countryCode}${phoneData?.phone}`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {step === "phone" && (
            <Form {...phoneForm}>
              <form onSubmit={phoneForm.handleSubmit(onPhoneSubmit)} className="space-y-4">
                <FormField
                  control={phoneForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Full Name *</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Enter your full name"
                          data-testid="input-name"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={phoneForm.control}
                  name="dateOfBirth"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Date of Birth (Optional)</FormLabel>
                      <FormControl>
                        <Input
                          type="date"
                          data-testid="input-dob"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={phoneForm.control}
                  name="registrationNumbers"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Vehicle Registration Numbers (Optional)</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="MH12AB1234, KA05CD9876 (comma separated)"
                          data-testid="input-registration"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={phoneForm.control}
                  name="profileImage"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Profile Image URL (Optional)</FormLabel>
                      <FormControl>
                        <Input
                          type="url"
                          placeholder="https://example.com/your-photo.jpg"
                          data-testid="input-profile-image"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    control={phoneForm.control}
                    name="countryCode"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Country</FormLabel>
                        <Select 
                          onValueChange={field.onChange} 
                          defaultValue={field.value}
                          data-testid="select-country"
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select country" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {COUNTRY_CODES.map((country) => (
                              <SelectItem key={country.code} value={country.code}>
                                <span className="flex items-center gap-2">
                                  <span>{country.flag}</span>
                                  <span>{country.code}</span>
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={phoneForm.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Phone Number</FormLabel>
                        <FormControl>
                          <Input
                            type="tel"
                            placeholder="1234567890"
                            data-testid="input-phone"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  disabled={sendOtpMutation.isPending}
                  data-testid="button-send-otp"
                >
                  {sendOtpMutation.isPending ? "Sending OTP..." : "Send OTP"}
                </Button>
              </form>
            </Form>
          )}

          {step === "otp" && (
            <Form {...otpForm}>
              <form onSubmit={otpForm.handleSubmit(onOtpSubmit)} className="space-y-4">
                <FormField
                  control={otpForm.control}
                  name="otp"
                  render={({ field }) => (
                    <FormItem className="text-center">
                      <FormLabel>Enter OTP</FormLabel>
                      <FormControl>
                        <InputOTP 
                          maxLength={6} 
                          value={field.value}
                          onChange={field.onChange}
                          data-testid="input-otp"
                        >
                          <InputOTPGroup className="mx-auto">
                            <InputOTPSlot index={0} />
                            <InputOTPSlot index={1} />
                            <InputOTPSlot index={2} />
                            <InputOTPSlot index={3} />
                            <InputOTPSlot index={4} />
                            <InputOTPSlot index={5} />
                          </InputOTPGroup>
                        </InputOTP>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {countdown > 0 && (
                  <div className="text-center text-sm text-muted-foreground">
                    Time remaining: <span className="font-mono">{formatTime(countdown)}</span>
                  </div>
                )}

                <div className="space-y-2">
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={verifyOtpMutation.isPending}
                    data-testid="button-verify-otp"
                  >
                    {verifyOtpMutation.isPending ? "Verifying..." : "Verify OTP"}
                  </Button>

                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full"
                    onClick={handleResendOtp}
                    disabled={sendOtpMutation.isPending || countdown > 0}
                    data-testid="button-resend-otp"
                  >
                    {sendOtpMutation.isPending ? "Sending..." : "Resend OTP"}
                  </Button>
                </div>
              </form>
            </Form>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}