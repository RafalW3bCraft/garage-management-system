import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { apiRequestJson } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Phone, User, Loader2, Timer } from "lucide-react";
import { cn } from "@/lib/utils";
import type { User as UserType } from "@shared/schema";

// Validation schemas for each step
const phoneSchema = z.object({
  phone: z
    .string()
    .min(10, "Phone number must be at least 10 digits")
    .max(15, "Phone number cannot exceed 15 digits")
    .regex(/^\d+$/, "Phone number must contain only digits"),
  countryCode: z.string().min(1, "Please select a country"),
});

const otpSchema = z.object({
  otp: z.string().length(6, "OTP must be exactly 6 digits"),
});

const profileSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
});

// Country options
const COUNTRY_OPTIONS = [
  { value: "+91", label: "India", flag: "🇮🇳" },
  { value: "UNIVERSAL", label: "Other Countries", flag: "🌍" },
];

type PhoneData = z.infer<typeof phoneSchema>;
type OtpData = z.infer<typeof otpSchema>;
type ProfileData = z.infer<typeof profileSchema>;

type MobileStep = "phone" | "otp" | "profile";

interface MobileRegistrationProps {
  mode: "login" | "register";
  onSuccess: (user: UserType) => void;
  onBack: () => void;
}

export function MobileRegistration({ mode, onSuccess, onBack }: MobileRegistrationProps) {
  const [currentStep, setCurrentStep] = useState<MobileStep>("phone");
  const [phoneData, setPhoneData] = useState<PhoneData | null>(null);
  const [otpCountdown, setOtpCountdown] = useState(0);
  const { toast } = useToast();

  // Forms for each step
  const phoneForm = useForm<PhoneData>({
    resolver: zodResolver(phoneSchema),
    defaultValues: {
      phone: "",
      countryCode: "+91", // Default to India
    },
  });

  const otpForm = useForm<OtpData>({
    resolver: zodResolver(otpSchema),
    defaultValues: {
      otp: "",
    },
  });

  const profileForm = useForm<ProfileData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: "",
    },
  });

  // OTP countdown effect
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (otpCountdown > 0) {
      interval = setInterval(() => {
        setOtpCountdown((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [otpCountdown]);

  // Send OTP mutation
  const sendOtpMutation = useMutation({
    mutationFn: async (data: PhoneData) => {
      const response = await apiRequestJson<{ message: string; expiresIn?: number }>(
        "POST",
        "/api/auth/mobile/send-otp",
        {
          phone: data.phone,
          countryCode: data.countryCode,
          purpose: mode === "login" ? "login" : "registration",
        }
      );
      return response;
    },
    onSuccess: (data, variables) => {
      setPhoneData(variables);
      setCurrentStep("otp");
      setOtpCountdown(300); // 5 minutes countdown
      toast({
        title: "OTP Sent",
        description: `Verification code sent to ${variables.countryCode}${variables.phone}`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Send OTP",
        description: error.message || "Please try again later",
        variant: "destructive",
      });
    },
  });

  // Verify OTP mutation
  const verifyOtpMutation = useMutation({
    mutationFn: async (data: OtpData) => {
      if (!phoneData) throw new Error("Phone data not available");
      
      const response = await apiRequestJson<{ user?: UserType; message: string }>(
        "POST",
        "/api/auth/mobile/verify-otp",
        {
          phone: phoneData.phone,
          countryCode: phoneData.countryCode,
          otpCode: data.otp,
          purpose: mode === "login" ? "login" : "registration",
        }
      );
      return response;
    },
    onSuccess: (data) => {
      if (data.user) {
        // Login successful - user already exists
        onSuccess(data.user);
        toast({
          title: "Login Successful",
          description: "Welcome back!",
        });
      } else {
        // For registration, proceed to profile setup
        setCurrentStep("profile");
        toast({
          title: "Phone Verified",
          description: "Please complete your profile",
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Invalid OTP",
        description: error.message || "Please check the code and try again",
        variant: "destructive",
      });
      otpForm.reset();
    },
  });

  // Complete registration mutation
  const completeRegistrationMutation = useMutation({
    mutationFn: async (data: ProfileData) => {
      if (!phoneData) throw new Error("Phone data not available");
      
      const response = await apiRequestJson<{ user: UserType; message: string }>(
        "POST",
        "/api/auth/mobile/register",
        {
          phone: phoneData.phone,
          countryCode: phoneData.countryCode,
          name: data.name,
        }
      );
      return response;
    },
    onSuccess: (data) => {
      onSuccess(data.user);
      toast({
        title: "Registration Complete",
        description: "Welcome to RonakMotorGarage!",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Registration Failed",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  // Handle phone form submission
  const onPhoneSubmit = (data: PhoneData) => {
    sendOtpMutation.mutate(data);
  };

  // Handle OTP form submission
  const onOtpSubmit = (data: OtpData) => {
    verifyOtpMutation.mutate(data);
  };

  // Handle profile form submission
  const onProfileSubmit = (data: ProfileData) => {
    completeRegistrationMutation.mutate(data);
  };

  // Resend OTP
  const resendOtp = () => {
    if (phoneData && otpCountdown === 0) {
      sendOtpMutation.mutate(phoneData);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="space-y-6">
      {/* Progress indicator */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="p-0 h-auto font-normal"
          data-testid="button-back"
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back
        </Button>
        <div className="flex items-center gap-1">
          {["phone", "otp", mode === "register" ? "profile" : null].filter(Boolean).map((step, index) => (
            <div
              key={step}
              className={cn(
                "w-2 h-2 rounded-full",
                currentStep === step || 
                (currentStep === "otp" && step === "phone") ||
                (currentStep === "profile" && ["phone", "otp"].includes(step!))
                  ? "bg-primary"
                  : "bg-muted"
              )}
            />
          ))}
        </div>
      </div>

      {/* Phone input step */}
      {currentStep === "phone" && (
        <div className="space-y-4">
          <div className="text-center space-y-2">
            <Phone className="w-8 h-8 mx-auto text-primary" />
            <h3 className="text-lg font-semibold">
              {mode === "login" ? "Login with Phone" : "Register with Phone"}
            </h3>
            <p className="text-sm text-muted-foreground">
              {mode === "login" 
                ? "Enter your phone number to receive a verification code"
                : "Enter your phone number to get started"
              }
            </p>
          </div>

          <Form {...phoneForm}>
            <form onSubmit={phoneForm.handleSubmit(onPhoneSubmit)} className="space-y-4">
              <FormField
                control={phoneForm.control}
                name="countryCode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Country</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-country">
                          <SelectValue placeholder="Select country" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {COUNTRY_OPTIONS.map((country) => (
                          <SelectItem key={country.value} value={country.value}>
                            {country.flag} {country.label}
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
                    <div className="flex gap-2">
                      <div className="w-20 px-3 py-2 text-sm border rounded-md bg-muted">
                        {phoneForm.watch("countryCode") === "UNIVERSAL" ? "+XX" : phoneForm.watch("countryCode")}
                      </div>
                      <FormControl>
                        <Input
                          placeholder="1234567890"
                          {...field}
                          data-testid="input-phone"
                        />
                      </FormControl>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button
                type="submit"
                className="w-full"
                disabled={sendOtpMutation.isPending}
                data-testid="button-send-otp"
              >
                {sendOtpMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Sending OTP...
                  </>
                ) : (
                  "Send Verification Code"
                )}
              </Button>
            </form>
          </Form>
        </div>
      )}

      {/* OTP verification step */}
      {currentStep === "otp" && phoneData && (
        <div className="space-y-4">
          <div className="text-center space-y-2">
            <Phone className="w-8 h-8 mx-auto text-primary" />
            <h3 className="text-lg font-semibold">Enter Verification Code</h3>
            <p className="text-sm text-muted-foreground">
              We sent a 6-digit code to {phoneData.countryCode}{phoneData.phone}
            </p>
          </div>

          <Form {...otpForm}>
            <form onSubmit={otpForm.handleSubmit(onOtpSubmit)} className="space-y-4">
              <FormField
                control={otpForm.control}
                name="otp"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Verification Code</FormLabel>
                    <FormControl>
                      <div className="flex justify-center">
                        <InputOTP
                          maxLength={6}
                          value={field.value}
                          onChange={field.onChange}
                          data-testid="input-otp"
                        >
                          <InputOTPGroup>
                            <InputOTPSlot index={0} />
                            <InputOTPSlot index={1} />
                            <InputOTPSlot index={2} />
                            <InputOTPSlot index={3} />
                            <InputOTPSlot index={4} />
                            <InputOTPSlot index={5} />
                          </InputOTPGroup>
                        </InputOTP>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button
                type="submit"
                className="w-full"
                disabled={verifyOtpMutation.isPending || otpForm.watch("otp").length !== 6}
                data-testid="button-verify-otp"
              >
                {verifyOtpMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  "Verify Code"
                )}
              </Button>

              {/* Resend OTP */}
              <div className="text-center">
                {otpCountdown > 0 ? (
                  <p className="text-sm text-muted-foreground flex items-center justify-center gap-1">
                    <Timer className="w-4 h-4" />
                    Resend code in {formatTime(otpCountdown)}
                  </p>
                ) : (
                  <Button
                    variant="ghost"
                    onClick={resendOtp}
                    disabled={sendOtpMutation.isPending}
                    className="p-0 h-auto text-primary hover:text-primary/80"
                    data-testid="button-resend-otp"
                  >
                    Didn't receive code? Resend
                  </Button>
                )}
              </div>
            </form>
          </Form>
        </div>
      )}

      {/* Profile setup step (only for registration) */}
      {currentStep === "profile" && mode === "register" && (
        <div className="space-y-4">
          <div className="text-center space-y-2">
            <User className="w-8 h-8 mx-auto text-primary" />
            <h3 className="text-lg font-semibold">Complete Your Profile</h3>
            <p className="text-sm text-muted-foreground">
              Please enter your name to complete registration
            </p>
          </div>

          <Form {...profileForm}>
            <form onSubmit={profileForm.handleSubmit(onProfileSubmit)} className="space-y-4">
              <FormField
                control={profileForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Full Name</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Enter your full name"
                        {...field}
                        data-testid="input-name"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button
                type="submit"
                className="w-full"
                disabled={completeRegistrationMutation.isPending}
                data-testid="button-complete-registration"
              >
                {completeRegistrationMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Creating Account...
                  </>
                ) : (
                  "Complete Registration"
                )}
              </Button>
            </form>
          </Form>
        </div>
      )}
    </div>
  );
}