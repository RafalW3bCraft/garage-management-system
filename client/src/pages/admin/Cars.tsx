import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Car, Plus, Edit, Trash2, Filter, Calendar, DollarSign, Eye } from "lucide-react";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useErrorHandler } from "@/lib/error-utils";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertCarSchema } from "@shared/schema";
import type { Car as CarType, Bid } from "@shared/schema";
import { z } from "zod";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

/**
 * Zod schema for car form validation with support for both sale and auction cars
 */
const carFormSchema = z.object({
  make: z.string()
    .min(1, "Make is required")
    .min(2, "Make must be at least 2 characters")
    .max(50, "Make cannot exceed 50 characters"),
  model: z.string()
    .min(1, "Model is required")
    .min(1, "Model must be at least 1 character")
    .max(50, "Model cannot exceed 50 characters"),
  year: z.coerce.number()
    .min(1900, "Year must be 1900 or later")
    .max(new Date().getFullYear() + 1, `Year cannot be later than ${new Date().getFullYear() + 1}`),
  price: z.coerce.number()
    .min(0, "Price must be positive")
    .max(100000000, "Price cannot exceed ₹10 crore"),
  mileage: z.coerce.number()
    .min(0, "Mileage must be positive")
    .max(10000000, "Mileage cannot exceed 10,000,000 km"),
  fuelType: z.string().min(1, "Fuel type is required"),
  location: z.string()
    .min(1, "Location is required")
    .min(3, "Location must be at least 3 characters")
    .max(100, "Location cannot exceed 100 characters"),
  condition: z.string().min(1, "Condition is required"),
  image: z.string()
    .min(1, "Image URL is required")
    .url("Please enter a valid URL")
    .regex(/\.(jpg|jpeg|png|webp|gif)$/i, "Image URL must end with .jpg, .jpeg, .png, .webp, or .gif"),
  isAuction: z.boolean().default(false),
  currentBid: z.coerce.number()
    .min(0, "Current bid must be positive")
    .optional(),
  auctionEndTime: z.string().optional(),
  description: z.string()
    .max(1000, "Description cannot exceed 1000 characters")
    .optional(),
});

type CarFormData = z.infer<typeof carFormSchema>;

/**
 * Helper function to parse and generate image URLs in multiple formats
 * 
 * @param {string} imageUrl - Base image URL
 * @returns {{webp: string, jpeg: string, fallback: string}} Image URLs in different formats
 */
const getImageUrls = (imageUrl: string) => {
  const baseUrl = imageUrl.replace(/\.(jpg|jpeg|png|webp)$/i, '');
  return {
    webp: `${baseUrl}.webp`,
    jpeg: `${baseUrl}.jpg`,
    fallback: imageUrl
  };
};

/**
 * Admin cars management component for managing car inventory including sales and auctions.
 * Features CRUD operations, tabbed interface for filtering, bid viewing for auction cars,
 * and comprehensive car details management with image support.
 * 
 * @returns {JSX.Element} The rendered admin cars management page
 * 
 * @example
 * ```tsx
 * <Route path="/admin/cars" component={AdminCars} />
 * ```
 */
