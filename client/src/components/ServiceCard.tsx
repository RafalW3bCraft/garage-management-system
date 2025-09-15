import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, IndianRupee } from "lucide-react";

interface ServiceCardProps {
  title: string;
  description: string;
  price: number;
  duration: string;
  features: string[];
  popular?: boolean;
  icon: React.ReactNode;
}

export function ServiceCard({ 
  title, 
  description, 
  price, 
  duration, 
  features, 
  popular, 
  icon 
}: ServiceCardProps) {
  const handleBookService = () => {
    console.log(`Booking ${title} service`);
  };

  return (
    <Card className={`relative h-full flex flex-col ${popular ? 'border-accent' : ''}`}>
      {popular && (
        <Badge className="absolute -top-2 left-4 bg-accent text-accent-foreground">
          Most Popular
        </Badge>
      )}
      
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="text-accent">
            {icon}
          </div>
          <div>
            <CardTitle className="text-lg">{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-1">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1 text-2xl font-bold">
              <IndianRupee className="h-6 w-6" />
              {price.toLocaleString('en-IN')}
            </div>
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              {duration}
            </div>
          </div>

          <div className="space-y-2">
            <h4 className="font-medium text-sm">Includes:</h4>
            <ul className="text-sm space-y-1">
              {features.map((feature, index) => (
                <li key={index} className="flex items-center gap-2">
                  <div className="h-1.5 w-1.5 bg-accent rounded-full" />
                  {feature}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </CardContent>

      <CardFooter>
        <Button 
          className="w-full" 
          onClick={handleBookService}
          variant={popular ? "default" : "outline"}
          data-testid={`button-book-${title.toLowerCase().replace(/\s+/g, '-')}`}
        >
          Book Now
        </Button>
      </CardFooter>
    </Card>
  );
}