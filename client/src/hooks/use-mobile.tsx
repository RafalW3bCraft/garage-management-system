import * as React from "react"

/**
 * Mobile breakpoint in pixels (768px)
 */
const MOBILE_BREAKPOINT = 768

/**
 * Hook for detecting whether the current viewport is in mobile size.
 * Uses matchMedia API to respond to viewport width changes dynamically.
 * 
 * @returns {boolean} True if viewport width is below 768px (mobile), false otherwise
 * 
 * @example
 * ```tsx
 * const MyComponent = () => {
 *   const isMobile = useIsMobile();
 *   
 *   return (
 *     <div>
 *       {isMobile ? <MobileLayout /> : <DesktopLayout />}
 *     </div>
 *   );
 * };
 * ```
 */
export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    mql.addEventListener("change", onChange)
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return !!isMobile
}
