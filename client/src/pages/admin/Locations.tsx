import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { MapPin, Plus, Phone, Mail, Clock, Star, Edit, Trash2 } from "lucide-react";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertLocationSchema } from "@shared/schema";
import type { Location } from "@shared/schema";
import { z } from "zod";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

type LocationFormData = z.infer<typeof insertLocationSchema>;

export default function AdminLocations() {
  const { user, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);
  const [deletingLocation, setDeletingLocation] = useState<Location | null>(null);

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

  const { data: locations = [], isLoading, isError } = useQuery<Location[]>({
    queryKey: ["/api/locations"],
  });

  const createLocationMutation = useMutation({
    mutationFn: async (data: LocationFormData) => {
      const response = await apiRequest("POST", "/api/locations", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/locations"] });
      setIsAddDialogOpen(false);
      form.reset();
      toast({
        title: "Success",
        description: "Location created successfully!",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create location",
        variant: "destructive",
      });
    },
  });

  const updateLocationMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: LocationFormData }) => {
      const response = await apiRequest("PUT", `/api/locations/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/locations"] });
      setEditingLocation(null);
      editForm.reset();
      toast({
        title: "Success",
        description: "Location updated successfully!",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update location",
        variant: "destructive",
      });
    },
  });

  const deleteLocationMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/locations/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/locations"] });
      setDeletingLocation(null);
      toast({
        title: "Success",
        description: "Location deleted successfully!",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete location",
        variant: "destructive",
      });
    },
  });

  const form = useForm<LocationFormData>({
    resolver: zodResolver(insertLocationSchema),
    defaultValues: {
      name: "",
      address: "",
      phone: "",
      email: "",
      hours: "",
      rating: "4.5",
    },
  });

  const editForm = useForm<LocationFormData>({
    resolver: zodResolver(insertLocationSchema),
    defaultValues: {
      name: "",
      address: "",
      phone: "",
      email: "",
      hours: "",
      rating: "4.5",
    },
  });

  const handleAddLocation = (data: LocationFormData) => {
    createLocationMutation.mutate(data);
  };

  const handleEditLocation = (location: Location) => {
    setEditingLocation(location);
    editForm.reset({
      name: location.name,
      address: location.address,
      phone: location.phone,
      email: location.email,
      hours: location.hours,
      rating: location.rating || "4.5",
    });
  };

  const handleUpdateLocation = (data: LocationFormData) => {
    if (editingLocation) {
      updateLocationMutation.mutate({ id: editingLocation.id, data });
    }
  };

  const handleDeleteLocation = (location: Location) => {
    setDeletingLocation(location);
  };

  const confirmDeleteLocation = () => {
    if (deletingLocation) {
      deleteLocationMutation.mutate(deletingLocation.id);
    }
  };

  const formatRating = (rating: string) => {
    const numRating = parseFloat(rating);
    return numRating.toFixed(1);
  };

  const getRatingColor = (rating: string) => {
    const numRating = parseFloat(rating);
    if (numRating >= 4.5) return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300";
    if (numRating >= 4.0) return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300";
    if (numRating >= 3.5) return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300";
    return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300";
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-6">Manage Locations</h1>
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
        <h1 className="text-2xl font-bold text-destructive mb-4">Error Loading Locations</h1>
        <p className="text-muted-foreground mb-4">Failed to load locations. Please try again.</p>
        <Button onClick={() => window.location.reload()}>Retry</Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="heading-admin-locations">
            Manage Locations
          </h1>
          <p className="text-muted-foreground">
            {locations.length} service locations
          </p>
        </div>
        <div className="flex gap-2">
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-add-location">
                <Plus className="w-4 h-4 mr-2" />
                Add Location
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Add New Location</DialogTitle>
                <DialogDescription>
                  Create a new service location for your garage network.
                </DialogDescription>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(handleAddLocation)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Location Name</FormLabel>
                        <FormControl>
                          <Input 
                            {...field} 
                            placeholder="Downtown Branch"
                            data-testid="input-location-name" 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="address"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Address</FormLabel>
                        <FormControl>
                          <Textarea 
                            {...field} 
                            placeholder="123 Main Street, City, State, PIN"
                            data-testid="input-location-address"
                            rows={3}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="phone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Phone Number</FormLabel>
                          <FormControl>
                            <Input 
                              {...field} 
                              placeholder="+91 98765 43210"
                              data-testid="input-location-phone" 
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email</FormLabel>
                          <FormControl>
                            <Input 
                              {...field} 
                              type="email"
                              placeholder="location@garage.com"
                              data-testid="input-location-email" 
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="hours"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Operating Hours</FormLabel>
                          <FormControl>
                            <Input 
                              {...field} 
                              placeholder="9:00 AM - 6:00 PM"
                              data-testid="input-location-hours" 
                            />
                          </FormControl>
                          <FormDescription>
                            e.g., "9:00 AM - 6:00 PM (Mon-Sat)"
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="rating"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Initial Rating</FormLabel>
                          <FormControl>
                            <Input 
                              {...field} 
                              value={field.value ?? undefined}
                              type="number"
                              min="1"
                              max="5"
                              step="0.1"
                              placeholder="4.5"
                              data-testid="input-location-rating" 
                            />
                          </FormControl>
                          <FormDescription>
                            Rating out of 5.0
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

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
                      disabled={createLocationMutation.isPending}
                      data-testid="button-create-location"
                    >
                      {createLocationMutation.isPending ? "Creating..." : "Create Location"}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>

          <Dialog open={!!editingLocation} onOpenChange={(open) => !open && setEditingLocation(null)}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Edit Location</DialogTitle>
                <DialogDescription>
                  Update the details for {editingLocation?.name}.
                </DialogDescription>
              </DialogHeader>
              <Form {...editForm}>
                <form onSubmit={editForm.handleSubmit(handleUpdateLocation)} className="space-y-4">
                  <FormField
                    control={editForm.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Location Name</FormLabel>
                        <FormControl>
                          <Input 
                            {...field} 
                            placeholder="Downtown Branch"
                            data-testid="input-edit-location-name" 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={editForm.control}
                    name="address"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Address</FormLabel>
                        <FormControl>
                          <Textarea 
                            {...field} 
                            placeholder="123 Main Street, City, State, PIN"
                            data-testid="input-edit-location-address"
                            rows={3}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={editForm.control}
                      name="phone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Phone Number</FormLabel>
                          <FormControl>
                            <Input 
                              {...field} 
                              placeholder="+91 98765 43210"
                              data-testid="input-edit-location-phone" 
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={editForm.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email</FormLabel>
                          <FormControl>
                            <Input 
                              {...field} 
                              type="email"
                              placeholder="location@garage.com"
                              data-testid="input-edit-location-email" 
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={editForm.control}
                      name="hours"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Operating Hours</FormLabel>
                          <FormControl>
                            <Input 
                              {...field} 
                              placeholder="9:00 AM - 6:00 PM"
                              data-testid="input-edit-location-hours" 
                            />
                          </FormControl>
                          <FormDescription>
                            e.g., "9:00 AM - 6:00 PM (Mon-Sat)"
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={editForm.control}
                      name="rating"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Rating</FormLabel>
                          <FormControl>
                            <Input 
                              {...field} 
                              value={field.value ?? undefined}
                              type="number"
                              min="1"
                              max="5"
                              step="0.1"
                              placeholder="4.5"
                              data-testid="input-edit-location-rating" 
                            />
                          </FormControl>
                          <FormDescription>
                            Rating out of 5.0
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <DialogFooter>
                    <Button 
                      type="button" 
                      variant="outline" 
                      onClick={() => setEditingLocation(null)}
                      data-testid="button-cancel-edit"
                    >
                      Cancel
                    </Button>
                    <Button 
                      type="submit" 
                      disabled={updateLocationMutation.isPending}
                      data-testid="button-update-location"
                    >
                      {updateLocationMutation.isPending ? "Updating..." : "Update Location"}
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

      {locations.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <MapPin className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Locations Found</h3>
            <p className="text-muted-foreground">No service locations have been created yet.</p>
            <Button 
              className="mt-4"
              onClick={() => setIsAddDialogOpen(true)}
              data-testid="button-add-first-location"
            >
              Add First Location
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {locations.map((location) => (
            <Card key={location.id} className="hover-elevate">
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-lg" data-testid={`location-name-${location.id}`}>
                      <div className="flex items-center gap-2">
                        <MapPin className="w-5 h-5 text-muted-foreground" />
                        {location.name}
                      </div>
                    </CardTitle>
                    <CardDescription className="mt-2">
                      {location.address}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge 
                      className={getRatingColor(location.rating || "4.5")}
                      data-testid={`rating-${location.id}`}
                    >
                      <Star className="w-3 h-3 mr-1" />
                      {formatRating(location.rating || "4.5")}
                    </Badge>
                    <div className="flex gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleEditLocation(location)}
                        data-testid={`button-edit-location-${location.id}`}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => handleDeleteLocation(location)}
                            data-testid={`button-delete-location-${location.id}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Location</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to delete "{location.name}"? This action cannot be undone.
                              {locations.filter(l => l.id !== location.id).length === 0 && (
                                <span className="block mt-2 font-medium text-destructive">
                                  Warning: This is your last location. Deleting it will leave you with no service locations.
                                </span>
                              )}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={confirmDeleteLocation}
                              disabled={deleteLocationMutation.isPending}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              {deleteLocationMutation.isPending ? "Deleting..." : "Delete"}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="flex items-center gap-2">
                    <Phone className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm" data-testid={`phone-${location.id}`}>
                      {location.phone}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Mail className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm" data-testid={`email-${location.id}`}>
                      {location.email}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm" data-testid={`hours-${location.id}`}>
                      {location.hours}
                    </span>
                  </div>
                </div>

              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {locations.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-lg">Location Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-primary" data-testid="stat-total-locations">
                  {locations.length}
                </div>
                <div className="text-sm text-muted-foreground">Total Locations</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600" data-testid="stat-avg-rating">
                  {locations.length > 0 
                    ? (locations.reduce((sum, loc) => sum + parseFloat(loc.rating || "4.5"), 0) / locations.length).toFixed(1)
                    : "0.0"
                  }
                </div>
                <div className="text-sm text-muted-foreground">Average Rating</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600" data-testid="stat-high-rated">
                  {locations.filter(loc => parseFloat(loc.rating || "4.5") >= 4.5).length}
                </div>
                <div className="text-sm text-muted-foreground">Highly Rated (4.5+)</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
