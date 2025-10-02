import { createContext, useContext, useEffect, useState } from "react";

/**
 * Theme type definition
 */
type Theme = "dark" | "light" | "system";

/**
 * Props for the ThemeProvider component
 */
type ThemeProviderProps = {
  children: React.ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
};

/**
 * Theme provider state type
 */
type ThemeProviderState = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
};

/**
 * Initial theme provider state
 */
const initialState: ThemeProviderState = {
  theme: "system",
  setTheme: () => null,
};

const ThemeProviderContext = createContext<ThemeProviderState>(initialState);

/**
 * Theme provider component for managing application theme (dark/light/system).
 * Persists theme preference to localStorage and automatically applies theme class to root element.
 * Supports system theme detection for automatic theme switching.
 * 
 * @param {ThemeProviderProps} props - Component props
 * @param {React.ReactNode} props.children - Child components
 * @param {Theme} [props.defaultTheme="system"] - Default theme
 * @param {string} [props.storageKey="ui-theme"] - localStorage key for theme persistence
 * @returns {JSX.Element} The theme provider wrapper
 * 
 * @example
 * ```tsx
 * <ThemeProvider defaultTheme="light" storageKey="app-theme">
 *   <App />
 * </ThemeProvider>
 * ```
 */
export function ThemeProvider({
  children,
  defaultTheme = "system",
  storageKey = "ui-theme",
  ...props
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem(storageKey) as Theme) || defaultTheme
  );

  useEffect(() => {
    const root = window.document.documentElement;

    root.classList.remove("light", "dark");

    if (theme === "system") {
      const systemTheme = window.matchMedia("(prefers-color-scheme: dark)")
        .matches
        ? "dark"
        : "light";

      root.classList.add(systemTheme);
      return;
    }

    root.classList.add(theme);
  }, [theme]);

  const value = {
    theme,
    setTheme: (theme: Theme) => {
      localStorage.setItem(storageKey, theme);
      setTheme(theme);
    },
  };

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

/**
 * Hook for accessing theme context and controls.
 * Must be used within a ThemeProvider component.
 * 
 * @returns {ThemeProviderState} Theme state and setter
 * @throws {Error} If used outside of ThemeProvider
 * 
 * @example
 * ```tsx
 * const { theme, setTheme } = useTheme();
 * setTheme("dark");
 * ```
 */
export const useTheme = () => {
  const context = useContext(ThemeProviderContext);

  if (context === undefined)
    throw new Error("useTheme must be used within a ThemeProvider");

  return context;
};