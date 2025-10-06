import { HeroSection } from "@/components/HeroSection";
import { ServiceCard } from "@/components/ServiceCard";
import { StatsCard } from "@/components/StatsCard";
import { CarCard } from "@/components/CarCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Wrench, 
  Car, 
  Zap, 
  Shield, 
  Calendar, 
  IndianRupee, 
  Users,
  Star,
  CheckCircle,
  Loader2
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import type { Service, Car as CarType } from "@shared/schema";

/**
 * Home page component displaying the landing page with hero section, featured services,
 * statistics, reasons to choose the service, customer testimonials, and call-to-action sections.
 * 
 * @returns {JSX.Element} The rendered home page
 * 
 * @example
 * ```tsx
 * <Route path="/" component={Home} />
 * ```
 */
export default function Home() {
  // Fetch services from API
  const { data: services = [], isLoading: servicesLoading, error: servicesError } = useQuery<Service[]>({
    queryKey: ["/api/services"],
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Fetch cars for sale from API
  const { data: carsForSale = [], isLoading: carsLoading, error: carsError } = useQuery<CarType[]>({
    queryKey: ["/api/cars/sale"],
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Get featured cars (first 3 cars for sale)
  const featuredCars = carsForSale.slice(0, 3);

  // Get featured services (first 3 services)
  const featuredServices = services.slice(0, 3).map(service => {
    const getServiceIcon = () => {
      switch (service.category) {
        case "maintenance": return <Wrench className="h-6 w-6" />;
        case "ac": return <Zap className="h-6 w-6" />;
        case "electrical": return <Zap className="h-6 w-6" />;
        default: return <Car className="h-6 w-6" />;
      }
    };
    
    return {
      service,
      icon: getServiceIcon(),
      popular: service.title.toLowerCase().includes("complete") || service.title.toLowerCase().includes("service")
    };
  });

  const testimonials = [
    {
      name: "Rajesh Kumar",
      location: "Mumbai",
      rating: 5,
      comment: "Excellent service! My car feels brand new after the complete service. Professional staff and transparent pricing."
    },
    {
      name: "Priya Sharma",
      location: "Delhi",
      rating: 5,
      comment: "Very satisfied with the AC service. Quick turnaround and the cooling is much better now."
    },
    {
      name: "Anil Patel",
      location: "Bangalore",
      rating: 4,
      comment: "Good experience overall. The oil change was done efficiently and the digital report was helpful."
    }
  ];

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <HeroSection />

      {/* Stats Section */}
      <section className="py-16 bg-muted/50">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-8">Our Performance</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <StatsCard
              title="Happy Customers"
              value="2,500+"
              icon={<Users className="h-4 w-4" />}
              description="Served this year"
            />
            <StatsCard
              title="Cars Serviced"
              value="5,000+"
              icon={<Car className="h-4 w-4" />}
              description="Complete services"
            />
            <StatsCard
              title="Expert Technicians"
              value={15}
              icon={<Shield className="h-4 w-4" />}
              description="Certified professionals"
            />
            <StatsCard
              title="Service Rating"
              value="4.8/5"
              icon={<Star className="h-4 w-4" />}
              description="Customer satisfaction"
            />
          </div>
        </div>
      </section>

      {/* Featured Cars Section */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">Featured Cars for Sale</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Browse our handpicked selection of quality pre-owned vehicles. 
              Each car is thoroughly inspected and priced competitively.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
            {carsLoading ? (
              [...Array(3)].map((_, index) => (
                <Card key={index} className="animate-pulse">
                  <div className="h-48 bg-muted rounded-t-lg"></div>
                  <div className="p-6 space-y-4">
                    <div className="h-4 bg-muted rounded"></div>
                    <div className="h-4 bg-muted rounded w-3/4"></div>
                    <div className="h-4 bg-muted rounded w-1/2"></div>
                  </div>
                </Card>
              ))
            ) : carsError ? (
              <div className="col-span-3 text-center py-8">
                <p className="text-muted-foreground">Unable to load featured cars. Please try again later.</p>
              </div>
            ) : featuredCars.length > 0 ? (
              featuredCars.map((car) => (
                <CarCard 
                  key={car.id}
                  id={car.id}
                  make={car.make}
                  model={car.model}
                  year={car.year}
                  price={car.price}
                  mileage={car.mileage}
                  fuelType={car.fuelType}
                  location={car.location}
                  image={car.image}
                  condition={car.condition as "Excellent" | "Good" | "Fair"}
                  isAuction={car.isAuction || false}
                  currentBid={car.currentBid || undefined}
                  auctionEndTime={car.auctionEndTime ? new Date(car.auctionEndTime).toISOString() : undefined}
                  description={car.description || undefined}
                  transmission={car.transmission || undefined}
                  bodyType={car.bodyType || undefined}
                  color={car.color || undefined}
                  numOwners={car.numOwners || undefined}
                  engineSize={car.engineSize || undefined}
                />
              ))
            ) : (
              <div className="col-span-3 text-center py-8">
                <p className="text-muted-foreground">No cars available at the moment.</p>
              </div>
            )}
          </div>
          <div className="text-center">
            <Button size="lg" asChild>
              <Link href="/cars" data-testid="link-view-all-cars">
                View All Cars
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Services Section */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">Our Services</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Professional automotive services with transparent pricing and expert technicians. 
              Your vehicle deserves the best care.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
            {servicesLoading ? (
              // Loading state
              [...Array(3)].map((_, index) => (
                <Card key={index} className="animate-pulse">
                  <div className="h-48 bg-muted rounded-t-lg"></div>
                  <div className="p-6 space-y-4">
                    <div className="h-4 bg-muted rounded"></div>
                    <div className="h-4 bg-muted rounded w-3/4"></div>
                    <div className="h-4 bg-muted rounded w-1/2"></div>
                  </div>
                </Card>
              ))
            ) : servicesError ? (
              // Error state
              <div className="col-span-3 text-center py-8">
                <p className="text-muted-foreground">Unable to load services. Please try again later.</p>
              </div>
            ) : featuredServices.length > 0 ? (
              // Services loaded successfully
              featuredServices.map((item, index) => (
                <ServiceCard 
                  key={item.service.id} 
                  service={item.service} 
                  popular={item.popular} 
                  icon={item.icon} 
                />
              ))
            ) : (
              // No services available
              <div className="col-span-3 text-center py-8">
                <p className="text-muted-foreground">No services available at the moment.</p>
              </div>
            )}
          </div>
          <div className="text-center">
            <Button size="lg" asChild>
              <Link href="/services" data-testid="link-view-all-services">
                View All Services
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Why Choose Us Section */}
      <section className="py-16 bg-muted/50">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">Why Choose RonakMotorGarage?</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              We combine modern technology with expert craftsmanship to deliver exceptional automotive services.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <Card>
              <CardHeader>
                <Shield className="h-8 w-8 text-accent mb-2" />
                <CardTitle>Certified Technicians</CardTitle>
                <CardDescription>
                  Our mechanics are certified and experienced with all major car brands
                </CardDescription>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <CheckCircle className="h-8 w-8 text-accent mb-2" />
                <CardTitle>Quality Guarantee</CardTitle>
                <CardDescription>
                  We stand behind our work with comprehensive service warranties
                </CardDescription>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <IndianRupee className="h-8 w-8 text-accent mb-2" />
                <CardTitle>Transparent Pricing</CardTitle>
                <CardDescription>
                  No hidden charges - clear pricing before any work begins
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        </div>
      </section>

      {/* Testimonials Section */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">What Our Customers Say</h2>
            <p className="text-muted-foreground">
              Real feedback from our satisfied customers
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {testimonials.map((testimonial, index) => (
              <Card key={index}>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <div className="flex">
                      {[...Array(testimonial.rating)].map((_, i) => (
                        <Star key={i} className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                      ))}
                    </div>
                  </div>
                  <CardTitle className="text-lg">{testimonial.name}</CardTitle>
                  <CardDescription>{testimonial.location}</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm italic">"{testimonial.comment}"</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 bg-primary text-primary-foreground">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold mb-4">Ready to Service Your Vehicle?</h2>
          <p className="text-lg mb-8 opacity-90">
            Book an appointment today and experience professional automotive care
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button 
              size="lg" 
              variant="secondary"
              asChild
            >
              <Link href="/services" data-testid="link-book-now-cta">
                <Calendar className="mr-2 h-5 w-5" />
                Book Service Now
              </Link>
            </Button>
            <Button 
              size="lg" 
              variant="outline" 
              className="border-primary-foreground text-primary-foreground hover:bg-primary-foreground hover:text-primary"
              data-testid="button-call-us-cta"
              onClick={() => window.open('tel:+919876543210', '_self')}
            >
              Call Us: +91-98765-43210
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}