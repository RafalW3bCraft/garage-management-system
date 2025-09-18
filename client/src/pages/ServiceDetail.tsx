import { useParams, useLocation, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { BookingDialog } from "@/components/BookingDialog";
import { 
  ArrowLeft, 
  Clock, 
  IndianRupee, 
  CheckCircle, 
  Star,
  MapPin,
  Wrench,
  Car,
  Zap,
  Shield,
  Settings,
  Droplets,
  Gauge,
  AlertTriangle,
  Cog,
  Loader2
} from "lucide-react";
import type { Service, Location } from "@shared/schema";

// Icon mapping function
const getIconComponent = (iconName: string | null, size: "sm" | "lg" = "sm") => {
  const iconClass = size === "lg" ? "h-12 w-12" : "h-6 w-6";
  const iconMap: Record<string, JSX.Element> = {
    'droplets': <Droplets className={iconClass} />,
    'car': <Car className={iconClass} />,
    'zap': <Zap className={iconClass} />,
    'alert-triangle': <AlertTriangle className={iconClass} />,
    'settings': <Settings className={iconClass} />,
    'gauge': <Gauge className={iconClass} />,
    'shield': <Shield className={iconClass} />,
    'wrench': <Wrench className={iconClass} />,
    'cog': <Cog className={iconClass} />
  };
  return iconMap[iconName || ''] || <Wrench className={iconClass} />;
};

export default function ServiceDetail() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();

  // Fetch service details
  const { data: service, isLoading: serviceLoading, error: serviceError } = useQuery<Service>({
    queryKey: [`/api/services/${id}`],
    enabled: !!id,
    retry: 3,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Fetch locations for additional info
  const { data: locations = [] } = useQuery<Location[]>({
    queryKey: ["/api/locations"],
    staleTime: 10 * 60 * 1000, // 10 minutes
  });

  // Fetch all services for related services
  const { data: allServices = [] } = useQuery<Service[]>({
    queryKey: ["/api/services"],
    staleTime: 5 * 60 * 1000,
  });

  if (serviceLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex items-center gap-2">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span>Loading service details...</span>
        </div>
      </div>
    );
  }

  if (serviceError || !service) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-16">
          <div className="text-center">
            <h1 className="text-4xl font-bold mb-4">Service Not Found</h1>
            <p className="text-xl text-muted-foreground mb-8">
              The service you're looking for doesn't exist or has been removed.
            </p>
            <Link href="/services">
              <Button data-testid="button-back-to-services">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Services
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Get related services (same category, exclude current)
  const relatedServices = allServices
    .filter(s => s.category === service.category && s.id !== service.id)
    .slice(0, 3);

  const features = Array.isArray(service.features) ? service.features : [];

  return (
    <div className="min-h-screen bg-background">
      {/* Breadcrumb */}
      <div className="border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Link href="/" className="hover:text-foreground" data-testid="link-home-breadcrumb">
              Home
            </Link>
            <span>/</span>
            <Link href="/services" className="hover:text-foreground" data-testid="link-services-breadcrumb">
              Services
            </Link>
            <span>/</span>
            <span className="text-foreground">{service.title}</span>
          </div>
        </div>
      </div>

      {/* Service Header */}
      <section className="py-8 bg-muted/50">
        <div className="container mx-auto px-4">
          <div className="flex flex-col lg:flex-row gap-8 items-start">
            {/* Service Info */}
            <div className="flex-1">
              <div className="flex items-center gap-4 mb-4">
                <div className="text-accent">
                  {getIconComponent(service.icon, "lg")}
                </div>
                <div>
                  <h1 className="text-4xl font-bold mb-2" data-testid="text-service-title">
                    {service.title}
                  </h1>
                  <p className="text-xl text-muted-foreground" data-testid="text-service-description">
                    {service.description}
                  </p>
                </div>
              </div>

              {/* Service Badges */}
              <div className="flex flex-wrap gap-2 mb-6">
                <Badge variant="secondary" data-testid="badge-category">
                  {service.category}
                </Badge>
                <Badge variant="outline" className="flex items-center gap-1" data-testid="badge-duration">
                  <Clock className="h-3 w-3" />
                  {service.duration}
                </Badge>
                <Badge variant="outline" className="flex items-center gap-1" data-testid="badge-rating">
                  <Star className="h-3 w-3 fill-current" />
                  4.8 Rating
                </Badge>
              </div>
            </div>

            {/* Pricing Card */}
            <div className="lg:w-80">
              <Card className="sticky top-4">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1 text-3xl font-bold">
                      <IndianRupee className="h-8 w-8" />
                      <span data-testid="text-service-price">
                        {service.price.toLocaleString('en-IN')}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                      <Clock className="h-4 w-4" />
                      {service.duration}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <BookingDialog service={service}>
                    <Button 
                      size="lg" 
                      className="w-full"
                      data-testid="button-book-service"
                    >
                      Book This Service
                    </Button>
                  </BookingDialog>
                  
                  <div className="text-center text-sm text-muted-foreground">
                    <p>✓ Free consultation included</p>
                    <p>✓ 30-day service warranty</p>
                    <p>✓ Transparent pricing</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* Service Details */}
      <section className="py-12">
        <div className="container mx-auto px-4">
          <div className="grid lg:grid-cols-3 gap-8">
            {/* Main Content */}
            <div className="lg:col-span-2 space-y-8">
              {/* What's Included */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CheckCircle className="h-5 w-5 text-green-500" />
                    What's Included
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {features.length > 0 ? (
                    <ul className="space-y-3">
                      {features.map((feature: string, index: number) => (
                        <li 
                          key={index} 
                          className="flex items-start gap-3"
                          data-testid={`feature-${index}`}
                        >
                          <CheckCircle className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-muted-foreground">
                      Comprehensive service as per industry standards.
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* Service Process */}
              <Card>
                <CardHeader>
                  <CardTitle>Service Process</CardTitle>
                  <CardDescription>
                    Our step-by-step approach to ensure quality service
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex gap-4">
                      <div className="flex-shrink-0">
                        <div className="w-8 h-8 bg-accent text-accent-foreground rounded-full flex items-center justify-center text-sm font-semibold">
                          1
                        </div>
                      </div>
                      <div>
                        <h4 className="font-semibold">Initial Inspection</h4>
                        <p className="text-sm text-muted-foreground">
                          Thorough diagnosis and inspection of your vehicle
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex gap-4">
                      <div className="flex-shrink-0">
                        <div className="w-8 h-8 bg-accent text-accent-foreground rounded-full flex items-center justify-center text-sm font-semibold">
                          2
                        </div>
                      </div>
                      <div>
                        <h4 className="font-semibold">Service Execution</h4>
                        <p className="text-sm text-muted-foreground">
                          Professional service using quality parts and tools
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex gap-4">
                      <div className="flex-shrink-0">
                        <div className="w-8 h-8 bg-accent text-accent-foreground rounded-full flex items-center justify-center text-sm font-semibold">
                          3
                        </div>
                      </div>
                      <div>
                        <h4 className="font-semibold">Quality Check</h4>
                        <p className="text-sm text-muted-foreground">
                          Final inspection and quality assurance before delivery
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Available Locations */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MapPin className="h-5 w-5" />
                    Available Locations
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {locations.length > 0 ? (
                      locations.map((location) => (
                        <div key={location.id} className="flex items-start gap-3" data-testid={`location-${location.id}`}>
                          <MapPin className="h-4 w-4 text-muted-foreground mt-1" />
                          <div>
                            <p className="font-medium">{location.name}</p>
                            <p className="text-sm text-muted-foreground">{location.address}</p>
                            <p className="text-sm text-muted-foreground">{location.phone}</p>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-muted-foreground text-sm">Location information loading...</p>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Contact Support */}
              <Card>
                <CardHeader>
                  <CardTitle>Need Help?</CardTitle>
                  <CardDescription>
                    Have questions about this service?
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Link href="/contact">
                    <Button variant="outline" className="w-full" data-testid="button-contact-support">
                      Contact Support
                    </Button>
                  </Link>
                  <Button variant="outline" className="w-full" data-testid="button-call-support" asChild>
                    <a href="tel:+919876543210">
                      Call: +91-98765-43210
                    </a>
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* Related Services */}
      {relatedServices.length > 0 && (
        <section className="py-12 bg-muted/50">
          <div className="container mx-auto px-4">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold mb-4">Related Services</h2>
              <p className="text-muted-foreground">
                Other services you might be interested in
              </p>
            </div>
            
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {relatedServices.map((relatedService) => (
                <Card key={relatedService.id} className="hover-elevate">
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <div className="text-accent">
                        {getIconComponent(relatedService.icon)}
                      </div>
                      <div>
                        <CardTitle className="text-lg">{relatedService.title}</CardTitle>
                        <CardDescription>{relatedService.description}</CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-1 text-xl font-bold">
                        <IndianRupee className="h-5 w-5" />
                        {relatedService.price.toLocaleString('en-IN')}
                      </div>
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Clock className="h-4 w-4" />
                        {relatedService.duration}
                      </div>
                    </div>
                    <Link href={`/services/${relatedService.id}`}>
                      <Button variant="outline" className="w-full" data-testid={`button-view-${relatedService.id}`}>
                        View Details
                      </Button>
                    </Link>
                  </CardContent>
                </Card>
              ))}
            </div>
            
            <div className="text-center mt-8">
              <Link href="/services">
                <Button variant="outline" data-testid="button-view-all-services">
                  View All Services
                </Button>
              </Link>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}