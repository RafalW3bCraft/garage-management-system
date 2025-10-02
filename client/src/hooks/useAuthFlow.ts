import { useReducer, useMemo } from "react";
import { z } from "zod";

/**
 * Authentication mode (login or register)
 */
export type AuthMode = "login" | "register";

/**
 * Authentication method (email, mobile, or Google)
 */
export type AuthMethod = "email" | "mobile" | "google";

/**
 * Authentication flow step
 */
export type AuthStep = 
  | "method-selection" 
  | "email-input" 
  | "password-input" 
  | "name-input" 
  | "phone-input" 
  | "otp-verification" 
  | "profile-setup";

/**
 * Authentication context that persists through the authentication flow
 */
export interface AuthContext {
  email?: string;
  password?: string;
  name?: string;
  phone?: string;
  countryCode?: string;
  otpToken?: string;
}

/**
 * Authentication state shape
 */
export interface AuthState {
  mode: AuthMode;
  method: AuthMethod;
  step: AuthStep;
  context: AuthContext;
}

/**
 * Flow configuration defining authentication steps for each mode-method combination
 */
export const FLOW_CONFIG: Record<string, AuthStep[]> = {
  // Email flows
  "login-email": ["method-selection", "email-input", "password-input"],
  "register-email": ["method-selection", "email-input", "password-input", "name-input"],
  
  // Mobile flows  
  "login-mobile": ["method-selection", "phone-input", "otp-verification"],
  "register-mobile": ["method-selection", "phone-input", "otp-verification", "profile-setup"],
  
  // Google flows (immediate redirect)
  "login-google": ["method-selection"],
  "register-google": ["method-selection"],
};

/**
 * Step metadata providing titles and descriptions for each authentication step
 */
export const STEP_METADATA: Record<AuthStep, {
  title: (mode: AuthMode, method: AuthMethod, context: AuthContext) => string;
  description: (mode: AuthMode, method: AuthMethod, context: AuthContext) => string;
}> = {
  "method-selection": {
    title: (mode) => mode === "login" ? "Welcome back" : "Create your account",
    description: (mode) => mode === "login" 
      ? "Choose how you'd like to sign in"
      : "Choose how you'd like to get started"
  },
  "email-input": {
    title: () => "Enter your email",
    description: () => "We'll use this to sign you in"
  },
  "password-input": {
    title: (mode) => mode === "login" ? "Enter your password" : "Create a password",
    description: (mode) => mode === "login" 
      ? "Enter the password for your account"
      : "Choose a strong password (at least 8 characters)"
  },
  "name-input": {
    title: () => "What's your name?",
    description: () => "This will be displayed on your profile"
  },
  "phone-input": {
    title: () => "Enter your phone number",
    description: () => "We'll send you a verification code"
  },
  "otp-verification": {
    title: () => "Verify your phone",
    description: (_, __, context) => 
      `Enter the 6-digit code sent to ${context.countryCode}${context.phone}`
  },
  "profile-setup": {
    title: () => "Complete your profile",
    description: () => "Just a few more details to complete your account"
  }
};

/**
 * Authentication flow reducer actions
 */
export type AuthAction = 
  | { type: "SET_MODE"; mode: AuthMode }
  | { type: "SET_METHOD"; method: AuthMethod }
  | { type: "NEXT_STEP" }
  | { type: "PREV_STEP" }
  | { type: "GO_TO_STEP"; step: AuthStep }
  | { type: "UPDATE_CONTEXT"; context: Partial<AuthContext> }
  | { type: "RESET" };

/**
 * Initial authentication state
 */
const initialState: AuthState = {
  mode: "login",
  method: "email", 
  step: "method-selection",
  context: {}
};

/**
 * Reducer function for auth flow state management with config-driven navigation
 * 
 * @param {AuthState} state - Current state
 * @param {AuthAction} action - Action to perform
 * @returns {AuthState} New state
 */
function authFlowReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case "SET_MODE":
      return { ...state, mode: action.mode };
      
    case "SET_METHOD": {
      const newState = { ...state, method: action.method };
      const flowKey = `${newState.mode}-${newState.method}`;
      const steps = FLOW_CONFIG[flowKey];
      
      if (action.method === "google") {
        // Google auth doesn't follow normal step flow
        return newState;
      }
      
      // Move to first step after method selection
      const nextStep = steps?.[1] || "method-selection";
      return { ...newState, step: nextStep };
    }
    
    case "NEXT_STEP": {
      const flowKey = `${state.mode}-${state.method}`;
      const steps = FLOW_CONFIG[flowKey];
      
      if (!steps) return state;
      
      const currentIndex = steps.indexOf(state.step);
      const nextIndex = currentIndex + 1;
      
      if (nextIndex < steps.length) {
        return { ...state, step: steps[nextIndex] };
      }
      
      return state; // Already at last step
    }
    
    case "PREV_STEP": {
      const flowKey = `${state.mode}-${state.method}`;
      const steps = FLOW_CONFIG[flowKey];
      
      if (!steps) return state;
      
      const currentIndex = steps.indexOf(state.step);
      const prevIndex = currentIndex - 1;
      
      if (prevIndex >= 0) {
        return { ...state, step: steps[prevIndex] };
      }
      
      return { ...state, step: "method-selection" }; // Go back to method selection
    }
    
    case "GO_TO_STEP":
      return { ...state, step: action.step };
      
    case "UPDATE_CONTEXT":
      return { 
        ...state, 
        context: { ...state.context, ...action.context }
      };
      
    case "RESET":
      return initialState;
      
    default:
      return state;
  }
}

/**
 * Hook for managing multi-step authentication flow with support for email, mobile, and Google auth.
 * Handles navigation between authentication steps, context management, and progress tracking.
 * 
 * @returns {object} Authentication flow state and methods
 * @property {AuthState} state - Current authentication state
 * @property {AuthMode} mode - Current mode (login/register)
 * @property {AuthMethod} method - Selected authentication method
 * @property {AuthStep} step - Current flow step
 * @property {AuthContext} context - Authentication context data
 * @property {number} progress - Progress percentage through the flow
 * @property {string} stepTitle - Title for current step
 * @property {string} stepDescription - Description for current step
 * @property {(mode: AuthMode) => void} setMode - Set authentication mode
 * @property {(method: AuthMethod) => void} setMethod - Set authentication method
 * @property {() => void} nextStep - Move to next step
 * @property {() => void} prevStep - Move to previous step
 * @property {(step: AuthStep) => void} goToStep - Jump to specific step
 * @property {(context: Partial<AuthContext>) => void} updateContext - Update context
 * @property {() => void} reset - Reset to initial state
 * @property {boolean} canGoBack - Whether back navigation is available
 * 
 * @example
 * ```tsx
 * const {
 *   mode,
 *   step,
 *   progress,
 *   setMethod,
 *   nextStep,
 *   updateContext
 * } = useAuthFlow();
 * 
 * // Select email method
 * setMethod("email");
 * 
 * // Update context with email
 * updateContext({ email: "user@example.com" });
 * 
 * // Move to next step
 * nextStep();
 * ```
 */
export function useAuthFlow() {
  const [state, dispatch] = useReducer(authFlowReducer, initialState);
  
  // Computed values
  const flowKey = `${state.mode}-${state.method}`;
  const steps = FLOW_CONFIG[flowKey] || [];
  const currentStepIndex = steps.indexOf(state.step);
  const totalSteps = steps.length;
  
  // Progress calculation (config-driven)
  const progress = useMemo(() => {
    if (state.step === "method-selection" || totalSteps === 0) return 0;
    return Math.round(((currentStepIndex + 1) / totalSteps) * 100);
  }, [currentStepIndex, totalSteps, state.step]);
  
  // Step metadata
  const stepTitle = STEP_METADATA[state.step]?.title(state.mode, state.method, state.context) || "";
  const stepDescription = STEP_METADATA[state.step]?.description(state.mode, state.method, state.context) || "";
  
  // Helper functions
  const setMode = (mode: AuthMode) => dispatch({ type: "SET_MODE", mode });
  const setMethod = (method: AuthMethod) => dispatch({ type: "SET_METHOD", method });
  const nextStep = () => dispatch({ type: "NEXT_STEP" });
  const prevStep = () => dispatch({ type: "PREV_STEP" });
  const goToStep = (step: AuthStep) => dispatch({ type: "GO_TO_STEP", step });
  const updateContext = (context: Partial<AuthContext>) => 
    dispatch({ type: "UPDATE_CONTEXT", context });
  const reset = () => dispatch({ type: "RESET" });
  
  // Navigation helpers
  const canGoBack = state.step !== "method-selection";
  const isFirstStep = currentStepIndex <= 0;
  const isLastStep = currentStepIndex >= totalSteps - 1;
  
  return {
    // State
    state,
    mode: state.mode,
    method: state.method,
    step: state.step,
    context: state.context,
    
    // Computed
    flowKey,
    steps,
    currentStepIndex,
    totalSteps,
    progress,
    stepTitle,
    stepDescription,
    
    // Actions
    setMode,
    setMethod,
    nextStep,
    prevStep,
    goToStep,
    updateContext,
    reset,
    
    // Helpers
    canGoBack,
    isFirstStep,
    isLastStep,
  };
}