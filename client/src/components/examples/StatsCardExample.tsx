import { StatsCard } from '../StatsCard';
import { Car, Calendar, IndianRupee, Users } from 'lucide-react';

export default function StatsCardExample() {
  return (
    <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <StatsCard
        title="Total Appointments"
        value={245}
        change={{ value: 12, type: "increase" }}
        icon={<Calendar className="h-4 w-4" />}
        description="This month"
      />
      <StatsCard
        title="Cars Serviced"
        value={189}
        change={{ value: 8, type: "increase" }}
        icon={<Car className="h-4 w-4" />}
        description="This month"
      />
      <StatsCard
        title="Revenue"
        value="₹2,85,000"
        change={{ value: 15, type: "increase" }}
        icon={<IndianRupee className="h-4 w-4" />}
        description="This month"
      />
      <StatsCard
        title="Active Customers"
        value={156}
        change={{ value: 3, type: "decrease" }}
        icon={<Users className="h-4 w-4" />}
        description="This month"
      />
    </div>
  );
}