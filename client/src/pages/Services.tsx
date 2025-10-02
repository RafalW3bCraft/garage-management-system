import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { ServiceCard } from "@/components/ServiceCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  Wrench, 
  Car, 
  Zap, 
  Shield, 
  Settings, 
  Droplets,
  Gauge,
  AlertTriangle,
  Search,
  Loader2,
  Cog
} from "lucide-react";
import type { Service } from "@shared/schema";

/**
 * Maps icon names to their corresponding Lucide icon components
 * 
 * @param {string | null} iconName - Name of the icon to retrieve
 * @returns {JSX.Element} The corresponding icon component with default styling
 */
const getIconComponent = (iconName: string | null) => {
  const iconMap: Record<string, JSX.Element> = {
    'droplets': <Droplets className="h-6 w-6" />,
    'car': <Car className="h-6 w-6" />,
    'zap': <Zap className="h-6 w-6" />,
    'alert-triangle': <AlertTriangle className="h-6 w-6" />,
    'settings': <Settings className="h-6 w-6" />,
    'gauge': <Gauge className="h-6 w-6" />,
    'shield': <Shield className="h-6 w-6" />,
    'wrench': <Wrench className="h-6 w-6" />,
    'cog': <Cog className="h-6 w-6" />
  };
  return iconMap[iconName || ''] || <Wrench className="h-6 w-6" />;
};

/**
 * Services page component displaying all available automotive services with filtering capabilities.
 * Features include search, category filtering, price range filtering, and service grid display.
 * 
 * @returns {JSX.Element} The rendered services page
 * 
 * @example
 * ```tsx
 * <Route path="/services" component={Services} />
 * ```
 */
