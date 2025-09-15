import { ServiceCard } from '../ServiceCard';
import { Wrench, Car, Zap, Shield } from 'lucide-react';

export default function ServiceCardExample() {
  return (
    <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      <ServiceCard
        title="Oil Change"
        description="Complete engine oil and filter replacement"
        price={2500}
        duration="30 mins"
        features={["Engine oil replacement", "Oil filter change", "Free inspection", "Digital report"]}
        icon={<Wrench className="h-6 w-6" />}
      />
      <ServiceCard
        title="Complete Service"
        description="Comprehensive vehicle maintenance"
        price={8500}
        duration="3 hours"
        features={["Full inspection", "Oil change", "Brake check", "AC service", "Washing"]}
        popular={true}
        icon={<Car className="h-6 w-6" />}
      />
      <ServiceCard
        title="AC Service"
        description="Air conditioning system maintenance"
        price={3500}
        duration="1 hour"
        features={["Filter replacement", "Gas refill", "Vent cleaning", "Performance check"]}
        icon={<Zap className="h-6 w-6" />}
      />
    </div>
  );
}