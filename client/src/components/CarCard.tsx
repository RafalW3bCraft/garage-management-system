import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, MapPin, Fuel, Gauge, IndianRupee, Heart } from "lucide-react";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { BidDialog } from "./BidDialog";
import { ContactDialog } from "./ContactDialog";
import { format } from "date-fns";
import { Link } from "wouter";
import type { Car } from "@shared/schema";

/**
 * Props for the CarCard component
 */
interface CarCardProps {
  id: string;
  make: string;
  model: string;
  year: number;
  price: number;
  mileage: number;
  fuelType: string;
  location: string;
  image: string;
  condition: "Excellent" | "Good" | "Fair";
  isAuction?: boolean;
  currentBid?: number;
  auctionEndTime?: string;
  description?: string;
  transmission?: string;
  bodyType?: string;
  color?: string;
  numOwners?: number;
  engineSize?: string;
}

/**
 * Car display card component for both sale and auction vehicles.
 * Shows car details, pricing, condition, and action buttons. Supports favorites and integrates
 * with bid/contact dialogs based on car type (auction vs. sale).
 * 
 * @param {CarCardProps} props - Component props
 * @returns {JSX.Element} The rendered car card
 * 
 * @example
 * ```tsx
 * <CarCard
 *   id="car-123"
 *   make="Maruti"
 *   model="Swift"
 *   year={2020}
 *   price={550000}
 *   mileage={25000}
 *   fuelType="Petrol"
 *   location="Mumbai"
 *   image="/cars/swift.jpg"
 *   condition="Excellent"
 *   isAuction={false}
 * />
 * ```
 */
