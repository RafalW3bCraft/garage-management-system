import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BookingDialog } from "@/components/BookingDialog";
import { Clock, IndianRupee, Eye } from "lucide-react";
import { Link } from "wouter";
import type { Service } from "@shared/schema";

interface ServiceCardProps {
  service: Service;
  popular?: boolean;
  icon: React.ReactNode;
}

export function ServiceCard({ 
  service,
  popular, 
  icon 
}: ServiceCardProps) {

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
            <CardTitle className="text-lg">{service.title}</CardTitle>
            <CardDescription>{service.description}</CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-1">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1 text-2xl font-bold">
              <IndianRupee className="h-6 w-6" />
              {service.price.toLocaleString('en-IN')}
            </div>
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              {service.duration}
            </div>
          </div>

          <div className="space-y-2">
            <h4 className="font-medium text-sm">Includes:</h4>
            <ul className="text-sm space-y-1">
              {service.features.map((feature: string, index: number) => (
                <li key={index} className="flex items-center gap-2">
                  <div className="h-1.5 w-1.5 bg-accent rounded-full" />
                  {feature}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </CardContent>

      <CardFooter className="flex flex-col gap-2 sm:flex-row">
        <Link href={`/services/${service.id}`} className="flex-1">
          <Button 
            variant="outline"
            className="w-full"
            data-testid={`button-view-details-${service.title.toLowerCase().replace(/\s+/g, '-')}`}
          >
            <Eye className="h-4 w-4 mr-2" />
            View Details
          </Button>
        </Link>
        
        <BookingDialog service={service}>
          <Button 
            className="flex-1 w-full" 
            variant={popular ? "default" : "secondary"}
            data-testid={`button-book-${service.title.toLowerCase().replace(/\s+/g, '-')}`}
          >
            Book Now
          </Button>
        </BookingDialog>
      </CardFooter>
    </Card>
  );
}
