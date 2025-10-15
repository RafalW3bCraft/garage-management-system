import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { z } from "zod";

/**
 * Schema for validating authentication preferences
 */
const authPreferencesSchema = z.object({
  lastMethod: z.enum(["email", "google"]).default("email"),
  lastCountryCode: z.string().default("+91"),
  lastEmail: z.string().default(""),
  rememberMe: z.boolean().default(true),
});

/**
 * Authentication preferences type
 */
export type AuthPreferences = z.infer<typeof authPreferencesSchema>;

/**
 * Auth preferences context state type
 */
interface AuthPreferencesContextState extends AuthPreferences {
  updatePreferences: (updates: Partial<AuthPreferences>) => void;
  saveEmail: (email: string) => void;
  saveMethod: (method: AuthPreferences["lastMethod"]) => void;
  saveCountryCode: (countryCode: string) => void;
  toggleRememberMe: () => void;
  clearPreferences: () => void;
  refreshCountryCode: () => void;
  getDefaultEmail: () => string;
}

const AuthPreferencesContext = createContext<AuthPreferencesContextState | undefined>(undefined);

/**
 * localStorage key for authentication preferences
 */
const STORAGE_KEY = "auth-preferences";

/**
 * Detects user's country code based on timezone
 * 
 * @returns {string} Detected country code
 */
const detectCountryCode = (): string => {
  try {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    
    if (timezone.includes('America')) return "+1";
    if (timezone.includes('Europe/London')) return "+44";
    if (timezone.includes('Asia/Shanghai')) return "+86";
    if (timezone.includes('Asia/Tokyo')) return "+81";
    
    return "+91";
  } catch {
    return "+91";
  }
};

/**
 * Loads authentication preferences from localStorage with validation
 * 
 * @returns {AuthPreferences} Validated preferences or defaults
 */
const loadPreferences = (): AuthPreferences => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return {
        lastMethod: "email",
        lastCountryCode: detectCountryCode(),
        lastEmail: "",
        rememberMe: true,
      };
    }
    
    const parsed = JSON.parse(stored);
    const validated = authPreferencesSchema.parse(parsed);
    
    if (!validated.lastCountryCode) {
      validated.lastCountryCode = detectCountryCode();
    }
    
    return validated;
  } catch (error) {
    console.warn("Failed to load auth preferences, using defaults:", error);
    return {
      lastMethod: "email", 
      lastCountryCode: detectCountryCode(),
      lastEmail: "",
      rememberMe: true,
    };
  }
};

/**
 * Saves authentication preferences to localStorage with validation
 * 
 * @param {AuthPreferences} preferences - Preferences to save
 */
const savePreferences = (preferences: AuthPreferences): void => {
  try {
    const validated = authPreferencesSchema.parse(preferences);
    
    if (!validated.rememberMe) {
      validated.lastEmail = "";
    }
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(validated));
  } catch (error) {
    console.error("Failed to save auth preferences:", error);
  }
};

/**
 * Auth Preferences Provider component for centralized authentication preference management.
 * Handles localStorage persistence, country code detection, and preference validation.
 * 
 * @param {object} props - Component props
 * @param {ReactNode} props.children - Child components
 * @returns {JSX.Element} The auth preferences provider wrapper
 * 
 * @example
 * ```tsx
 * <AuthPreferencesProvider>
 *   <App />
 * </AuthPreferencesProvider>
 * ```
 */
export function AuthPreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState<AuthPreferences>(loadPreferences);

  const updatePreferences = useCallback((updates: Partial<AuthPreferences>) => {
    setPreferences(current => {
      const updated = { ...current, ...updates };
      
      if (updates.rememberMe === false) {
        updated.lastEmail = "";
      }
      
      savePreferences(updated);
      return updated;
    });
  }, []);

  const saveEmail = useCallback((email: string) => {
    if (preferences.rememberMe) {
      updatePreferences({ lastEmail: email });
    }
  }, [preferences.rememberMe, updatePreferences]);

  const getDefaultEmail = useCallback(() => {
    return preferences.rememberMe ? preferences.lastEmail : "";
  }, [preferences.rememberMe, preferences.lastEmail]);

  const saveMethod = useCallback((method: AuthPreferences["lastMethod"]) => {
    updatePreferences({ lastMethod: method });
  }, [updatePreferences]);

  const saveCountryCode = useCallback((countryCode: string) => {
    updatePreferences({ lastCountryCode: countryCode });
  }, [updatePreferences]);

  const toggleRememberMe = useCallback(() => {
    updatePreferences({ rememberMe: !preferences.rememberMe });
  }, [preferences.rememberMe, updatePreferences]);

  const clearPreferences = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
      setPreferences({
        lastMethod: "email",
        lastCountryCode: detectCountryCode(),
        lastEmail: "",
        rememberMe: true,
      });
    } catch (error) {
      console.error("Failed to clear auth preferences:", error);
    }
  }, []);

  const refreshCountryCode = useCallback(() => {
    const detectedCode = detectCountryCode();
    if (!preferences.lastCountryCode || preferences.lastCountryCode === "+91") {
      updatePreferences({ lastCountryCode: detectedCode });
    }
  }, [preferences.lastCountryCode, updatePreferences]);

  useEffect(() => {
    if (!preferences.lastCountryCode) {
      refreshCountryCode();
    }
  }, []);

  return (
    <AuthPreferencesContext.Provider
      value={{
        ...preferences,
        updatePreferences,
        saveEmail,
        saveMethod,
        saveCountryCode,
        toggleRememberMe,
        clearPreferences,
        refreshCountryCode,
        getDefaultEmail,
      }}
    >
      {children}
    </AuthPreferencesContext.Provider>
  );
}

/**
 * Hook for accessing auth preferences context and controls.
 * Must be used within an AuthPreferencesProvider component.
 * 
 * @returns {AuthPreferencesContextState} Auth preferences state and methods
 * @throws {Error} If used outside of AuthPreferencesProvider
 * 
 * @example
 * ```tsx
 * const {
 *   lastMethod,
 *   lastEmail,
 *   saveMethod,
 *   saveEmail,
 *   rememberMe
 * } = useAuthPreferences();
 * 
 *
 * saveMethod("email");
 * 
 *
 * if (rememberMe) {
 *   saveEmail("user@example.com");
 * }
 * ```
 */
export function useAuthPreferencesContext() {
  const context = useContext(AuthPreferencesContext);
  if (context === undefined) {
    throw new Error("useAuthPreferencesContext must be used within an AuthPreferencesProvider");
  }
  return context;
}
