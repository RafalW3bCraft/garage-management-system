import { HeroSection } from "@/components/HeroSection";
import { ServiceCard } from "@/components/ServiceCard";
import { StatsCard } from "@/components/StatsCard";
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
  CheckCircle
} from "lucide-react";

export default function Home() {
  // Mock data - todo: remove mock functionality
  const featuredServices = [
    {
      title: "Oil Change",
      description: "Complete engine oil and filter replacement",
      price: 2500,
      duration: "30 mins",
      features: ["Engine oil replacement", "Oil filter change", "Free inspection", "Digital report"],
      icon: <Wrench className="h-6 w-6" />
    },
    {
      title: "Complete Service",
      description: "Comprehensive vehicle maintenance",
      price: 8500,
      duration: "3 hours",
      features: ["Full inspection", "Oil change", "Brake check", "AC service", "Washing"],
      popular: true,
      icon: <Car className="h-6 w-6" />
    },
    {
      title: "AC Service",
      description: "Air conditioning system maintenance",
      price: 3500,
      duration: "1 hour",
      features: ["Filter replacement", "Gas refill", "Vent cleaning", "Performance check"],
      icon: <Zap className="h-6 w-6" />
    }
  ];

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
            {featuredServices.map((service, index) => (
              <ServiceCard key={index} {...service} />
            ))}
          </div>
          <div className="text-center">
            <Button size="lg" data-testid="button-view-all-services">
              View All Services
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
              data-testid="button-book-now-cta"
            >
              <Calendar className="mr-2 h-5 w-5" />
              Book Service Now
            </Button>
            <Button 
              size="lg" 
              variant="outline" 
              className="border-primary-foreground text-primary-foreground hover:bg-primary-foreground hover:text-primary"
              data-testid="button-call-us-cta"
            >
              Call Us: +91-98765-43210
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}