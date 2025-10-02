import { Button } from "@/components/ui/button";
import { Calendar, Shield, Wrench } from "lucide-react";

/**
 * Using a professional automotive garage image from Unsplash
 */
const heroImage = "https://images.unsplash.com/photo-1621939514649-280e2198acc0?w=1920&h=600&fit=crop&crop=center";

/**
 * Hero section component for the landing page featuring a background image,
 * main headline, call-to-action buttons, and key feature highlights.
 * 
 * @returns {JSX.Element} The rendered hero section
 * 
 * @example
 * ```tsx
 * <HeroSection />
 * ```
 */
export function HeroSection() {
  return (
    <section className="relative h-[600px] flex items-center justify-center overflow-hidden">
      {/* Background Image with Dark Overlay */}
      <div 
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: `url(${heroImage})` }}
      />
      <div className="absolute inset-0 bg-black/50" />
      
      {/* Content */}
      <div className="relative z-10 text-center text-white max-w-4xl mx-auto px-4 md:px-6">
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-4 md:mb-6">
          Professional Automotive Services You Can Trust
        </h1>
        <p className="text-base sm:text-lg md:text-xl mb-6 md:mb-8 text-gray-200">
          Expert car maintenance, repairs, and resale services with modern facilities 
          and certified technicians. Your vehicle deserves the best care.
        </p>
        
        <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
          <Button 
            size="lg" 
            className="bg-accent hover:bg-accent/90 text-accent-foreground border border-accent-border"
            data-testid="button-book-service"
          >
            <Calendar className="mr-2 h-5 w-5" />
            Book Service
          </Button>
          <Button 
            size="lg" 
            variant="outline" 
            className="backdrop-blur-sm bg-white/10 border-white/20 text-white hover:bg-white/20"
            data-testid="button-browse-cars"
          >
            <Wrench className="mr-2 h-5 w-5" />
            Browse Cars
          </Button>
        </div>

        {/* Features */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
          <div className="flex items-center justify-center gap-2">
            <Shield className="h-5 w-5 text-accent" />
            <span>Certified Technicians</span>
          </div>
          <div className="flex items-center justify-center gap-2">
            <Wrench className="h-5 w-5 text-accent" />
            <span>Modern Equipment</span>
          </div>
          <div className="flex items-center justify-center gap-2">
            <Calendar className="h-5 w-5 text-accent" />
            <span>Flexible Scheduling</span>
          </div>
        </div>
      </div>
    </section>
  );
}