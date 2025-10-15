import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequestJson } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Loader2, DollarSign, User, Car, ArrowLeft, ChevronLeft, ChevronRight, Check, X, TrendingUp, Activity, FileCheck, FileX, Filter as FilterIcon, Calendar as CalendarIcon, XCircle } from "lucide-react";
import { format, subDays } from "date-fns";
import { cn } from "@/lib/utils";

interface Bid {
  id: string;
  userId: string;
  carId: string;
  amount: number;
  status: "pending" | "accepted" | "rejected";
  createdAt: string;
  userName?: string;
  userEmail?: string;
  carMake?: string;
  carModel?: string;
  carYear?: number;
}

interface BidsResponse {
  bids: Bid[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    hasMore: boolean;
    totalPages: number;
  };
}

interface BidAnalytics {
  totalBids: number;
  pendingBids: number;
  acceptedBids: number;
  rejectedBids: number;
  totalValue: number;
  avgBidAmount: number;
}

type DatePreset = "last7" | "last30" | "custom";

export default function AdminBids() {
  const { user, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const searchParams = new URLSearchParams(window.location.search);
  const carIdFromQuery = searchParams.get("carId") || "";
  
  const [currentPage, setCurrentPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [datePreset, setDatePreset] = useState<DatePreset>("custom");
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [minAmount, setMinAmount] = useState<string>("");
  const [maxAmount, setMaxAmount] = useState<string>("");
  const [carIdFilter, setCarIdFilter] = useState<string>(carIdFromQuery);
  const pageSize = 20;

  const { data: analytics } = useQuery<BidAnalytics>({
    queryKey: ["/api/admin/bids/analytics"],
    enabled: isAuthenticated && user?.role === "admin",
    queryFn: async () => {
      return apiRequestJson<BidAnalytics>("GET", "/api/admin/bids/analytics");
    },
  });

  const { data, isLoading, isError, error } = useQuery<BidsResponse>({
    queryKey: ["/api/admin/bids", currentPage, statusFilter, startDate, endDate, minAmount, maxAmount, carIdFilter],
    enabled: isAuthenticated && user?.role === "admin",
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("page", currentPage.toString());
      params.set("limit", pageSize.toString());
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (startDate) params.set("startDate", format(startDate, "yyyy-MM-dd"));
      if (endDate) params.set("endDate", format(endDate, "yyyy-MM-dd"));
      if (minAmount) params.set("minAmount", minAmount);
      if (maxAmount) params.set("maxAmount", maxAmount);
      if (carIdFilter) params.set("carId", carIdFilter);
      
      const response = await apiRequestJson<BidsResponse>(
        "GET",
        `/api/admin/bids?${params.toString()}`
      );
      return response;
    },
  });

  if (!isAuthenticated || user?.role !== "admin") {
    return (
      <div className="container mx-auto px-4 py-8 text-center">
        <h1 className="text-2xl font-bold text-destructive mb-4">Access Denied</h1>
        <p className="text-muted-foreground mb-4">You need admin privileges to access this page.</p>
        <Link href="/">
          <Button>Return Home</Button>
        </Link>
      </div>
    );
  }

  const updateBidStatusMutation = useMutation({
    mutationFn: async ({ bidId, status }: { bidId: string; status: "accepted" | "rejected" }) => {
      return apiRequestJson("PATCH", `/api/admin/bids/${bidId}`, { status });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/bids"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/bids/analytics"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cars"] });
      toast({
        title: "Success",
        description: `Bid ${variables.status} successfully!`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update bid",
        description: error.message || "Could not update bid status",
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (isError && error) {
      toast({
        title: "Failed to load bids",
        description: error instanceof Error ? error.message : "Unable to fetch bids",
        variant: "destructive",
      });
    }
  }, [isError, error, toast]);

  const handleDatePresetChange = (preset: DatePreset) => {
    setDatePreset(preset);
    const now = new Date();
    if (preset === "last7") {
      setStartDate(subDays(now, 7));
      setEndDate(now);
    } else if (preset === "last30") {
      setStartDate(subDays(now, 30));
      setEndDate(now);
    } else {
      setStartDate(undefined);
      setEndDate(undefined);
    }
    setCurrentPage(1);
  };

  const clearFilters = () => {
    setStatusFilter("all");
    setDatePreset("custom");
    setStartDate(undefined);
    setEndDate(undefined);
    setMinAmount("");
    setMaxAmount("");
    setCarIdFilter("");
    setCurrentPage(1);
    window.history.pushState({}, "", "/admin/bids");
  };

  const hasActiveFilters = statusFilter !== "all" || startDate !== undefined || endDate !== undefined || 
                           minAmount !== "" || maxAmount !== "" || carIdFilter !== "";

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending":
        return "bg-yellow-500 text-white";
      case "accepted":
        return "bg-green-500 text-white";
      case "rejected":
        return "bg-red-500 text-white";
      default:
        return "bg-gray-500 text-white";
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
    }).format(amount);
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-center items-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <Link href="/admin">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Dashboard
          </Button>
        </Link>
      </div>

      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">Auction Bids Management</h1>
          <p className="text-muted-foreground mt-1">
            Review and manage customer bids on auction vehicles
          </p>
        </div>
      </div>

      {analytics && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 mb-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Bids</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" />
                <div className="text-2xl font-bold">{analytics.totalBids}</div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Pending</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-yellow-500" />
                <div className="text-2xl font-bold">{analytics.pendingBids}</div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Accepted</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <FileCheck className="h-4 w-4 text-green-500" />
                <div className="text-2xl font-bold">{analytics.acceptedBids}</div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Rejected</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <FileX className="h-4 w-4 text-red-500" />
                <div className="text-2xl font-bold">{analytics.rejectedBids}</div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Value</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                <div className="text-2xl font-bold">₹{(analytics.totalValue / 100000).toFixed(1)}L</div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Avg Bid</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-primary" />
                <div className="text-2xl font-bold">₹{(analytics.avgBidAmount / 1000).toFixed(0)}k</div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Filter Bids</CardTitle>
            {hasActiveFilters && (
              <Button variant="outline" size="sm" onClick={clearFilters}>
                <XCircle className="w-4 h-4 mr-2" />
                Clear Filters
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={statusFilter} onValueChange={(value) => {
                setStatusFilter(value);
                setCurrentPage(1);
              }}>
                <SelectTrigger>
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Bids</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="accepted">Accepted</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>Date Range</Label>
              <Select value={datePreset} onValueChange={(value) => handleDatePresetChange(value as DatePreset)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select date range" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="custom">Custom</SelectItem>
                  <SelectItem value="last7">Last 7 Days</SelectItem>
                  <SelectItem value="last30">Last 30 Days</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {datePreset === "custom" && (
              <>
                <div className="space-y-2">
                  <Label>Start Date</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !startDate && "text-muted-foreground")}>
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {startDate ? format(startDate, "PPP") : "Pick a date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar mode="single" selected={startDate} onSelect={(date) => { setStartDate(date); setCurrentPage(1); }} initialFocus />
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="space-y-2">
                  <Label>End Date</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !endDate && "text-muted-foreground")}>
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {endDate ? format(endDate, "PPP") : "Pick a date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar mode="single" selected={endDate} onSelect={(date) => { setEndDate(date); setCurrentPage(1); }} initialFocus />
                    </PopoverContent>
                  </Popover>
                </div>
              </>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Min Amount (₹)</Label>
              <Input type="number" placeholder="0" value={minAmount} onChange={(e) => { setMinAmount(e.target.value); setCurrentPage(1); }} />
            </div>
            <div className="space-y-2">
              <Label>Max Amount (₹)</Label>
              <Input type="number" placeholder="10000000" value={maxAmount} onChange={(e) => { setMaxAmount(e.target.value); setCurrentPage(1); }} />
            </div>
            <div className="space-y-2">
              <Label>Car ID</Label>
              <Input placeholder="Filter by car ID" value={carIdFilter} onChange={(e) => { setCarIdFilter(e.target.value); setCurrentPage(1); }} />
            </div>
          </div>

          {carIdFilter && (
            <Badge variant="outline" className="mt-2">
              <FilterIcon className="w-3 h-3 mr-1" />
              Filtered by Car ID: {carIdFilter}
            </Badge>
          )}

          {data && (
            <p className="text-sm text-muted-foreground">
              Showing {data.bids.length} of {data.pagination.total} bids
            </p>
          )}
        </CardContent>
      </Card>

      <div className="space-y-4">
        {data?.bids.map((bid) => (
          <Card key={bid.id}>
            <CardContent className="p-6">
              <div className="flex justify-between items-start mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-xl font-bold">{formatCurrency(bid.amount)}</h3>
                    <Badge className={getStatusColor(bid.status)}>
                      {bid.status.charAt(0).toUpperCase() + bid.status.slice(1)}
                    </Badge>
                  </div>
                </div>
                <div className="text-right text-sm text-muted-foreground">
                  {new Date(bid.createdAt).toLocaleDateString()} {new Date(bid.createdAt).toLocaleTimeString()}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-center gap-3 p-3 bg-muted rounded-md">
                  <User className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Bidder</p>
                    <p className="text-sm text-muted-foreground">
                      {bid.userName || "Unknown User"}
                    </p>
                    {bid.userEmail && (
                      <p className="text-xs text-muted-foreground">{bid.userEmail}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3 bg-muted rounded-md">
                  <Car className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Vehicle</p>
                    <p className="text-sm text-muted-foreground">
                      {bid.carMake && bid.carModel
                        ? `${bid.carMake} ${bid.carModel} ${bid.carYear || ""}`
                        : "Car details unavailable"}
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-4 flex gap-2 flex-wrap">
                {bid.status === "pending" && (
                  <>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="outline" className="text-green-600 hover:text-green-700">
                          <Check className="w-4 h-4 mr-1" />
                          Accept
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Accept Bid</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to accept this bid of {formatCurrency(bid.amount)} from {bid.userName || bid.userEmail}?
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => updateBidStatusMutation.mutate({ bidId: bid.id, status: "accepted" })}
                            className="bg-green-600 hover:bg-green-700"
                          >
                            Accept Bid
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="outline" className="text-red-600 hover:text-red-700">
                          <X className="w-4 h-4 mr-1" />
                          Reject
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Reject Bid</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to reject this bid of {formatCurrency(bid.amount)} from {bid.userName || bid.userEmail}?
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => updateBidStatusMutation.mutate({ bidId: bid.id, status: "rejected" })}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Reject Bid
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </>
                )}
                <Link href={`/admin/cars?carId=${bid.carId}`}>
                  <Button variant="outline" size="sm">
                    View Car Details
                  </Button>
                </Link>
                <Link href={`/admin/users?userId=${bid.userId}`}>
                  <Button variant="outline" size="sm">
                    View User Profile
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        ))}

        {data?.bids.length === 0 && (
          <Card>
            <CardContent className="p-12 text-center">
              <DollarSign className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">No bids found matching your criteria</p>
            </CardContent>
          </Card>
        )}
      </div>

      {data && data.pagination.totalPages > 1 && (
        <div className="mt-6 flex justify-center gap-2 items-center">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {currentPage} of {data.pagination.totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage((p) => Math.min(data.pagination.totalPages, p + 1))}
            disabled={currentPage === data.pagination.totalPages}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
