import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown } from "lucide-react";

/**
 * Props for the StatsCard component
 */
interface StatsCardProps {
  title: string;
  value: string | number;
  change?: {
    value: number;
    type: "increase" | "decrease";
  };
  icon: React.ReactNode;
  description?: string;
}

/**
 * Statistics card component for displaying key metrics with optional trend indicators.
 * Shows a title, value, icon, optional percentage change, and description.
 * 
 * @param {StatsCardProps} props - Component props
 * @param {string} props.title - Card title
 * @param {string | number} props.value - Main statistic value
 * @param {object} [props.change] - Optional change indicator
 * @param {number} props.change.value - Percentage change value
 * @param {"increase" | "decrease"} props.change.type - Change direction
 * @param {React.ReactNode} props.icon - Icon to display
 * @param {string} [props.description] - Optional description text
 * @returns {JSX.Element} The rendered stats card
 * 
 * @example
 * ```tsx
 * <StatsCard
 *   title="Total Revenue"
 *   value="₹2,50,000"
 *   change={{ value: 12, type: "increase" }}
 *   icon={<IndianRupee className="h-4 w-4" />}
 *   description="Total earnings this month"
 * />
 * ```
 */
export function StatsCard({ title, value, change, icon, description }: StatsCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <div className="text-muted-foreground">
          {icon}
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {change && (
          <div className={`flex items-center text-xs ${
            change.type === "increase" ? "text-green-600" : "text-red-600"
          }`}>
            {change.type === "increase" ? (
              <TrendingUp className="mr-1 h-3 w-3" />
            ) : (
              <TrendingDown className="mr-1 h-3 w-3" />
            )}
            {change.value}% from last month
          </div>
        )}
        {description && (
          <p className="text-xs text-muted-foreground mt-1">
            {description}
          </p>
        )}
      </CardContent>
    </Card>
  );
}