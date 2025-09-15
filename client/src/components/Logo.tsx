import { Wrench } from "lucide-react";

interface LogoProps {
  className?: string;
  size?: "sm" | "md" | "lg";
}

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