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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Mail, ArrowLeft, User, Chrome } from "lucide-react";

import { useAuthFlow } from "@/hooks/useAuthFlow";
import { useAuthPreferences } from "@/hooks/useAuthPreferences";
import { useAuthMutations } from "@/hooks/useAuthMutations";
import { useAuthForm } from "@/hooks/useAuthForm";
import { useAuth } from "@/hooks/use-auth";


/**
 * Props for the AuthDialog component
 */
interface AuthDialogProps {
  children: React.ReactNode;
}

/**
 * Comprehensive authentication dialog supporting multiple authentication methods.
 * Features email/password and Google OAuth authentication flows with
 * smart method selection, preference memory, and seamless multi-step registration.
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

  const flow = useAuthFlow();
  const preferences = useAuthPreferences();
  const { isGoogleEnabled } = useAuth();

  const mutations = useAuthMutations({
    onTransition: (nextStep) => {
      if (nextStep && (nextStep as string) === "profile-setup") {
        flow.goToStep("profile-setup");
      }
    },
    onComplete: () => {
      setOpen(false);
      flow.reset();
    },
  });

  const authForm = useAuthForm(
    flow.step,
    flow.mode,
    flow.context,
    preferences.getDefaultEmail(),
    preferences.lastCountryCode
  );


  useEffect(() => {
    if (open && preferences.lastMethod) {
      flow.setMethod(preferences.lastMethod);
    }
  }, [open]);

  useEffect(() => {
    if (open) {
      preferences.refreshCountryCode();
    }
  }, [open]);

  const handleDialogClose = (isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) {
      flow.reset();
    }
  };

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

  const handleMethodSelection = (method: "email" | "google") => {
    if (method === "google") {

      window.location.href = "/api/auth/google";
      return;
    }
    
    preferences.saveMethod(method);
    flow.setMethod(method);
  };

  const handleFormSubmit = (formData: Record<string, unknown>) => {
    const stepData = authForm.getStepData(formData);
    
    switch (flow.step) {
      case "email-input":

        if (preferences.rememberMe && stepData.email) {
          preferences.saveEmail(stepData.email);
        }
        flow.updateContext({ email: stepData.email });
        flow.nextStep();
        break;
        
      case "password-input":
        if (flow.mode === "login") {

          mutations.executeLogin(flow.method, { password: stepData.password || "" }, {
            ...flow.context,
            password: stepData.password,
          });
        } else {

          flow.updateContext({ password: stepData.password });
          flow.nextStep();
        }
        break;
        
      case "name-input":

        mutations.executeRegister(flow.method, { name: stepData.name || "" }, {
          ...flow.context,
          name: stepData.name,
        });
        break;
        
      case "profile-setup":

        mutations.executeRegister(flow.method, { name: stepData.name || "" }, {
          ...flow.context,
          name: stepData.name,
        });
        break;
    }
  };


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
              
              {/* Email Button */}
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
              
              <Form {...authForm.form}>
                <form onSubmit={authForm.form.handleSubmit(handleFormSubmit)} className="space-y-4">
                  {renderStepFields()}
                  
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