export default function AdminCars() {
  const { user, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { handleMutationError } = useErrorHandler();
  const [selectedTab, setSelectedTab] = useState<string>("all");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingCar, setEditingCar] = useState<CarType | null>(null);
  const [viewingBids, setViewingBids] = useState<CarType | null>(null);

  // Redirect non-admin users
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

  // Fetch all cars
  const { data: cars = [], isLoading, isError, refetch } = useQuery<CarType[]>({
    queryKey: ["/api/cars"],
  });

  // Fetch bids for a specific car when viewing bids
  const { data: bids = [], isLoading: bidsLoading } = useQuery<Bid[]>({
    queryKey: ["/api/cars", viewingBids?.id, "bids"],
    enabled: !!viewingBids?.id,
  });

  // Create car mutation
  const createCarMutation = useMutation({
    mutationFn: async (data: CarFormData) => {
      const response = await apiRequest("POST", "/api/cars", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cars"] });
      setIsAddDialogOpen(false);
      toast({
        title: "Success",
        description: "Car created successfully!",
      });
    },
    onError: (error: Error) => {
      handleMutationError(error, {
        title: "Failed to Create Car",
        defaultMessage: "Could not create car. Please try again.",
      });
    },
  });

  // Update car mutation
  const updateCarMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: CarFormData }) => {
      const response = await apiRequest("PUT", `/api/cars/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cars"] });
      setEditingCar(null);
      toast({
        title: "Success",
        description: "Car updated successfully!",
      });
    },
    onError: (error: Error) => {
      handleMutationError(error, {
        title: "Failed to Update Car",
        defaultMessage: "Could not update car. Please try again.",
      });
    },
  });

  // Delete car mutation
  const deleteCarMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/cars/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cars"] });
      toast({
        title: "Success",
        description: "Car deleted successfully!",
      });
    },
    onError: (error: Error) => {
      handleMutationError(error, {
        title: "Failed to Delete Car",
        defaultMessage: "Could not delete car. Please try again.",
      });
    },
  });

  // Filter cars by type
  const filteredCars = cars.filter(car => {
    switch (selectedTab) {
      case "sale": return !car.isAuction;
      case "auction": return car.isAuction;
      case "active-auctions": return car.isAuction && car.auctionEndTime && new Date(car.auctionEndTime) > new Date();
      case "ended-auctions": return car.isAuction && car.auctionEndTime && new Date(car.auctionEndTime) <= new Date();
      default: return true;
    }
  });

  // Add car form
  const addForm = useForm<CarFormData>({
    resolver: zodResolver(carFormSchema),
    defaultValues: {
      make: "",
      model: "",
      year: new Date().getFullYear(),
      price: 0,
      mileage: 0,
      fuelType: "",
      location: "",
      condition: "",
      image: "",
      isAuction: false,
      currentBid: 0,
      auctionEndTime: undefined,
      description: "",
    },
  });

  // Edit car form
  const editForm = useForm<CarFormData>({
    resolver: zodResolver(carFormSchema),
  });

  // Handle add car
  const handleAddCar = (data: CarFormData) => {
    const transformedData = {
      ...data,
      auctionEndTime: data.auctionEndTime ? new Date(data.auctionEndTime).toISOString() : undefined,
    };
    createCarMutation.mutate(transformedData);
  };

  // Handle edit car
  const handleEditCar = (data: CarFormData) => {
    if (editingCar) {
      const transformedData = {
        ...data,
        auctionEndTime: data.auctionEndTime ? new Date(data.auctionEndTime).toISOString() : undefined,
      };
      updateCarMutation.mutate({ id: editingCar.id, data: transformedData });
    }
  };

  // Handle delete car
  const handleDeleteCar = (id: string) => {
    deleteCarMutation.mutate(id);
  };

  // Open edit dialog
  const openEditDialog = (car: CarType) => {
    setEditingCar(car);
    editForm.reset({
      ...car,
      auctionEndTime: car.auctionEndTime ? format(new Date(car.auctionEndTime), "yyyy-MM-dd'T'HH:mm") : undefined,
      isAuction: car.isAuction ?? false,
      currentBid: car.currentBid ?? undefined,
      description: car.description ?? undefined,
    });
  };

  // Check if auction is active
  const isAuctionActive = (car: CarType) => {
    if (!car.isAuction || !car.auctionEndTime) return false;
    return new Date(car.auctionEndTime) > new Date();
  };

  // Get condition badge color
  const getConditionColor = (condition: string) => {
    switch (condition.toLowerCase()) {
      case "excellent": return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300";
      case "good": return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300";
      case "fair": return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300";
      default: return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300";
    }
  };

  // Calculate stats
  const stats = {
    totalCars: cars.length,
    carsForSale: cars.filter(c => !c.isAuction).length,
    auctionCars: cars.filter(c => c.isAuction).length,
    activeAuctions: cars.filter(c => c.isAuction && isAuctionActive(c)).length,
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-6">Manage Cars</h1>
        <div className="grid gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6">
                <div className="h-4 bg-muted rounded w-1/4 mb-2"></div>
                <div className="h-6 bg-muted rounded w-1/2 mb-4"></div>
                <div className="h-3 bg-muted rounded w-3/4"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="container mx-auto px-4 py-8 text-center">
        <h1 className="text-2xl font-bold text-destructive mb-4">Error Loading Cars</h1>
        <p className="text-muted-foreground mb-4">Failed to load cars. Please try again.</p>
        <Button onClick={() => refetch()}>Retry</Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="heading-admin-cars">
            Manage Cars
          </h1>
          <p className="text-muted-foreground">
            {cars.length} total cars • {stats.carsForSale} for sale • {stats.auctionCars} auction cars
          </p>
        </div>
        <div className="flex gap-2">
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-add-car">
                <Plus className="w-4 h-4 mr-2" />
                Add Car
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl">
              <DialogHeader>
                <DialogTitle>Add New Car</DialogTitle>
                <DialogDescription>
                  Add a new car to your inventory for sale or auction.
                </DialogDescription>
              </DialogHeader>
              <Form {...addForm}>
                <form onSubmit={addForm.handleSubmit(handleAddCar)} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <FormField
                      control={addForm.control}
                      name="make"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Make</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="Toyota" data-testid="input-car-make" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={addForm.control}
                      name="model"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Model</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="Camry" data-testid="input-car-model" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={addForm.control}
                      name="year"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Year</FormLabel>
                          <FormControl>
                            <Input 
                              type="number" 
                              {...field} 
                              onChange={e => field.onChange(e.target.value)}
                              data-testid="input-car-year" 
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                    <FormField
                      control={addForm.control}
                      name="price"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Price (₹)</FormLabel>
                          <FormControl>
                            <Input 
                              type="number" 
                              {...field} 
                              onChange={e => field.onChange(e.target.value)}
                              data-testid="input-car-price" 
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={addForm.control}
                      name="mileage"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Mileage (km)</FormLabel>
                          <FormControl>
                            <Input 
                              type="number" 
                              {...field} 
                              onChange={e => field.onChange(e.target.value)}
                              data-testid="input-car-mileage" 
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={addForm.control}
                      name="fuelType"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Fuel Type</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-car-fuel-type">
                                <SelectValue placeholder="Select fuel type" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="Petrol">Petrol</SelectItem>
                              <SelectItem value="Diesel">Diesel</SelectItem>
                              <SelectItem value="Electric">Electric</SelectItem>
                              <SelectItem value="Hybrid">Hybrid</SelectItem>
                              <SelectItem value="CNG">CNG</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={addForm.control}
                      name="condition"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Condition</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-car-condition">
                                <SelectValue placeholder="Select condition" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="Excellent">Excellent</SelectItem>
                              <SelectItem value="Good">Good</SelectItem>
                              <SelectItem value="Fair">Fair</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={addForm.control}
                      name="location"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Location</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="Mumbai, India" data-testid="input-car-location" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={addForm.control}
                      name="image"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Image URL</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="https://..." data-testid="input-car-image" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={addForm.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Description</FormLabel>
                        <FormControl>
                          <Textarea {...field} rows={3} data-testid="input-car-description" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={addForm.control}
                    name="isAuction"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">Auction Car</FormLabel>
                          <FormDescription>
                            Enable if this car is for auction instead of direct sale
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            data-testid="switch-car-auction"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  {addForm.watch("isAuction") && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={addForm.control}
                        name="currentBid"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Starting Bid (₹)</FormLabel>
                            <FormControl>
                              <Input 
                                type="number" 
                                {...field} 
                                onChange={e => field.onChange(e.target.value)}
                                data-testid="input-car-starting-bid" 
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={addForm.control}
                        name="auctionEndTime"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Auction End Date</FormLabel>
                            <FormControl>
                              <Input 
                                type="datetime-local" 
                                {...field}
                                data-testid="input-car-auction-end" 
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  )}

                  <DialogFooter>
                    <Button 
                      type="button" 
                      variant="outline" 
                      onClick={() => setIsAddDialogOpen(false)}
                      data-testid="button-cancel-add"
                    >
                      Cancel
                    </Button>
                    <Button 
                      type="submit" 
                      disabled={createCarMutation.isPending}
                      data-testid="button-create-car"
                    >
                      {createCarMutation.isPending ? "Creating..." : "Create Car"}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
          <Link href="/admin">
            <Button variant="outline">Back to Dashboard</Button>
          </Link>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Cars</p>
                <p className="text-2xl font-bold" data-testid="stat-total-cars">{stats.totalCars}</p>
              </div>
              <Car className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">For Sale</p>
                <p className="text-2xl font-bold" data-testid="stat-cars-sale">{stats.carsForSale}</p>
              </div>
              <DollarSign className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Auctions</p>
                <p className="text-2xl font-bold" data-testid="stat-cars-auction">{stats.auctionCars}</p>
              </div>
              <Calendar className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Active Auctions</p>
                <p className="text-2xl font-bold" data-testid="stat-active-auctions">{stats.activeAuctions}</p>
              </div>
              <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300">Live</Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs for filtering */}
      <Tabs value={selectedTab} onValueChange={setSelectedTab} className="mb-6">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="all" data-testid="tab-all-cars">All Cars</TabsTrigger>
          <TabsTrigger value="sale" data-testid="tab-cars-sale">For Sale</TabsTrigger>
          <TabsTrigger value="auction" data-testid="tab-cars-auction">Auction Cars</TabsTrigger>
          <TabsTrigger value="active-auctions" data-testid="tab-active-auctions">Active Auctions</TabsTrigger>
          <TabsTrigger value="ended-auctions" data-testid="tab-ended-auctions">Ended Auctions</TabsTrigger>
        </TabsList>

        <TabsContent value={selectedTab} className="mt-6">
          {filteredCars.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <Car className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">No Cars Found</h3>
                <p className="text-muted-foreground">
                  {selectedTab === "all" 
                    ? "No cars have been added yet." 
                    : `No cars found in the "${selectedTab}" category.`}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {filteredCars.map((car) => (
                <Card key={car.id} className="hover-elevate">
                  <div className="flex">
                    <div className="w-48 h-32 bg-muted rounded-l-lg overflow-hidden flex-shrink-0">
                      {car.image ? (
                        <picture>
                          <source srcSet={getImageUrls(car.image).webp} type="image/webp" />
                          <img 
                            src={getImageUrls(car.image).jpeg} 
                            alt={`${car.make} ${car.model}`}
                            className="w-full h-full object-cover"
                            data-testid={`image-${car.id}`}
                          />
                        </picture>
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Car className="w-8 h-8 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1">
                      <CardHeader>
                        <div className="flex justify-between items-start">
                          <div>
                            <CardTitle className="text-lg" data-testid={`car-title-${car.id}`}>
                              {car.year} {car.make} {car.model}
                            </CardTitle>
                            <CardDescription>
                              {car.mileage.toLocaleString()} km • {car.fuelType} • {car.location}
                            </CardDescription>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge className={getConditionColor(car.condition)}>
                              {car.condition}
                            </Badge>
                            {car.isAuction ? (
                              <Badge className={isAuctionActive(car) 
                                ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300"
                                : "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300"
                              }>
                                {isAuctionActive(car) ? "Live Auction" : "Ended"}
                              </Badge>
                            ) : (
                              <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300">
                                For Sale
                              </Badge>
                            )}
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="flex justify-between items-center mb-4">
                          <div>
                            <div className="text-2xl font-bold text-primary" data-testid={`price-${car.id}`}>
                              ₹{car.price.toLocaleString()}
                              {car.isAuction && car.currentBid && (
                                <span className="text-sm font-normal text-muted-foreground ml-2">
                                  (Current: ₹{car.currentBid.toLocaleString()})
                                </span>
                              )}
                            </div>
                            {car.isAuction && car.auctionEndTime && (
                              <div className="text-sm text-muted-foreground">
                                Ends: {format(new Date(car.auctionEndTime), "MMM dd, yyyy 'at' hh:mm a")}
                              </div>
                            )}
                          </div>
                          <div className="flex gap-2">
                            {car.isAuction && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setViewingBids(car)}
                                data-testid={`button-view-bids-${car.id}`}
                              >
                                <Eye className="w-4 h-4 mr-1" />
                                View Bids
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openEditDialog(car)}
                              data-testid={`button-edit-${car.id}`}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  data-testid={`button-delete-${car.id}`}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This will permanently delete the car "{car.year} {car.make} {car.model}". This action cannot be undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => handleDeleteCar(car.id)}
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  >
                                    Delete Car
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </div>
                        
                        {car.description && (
                          <p className="text-muted-foreground text-sm">{car.description}</p>
                        )}
                      </CardContent>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* View Bids Dialog */}
      <Dialog open={!!viewingBids} onOpenChange={() => setViewingBids(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Bids for {viewingBids?.year} {viewingBids?.make} {viewingBids?.model}
            </DialogTitle>
            <DialogDescription>
              All bids placed on this auction car.
            </DialogDescription>
          </DialogHeader>
          
          {bidsLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => (
                <div key={i} className="animate-pulse p-4 border rounded">
                  <div className="h-4 bg-muted rounded w-3/4 mb-2"></div>
                  <div className="h-3 bg-muted rounded w-1/2"></div>
                </div>
              ))}
            </div>
          ) : bids.length === 0 ? (
            <div className="text-center py-8">
              <DollarSign className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Bids Yet</h3>
              <p className="text-muted-foreground">This auction hasn't received any bids.</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {bids.map((bid, index) => (
                <div key={bid.id} className="flex justify-between items-center p-4 border rounded hover:bg-muted/50">
                  <div>
                    <div className="font-semibold" data-testid={`bid-amount-${index}`}>
                      ₹{bid.bidAmount.toLocaleString()}
                    </div>
                    <div className="text-sm text-muted-foreground" data-testid={`bid-email-${index}`}>
                      {bid.bidderEmail}
                    </div>
                  </div>
                  <div className="text-sm text-muted-foreground" data-testid={`bid-time-${index}`}>
                    {format(new Date(bid.bidTime), "MMM dd, hh:mm a")}
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Car Dialog - Similar to Add but with existing data */}
      <Dialog open={!!editingCar} onOpenChange={() => setEditingCar(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Edit Car</DialogTitle>
            <DialogDescription>
              Update the car details below.
            </DialogDescription>
          </DialogHeader>
          {editingCar && (
            <Form {...editForm}>
              <form onSubmit={editForm.handleSubmit(handleEditCar)} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <FormField
                    control={editForm.control}
                    name="make"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Make</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Toyota" data-testid="input-edit-car-make" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={editForm.control}
                    name="model"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Model</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Camry" data-testid="input-edit-car-model" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={editForm.control}
                    name="year"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Year</FormLabel>
                        <FormControl>
                          <Input 
                            type="number" 
                            {...field} 
                            onChange={e => field.onChange(parseInt(e.target.value) || 0)}
                            data-testid="input-edit-car-year" 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                  <FormField
                    control={editForm.control}
                    name="price"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Price (₹)</FormLabel>
                        <FormControl>
                          <Input 
                            type="number" 
                            {...field} 
                            onChange={e => field.onChange(parseInt(e.target.value) || 0)}
                            data-testid="input-edit-car-price" 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={editForm.control}
                    name="mileage"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Mileage (km)</FormLabel>
                        <FormControl>
                          <Input 
                            type="number" 
                            {...field} 
                            onChange={e => field.onChange(parseInt(e.target.value) || 0)}
                            data-testid="input-edit-car-mileage" 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={editForm.control}
                    name="fuelType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Fuel Type</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-edit-car-fuel-type">
                              <SelectValue placeholder="Select fuel type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="Petrol">Petrol</SelectItem>
                            <SelectItem value="Diesel">Diesel</SelectItem>
                            <SelectItem value="Electric">Electric</SelectItem>
                            <SelectItem value="Hybrid">Hybrid</SelectItem>
                            <SelectItem value="CNG">CNG</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={editForm.control}
                    name="condition"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Condition</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-edit-car-condition">
                              <SelectValue placeholder="Select condition" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="Excellent">Excellent</SelectItem>
                            <SelectItem value="Good">Good</SelectItem>
                            <SelectItem value="Fair">Fair</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={editForm.control}
                    name="location"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Location</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Mumbai, India" data-testid="input-edit-car-location" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={editForm.control}
                    name="image"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Image URL</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="https://..." data-testid="input-edit-car-image" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={editForm.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea {...field} rows={3} data-testid="input-edit-car-description" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={editForm.control}
                  name="isAuction"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">Auction Car</FormLabel>
                        <FormDescription>
                          Enable if this car is for auction instead of direct sale
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          data-testid="switch-edit-car-auction"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                {editForm.watch("isAuction") && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={editForm.control}
                      name="currentBid"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Current Bid (₹)</FormLabel>
                          <FormControl>
                            <Input 
                              type="number" 
                              {...field} 
                              onChange={e => field.onChange(e.target.value)}
                              data-testid="input-edit-car-current-bid" 
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={editForm.control}
                      name="auctionEndTime"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Auction End Date</FormLabel>
                          <FormControl>
                            <Input 
                              type="datetime-local" 
                              {...field}
                              data-testid="input-edit-car-auction-end" 
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                )}

                <DialogFooter>
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => setEditingCar(null)}
                    data-testid="button-cancel-edit"
                  >
                    Cancel
                  </Button>
                  <Button 
                    type="submit" 
                    disabled={updateCarMutation.isPending}
                    data-testid="button-update-car"
                  >
                    {updateCarMutation.isPending ? "Updating..." : "Update Car"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}