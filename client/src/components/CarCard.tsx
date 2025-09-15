import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, MapPin, Fuel, Gauge, IndianRupee, Heart } from "lucide-react";
import { useState } from "react";

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
}

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
  auctionEndTime
}: CarCardProps) {
  const [isFavorited, setIsFavorited] = useState(false);

  const handleAction = () => {
    if (isAuction) {
      console.log(`Placing bid on ${make} ${model}`);
    } else {
      console.log(`Viewing details for ${make} ${model}`);
    }
  };

  const handleFavorite = () => {
    setIsFavorited(!isFavorited);
    console.log(`${isFavorited ? 'Removed from' : 'Added to'} favorites: ${make} ${model}`);
  };

  const getConditionColor = (condition: string) => {
    switch (condition) {
      case "Excellent": return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
      case "Good": return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
      case "Fair": return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
      default: return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200";
    }
  };

  return (
    <Card className="overflow-hidden hover-elevate">
      <div className="relative">
        <img 
          src={image} 
          alt={`${make} ${model}`}
          className="w-full h-48 object-cover"
        />
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-2 right-2 bg-white/80 hover:bg-white"
          onClick={handleFavorite}
          data-testid={`button-favorite-${id}`}
        >
          <Heart className={`h-4 w-4 ${isFavorited ? 'fill-red-500 text-red-500' : ''}`} />
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

      <CardContent>
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
          {isAuction && auctionEndTime && (
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs">Ends {auctionEndTime}</span>
            </div>
          )}
        </div>
      </CardContent>

      <CardFooter className="gap-2">
        <Button 
          className="flex-1" 
          onClick={handleAction}
          data-testid={`button-${isAuction ? 'bid' : 'view'}-${id}`}
        >
          {isAuction ? 'Place Bid' : 'View Details'}
        </Button>
        {!isAuction && (
          <Button 
            variant="outline" 
            onClick={() => console.log(`Contacting seller for ${make} ${model}`)}
            data-testid={`button-contact-${id}`}
          >
            Contact
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}