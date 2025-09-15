import { useState } from "react";
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
  Search
} from "lucide-react";

export default function Services() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [priceRange, setPriceRange] = useState("all");

  // Mock data - todo: remove mock functionality
  const services = [
    {
      title: "Oil Change",
      description: "Complete engine oil and filter replacement with quality oil",
      price: 2500,
      duration: "30 mins",
      category: "maintenance",
      features: ["Engine oil replacement", "Oil filter change", "Free inspection", "Digital report"],
      icon: <Droplets className="h-6 w-6" />
    },
    {
      title: "Complete Service",
      description: "Comprehensive vehicle maintenance and inspection",
      price: 8500,
      duration: "3 hours",
      category: "maintenance",
      features: ["Full inspection", "Oil change", "Brake check", "AC service", "Washing"],
      popular: true,
      icon: <Car className="h-6 w-6" />
    },
    {
      title: "AC Service",
      description: "Air conditioning system cleaning and maintenance",
      price: 3500,
      duration: "1 hour",
      category: "ac",
      features: ["Filter replacement", "Gas refill", "Vent cleaning", "Performance check"],
      icon: <Zap className="h-6 w-6" />
    },
    {
      title: "Brake Service",
      description: "Complete brake system inspection and maintenance",
      price: 4500,
      duration: "1.5 hours",
      category: "brakes",
      features: ["Brake pad inspection", "Brake fluid check", "Disc inspection", "Performance test"],
      icon: <AlertTriangle className="h-6 w-6" />
    },
    {
      title: "Tire Service",
      description: "Tire rotation, alignment, and balancing service",
      price: 2000,
      duration: "45 mins",
      category: "tires",
      features: ["Tire rotation", "Wheel alignment", "Balancing", "Pressure check"],
      icon: <Settings className="h-6 w-6" />
    },
    {
      title: "Engine Diagnostics",
      description: "Computer diagnostics and engine health check",
      price: 1500,
      duration: "1 hour",
      category: "diagnostics",
      features: ["OBD scan", "Error code analysis", "Performance report", "Recommendations"],
      icon: <Gauge className="h-6 w-6" />
    },
    {
      title: "Battery Service",
      description: "Battery testing, cleaning, and replacement if needed",
      price: 1000,
      duration: "30 mins",
      category: "electrical",
      features: ["Battery test", "Terminal cleaning", "Voltage check", "Installation if needed"],
      icon: <Zap className="h-6 w-6" />
    },
    {
      title: "Transmission Service",
      description: "Transmission fluid change and system check",
      price: 5500,
      duration: "2 hours",
      category: "transmission",
      features: ["Fluid replacement", "Filter change", "System inspection", "Performance test"],
      icon: <Settings className="h-6 w-6" />
    },
    {
      title: "Paint Protection",
      description: "Ceramic coating and paint protection service",
      price: 12000,
      duration: "4 hours",
      category: "detailing",
      features: ["Surface preparation", "Ceramic coating", "Paint correction", "6-month warranty"],
      icon: <Shield className="h-6 w-6" />
    }
  ];

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

  const filteredServices = services.filter(service => {
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
          <div className="flex flex-col lg:flex-row gap-4 items-center">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="Search services..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
                data-testid="input-search-services"
              />
            </div>
            
            <div className="flex gap-4">
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger className="w-48" data-testid="select-category">
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

              <Select value={priceRange} onValueChange={setPriceRange}>
                <SelectTrigger className="w-48" data-testid="select-price-range">
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
          {filteredServices.length > 0 ? (
            <>
              <div className="flex justify-between items-center mb-8">
                <h2 className="text-2xl font-semibold">
                  {filteredServices.length} Service{filteredServices.length !== 1 ? 's' : ''} Found
                </h2>
                <div className="text-sm text-muted-foreground">
                  Showing results {selectedCategory !== "all" && `in ${categories.find(c => c.value === selectedCategory)?.label}`}
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredServices.map((service, index) => (
                  <ServiceCard key={index} {...service} />
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
            <Button size="lg" data-testid="button-contact-custom">
              Contact Us
            </Button>
            <Button size="lg" variant="outline" data-testid="button-call-custom">
              Call: +91-98765-43210
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}