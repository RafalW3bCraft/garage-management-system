import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useEffect, useMemo } from "react";
import type { AuthStep, AuthMode, AuthContext } from "./useAuthFlow";

// Individual validation schemas for each step
const emailSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
});

const passwordSchema = z.object({
  password: z.string().min(8, "Password must be at least 8 characters"),
});

const confirmPasswordSchema = z.object({
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string().min(1, "Please confirm your password"),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

const nameSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
});

const phoneSchema = z.object({
  phone: z
    .string()
    .min(7, "Phone number must be at least 7 digits")
    .max(15, "Phone number cannot exceed 15 digits")
    .regex(/^[0-9]+$/, "Phone number must contain only digits"),
  countryCode: z.string().min(1, "Please select a country"),
});

const otpSchema = z.object({
  otp: z.string().length(6, "OTP must be 6 digits"),
});

// Schema mapping for each step
const STEP_SCHEMAS: Record<AuthStep, z.ZodSchema> = {
  "method-selection": z.object({}), // No validation needed
  "email-input": emailSchema,
  "password-input": passwordSchema,
  "name-input": nameSchema,
  "phone-input": phoneSchema,
  "otp-verification": otpSchema,
  "profile-setup": nameSchema, // Reuse name schema
};

// Enhanced schema for registration password step (includes confirm password)
const getPasswordStepSchema = (mode: AuthMode): z.ZodSchema => {
  return mode === "register" ? confirmPasswordSchema : passwordSchema;
};

// Dynamic form data type based on all possible fields
type AuthFormData = {
  email?: string;
  password?: string;
  confirmPassword?: string;
  name?: string;
  phone?: string;
  countryCode?: string;
  otp?: string;
};

// Get default values for the current step
const getStepDefaultValues = (
  step: AuthStep, 
  mode: AuthMode,
  context: AuthContext,
  defaultEmail: string = "",
  defaultCountryCode: string = "+91"
): Partial<AuthFormData> => {
  switch (step) {
    case "email-input":
      return { email: context.email || defaultEmail };
      
    case "password-input":
      return mode === "register" 
        ? { password: context.password || "", confirmPassword: "" }
        : { password: "" };
        
    case "name-input":
    case "profile-setup":
      return { name: context.name || "" };
      
    case "phone-input":
      return { 
        phone: context.phone || "", 
        countryCode: context.countryCode || defaultCountryCode 
      };
      
    case "otp-verification":
      return { otp: "" };
      
    default:
      return {};
  }
};

// Hook for unified auth form management
export function useAuthForm(
  step: AuthStep,
  mode: AuthMode,
  context: AuthContext,
  defaultEmail: string = "",
  defaultCountryCode: string = "+91"
) {
  // Get the appropriate schema for the current step
  const schema = useMemo(() => {
    if (step === "password-input") {
      return getPasswordStepSchema(mode);
    }
    return STEP_SCHEMAS[step] || z.object({});
  }, [step, mode]);
  
  // Get default values for the current step
  const defaultValues = useMemo(() => 
    getStepDefaultValues(step, mode, context, defaultEmail, defaultCountryCode),
    [step, mode, context, defaultEmail, defaultCountryCode]
  );
  
  // Create the form with dynamic schema and default values
  const form = useForm<AuthFormData>({
    resolver: zodResolver(schema),
    defaultValues,
    mode: "onChange", // Validate on change for better UX
  });
  
  // Update form values when step or context changes
  useEffect(() => {
    const newDefaults = getStepDefaultValues(step, mode, context, defaultEmail, defaultCountryCode);
    
    // Reset form with new schema and defaults
    form.reset(newDefaults);
  }, [step, mode, context, defaultEmail, defaultCountryCode, form]);
  
  // Helper to get step-specific field configurations
  const getFieldConfig = (fieldName: keyof AuthFormData) => {
    const configs = {
      email: {
        label: "Email address",
        placeholder: "Enter your email",
        type: "email" as const,
        testId: "input-email",
      },
      password: {
        label: "Password", 
        placeholder: step === "password-input" && mode === "login" 
          ? "Enter your password" 
          : "Create a password",
        type: "password" as const,
        testId: "input-password",
      },
      confirmPassword: {
        label: "Confirm Password",
        placeholder: "Confirm your password", 
        type: "password" as const,
        testId: "input-confirm-password",
      },
      name: {
        label: "Full name",
        placeholder: "Enter your full name",
        type: "text" as const,
        testId: "input-name",
      },
      phone: {
        label: "Phone number",
        placeholder: "Enter your phone number",
        type: "tel" as const,
        testId: "input-phone",
      },
      countryCode: {
        label: "Country",
        placeholder: "Select country",
        type: "select" as const,
        testId: "select-country-code",
      },
      otp: {
        label: "Verification code",
        placeholder: "Enter 6-digit code",
        type: "text" as const,
        testId: "input-otp",
      },
    };
    
    return configs[fieldName];
  };
  
  // Get fields that should be rendered for the current step
  const getStepFields = (): (keyof AuthFormData)[] => {
    switch (step) {
      case "email-input":
        return ["email"];
        
      case "password-input":
        return mode === "register" 
          ? ["password", "confirmPassword"]
          : ["password"];
          
      case "name-input":
      case "profile-setup":
        return ["name"];
        
      case "phone-input":
        return ["countryCode", "phone"];
        
      case "otp-verification":
        return ["otp"];
        
      default:
        return [];
    }
  };
  
  // Helper to extract only the relevant data for the current step
  const getStepData = (formData: AuthFormData) => {
    const fields = getStepFields();
    const stepData: Partial<AuthFormData> = {};
    
    fields.forEach(field => {
      if (formData[field] !== undefined) {
        stepData[field] = formData[field];
      }
    });
    
    return stepData;
  };
  
  // Get button configuration for the current step
  const getSubmitButtonConfig = () => {
    const configs = {
      "email-input": {
        text: "Continue",
        testId: "button-email-continue",
      },
      "password-input": {
        text: mode === "login" ? "Sign in" : "Continue",
        testId: "button-password-continue",
      },
      "name-input": {
        text: "Create account",
        testId: "button-complete-registration",
      },
      "phone-input": {
        text: "Send code",
        testId: "button-send-otp",
      },
      "otp-verification": {
        text: "Verify",
        testId: "button-verify-otp",
      },
      "profile-setup": {
        text: "Complete registration",
        testId: "button-complete-profile",
      },
    };
    
    return configs[step] || { text: "Continue", testId: "button-continue" };
  };
  
  return {
    // Form instance
    form,
    
    // Validation
    schema,
    
    // Helpers
    getFieldConfig,
    getStepFields,
    getStepData,
    getSubmitButtonConfig,
    
    // State
    isValid: form.formState.isValid,
    isSubmitting: form.formState.isSubmitting,
    errors: form.formState.errors,
    
    // Values
    values: form.getValues(),
    watchedValues: form.watch(),
  };
}