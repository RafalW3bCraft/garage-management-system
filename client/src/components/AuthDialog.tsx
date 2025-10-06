import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Mail, Smartphone, ArrowLeft, User, Chrome, MessageSquare } from "lucide-react";

// Import our new hooks
import { useAuthFlow } from "@/hooks/useAuthFlow";
import { useAuthPreferences } from "@/hooks/useAuthPreferences";
import { useAuthMutations } from "@/hooks/useAuthMutations";
import { useAuthForm } from "@/hooks/useAuthForm";
import { useAuth } from "@/hooks/use-auth";

/**
 * Country options for mobile registration
 */
const COUNTRY_OPTIONS = [
  { value: "+91", label: "India", flag: "🇮🇳" },
  { value: "+1", label: "United States", flag: "🇺🇸" },
  { value: "+44", label: "United Kingdom", flag: "🇬🇧" },
  { value: "+86", label: "China", flag: "🇨🇳" },
  { value: "+81", label: "Japan", flag: "🇯🇵" },
] as const;

/**
 * Props for the AuthDialog component
 */
interface AuthDialogProps {
  children: React.ReactNode;
}

/**
 * Comprehensive authentication dialog supporting OTP-only authentication.
 * Features mobile OTP (WhatsApp & Email) authentication flows with
 * smart method selection, preference memory, and seamless multi-step registration.
 * 
 * Note: Email/password and Google OAuth have been disabled in favor of OTP-only authentication.
 * 
 * @param {AuthDialogProps} props - Component props
 * @param {React.ReactNode} props.children - Trigger element for opening the dialog
 * @returns {JSX.Element} The rendered authentication dialog
 * 
 * @example
 * ```tsx
 * <AuthDialog>
 *   <Button>Login</Button>
 * </AuthDialog>
 * ```
 */
