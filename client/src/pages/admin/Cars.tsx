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
import { Car, Plus, Edit, Trash2, Filter, Calendar, DollarSign, Eye, ChevronLeft, ChevronRight, Check, X, Gavel, Clock, TrendingUp, List } from "lucide-react";
import { Link, useLocation } from "wouter";
import { apiRequest, apiRequestJson } from "@/lib/queryClient";
import { useErrorHandler } from "@/lib/error-utils";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertCarSchema } from "@shared/schema";
import type { Car as CarType, Bid, CarImage } from "@shared/schema";
import { z } from "zod";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { format, differenceInHours, differenceInMinutes, differenceInSeconds, differenceInDays } from "date-fns";
import { ImageUpload } from "@/components/ImageUpload";
import { CarImageGallery } from "@/components/CarImageGallery";

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
  transmission: z.string().min(1, "Transmission is required"),
  location: z.string()
    .min(1, "Location is required")
    .min(3, "Location must be at least 3 characters")
    .max(100, "Location cannot exceed 100 characters"),
  condition: z.string().min(1, "Condition is required"),
  registrationNumber: z.string()
    .min(1, "Registration number is required")
    .transform(val => val.trim().toUpperCase())
    .pipe(z.string()
      .min(6, "Registration number must be at least 6 characters")
      .max(20, "Registration number cannot exceed 20 characters")
      .regex(/^[A-Z0-9\-]+$/, "Registration number can only contain letters, numbers, and hyphens")
    ),
  numOwners: z.coerce.number()
    .min(1, "Number of owners must be at least 1")
    .max(10, "Number of owners cannot exceed 10"),
  bodyType: z.string().min(1, "Body type is required"),
  color: z.string().min(1, "Color is required"),
  engineSize: z.string()
    .min(1, "Engine size is required")
    .regex(/^\d+(\.\d+)?$/, "Engine size must be a number (e.g., 1498, 1.5)"),
  features: z.array(z.string()).optional().or(z.string().transform(val => val ? val.split(',').map(f => f.trim()).filter(f => f.length > 0) : [])),
  serviceHistory: z.string().optional(),
  image: z.string()
    .optional()
    .or(z.literal(''))
    .refine((val) => !val || val.match(/^https?:\/\/.+\.(jpg|jpeg|png|webp|gif)$/i), {
      message: "If provided, image URL must be a valid URL ending with .jpg, .jpeg, .png, .webp, or .gif"
    }),
  isAuction: z.boolean().default(false),
  currentBid: z.coerce.number()
    .min(0, "Current bid must be positive")
    .optional(),
  auctionEndTime: z.string().optional(),
  description: z.string()
    .max(1000, "Description cannot exceed 1000 characters")
    .optional(),
  userId: z.string().optional(),
});

type CarFormData = z.infer<typeof carFormSchema>;

interface CountdownTimerProps {
  endTime: string | Date;
}