export function CarCard({
  id,
  make,
  model,
  year,
  price,
  mileage,
  fuelType,
  location,
  image,
  condition,
  isAuction = false,
  currentBid,
  auctionEndTime,
  description,
  transmission,
  bodyType,
  color,
  numOwners,
  engineSize
}: CarCardProps) {
  const { toast } = useToast();
  const [isFavorited, setIsFavorited] = useState(false);
  const [bidDialogOpen, setBidDialogOpen] = useState(false);
  const [contactDialogOpen, setContactDialogOpen] = useState(false);

  useEffect(() => {
    const favorites = JSON.parse(localStorage.getItem('car-favorites') || '[]');
    setIsFavorited(favorites.includes(id));
  }, [id]);

  const getImageUrls = (imageUrl: string) => {
    const baseUrl = imageUrl.replace(/\.(jpg|jpeg|png|webp)$/i, '');
    return {
      webp: `${baseUrl}.webp`,
      jpeg: `${baseUrl}.jpg`,
      fallback: imageUrl
    };
  };

  const handleFavorite = () => {
    const favorites = JSON.parse(localStorage.getItem('car-favorites') || '[]');
    let newFavorites;
    
    if (isFavorited) {
      newFavorites = favorites.filter((fav: string) => fav !== id);
      toast({
        title: "Removed from Favorites",
        description: `${make} ${model} removed from your favorites.`,
      });
    } else {
      newFavorites = [...favorites, id];
      toast({
        title: "Added to Favorites",
        description: `${make} ${model} added to your favorites.`,
      });
    }
    
    localStorage.setItem('car-favorites', JSON.stringify(newFavorites));
    setIsFavorited(!isFavorited);
  };

  const handleContactSeller = () => {
    setContactDialogOpen(true);
  };

  const getConditionColor = (condition: string) => {
    switch (condition) {
      case "Excellent": return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
      case "Good": return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
      case "Fair": return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
      default: return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200";
    }
  };

  const imageUrls = getImageUrls(image);

  return (
    <Card className="overflow-hidden hover-elevate">
      <div className="relative">
        <picture>
          <source srcSet={imageUrls.webp} type="image/webp" />
          <img 
            src={imageUrls.jpeg} 
            alt={`${make} ${model}`}
            className="w-full h-48 object-cover"
          />
        </picture>
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-2 right-2 bg-white/80 hover:bg-white"
          onClick={handleFavorite}
          data-testid={`button-favorite-${id}`}
          aria-label={isFavorited ? `Remove ${make} ${model} from favorites` : `Add ${make} ${model} to favorites`}
        >
          <Heart className={`h-4 w-4 ${isFavorited ? 'fill-red-500 text-red-500' : ''}`} aria-hidden="true" />
        </Button>
        <Badge className={`absolute top-2 left-2 ${getConditionColor(condition)}`}>
          {condition}
        </Badge>
        {isAuction && (
          <Badge className="absolute bottom-2 left-2 bg-accent text-accent-foreground">
            Auction
          </Badge>
        )}
      </div>

      <CardHeader>
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="text-lg">{make} {model}</CardTitle>
            <CardDescription>{year}</CardDescription>
          </div>
          <div className="text-right">
            <div className="flex items-center gap-1 text-xl font-bold">
              <IndianRupee className="h-5 w-5" />
              {(isAuction ? currentBid || price : price).toLocaleString('en-IN')}
            </div>
            {isAuction && (
              <p className="text-xs text-muted-foreground">
                {currentBid ? 'Current Bid' : 'Starting Bid'}
              </p>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="flex items-center gap-2">
            <Gauge className="h-4 w-4 text-muted-foreground" />
            <span>{mileage.toLocaleString()} km</span>
          </div>
          <div className="flex items-center gap-2">
            <Fuel className="h-4 w-4 text-muted-foreground" />
            <span>{fuelType}</span>
          </div>
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-muted-foreground" />
            <span>{location}</span>
          </div>
          {isAuction && auctionEndTime && (() => {
            const dt = new Date(auctionEndTime);
            return !isNaN(dt.getTime()) ? (
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs">Ends {format(dt, "MMM dd, yyyy")}</span>
              </div>
            ) : null;
          })()}
        </div>
        
        {(transmission || bodyType) && (
          <div className="flex gap-2 text-xs text-muted-foreground">
            {transmission && <Badge variant="secondary">{transmission}</Badge>}
            {bodyType && <Badge variant="secondary">{bodyType}</Badge>}
          </div>
        )}

        {description && (
          <p className="text-sm text-muted-foreground line-clamp-2">
            {description}
          </p>
        )}
      </CardContent>

      <CardFooter className="flex flex-col gap-2 sm:flex-row">
        {isAuction ? (
          <Button 
            className="flex-1" 
            onClick={() => setBidDialogOpen(true)}
            data-testid={`button-bid-${id}`}
          >
            Place Bid
          </Button>
        ) : (
          <>
            <Button 
              className="flex-1" 
              asChild
              data-testid={`button-view-${id}`}
            >
              <Link href={`/cars/${id}`}>View Details</Link>
            </Button>
            <Button 
              variant="outline" 
              className="flex-1"
              onClick={handleContactSeller}
              data-testid={`button-contact-${id}`}
            >
              Contact
            </Button>
          </>
        )}
      </CardFooter>

      {/* Bid Dialog for Auction Cars */}
      {isAuction && (
        <BidDialog
          car={{
            id,
            make,
            model,
            year,
            price,
            mileage,
            fuelType,
            location,
            image,
            condition,
            isAuction,
            currentBid: currentBid || null,
            auctionEndTime: auctionEndTime ? new Date(auctionEndTime) : null,
            description: "",
            createdAt: new Date()
          } as Car}
          open={bidDialogOpen}
          onOpenChange={setBidDialogOpen}
        />
      )}

      {/* Contact Dialog for Non-Auction Cars */}
      {!isAuction && (
        <ContactDialog
          carMake={make}
          carModel={model}
          carYear={year}
          carPrice={price}
          open={contactDialogOpen}
          onOpenChange={setContactDialogOpen}
        />
      )}
    </Card>
  );
}
