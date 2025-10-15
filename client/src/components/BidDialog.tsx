import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Car } from "@shared/schema";

/**
 * Props for the BidDialog component
 */
interface BidDialogProps {
  car: Car;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Zod schema for bid form validation with dynamic minimum bid validation
 */
const createBidSchema = (minimumBid: number) => z.object({
  bidAmount: z.coerce
    .number({
      required_error: "Please enter a bid amount",
      invalid_type_error: "Bid amount must be a number"
    })
    .int("Bid amount must be a whole number")
    .positive("Bid amount must be positive")
    .min(minimumBid, `Minimum bid is ₹${minimumBid.toLocaleString('en-IN')}`)
    .min(1000, "Minimum bid is ₹1,000")
});

type BidFormData = z.infer<ReturnType<typeof createBidSchema>>;

/**
 * Auction bid placement dialog for submitting bids on auction cars.
 * Validates minimum bid amounts, displays current bid information, and handles bid submission.
 * Uses Zod schema validation with react-hook-form for comprehensive input validation.
 * 
 * @param {BidDialogProps} props - Component props
 * @param {Car} props.car - The auction car to bid on
 * @param {boolean} props.open - Dialog open state
 * @param {(open: boolean) => void} props.onOpenChange - Callback when dialog state changes
 * @returns {JSX.Element} The rendered bid dialog
 * 
 * @example
 * ```tsx
 * <BidDialog
 *   car={auctionCar}
 *   open={isOpen}
 *   onOpenChange={setIsOpen}
 * />
 * ```
 */
export function BidDialog({ car, open, onOpenChange }: BidDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const currentBid = car.currentBid || car.price;
  const minimumBid = currentBid + 1000;

  const bidSchema = createBidSchema(minimumBid);
  
  const form = useForm<BidFormData>({
    resolver: zodResolver(bidSchema),
    defaultValues: {
      bidAmount: minimumBid,
    },
    mode: "onChange",
  });

  const placeBidMutation = useMutation({
    mutationFn: async (bidData: BidFormData) => {
      return apiRequest("POST", `/api/cars/${car.id}/bids`, {
        bidAmount: bidData.bidAmount
      });
    },
    onSuccess: (_, variables) => {
      toast({
        title: "Bid Placed Successfully!",
        description: `Your bid of ₹${variables.bidAmount.toLocaleString('en-IN')} has been placed for ${car.make} ${car.model}.`,
      });

      queryClient.invalidateQueries({ queryKey: ["/api/cars"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cars/auctions"] });
      queryClient.invalidateQueries({ queryKey: [`/api/cars/${car.id}/bids`] });

      form.reset();
      onOpenChange(false);
    },
    onError: (error: Error) => {
      console.error("Error placing bid:", error);
      const errorMessage = error?.message || "Failed to place bid. Please try again.";
      toast({
        title: "Bid Failed",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: BidFormData) => {
    placeBidMutation.mutate(data);
  };

  const auctionEnded = car.auctionEndTime && new Date() > new Date(car.auctionEndTime);

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      form.reset();
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="w-full max-w-sm md:max-w-lg max-h-[90vh] overflow-y-auto" data-testid="dialog-bid" aria-describedby="bid-dialog-description">
        <DialogHeader>
          <DialogTitle id="bid-dialog-title" data-testid="text-bid-title">
            Place Bid - {car.make} {car.model} ({car.year})
          </DialogTitle>
          <p id="bid-dialog-description" className="sr-only">
            Place your bid on this auction car
          </p>
        </DialogHeader>
        
        <div className="space-y-4 max-h-[60vh] overflow-y-auto">
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
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" aria-label="Bid form">
                <FormField
                  control={form.control}
                  name="bidAmount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel htmlFor="bidAmount">Your Bid Amount (₹)</FormLabel>
                      <FormControl>
                        <Input
                          id="bidAmount"
                          type="number"
                          placeholder={`Minimum: ₹${minimumBid.toLocaleString('en-IN')}`}
                          {...field}
                          onChange={(e) => field.onChange(e.target.value)}
                          min={minimumBid}
                          step="1000"
                          disabled={placeBidMutation.isPending}
                          data-testid="input-bid-amount"
                          aria-invalid={form.formState.errors.bidAmount ? "true" : "false"}
                          aria-describedby="bidAmount-help bidAmount-error"
                        />
                      </FormControl>
                      <FormDescription id="bidAmount-help">
                        Minimum bid: ₹{minimumBid.toLocaleString('en-IN')} (₹1,000 increment)
                      </FormDescription>
                      <FormMessage id="bidAmount-error" role="alert" />
                    </FormItem>
                  )}
                />

                <DialogFooter className="flex-col gap-2 sm:flex-row">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleOpenChange(false)}
                    disabled={placeBidMutation.isPending}
                    data-testid="button-cancel-bid"
                    aria-label="Cancel bid"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={placeBidMutation.isPending || !form.formState.isValid}
                    data-testid="button-place-bid"
                    aria-label={placeBidMutation.isPending ? "Placing bid, please wait" : "Place bid"}
                  >
                    {placeBidMutation.isPending ? "Placing Bid..." : "Place Bid"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
