import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useEffect, useMemo } from "react";
import type { AuthStep, AuthMode, AuthContext } from "./useAuthFlow";
import { passwordValidation } from "@shared/schema";

const emailSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
});

const passwordSchema = z.object({
  password: passwordValidation,
});

const confirmPasswordSchema = z.object({
  password: passwordValidation,
  confirmPassword: z.string().min(1, "Please confirm your password"),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

const nameSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
});

const STEP_SCHEMAS: Record<AuthStep, z.ZodSchema> = {
  "method-selection": z.object({}),
  "email-input": emailSchema,
  "password-input": passwordSchema,
  "name-input": nameSchema,
  "profile-setup": nameSchema,
};

const getPasswordStepSchema = (mode: AuthMode): z.ZodSchema => {
  return mode === "register" ? confirmPasswordSchema : passwordSchema;
};

type AuthFormData = {
  email?: string;
  password?: string;
  confirmPassword?: string;
  name?: string;
};

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
      
    default:
      return {};
  }
};

/**
 * Hook for unified authentication form management with dynamic validation and field configuration.
 * Provides form instance, validation schemas, field configurations, and step-specific helpers.
 * 
 * @param {AuthStep} step - Current authentication step
 * @param {AuthMode} mode - Current authentication mode
 * @param {AuthContext} context - Authentication context
 * @param {string} [defaultEmail=""] - Default email to pre-fill
 * @param {string} [defaultCountryCode="+91"] - Default country code
 * @returns {object} Form state and methods
 * @property {object} form - React Hook Form instance
 * @property {z.ZodSchema} schema - Current step's validation schema
 * @property {(fieldName: string) => object} getFieldConfig - Get field configuration
 * @property {() => string[]} getStepFields - Get fields for current step
 * @property {(formData: AuthFormData) => object} getStepData - Extract relevant step data
 * @property {() => object} getSubmitButtonConfig - Get submit button configuration
 * @property {boolean} isValid - Whether form is valid
 * @property {boolean} isSubmitting - Whether form is submitting
 * 
 * @example
 * ```tsx
 * const {
 *   form,
 *   getFieldConfig,
 *   getStepFields,
 *   isValid
 * } = useAuthForm(step, mode, context);
 * 
 * const fields = getStepFields();
 * 
 * return (
 *   <Form {...form}>
 *     {fields.map(field => {
 *       const config = getFieldConfig(field);
 *       return <FormField key={field} {...config} />;
 *     })}
 *   </Form>
 * );
 * ```
 */
export function useAuthForm(
  step: AuthStep,
  mode: AuthMode,
  context: AuthContext,
  defaultEmail: string = "",
  defaultCountryCode: string = "+91"
) {

  const schema = useMemo(() => {
    if (step === "password-input") {
      return getPasswordStepSchema(mode);
    }
    return STEP_SCHEMAS[step] || z.object({});
  }, [step, mode]);

  const defaultValues = useMemo(() => 
    getStepDefaultValues(step, mode, context, defaultEmail, defaultCountryCode),
    [step, mode, context, defaultEmail, defaultCountryCode]
  );

  const form = useForm<AuthFormData>({
    resolver: zodResolver(schema),
    defaultValues,
    mode: "onChange",
  });

  useEffect(() => {
    const newDefaults = getStepDefaultValues(step, mode, context, defaultEmail, defaultCountryCode);
    form.reset(newDefaults);
  }, [step, mode, context.email, context.password, context.name, defaultEmail, defaultCountryCode]);

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
    } as const;
    
    return configs[fieldName] as typeof configs[keyof typeof configs] | undefined;
  };

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
        
      default:
        return [];
    }
  };

  const getStepData = (formData: AuthFormData) => {
    const fields = getStepFields();
    const stepData: Partial<AuthFormData> = {};
    
    fields.forEach(field => {
      if (formData[field] !== undefined) {
        stepData[field] = formData[field] as any;
      }
    });
    
    return stepData;
  };

  const getSubmitButtonConfig = () => {
    const configs: Record<AuthStep, { text: string; testId: string }> = {
      "method-selection": {
        text: "Continue",
        testId: "button-continue",
      },
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
      "profile-setup": {
        text: "Complete registration",
        testId: "button-complete-profile",
      },
    };
    
    return configs[step];
  };
  
  return {

    form,

    schema,

    getFieldConfig,
    getStepFields,
    getStepData,
    getSubmitButtonConfig,

    isValid: form.formState.isValid,
    isSubmitting: form.formState.isSubmitting,
    errors: form.formState.errors,

    values: form.getValues(),
    watchedValues: form.watch(),
  };
}