export default function Services() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [priceRange, setPriceRange] = useState("all");

  // Fetch services from API
  const { data: servicesData, isLoading, error, refetch } = useQuery<Service[]>({
    queryKey: ["/api/services"],
    retry: 3,
    staleTime: 60 * 1000 // 60 seconds
  });

  // Use original API data without transformation
  const services = servicesData || [];

  const categories = [
    { value: "all", label: "All Services" },
    { value: "maintenance", label: "Maintenance" },
    { value: "ac", label: "AC Service" },
    { value: "brakes", label: "Brakes" },
    { value: "tires", label: "Tires" },
    { value: "diagnostics", label: "Diagnostics" },
    { value: "electrical", label: "Electrical" },
    { value: "transmission", label: "Transmission" },
    { value: "detailing", label: "Detailing" }
  ];

  const priceRanges = [
    { value: "all", label: "All Prices" },
    { value: "under-2000", label: "Under ₹2,000" },
    { value: "2000-5000", label: "₹2,000 - ₹5,000" },
    { value: "5000-10000", label: "₹5,000 - ₹10,000" },
    { value: "above-10000", label: "Above ₹10,000" }
  ];

  // Memoized filtering for performance
  const filteredServices = useMemo(() => {
    return services.filter(service => {
      const matchesSearch = service.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           service.description.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesCategory = selectedCategory === "all" || service.category === selectedCategory;
      
      const matchesPrice = priceRange === "all" || 
        (priceRange === "under-2000" && service.price < 2000) ||
        (priceRange === "2000-5000" && service.price >= 2000 && service.price <= 5000) ||
        (priceRange === "5000-10000" && service.price >= 5000 && service.price <= 10000) ||
        (priceRange === "above-10000" && service.price > 10000);

      return matchesSearch && matchesCategory && matchesPrice;
    });
  }, [services, searchTerm, selectedCategory, priceRange]);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <section className="py-16 bg-muted/50">
        <div className="container mx-auto px-4">
          <div className="text-center">
            <h1 className="text-4xl font-bold mb-4">Our Services</h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Professional automotive services with transparent pricing and expert technicians. 
              Find the perfect service for your vehicle.
            </p>
          </div>
        </div>
      </section>

      {/* Filters */}
      <section className="py-8 border-b">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            <div className="relative w-full xl:col-span-2">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="Search services..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 min-h-11 w-full"
                data-testid="input-search-services"
              />
            </div>
            
            <div className="w-full">
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger className="min-h-11 w-full" data-testid="select-category">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map(category => (
                    <SelectItem key={category.value} value={category.value}>
                      {category.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="w-full">
              <Select value={priceRange} onValueChange={setPriceRange}>
                <SelectTrigger className="min-h-11 w-full" data-testid="select-price-range">
                  <SelectValue placeholder="Select price range" />
                </SelectTrigger>
                <SelectContent>
                  {priceRanges.map(range => (
                    <SelectItem key={range.value} value={range.value}>
                      {range.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Active Filters */}
          <div className="flex gap-2 mt-4">
            {selectedCategory !== "all" && (
              <Badge variant="secondary" className="cursor-pointer" onClick={() => setSelectedCategory("all")}>
                {categories.find(c => c.value === selectedCategory)?.label} ×
              </Badge>
            )}
            {priceRange !== "all" && (
              <Badge variant="secondary" className="cursor-pointer" onClick={() => setPriceRange("all")}>
                {priceRanges.find(p => p.value === priceRange)?.label} ×
              </Badge>
            )}
            {searchTerm && (
              <Badge variant="secondary" className="cursor-pointer" onClick={() => setSearchTerm("")}>
                "{searchTerm}" ×
              </Badge>
            )}
          </div>
        </div>
      </section>

      {/* Services Grid */}
      <section className="py-12">
        <div className="container mx-auto px-4">
          {isLoading ? (
            <div className="text-center py-16">
              <Loader2 className="h-16 w-16 text-muted-foreground mx-auto mb-4 animate-spin" />
              <h3 className="text-xl font-semibold mb-2">Loading Services</h3>
              <p className="text-muted-foreground">
                Please wait while we fetch our latest services...
              </p>
            </div>
          ) : error ? (
            <div className="text-center py-16">
              <AlertTriangle className="h-16 w-16 text-destructive mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">Failed to Load Services</h3>
              <p className="text-muted-foreground mb-6">
                There was an error loading our services. Please try again later.
              </p>
              <Button 
                onClick={() => refetch()}
                data-testid="button-retry-services"
              >
                Try Again
              </Button>
            </div>
          ) : filteredServices.length > 0 ? (
            <>
              <div className="flex justify-between items-center mb-8">
                <h2 className="text-2xl font-semibold">
                  {filteredServices.length} Service{filteredServices.length !== 1 ? 's' : ''} Found
                </h2>
                <div className="text-sm text-muted-foreground">
                  Showing results {selectedCategory !== "all" && `in ${categories.find(c => c.value === selectedCategory)?.label}`}
                </div>
              </div>
              
              <div className="grid sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredServices.map((service, index) => (
                  <ServiceCard 
                    key={service.id} 
                    service={service} 
                    popular={service.popular || false}
                    icon={getIconComponent(service.icon)}
                  />
                ))}
              </div>
            </>
          ) : (
            <div className="text-center py-16">
              <Car className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">No services found</h3>
              <p className="text-muted-foreground mb-6">
                Try adjusting your search criteria or browse all services
              </p>
              <Button 
                onClick={() => {
                  setSearchTerm("");
                  setSelectedCategory("all");
                  setPriceRange("all");
                }}
                data-testid="button-clear-filters"
              >
                Clear All Filters
              </Button>
            </div>
          )}
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 bg-muted/50">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold mb-4">Need a Custom Service?</h2>
          <p className="text-lg text-muted-foreground mb-8">
            Can't find what you're looking for? Contact us for custom service packages
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" data-testid="button-contact-custom" asChild>
              <Link href="/contact">
                Contact Us
              </Link>
            </Button>
            <Button size="lg" variant="outline" data-testid="button-call-custom" asChild>
              <a href="tel:+919876543210">
                Call: +91-98765-43210
              </a>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}