export function AuthDialog({ children }: AuthDialogProps) {
  const [open, setOpen] = useState(false);
  const [otpCountdown, setOtpCountdown] = useState(0);
  
  // Use our new hooks
  const flow = useAuthFlow();
  const preferences = useAuthPreferences();
  const { isGoogleEnabled } = useAuth();
  
  // Auth mutations with callbacks for flow management
  const mutations = useAuthMutations({
    onTransition: (nextStep) => {
      if (nextStep && (nextStep as string) === "otp-verification") {
        flow.goToStep("otp-verification");
        setOtpCountdown(300); // 5 minutes
      } else if (nextStep && (nextStep as string) === "profile-setup") {
        flow.goToStep("profile-setup");
      }
    },
    onComplete: () => {
      setOpen(false);
      flow.reset();
      setOtpCountdown(0);
    },
  });
  
  // Unified form management
  const authForm = useAuthForm(
    flow.step,
    flow.mode,
    flow.context,
    preferences.getDefaultEmail(),
    preferences.lastCountryCode
  );
  
  // OTP countdown timer
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (otpCountdown > 0) {
      interval = setInterval(() => {
        setOtpCountdown(prev => prev - 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [otpCountdown]);
  
  // Pre-select mobile OTP method when dialog opens (OTP-only authentication)
  useEffect(() => {
    if (open) {
      // Always default to mobile OTP since email/password and Google are disabled
      flow.setMethod('mobile');
    }
  }, [open]);
  
  // Auto-detect country code on mount
  useEffect(() => {
    if (open) {
      preferences.refreshCountryCode();
    }
  }, [open]);
  
  // Dialog close handler
  const handleDialogClose = (isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) {
      flow.reset();
      setOtpCountdown(0);
    }
  };
  
  // Keyboard shortcut handler for Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) {
        handleDialogClose(false);
      }
    };
    
    if (open) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [open]);
  
  // Method selection handler - OTP only
  const handleMethodSelection = (method: "email" | "mobile" | "google") => {
    // Only mobile OTP is allowed
    if (method !== "mobile") {
      console.warn('Only mobile OTP authentication is supported');
      return;
    }
    
    preferences.saveMethod(method);
    flow.setMethod(method);
  };
  
  // Form submission handler
  const handleFormSubmit = (formData: Record<string, unknown>) => {
    const stepData = authForm.getStepData(formData);
    
    switch (flow.step) {
      case "email-input":
        // Save email preference and move to password step
        if (preferences.rememberMe && stepData.email) {
          preferences.saveEmail(stepData.email);
        }
        flow.updateContext({ email: stepData.email });
        flow.nextStep();
        break;
        
      case "password-input":
        if (flow.mode === "login") {
          // Execute login
          mutations.executeLogin(flow.method, { password: stepData.password || "" }, {
            ...flow.context,
            password: stepData.password,
          });
        } else {
          // For registration, save password and move to name step
          flow.updateContext({ password: stepData.password });
          flow.nextStep();
        }
        break;
        
      case "name-input":
        // Complete email registration
        mutations.executeRegister(flow.method, { name: stepData.name || "" }, {
          ...flow.context,
          name: stepData.name,
        });
        break;
        
      case "phone-input":
        // Save country code preference and send OTP
        if (stepData.countryCode) {
          preferences.saveCountryCode(stepData.countryCode);
        }
        
        const channel = stepData.channel || 'whatsapp';
        
        flow.updateContext({
          channel,
          phone: stepData.phone,
          countryCode: stepData.countryCode,
          email: stepData.email,
        });
        
        mutations.sendOtp(
          channel,
          flow.mode,
          stepData.phone,
          stepData.countryCode,
          stepData.email
        );
        break;
        
      case "otp-verification":
        // Verify OTP
        mutations.verifyOtp(
          flow.context.phone!,
          flow.context.countryCode!,
          stepData.otp!,
          flow.mode
        );
        break;
        
      case "profile-setup":
        // Complete mobile registration
        mutations.executeRegister(flow.method, { name: stepData.name || "" }, {
          ...flow.context,
          name: stepData.name,
        });
        break;
    }
  };
  
  // Format time helper
  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };
  
  // Render form fields for current step
  const renderStepFields = () => {
    const fields = authForm.getStepFields();
    
    return fields.map((fieldName) => {
      const config = authForm.getFieldConfig(fieldName);
      if (!config) return null;
      
      const hasError = authForm.form.formState.errors[fieldName];
      
      return (
        <FormField
          key={fieldName}
          control={authForm.form.control}
          name={fieldName}
          render={({ field }) => (
            <FormItem>
              <FormLabel htmlFor={fieldName}>{config.label}</FormLabel>
              <FormControl>
                {fieldName === "channel" ? (
                  <RadioGroup
                    onValueChange={field.onChange}
                    value={field.value || 'whatsapp'}
                    className="flex flex-col gap-3"
                    data-testid={config.testId}
                  >
                    <div className="flex items-center space-x-3 border rounded-lg p-4 cursor-pointer hover:bg-muted/50 transition-colors">
                      <RadioGroupItem value="whatsapp" id="whatsapp" />
                      <label
                        htmlFor="whatsapp"
                        className="flex-1 flex items-center gap-3 cursor-pointer"
                      >
                        <MessageSquare className="w-5 h-5 text-green-600" aria-hidden="true" />
                        <div>
                          <div className="font-medium">WhatsApp</div>
                          <div className="text-xs text-muted-foreground">
                            Receive OTP via WhatsApp
                          </div>
                        </div>
                      </label>
                    </div>
                    <div className="flex items-center space-x-3 border rounded-lg p-4 cursor-pointer hover:bg-muted/50 transition-colors">
                      <RadioGroupItem value="email" id="email-channel" />
                      <label
                        htmlFor="email-channel"
                        className="flex-1 flex items-center gap-3 cursor-pointer"
                      >
                        <Mail className="w-5 h-5 text-blue-600" aria-hidden="true" />
                        <div>
                          <div className="font-medium">Email</div>
                          <div className="text-xs text-muted-foreground">
                            Receive OTP via email
                          </div>
                        </div>
                      </label>
                    </div>
                  </RadioGroup>
                ) : fieldName === "countryCode" ? (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger 
                      id={fieldName}
                      data-testid={config.testId}
                      aria-label="Select country code"
                      aria-invalid={hasError ? "true" : "false"}
                      aria-describedby={hasError ? `${fieldName}-error` : undefined}
                    >
                      <SelectValue placeholder={config.placeholder} />
                    </SelectTrigger>
                    <SelectContent>
                      {COUNTRY_OPTIONS.map((country) => (
                        <SelectItem key={country.value} value={country.value}>
                          <div className="flex items-center gap-2">
                            <span aria-hidden="true">{country.flag}</span>
                            <span>{country.label}</span>
                            <span className="text-muted-foreground">
                              {country.value}
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : fieldName === "otp" ? (
                  <InputOTP
                    maxLength={6}
                    value={field.value || ""}
                    onChange={field.onChange}
                    data-testid={config.testId}
                    aria-label="Enter 6-digit OTP code"
                    aria-invalid={hasError ? "true" : "false"}
                    aria-describedby={hasError ? `${fieldName}-error` : undefined}
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
                ) : (
                  <Input
                    id={fieldName}
                    type={config.type}
                    placeholder={config.placeholder}
                    className="h-12"
                    data-testid={config.testId}
                    aria-invalid={hasError ? "true" : "false"}
                    aria-describedby={hasError ? `${fieldName}-error` : undefined}
                    {...field}
                  />
                )}
              </FormControl>
              <FormMessage id={`${fieldName}-error`} role="alert" />
            </FormItem>
          )}
        />
      );
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleDialogClose}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="w-full max-w-sm md:max-w-lg max-h-[90vh] overflow-y-auto" aria-describedby="auth-dialog-description">
        <DialogHeader>
          <div className="flex items-center gap-2">
            {flow.canGoBack && (
              <Button
                variant="ghost"
                size="sm"
                onClick={flow.prevStep}
                className="p-1 h-auto"
                data-testid="button-auth-back"
                aria-label="Go back to previous step"
              >
                <ArrowLeft className="w-4 h-4" aria-hidden="true" />
              </Button>
            )}
            <div className="flex-1">
              <DialogTitle className="text-left">{flow.stepTitle}</DialogTitle>
              <DialogDescription id="auth-dialog-description" className="text-left">
                {flow.stepDescription}
              </DialogDescription>
            </div>
          </div>
          
          {/* Progress indicator */}
          {flow.step !== "method-selection" && (
            <div className="mt-4">
              <Progress value={flow.progress} className="h-2" />
            </div>
          )}
        </DialogHeader>

        <div className="space-y-6 mt-6 max-h-[60vh] overflow-y-auto">
          {/* Method Selection Step */}
          {flow.step === "method-selection" && (
            <div className="space-y-4">
              {/* Smart recommendation */}
              {preferences.lastMethod !== 'email' && preferences.lastEmail && (
                <div className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-lg">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4" aria-hidden="true" />
                    <span>Welcome back! Continue with your preferred method below.</span>
                  </div>
                </div>
              )}
              
              {/* Google OAuth Button */}
              {isGoogleEnabled && (
                <>
                  <Button
                    variant={preferences.lastMethod === 'google' ? "default" : "outline"}
                    className="w-full h-12"
                    onClick={() => handleMethodSelection("google")}
                    data-testid="button-google-auth"
                  >
                    <Chrome className="w-5 h-5 mr-3" aria-hidden="true" />
                    Continue with Google
                    {preferences.lastMethod === 'google' && (
                      <span className="ml-2 text-xs opacity-75">(Last used)</span>
                    )}
                  </Button>
                  
                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <Separator className="w-full" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-background px-2 text-muted-foreground">or</span>
                    </div>
                  </div>
                </>
              )}
              
              {/* Email and Mobile Buttons */}
              <div className="grid grid-cols-1 gap-3">
                <Button
                  variant={preferences.lastMethod === 'email' ? "default" : "outline"}
                  className="w-full h-12 justify-start"
                  onClick={() => handleMethodSelection("email")}
                  data-testid="button-email-auth"
                >
                  <Mail className="w-5 h-5 mr-3" aria-hidden="true" />
                  <div className="text-left flex-1">
                    <div className="font-medium flex items-center gap-2">
                      Continue with Email
                      {preferences.lastMethod === 'email' && (
                        <span className="text-xs opacity-75">(Last used)</span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {preferences.lastEmail && preferences.rememberMe ? 
                        preferences.lastEmail : "Use your email address"}
                    </div>
                  </div>
                </Button>
                
                <Button
                  variant={preferences.lastMethod === 'mobile' ? "default" : "outline"}
                  className="w-full h-12 justify-start"
                  onClick={() => handleMethodSelection("mobile")}
                  data-testid="button-mobile-auth"
                >
                  <Smartphone className="w-5 h-5 mr-3" aria-hidden="true" />
                  <div className="text-left flex-1">
                    <div className="font-medium flex items-center gap-2">
                      Continue with Phone
                      {preferences.lastMethod === 'mobile' && (
                        <span className="text-xs opacity-75">(Last used)</span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      We'll send you a verification code
                    </div>
                  </div>
                </Button>
              </div>
            </div>
          )}

          {/* Form Steps */}
          {flow.step !== "method-selection" && (
            <div className="space-y-4">
              {/* Context display for current step */}
              {flow.step === "password-input" && flow.context.email && (
                <div className="text-sm text-muted-foreground">
                  <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                    <Mail className="w-4 h-4" aria-hidden="true" />
                    <span>{flow.context.email}</span>
                  </div>
                </div>
              )}
              
              {flow.step === "otp-verification" && (flow.context.phone || flow.context.email) && (
                <div className="text-sm text-muted-foreground">
                  <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                    {flow.context.channel === 'email' ? (
                      <>
                        <Mail className="w-4 h-4" aria-hidden="true" />
                        <span>{flow.context.email}</span>
                      </>
                    ) : (
                      <>
                        <MessageSquare className="w-4 h-4" aria-hidden="true" />
                        <span>{flow.context.countryCode}{flow.context.phone}</span>
                      </>
                    )}
                  </div>
                </div>
              )}
              
              <Form {...authForm.form}>
                <form onSubmit={authForm.form.handleSubmit(handleFormSubmit)} className="space-y-4">
                  {renderStepFields()}
                  
                  {/* Conditional fields for phone-input step based on channel */}
                  {flow.step === "phone-input" && (
                    <>
                      {authForm.form.watch("channel") === "whatsapp" && (
                        <>
                          <FormField
                            control={authForm.form.control}
                            name="countryCode"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel htmlFor="countryCode">Country</FormLabel>
                                <FormControl>
                                  <Select onValueChange={field.onChange} value={field.value}>
                                    <SelectTrigger 
                                      id="countryCode"
                                      data-testid="select-country-code"
                                      aria-label="Select country code"
                                    >
                                      <SelectValue placeholder="Select country" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {COUNTRY_OPTIONS.map((country) => (
                                        <SelectItem key={country.value} value={country.value}>
                                          <div className="flex items-center gap-2">
                                            <span aria-hidden="true">{country.flag}</span>
                                            <span>{country.label}</span>
                                            <span className="text-muted-foreground">
                                              {country.value}
                                            </span>
                                          </div>
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </FormControl>
                                <FormMessage role="alert" />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={authForm.form.control}
                            name="phone"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel htmlFor="phone">Phone number</FormLabel>
                                <FormControl>
                                  <Input
                                    id="phone"
                                    type="tel"
                                    placeholder="Enter your phone number"
                                    className="h-12"
                                    data-testid="input-phone"
                                    {...field}
                                  />
                                </FormControl>
                                <FormMessage role="alert" />
                              </FormItem>
                            )}
                          />
                        </>
                      )}
                      
                      {authForm.form.watch("channel") === "email" && (
                        <FormField
                          control={authForm.form.control}
                          name="email"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel htmlFor="email-otp">Email address</FormLabel>
                              <FormControl>
                                <Input
                                  id="email-otp"
                                  type="email"
                                  placeholder="Enter your email"
                                  className="h-12"
                                  data-testid="input-email-otp"
                                  {...field}
                                />
                              </FormControl>
                              <FormMessage role="alert" />
                            </FormItem>
                          )}
                        />
                      )}
                    </>
                  )}
                  
                  {/* OTP Resend and Countdown */}
                  {flow.step === "otp-verification" && (
                    <div className="flex items-center justify-between text-sm">
                      <div className="text-muted-foreground">
                        {otpCountdown > 0 ? (
                          <span>Resend code in {formatTime(otpCountdown)}</span>
                        ) : (
                          <Button
                            variant="ghost"
                            className="p-0 h-auto font-normal underline"
                            onClick={() => {
                              const channel = flow.context.channel || 'whatsapp';
                              mutations.sendOtp(
                                channel,
                                flow.mode,
                                flow.context.phone,
                                flow.context.countryCode,
                                flow.context.email
                              );
                              setOtpCountdown(300);
                            }}
                            data-testid="button-resend-otp"
                          >
                            Resend code
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                  
                  <Button
                    type="submit"
                    className="w-full h-12"
                    disabled={mutations.isLoading || authForm.isSubmitting}
                    data-testid={authForm.getSubmitButtonConfig().testId}
                  >
                    {mutations.isLoading || authForm.isSubmitting 
                      ? "Loading..." 
                      : authForm.getSubmitButtonConfig().text
                    }
                  </Button>
                </form>
              </Form>
            </div>
          )}
          
          {/* Mode Switch and Settings */}
          {flow.step === "method-selection" && (
            <div className="space-y-3">
              {/* Remember me toggle */}
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Remember my preferences</span>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={preferences.rememberMe}
                    onChange={preferences.toggleRememberMe}
                    className="w-4 h-4 text-primary bg-gray-100 border-gray-300 rounded focus:ring-primary dark:focus:ring-primary dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                  />
                  <span className="text-sm">{preferences.rememberMe ? 'On' : 'Off'}</span>
                </label>
              </div>
              
              <div className="text-center text-sm border-t pt-4">
                <span className="text-muted-foreground">
                  {flow.mode === "login" ? "Don't have an account?" : "Already have an account?"}
                </span>{" "}
                <Button
                  variant="ghost"
                  className="p-0 h-auto font-normal underline"
                  onClick={() => flow.setMode(flow.mode === "login" ? "register" : "login")}
                  data-testid="button-switch-mode"
                >
                  {flow.mode === "login" ? "Sign up" : "Sign in"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}