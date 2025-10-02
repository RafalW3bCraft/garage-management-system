import { useState, useEffect, useCallback } from "react";
import { z } from "zod";

// Schema for validating auth preferences
const authPreferencesSchema = z.object({
  lastMethod: z.enum(["email", "mobile", "google"]).default("email"),
  lastCountryCode: z.string().default("+91"),
  lastEmail: z.string().default(""),
  rememberMe: z.boolean().default(true),
});

export type AuthPreferences = z.infer<typeof authPreferencesSchema>;

// Country detection helper
const detectCountryCode = (): string => {
  try {
    // Try to detect user's country from timezone or other indicators
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    
    if (timezone.includes('America')) return "+1";
    if (timezone.includes('Europe/London')) return "+44";
    if (timezone.includes('Asia/Shanghai')) return "+86";
    if (timezone.includes('Asia/Tokyo')) return "+81";
    
    // Default to India
    return "+91";
  } catch {
    return "+91";
  }
};

// Safe localStorage operations with schema validation
const STORAGE_KEY = "auth-preferences";

const loadPreferences = (): AuthPreferences => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      // Return defaults with detected country code
      return {
        lastMethod: "email",
        lastCountryCode: detectCountryCode(),
        lastEmail: "",
        rememberMe: true,
      };
    }
    
    const parsed = JSON.parse(stored);
    const validated = authPreferencesSchema.parse(parsed);
    
    // If country code is missing, detect it
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

const savePreferences = (preferences: AuthPreferences): void => {
  try {
    // Validate before saving
    const validated = authPreferencesSchema.parse(preferences);
    
    // Gate email persistence by rememberMe
    if (!validated.rememberMe) {
      validated.lastEmail = "";
    }
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(validated));
  } catch (error) {
    console.error("Failed to save auth preferences:", error);
  }
};

// Custom hook for auth preferences management
export function useAuthPreferences() {
  const [preferences, setPreferences] = useState<AuthPreferences>(loadPreferences);
  
  // Update preferences with validation and persistence
  const updatePreferences = useCallback((updates: Partial<AuthPreferences>) => {
    setPreferences(current => {
      const updated = { ...current, ...updates };
      
      // If rememberMe is being turned off, clear email
      if (updates.rememberMe === false) {
        updated.lastEmail = "";
      }
      
      // Save to localStorage
      savePreferences(updated);
      
      return updated;
    });
  }, []);
  
  // Helper to save email only if rememberMe is enabled
  const saveEmail = useCallback((email: string) => {
    if (preferences.rememberMe) {
      updatePreferences({ lastEmail: email });
    }
  }, [preferences.rememberMe, updatePreferences]);
  
  // Helper to get default email (respects rememberMe setting)
  const getDefaultEmail = useCallback(() => {
    return preferences.rememberMe ? preferences.lastEmail : "";
  }, [preferences.rememberMe, preferences.lastEmail]);
  
  // Helper to save method preference
  const saveMethod = useCallback((method: AuthPreferences["lastMethod"]) => {
    updatePreferences({ lastMethod: method });
  }, [updatePreferences]);
  
  // Helper to save country code preference  
  const saveCountryCode = useCallback((countryCode: string) => {
    updatePreferences({ lastCountryCode: countryCode });
  }, [updatePreferences]);
  
  // Helper to toggle remember me setting
  const toggleRememberMe = useCallback(() => {
    updatePreferences({ rememberMe: !preferences.rememberMe });
  }, [preferences.rememberMe, updatePreferences]);
  
  // Clear all preferences (useful for logout/reset)
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
  
  // Re-detect country code if needed
  const refreshCountryCode = useCallback(() => {
    const detectedCode = detectCountryCode();
    if (!preferences.lastCountryCode || preferences.lastCountryCode === "+91") {
      updatePreferences({ lastCountryCode: detectedCode });
    }
  }, [preferences.lastCountryCode, updatePreferences]);
  
  // Effect to refresh country code on mount if not set
  useEffect(() => {
    if (!preferences.lastCountryCode) {
      refreshCountryCode();
    }
  }, []); // Only run on mount
  
  return {
    // State
    preferences,
    
    // Getters
    getDefaultEmail,
    
    // Setters
    updatePreferences,
    saveEmail,
    saveMethod,
    saveCountryCode,
    toggleRememberMe,
    
    // Actions
    clearPreferences,
    refreshCountryCode,
    
    // Direct access to commonly used values
    lastMethod: preferences.lastMethod,
    lastCountryCode: preferences.lastCountryCode,
    lastEmail: preferences.lastEmail,
    rememberMe: preferences.rememberMe,
  };
}