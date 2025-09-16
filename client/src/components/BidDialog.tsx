import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Car } from "@shared/schema";

interface BidDialogProps {
  car: Car;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BidDialog({ car, open, onOpenChange }: BidDialogProps) {
  const [bidAmount, setBidAmount] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Calculate minimum bid amount
  const currentBid = car.currentBid || car.price;
  const minimumBid = currentBid + 1000; // Minimum ₹1,000 increment

  const placeBidMutation = useMutation({
    mutationFn: async (bidData: { carId: string; bidAmount: number }) => {
      return apiRequest("POST", `/api/cars/${bidData.carId}/bids`, {
        bidAmount: bidData.bidAmount
      });
    },
    onSuccess: () => {
      toast({
        title: "Bid Placed Successfully!",
        description: `Your bid of ₹${parseInt(bidAmount).toLocaleString('en-IN')} has been placed for ${car.make} ${car.model}.`,
      });
      
      // Invalidate and refetch cars data
      queryClient.invalidateQueries({ queryKey: ["/api/cars"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cars/auctions"] });
      queryClient.invalidateQueries({ queryKey: [`/api/cars/${car.id}/bids`] });
      
      // Reset form and close dialog
      setBidAmount("");
      onOpenChange(false);
    },
    onError: (error: any) => {
      console.error("Error placing bid:", error);
      const errorMessage = error?.message || "Failed to place bid. Please try again.";
      toast({
        title: "Bid Failed",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const bidValue = parseInt(bidAmount);
    
    // Client-side validation
    if (!bidAmount || isNaN(bidValue)) {
      toast({
        title: "Invalid Bid",
        description: "Please enter a valid bid amount.",
        variant: "destructive",
      });
      return;
    }

    if (bidValue < minimumBid) {
      toast({
        title: "Bid Too Low",
        description: `Minimum bid is ₹${minimumBid.toLocaleString('en-IN')}`,
        variant: "destructive",
      });
      return;
    }

    placeBidMutation.mutate({
      carId: car.id,
      bidAmount: bidValue
    });
  };

  // Check if auction has ended
  const auctionEnded = car.auctionEndTime && new Date() > car.auctionEndTime;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="dialog-bid">
        <DialogHeader>
          <DialogTitle data-testid="text-bid-title">
            Place Bid - {car.make} {car.model} ({car.year})
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* Car Info */}
          <div className="bg-muted p-4 rounded-lg space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Current Bid:</span>
              <span className="font-semibold text-lg" data-testid="text-current-bid">
                ₹{currentBid.toLocaleString('en-IN')}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Condition:</span>
              <Badge variant="secondary" data-testid="badge-condition">
                {car.condition}
              </Badge>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Location:</span>
              <span className="text-sm" data-testid="text-location">{car.location}</span>
            </div>
            {car.auctionEndTime && (
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Auction Ends:</span>
                <span className="text-sm" data-testid="text-auction-end">
                  {new Date(car.auctionEndTime).toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </span>
              </div>
            )}
          </div>

          {/* Bid Form */}
          {auctionEnded ? (
            <div className="text-center p-4 bg-destructive/10 rounded-lg">
              <p className="text-destructive font-medium" data-testid="text-auction-ended">
                This auction has ended
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="bidAmount">Your Bid Amount (₹)</Label>
                <Input
                  id="bidAmount"
                  type="number"
                  placeholder={`Minimum: ₹${minimumBid.toLocaleString('en-IN')}`}
                  value={bidAmount}
                  onChange={(e) => setBidAmount(e.target.value)}
                  min={minimumBid}
                  step="1000"
                  disabled={placeBidMutation.isPending}
                  data-testid="input-bid-amount"
                />
                <p className="text-xs text-muted-foreground">
                  Minimum bid: ₹{minimumBid.toLocaleString('en-IN')} (₹1,000 increment)
                </p>
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  className="flex-1"
                  disabled={placeBidMutation.isPending}
                  data-testid="button-cancel-bid"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="flex-1"
                  disabled={placeBidMutation.isPending || !bidAmount}
                  data-testid="button-place-bid"
                >
                  {placeBidMutation.isPending ? "Placing Bid..." : "Place Bid"}
                </Button>
              </div>
            </form>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}