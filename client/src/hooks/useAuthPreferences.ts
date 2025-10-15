import { useAuthPreferencesContext } from "@/contexts";

/**
 * Hook for managing authentication preferences (method, email, country code, remember me).
 * Now uses the centralized AuthPreferencesContext for better state management.
 * This hook provides backward compatibility for existing code.
 * 
 * @returns {object} Preferences state and methods from context
 * @property {() => string} getDefaultEmail - Get default email if remember me is enabled
 * @property {(updates: Partial<AuthPreferences>) => void} updatePreferences - Update preferences
 * @property {(email: string) => void} saveEmail - Save email preference
 * @property {(method: string) => void} saveMethod - Save method preference
 * @property {(countryCode: string) => void} saveCountryCode - Save country code preference
 * @property {() => void} toggleRememberMe - Toggle remember me setting
 * @property {() => void} clearPreferences - Clear all preferences
 * @property {() => void} refreshCountryCode - Re-detect country code
 * @property {string} lastMethod - Last used authentication method
 * @property {string} lastCountryCode - Last used country code
 * @property {string} lastEmail - Last used email
 * @property {boolean} rememberMe - Remember me setting
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
export function useAuthPreferences() {

  return useAuthPreferencesContext();
}