function CountdownTimer({ endTime }: CountdownTimerProps) {
  const [timeLeft, setTimeLeft] = useState<string>("");

  useEffect(() => {
    const calculateTimeLeft = () => {
      const now = new Date();
      const end = typeof endTime === 'string' ? new Date(endTime) : endTime;
      
      if (end <= now) {
        setTimeLeft("Ended");
        return;
      }

      const days = differenceInDays(end, now);
      const hours = differenceInHours(end, now) % 24;
      const minutes = differenceInMinutes(end, now) % 60;

      if (days > 0) {
        setTimeLeft(`${days}d ${hours}h ${minutes}m`);
      } else if (hours > 0) {
        setTimeLeft(`${hours}h ${minutes}m`);
      } else {
        setTimeLeft(`${minutes}m`);
      }
    };

    calculateTimeLeft();
    const interval = setInterval(calculateTimeLeft, 60000);

    return () => clearInterval(interval);
  }, [endTime]);

  if (timeLeft === "Ended") {
    return null;
  }

  return (
    <Badge variant="outline" className="flex items-center gap-1">
      <Clock className="w-3 h-3" />
      {timeLeft}
    </Badge>
  );
}

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
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 20;
  const [uploadedImageUrls, setUploadedImageUrls] = useState<string[]>([]);
  const [editCarImages, setEditCarImages] = useState<CarImage[]>([]);

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

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["/api/cars", currentPage, pageSize],
    queryFn: async () => {
      const offset = (currentPage - 1) * pageSize;
      const response = await apiRequest("GET", `/api/cars?offset=${offset}&limit=${pageSize}`);
      return response.json();
    },
  });

  const cars = data?.cars || [];
  const totalCount = data?.total || 0;
  const totalPages = Math.ceil(totalCount / pageSize);
  const startIndex = (currentPage - 1) * pageSize + 1;
  const endIndex = Math.min(currentPage * pageSize, totalCount);

  const { data: bids = [], isLoading: bidsLoading } = useQuery<Bid[]>({
    queryKey: ["/api/cars", viewingBids?.id, "bids"],
    enabled: !!viewingBids?.id,
  });

  const { data: carImages = [], refetch: refetchCarImages } = useQuery<CarImage[]>({
    queryKey: ["/api/cars", editingCar?.id, "images"],
    enabled: !!editingCar?.id,
    queryFn: async () => {
      const response = await apiRequest("GET", `/api/cars/${editingCar?.id}/images`);
      return response.json();
    },
  });

  useEffect(() => {
    if (carImages.length > 0) {
      setEditCarImages(carImages);
    } else {
      setEditCarImages([]);
    }
  }, [carImages]);

  const getBidCountForCar = (carId: string): number => {
    const carBids = queryClient.getQueryData<Bid[]>(["/api/cars", carId, "bids"]);
    return carBids?.length || 0;
  };

  const getHighestBidForCar = (carId: string): number | null => {
    const carBids = queryClient.getQueryData<Bid[]>(["/api/cars", carId, "bids"]);
    if (!carBids || carBids.length === 0) return null;
    return Math.max(...carBids.map(bid => bid.bidAmount));
  };

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

  const updateBidStatusMutation = useMutation({
    mutationFn: async ({ bidId, status }: { bidId: string; status: "accepted" | "rejected" }) => {
      const response = await apiRequestJson("PATCH", `/api/admin/bids/${bidId}`, { status });
      return response;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/bids"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cars"] });
      if (viewingBids?.id) {
        queryClient.invalidateQueries({ queryKey: ["/api/cars", viewingBids.id, "bids"] });
      }
      toast({
        title: "Success",
        description: `Bid ${variables.status} successfully!`,
      });
    },
    onError: (error: Error) => {
      handleMutationError(error, {
        title: "Failed to Update Bid",
        defaultMessage: "Could not update bid status. Please try again.",
      });
    },
  });

  const associateImagesMutation = useMutation({
    mutationFn: async ({ carId, imageUrls, setFirstAsPrimary = false }: { carId: string; imageUrls: string[]; setFirstAsPrimary?: boolean }) => {
      const imagesToAssociate = imageUrls.map((imageUrl, index) => ({
        imageUrl,
        displayOrder: index,
        isPrimary: setFirstAsPrimary && index === 0
      }));
      const response = await apiRequestJson("POST", `/api/cars/${carId}/images`, imagesToAssociate);
      return response;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/cars"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cars", variables.carId, "images"] });
      toast({
        title: "Success",
        description: "Images associated successfully!",
      });
    },
    onError: (error: Error) => {
      handleMutationError(error, {
        title: "Failed to Associate Images",
        defaultMessage: "Could not associate images with car. Please try again.",
      });
    },
  });

  const reorderImagesMutation = useMutation({
    mutationFn: async ({ carId, images }: { carId: string; images: CarImage[] }) => {
      const imageData = images.map(img => ({
        id: img.id,
        displayOrder: img.displayOrder
      }));
      const response = await apiRequestJson("PATCH", `/api/cars/${carId}/images/reorder`, { images: imageData });
      return response;
    },
    onSuccess: (_, variables) => {
      setEditCarImages(variables.images);
      queryClient.invalidateQueries({ queryKey: ["/api/cars", variables.carId, "images"] });
      toast({
        title: "Success",
        description: "Images reordered successfully!",
      });
    },
    onError: (error: Error) => {
      handleMutationError(error, {
        title: "Failed to Reorder Images",
        defaultMessage: "Could not reorder images. Please try again.",
      });
    },
  });

  const setPrimaryImageMutation = useMutation({
    mutationFn: async ({ carId, imageId }: { carId: string; imageId: string }) => {
      const response = await apiRequestJson("PATCH", `/api/cars/${carId}/images/${imageId}`, { isPrimary: true });
      return response;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/cars"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cars", variables.carId, "images"] });
      refetchCarImages();
      toast({
        title: "Success",
        description: "Primary image updated successfully!",
      });
    },
    onError: (error: Error) => {
      handleMutationError(error, {
        title: "Failed to Set Primary Image",
        defaultMessage: "Could not set primary image. Please try again.",
      });
    },
  });

  const deleteImageMutation = useMutation({
    mutationFn: async ({ imageId }: { imageId: string }) => {
      await apiRequest("DELETE", `/api/cars/images/${imageId}`);
    },
    onSuccess: () => {
      if (editingCar?.id) {
        queryClient.invalidateQueries({ queryKey: ["/api/cars", editingCar.id, "images"] });
        queryClient.invalidateQueries({ queryKey: ["/api/cars"] });
      }
      toast({
        title: "Success",
        description: "Image deleted successfully!",
      });
    },
    onError: (error: Error) => {
      handleMutationError(error, {
        title: "Failed to Delete Image",
        defaultMessage: "Could not delete image. Please try again.",
      });
    },
  });

  const filteredCars = cars.filter((car: CarType) => {
    switch (selectedTab) {
      case "sale": return !car.isAuction;
      case "auction": return car.isAuction;
      case "active-auctions": return car.isAuction && car.auctionEndTime && new Date(car.auctionEndTime) > new Date();
      case "ended-auctions": return car.isAuction && car.auctionEndTime && new Date(car.auctionEndTime) <= new Date();
      default: return true;
    }
  });

  useEffect(() => {
    filteredCars.forEach((car: CarType) => {
      if (car.isAuction && car.id) {
        queryClient.prefetchQuery({
          queryKey: ["/api/cars", car.id, "bids"],
          queryFn: async () => {
            const response = await apiRequest("GET", `/api/cars/${car.id}/bids`);
            return response.json();
          },
        });
      }
    });
  }, [filteredCars, queryClient]);

  const addForm = useForm<CarFormData>({
    resolver: zodResolver(carFormSchema),
    defaultValues: {
      make: "",
      model: "",
      year: new Date().getFullYear(),
      price: 0,
      mileage: 0,
      fuelType: "",
      transmission: "",
      location: "",
      condition: "",
      registrationNumber: "",
      numOwners: 1,
      bodyType: "",
      color: "",
      engineSize: "",
      features: [],
      serviceHistory: "",
      image: "",
      isAuction: false,
      currentBid: 0,
      auctionEndTime: undefined,
      description: "",
      userId: undefined,
    },
  });

  const editForm = useForm<CarFormData>({
    resolver: zodResolver(carFormSchema),
  });

  const handleAddCar = async (data: CarFormData) => {
    const transformedData: any = {
      ...data,
      auctionEndTime: data.auctionEndTime && data.auctionEndTime.trim() !== '' 
        ? new Date(data.auctionEndTime).toISOString() 
        : undefined,
    };

    if (transformedData.auctionEndTime === undefined) {
      delete transformedData.auctionEndTime;
    }

    try {
      const createdCar = await createCarMutation.mutateAsync(transformedData);
      
      if (uploadedImageUrls.length > 0 && createdCar?.id) {
        await associateImagesMutation.mutateAsync({
          carId: createdCar.id,
          imageUrls: uploadedImageUrls,
          setFirstAsPrimary: true
        });
      }
      
      setUploadedImageUrls([]);
      setIsAddDialogOpen(false);
    } catch (error) {
    }
  };

  const handleEditCar = (data: CarFormData) => {
    if (editingCar) {
      const transformedData: any = {
        ...data,
        auctionEndTime: data.auctionEndTime && data.auctionEndTime.trim() !== '' 
          ? new Date(data.auctionEndTime).toISOString() 
          : undefined,
      };

      if (transformedData.auctionEndTime === undefined) {
        delete transformedData.auctionEndTime;
      }
      updateCarMutation.mutate({ id: editingCar.id, data: transformedData });
    }
  };

  const handleDeleteCar = (id: string) => {
    deleteCarMutation.mutate(id);
  };

  const openEditDialog = (car: CarType) => {
    setEditingCar(car);
    setUploadedImageUrls([]);
    editForm.reset({
      make: car.make || "",
      model: car.model || "",
      year: car.year || new Date().getFullYear(),
      price: car.price || 0,
      mileage: car.mileage || 0,
      fuelType: car.fuelType || "",
      transmission: car.transmission || "",
      location: car.location || "",
      condition: car.condition || "",
      registrationNumber: car.registrationNumber || "",
      numOwners: car.numOwners || 1,
      bodyType: car.bodyType || "",
      color: car.color || "",
      engineSize: car.engineSize || "",
      features: Array.isArray(car.features) ? car.features : (car.features ? [car.features] : []),
      serviceHistory: car.serviceHistory || "",
      image: car.image || "",
      auctionEndTime: car.auctionEndTime ? format(new Date(car.auctionEndTime), "yyyy-MM-dd'T'HH:mm") : undefined,
      isAuction: car.isAuction ?? false,
      currentBid: car.currentBid ?? undefined,
      description: car.description ?? undefined,
      userId: car.userId ?? undefined,
    });
  };

  const handleImageUploadComplete = async (urls: string[]) => {
    if (editingCar?.id) {
      await associateImagesMutation.mutateAsync({
        carId: editingCar.id,
        imageUrls: urls
      });
      refetchCarImages();
    } else {
      setUploadedImageUrls(prev => [...prev, ...urls]);
    }
  };

  const handleReorderImages = (images: CarImage[]) => {
    if (editingCar?.id) {
      reorderImagesMutation.mutate({
        carId: editingCar.id,
        images
      });
    }
  };

  const handleSetPrimaryImage = (imageId: string) => {
    if (editingCar?.id) {
      setPrimaryImageMutation.mutate({
        carId: editingCar.id,
        imageId
      });
    }
  };

  const handleDeleteImage = (imageId: string) => {
    deleteImageMutation.mutate({ imageId });
  };

  const getCarPrimaryImage = (car: CarType): string => {
    return car.image || '';
  };

  const isAuctionActive = (car: CarType) => {
    if (!car.isAuction || !car.auctionEndTime) return false;
    return new Date(car.auctionEndTime) > new Date();
  };

  const getConditionColor = (condition: string) => {
    switch (condition.toLowerCase()) {
      case "excellent": return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300";
      case "good": return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300";
      case "fair": return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300";
      default: return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300";
    }
  };

  const stats = {
    totalCars: cars.length,
    carsForSale: cars.filter((c: CarType) => !c.isAuction).length,
    auctionCars: cars.filter((c: CarType) => c.isAuction).length,
    activeAuctions: cars.filter((c: CarType) => c.isAuction && isAuctionActive(c)).length,
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
            {totalCount > 0 ? `Showing ${startIndex}-${endIndex} of ${totalCount} cars` : 'No cars'}
            {cars.length > 0 && ` • ${stats.carsForSale} for sale • ${stats.auctionCars} auction on this page`}
          </p>
        </div>
        <div className="flex gap-2">
          <Dialog open={isAddDialogOpen} onOpenChange={(open) => {
            setIsAddDialogOpen(open);
            if (!open) {
              setUploadedImageUrls([]);
              addForm.reset();
            }
          }}>
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

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                    <FormField
                      control={addForm.control}
                      name="transmission"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Transmission</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-car-transmission">
                                <SelectValue placeholder="Select transmission" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="Manual">Manual</SelectItem>
                              <SelectItem value="Automatic">Automatic</SelectItem>
                              <SelectItem value="Semi-Automatic">Semi-Automatic</SelectItem>
                              <SelectItem value="CVT">CVT</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={addForm.control}
                      name="bodyType"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Body Type</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-car-body-type">
                                <SelectValue placeholder="Select body type" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="Sedan">Sedan</SelectItem>
                              <SelectItem value="SUV">SUV</SelectItem>
                              <SelectItem value="Hatchback">Hatchback</SelectItem>
                              <SelectItem value="Coupe">Coupe</SelectItem>
                              <SelectItem value="Convertible">Convertible</SelectItem>
                              <SelectItem value="Wagon">Wagon</SelectItem>
                              <SelectItem value="Truck">Truck</SelectItem>
                              <SelectItem value="Van">Van</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={addForm.control}
                      name="color"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Color</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="White" data-testid="input-car-color" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={addForm.control}
                      name="numOwners"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Number of Owners</FormLabel>
                          <Select onValueChange={(v) => field.onChange(parseInt(v))} value={field.value?.toString()}>
                            <FormControl>
                              <SelectTrigger data-testid="select-car-num-owners">
                                <SelectValue placeholder="Select" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="1">1 (First Owner)</SelectItem>
                              <SelectItem value="2">2</SelectItem>
                              <SelectItem value="3">3</SelectItem>
                              <SelectItem value="4">4</SelectItem>
                              <SelectItem value="5">5+</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <FormField
                      control={addForm.control}
                      name="registrationNumber"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Registration Number</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="MH01AB1234" data-testid="input-car-registration" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={addForm.control}
                      name="engineSize"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Engine Size (cc or L)</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="1498 or 1.5" data-testid="input-car-engine-size" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
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
                    name="features"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Features (comma-separated)</FormLabel>
                        <FormControl>
                          <Input 
                            {...field} 
                            value={Array.isArray(field.value) ? field.value.join(', ') : field.value} 
                            onChange={(e) => field.onChange(e.target.value)}
                            placeholder="Air Conditioning, Power Steering, ABS, Airbags" 
                            data-testid="input-car-features" 
                          />
                        </FormControl>
                        <FormDescription>
                          Enter features separated by commas (e.g., "Air Conditioning, Power Steering, ABS")
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={addForm.control}
                    name="serviceHistory"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Service History (optional)</FormLabel>
                        <FormControl>
                          <Textarea {...field} rows={3} placeholder="Full service history available. Last serviced in Jan 2025..." data-testid="input-car-service-history" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

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

                  <div>
                    <Label className="mb-2 block">Additional Images</Label>
                    <ImageUpload
                      uploadUrl="/api/upload/car"
                      multiple
                      maxFiles={10}
                      onUploadComplete={handleImageUploadComplete}
                      label="Upload multiple car images (max 10)"
                    />
                    {uploadedImageUrls.length > 0 && (
                      <p className="text-sm text-muted-foreground mt-2">
                        {uploadedImageUrls.length} image{uploadedImageUrls.length !== 1 ? 's' : ''} ready to be associated with the car
                      </p>
                    )}
                  </div>

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
              {filteredCars.map((car: CarType) => (
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
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge className={getConditionColor(car.condition)}>
                              {car.condition}
                            </Badge>
                            {car.isAuction ? (
                              <>
                                <Badge className={isAuctionActive(car) 
                                  ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300"
                                  : "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300"
                                }>
                                  {isAuctionActive(car) ? "Live Auction" : "Ended"}
                                </Badge>
                                {getBidCountForCar(car.id) > 0 && (
                                  <Badge variant="outline" className="flex items-center gap-1">
                                    <Gavel className="w-3 h-3" />
                                    {getBidCountForCar(car.id)} {getBidCountForCar(car.id) === 1 ? 'Bid' : 'Bids'}
                                  </Badge>
                                )}
                                {getHighestBidForCar(car.id) && (
                                  <Badge variant="outline" className="flex items-center gap-1 bg-primary/10">
                                    <TrendingUp className="w-3 h-3" />
                                    ₹{getHighestBidForCar(car.id)?.toLocaleString()}
                                  </Badge>
                                )}
                                {car.auctionEndTime && isAuctionActive(car) && (
                                  <CountdownTimer endTime={car.auctionEndTime} />
                                )}
                              </>
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
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="font-semibold" data-testid={`bid-amount-${index}`}>
                        ₹{bid.bidAmount.toLocaleString()}
                      </div>
                      <Badge className={
                        bid.status === "pending" ? "bg-yellow-500 text-white" :
                        bid.status === "accepted" ? "bg-green-500 text-white" :
                        "bg-red-500 text-white"
                      }>
                        {bid.status.charAt(0).toUpperCase() + bid.status.slice(1)}
                      </Badge>
                    </div>
                    <div className="text-sm text-muted-foreground" data-testid={`bid-email-${index}`}>
                      {bid.bidderEmail}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-sm text-muted-foreground mr-2" data-testid={`bid-time-${index}`}>
                      {format(new Date(bid.bidTime), "MMM dd, hh:mm a")}
                    </div>
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
                                Are you sure you want to accept this bid of ₹{bid.bidAmount.toLocaleString()} from {bid.bidderEmail}?
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
                                Are you sure you want to reject this bid of ₹{bid.bidAmount.toLocaleString()} from {bid.bidderEmail}?
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
                  </div>
                </div>
              ))}
            </div>
          )}
          <DialogFooter className="mt-4">
            <Link href={`/admin/bids?carId=${viewingBids?.id}`}>
              <Button variant="outline">
                <List className="w-4 h-4 mr-2" />
                View All Bids for this Car
              </Button>
            </Link>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingCar} onOpenChange={(open) => {
        if (!open) {
          setEditingCar(null);
          setUploadedImageUrls([]);
          setEditCarImages([]);
        }
      }}>
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

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                  <FormField
                    control={editForm.control}
                    name="transmission"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Transmission</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-edit-car-transmission">
                              <SelectValue placeholder="Select transmission" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="Manual">Manual</SelectItem>
                            <SelectItem value="Automatic">Automatic</SelectItem>
                            <SelectItem value="Semi-Automatic">Semi-Automatic</SelectItem>
                            <SelectItem value="CVT">CVT</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={editForm.control}
                    name="bodyType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Body Type</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-edit-car-body-type">
                              <SelectValue placeholder="Select body type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="Sedan">Sedan</SelectItem>
                            <SelectItem value="SUV">SUV</SelectItem>
                            <SelectItem value="Hatchback">Hatchback</SelectItem>
                            <SelectItem value="Coupe">Coupe</SelectItem>
                            <SelectItem value="Convertible">Convertible</SelectItem>
                            <SelectItem value="Wagon">Wagon</SelectItem>
                            <SelectItem value="Truck">Truck</SelectItem>
                            <SelectItem value="Van">Van</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={editForm.control}
                    name="color"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Color</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="White" data-testid="input-edit-car-color" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={editForm.control}
                    name="numOwners"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Number of Owners</FormLabel>
                        <Select onValueChange={(v) => field.onChange(parseInt(v))} value={field.value?.toString()}>
                          <FormControl>
                            <SelectTrigger data-testid="select-edit-car-num-owners">
                              <SelectValue placeholder="Select" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="1">1 (First Owner)</SelectItem>
                            <SelectItem value="2">2</SelectItem>
                            <SelectItem value="3">3</SelectItem>
                            <SelectItem value="4">4</SelectItem>
                            <SelectItem value="5">5+</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <FormField
                    control={editForm.control}
                    name="registrationNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Registration Number</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="MH01AB1234" data-testid="input-edit-car-registration" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={editForm.control}
                    name="engineSize"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Engine Size (cc or L)</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="1498 or 1.5" data-testid="input-edit-car-engine-size" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
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
                  name="features"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Features (comma-separated)</FormLabel>
                      <FormControl>
                        <Input 
                          {...field} 
                          value={Array.isArray(field.value) ? field.value.join(', ') : field.value} 
                          onChange={(e) => field.onChange(e.target.value)}
                          placeholder="Air Conditioning, Power Steering, ABS, Airbags" 
                          data-testid="input-edit-car-features" 
                        />
                      </FormControl>
                      <FormDescription>
                        Enter features separated by commas (e.g., "Air Conditioning, Power Steering, ABS")
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={editForm.control}
                  name="serviceHistory"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Service History (optional)</FormLabel>
                      <FormControl>
                        <Textarea {...field} rows={3} placeholder="Full service history available. Last serviced in Jan 2025..." data-testid="input-edit-car-service-history" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

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

                <div className="space-y-4">
                  <div>
                    <Label className="mb-2 block">Car Images Gallery</Label>
                    {editCarImages.length > 0 ? (
                      <CarImageGallery
                        images={editCarImages}
                        onReorder={handleReorderImages}
                        onSetPrimary={handleSetPrimaryImage}
                        onDelete={handleDeleteImage}
                      />
                    ) : (
                      <p className="text-sm text-muted-foreground">No images uploaded yet</p>
                    )}
                  </div>

                  <div>
                    <Label className="mb-2 block">Upload Additional Images</Label>
                    <ImageUpload
                      uploadUrl="/api/upload/car"
                      multiple
                      maxFiles={10}
                      onUploadComplete={handleImageUploadComplete}
                      label="Upload more car images (max 10 total)"
                    />
                  </div>
                </div>

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

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-6">
          <div className="text-sm text-muted-foreground">
            Page {currentPage} of {totalPages}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
            >
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
