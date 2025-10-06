import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  ArrowLeft, 
  Calendar, 
  MapPin, 
  Fuel, 
  Gauge, 
  IndianRupee,
  Car as CarIcon,
  Palette,
  Users,
  Cog,
  Settings,
  Loader2,
  CheckCircle2
} from "lucide-react";
import { useState } from "react";
import { BidDialog } from "@/components/BidDialog";
import { ContactDialog } from "@/components/ContactDialog";
import { format } from "date-fns";
import type { Car } from "@shared/schema";

/**
 * CarDetail page component that displays comprehensive information about a specific car.
 * Includes image, specifications, features, description, and action buttons.
 * 
 * @returns {JSX.Element} The rendered car detail page
 * 
 * @example
 * ```tsx
 * <Route path="/cars/:id" component={CarDetail} />
 * ```
 */
export default function CarDetail() {
  const { id } = useParams<{ id: string }>();
  const [bidDialogOpen, setBidDialogOpen] = useState(false);
  const [contactDialogOpen, setContactDialogOpen] = useState(false);

  const { data: car, isLoading, isError, error } = useQuery<Car>({
    queryKey: [`/api/cars/${id}`],
    enabled: !!id,
    retry: 1,
  });

  const getConditionColor = (condition: string) => {
    switch (condition) {
      case "Excellent": return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
      case "Good": return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
      case "Fair": return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
      default: return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200";
    }
  };

  const getImageUrls = (imageUrl: string) => {
    const baseUrl = imageUrl.replace(/\.(jpg|jpeg|png|webp)$/i, '');
    return {
      webp: `${baseUrl}.webp`,
      jpeg: `${baseUrl}.jpg`,
      fallback: imageUrl
    };
  };

  const parseFeatures = (featuresString: string | null): string[] => {
    if (!featuresString) return [];
    try {
      const parsed = JSON.parse(featuresString);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-muted-foreground mx-auto mb-4" />
          <p className="text-lg text-muted-foreground">Loading car details...</p>
        </div>
      </div>
    );
  }

  if (isError || !car) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center max-w-md mx-auto px-4">
          <h2 className="text-2xl font-bold mb-2">Car Not Found</h2>
          <p className="text-muted-foreground mb-6">
            {error?.message || "The car you're looking for doesn't exist or has been removed."}
          </p>
          <Button asChild>
            <Link href="/cars">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Cars
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  const imageUrls = getImageUrls(car.image);
  const features = parseFeatures(car.features);

  return (
    <div className="min-h-screen bg-background">
      {/* Back Button */}
      <div className="container mx-auto px-4 py-6">
        <Button variant="ghost" asChild>
          <Link href="/cars">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Cars
          </Link>
        </Button>
      </div>

      {/* Hero Section with Image */}
      <section className="container mx-auto px-4 pb-8">
        <div className="grid lg:grid-cols-2 gap-8">
          {/* Image Gallery */}
          <div className="relative">
            <picture>
              <source srcSet={imageUrls.webp} type="image/webp" />
              <img 
                src={imageUrls.jpeg} 
                alt={`${car.make} ${car.model}`}
                className="w-full h-[400px] lg:h-[500px] object-cover rounded-lg"
              />
            </picture>
            <Badge className={`absolute top-4 left-4 ${getConditionColor(car.condition)}`}>
              {car.condition}
            </Badge>
            {car.isAuction && (
              <Badge className="absolute top-4 right-4 bg-accent text-accent-foreground">
                Auction
              </Badge>
            )}
          </div>

          {/* Car Info */}
          <div className="space-y-6">
            <div>
              <h1 className="text-4xl font-bold mb-2">
                {car.make} {car.model}
              </h1>
              <p className="text-xl text-muted-foreground">{car.year}</p>
            </div>

            <div className="flex items-baseline gap-2">
              <IndianRupee className="h-8 w-8" />
              <span className="text-4xl font-bold">
                {(car.isAuction ? car.currentBid || car.price : car.price).toLocaleString('en-IN')}
              </span>
              {car.isAuction && (
                <span className="text-sm text-muted-foreground ml-2">
                  {car.currentBid ? 'Current Bid' : 'Starting Bid'}
                </span>
              )}
            </div>

            {car.isAuction && car.auctionEndTime && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Calendar className="h-5 w-5" />
                <span>
                  Auction ends: {format(new Date(car.auctionEndTime), "MMMM dd, yyyy 'at' h:mm a")}
                </span>
              </div>
            )}

            {/* Quick Stats */}
            <div className="grid grid-cols-2 gap-4 py-4">
              <div className="flex items-center gap-3">
                <Gauge className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Mileage</p>
                  <p className="font-semibold">{car.mileage.toLocaleString()} km</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Fuel className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Fuel Type</p>
                  <p className="font-semibold">{car.fuelType}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <MapPin className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Location</p>
                  <p className="font-semibold">{car.location}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Calendar className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Year</p>
                  <p className="font-semibold">{car.year}</p>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-3">
              {car.isAuction ? (
                <Button 
                  size="lg" 
                  className="flex-1"
                  onClick={() => setBidDialogOpen(true)}
                >
                  Place Bid
                </Button>
              ) : (
                <Button 
                  size="lg" 
                  className="flex-1"
                  onClick={() => setContactDialogOpen(true)}
                >
                  Contact Seller
                </Button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Detailed Specifications */}
      <section className="container mx-auto px-4 pb-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Complete Specifications</CardTitle>
            <CardDescription>Detailed information about this vehicle</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="flex justify-between items-center pb-2 border-b">
                  <span className="text-muted-foreground">Price</span>
                  <span className="font-semibold">₹{car.price.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between items-center pb-2 border-b">
                  <span className="text-muted-foreground">Year</span>
                  <span className="font-semibold">{car.year}</span>
                </div>
                <div className="flex justify-between items-center pb-2 border-b">
                  <span className="text-muted-foreground">Mileage</span>
                  <span className="font-semibold">{car.mileage.toLocaleString()} km</span>
                </div>
                <div className="flex justify-between items-center pb-2 border-b">
                  <span className="text-muted-foreground">Fuel Type</span>
                  <span className="font-semibold">{car.fuelType}</span>
                </div>
                <div className="flex justify-between items-center pb-2 border-b">
                  <span className="text-muted-foreground">Location</span>
                  <span className="font-semibold">{car.location}</span>
                </div>
              </div>

              <div className="space-y-4">
                {car.transmission && (
                  <div className="flex justify-between items-center pb-2 border-b">
                    <span className="text-muted-foreground flex items-center gap-2">
                      <Settings className="h-4 w-4" />
                      Transmission
                    </span>
                    <span className="font-semibold">{car.transmission}</span>
                  </div>
                )}
                {car.bodyType && (
                  <div className="flex justify-between items-center pb-2 border-b">
                    <span className="text-muted-foreground flex items-center gap-2">
                      <CarIcon className="h-4 w-4" />
                      Body Type
                    </span>
                    <span className="font-semibold">{car.bodyType}</span>
                  </div>
                )}
                {car.color && (
                  <div className="flex justify-between items-center pb-2 border-b">
                    <span className="text-muted-foreground flex items-center gap-2">
                      <Palette className="h-4 w-4" />
                      Color
                    </span>
                    <span className="font-semibold">{car.color}</span>
                  </div>
                )}
                {car.engineSize && (
                  <div className="flex justify-between items-center pb-2 border-b">
                    <span className="text-muted-foreground flex items-center gap-2">
                      <Cog className="h-4 w-4" />
                      Engine Size
                    </span>
                    <span className="font-semibold">{car.engineSize}</span>
                  </div>
                )}
                {car.numOwners !== null && car.numOwners !== undefined && (
                  <div className="flex justify-between items-center pb-2 border-b">
                    <span className="text-muted-foreground flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      Number of Owners
                    </span>
                    <span className="font-semibold">{car.numOwners}</span>
                  </div>
                )}
                <div className="flex justify-between items-center pb-2 border-b">
                  <span className="text-muted-foreground">Condition</span>
                  <Badge className={getConditionColor(car.condition)}>
                    {car.condition}
                  </Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Description */}
      {car.description && (
        <section className="container mx-auto px-4 pb-8">
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">Description</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground whitespace-pre-line leading-relaxed">
                {car.description}
              </p>
            </CardContent>
          </Card>
        </section>
      )}

      {/* Features */}
      {features.length > 0 && (
        <section className="container mx-auto px-4 pb-8">
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">Features</CardTitle>
              <CardDescription>This vehicle comes equipped with the following features</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {features.map((feature, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0" />
                    <span className="text-sm">{feature}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>
      )}

      {/* CTA Section */}
      <section className="container mx-auto px-4 pb-12">
        <Card className="bg-muted/50">
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row items-center justify-between gap-6">
              <div>
                <h3 className="text-xl font-bold mb-2">Interested in this {car.make} {car.model}?</h3>
                <p className="text-muted-foreground">
                  {car.isAuction 
                    ? "Place your bid now and don't miss this opportunity!"
                    : "Contact us today to schedule a test drive or learn more about this vehicle."
                  }
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
                {car.isAuction ? (
                  <Button 
                    size="lg"
                    onClick={() => setBidDialogOpen(true)}
                  >
                    Place Bid
                  </Button>
                ) : (
                  <Button 
                    size="lg"
                    onClick={() => setContactDialogOpen(true)}
                  >
                    Contact Seller
                  </Button>
                )}
                <Button 
                  size="lg" 
                  variant="outline"
                  asChild
                >
                  <Link href="/cars">Browse More Cars</Link>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Bid Dialog for Auction Cars */}
      {car.isAuction && (
        <BidDialog
          car={car}
          open={bidDialogOpen}
          onOpenChange={setBidDialogOpen}
        />
      )}

      {/* Contact Dialog for Non-Auction Cars */}
      {!car.isAuction && (
        <ContactDialog
          carMake={car.make}
          carModel={car.model}
          carYear={car.year}
          carPrice={car.price}
          open={contactDialogOpen}
          onOpenChange={setContactDialogOpen}
        />
      )}
    </div>
  );
}
