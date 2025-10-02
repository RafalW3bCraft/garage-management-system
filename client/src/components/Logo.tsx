import { Wrench } from "lucide-react";

/**
 * Props for the Logo component
 */
interface LogoProps {
  className?: string;
  size?: "sm" | "md" | "lg";
}

/**
 * Application logo component displaying the brand name with icon.
 * Customizable size for different use cases (navigation, footer, etc.).
 * 
 * @param {LogoProps} props - Component props
 * @param {string} [props.className=""] - Additional CSS classes
 * @param {"sm" | "md" | "lg"} [props.size="md"] - Logo size
 * @returns {JSX.Element} The rendered logo
 * 
 * @example
 * ```tsx
 * <Logo size="lg" className="my-4" />
 * ```
 */
export function Logo({ className = "", size = "md" }: LogoProps) {
  const sizeClasses = {
    sm: "text-lg",
    md: "text-xl",
    lg: "text-2xl"
  };

  return (
    <div className={`flex items-center gap-2 font-bold text-primary ${sizeClasses[size]} ${className}`}>
      <Wrench className="h-6 w-6" />
      <span>RonakMotorGarage</span>
    </div>
  );
}