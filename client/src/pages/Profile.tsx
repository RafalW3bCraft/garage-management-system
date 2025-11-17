import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { updateProfileSchema, type Car as CarType } from "@shared/schema";
import { User, Settings, Phone, Mail, MapPin, Calendar, Car, Camera, Save, Edit3, Plus, Eye, Trash2, Wrench } from "lucide-react";
import { ImageUpload } from "@/components/ImageUpload";

const profileSchema = updateProfileSchema.extend({
  dateOfBirth: z.string().optional(),
  registrationNumbers: z.string().optional().refine((regNumbers) => {
    if (!regNumbers) return true;
    const numbers = regNumbers.split(',').map(n => n.trim()).filter(n => n.length > 0);
    return numbers.every(n => /^[A-Z0-9\-\s]{6,20}$/i.test(n));
  }, { message: "Enter valid vehicle registration numbers (e.g., MH12AB1234)" }),
  profileImage: z.string().url().optional().or(z.literal("")),
});

type ProfileFormData = z.infer<typeof profileSchema>;

/**
 * Car form schema for user's personal vehicles (simplified version without auction features)
 */
const userCarFormSchema = z.object({
  make: z.string().min(1, "Make is required").min(2, "Make must be at least 2 characters"),
  model: z.string().min(1, "Model is required"),
  year: z.coerce.number().min(1900, "Year must be 1900 or later").max(new Date().getFullYear() + 1),
  price: z.coerce.number().min(0, "Price must be positive"),
  mileage: z.coerce.number().min(0, "Mileage must be positive"),
  fuelType: z.string().min(1, "Fuel type is required"),
  transmission: z.string().min(1, "Transmission is required"),
  location: z.string().min(1, "Location is required"),
  condition: z.string().min(1, "Condition is required"),
  registrationNumber: z.string()
    .min(1, "Registration number is required")
    .transform(val => val.trim().toUpperCase())
    .pipe(z.string().min(6, "Registration number must be at least 6 characters").regex(/^[A-Z0-9\-]+$/, "Registration number can only contain letters, numbers, and hyphens")),
  numOwners: z.coerce.number().min(1).max(10),
  bodyType: z.string().min(1, "Body type is required"),
  color: z.string().min(1, "Color is required"),
  engineSize: z.string().min(1, "Engine size is required").regex(/^\d+(\.\d+)?$/, "Engine size must be a number"),
  features: z.string().optional(),
  serviceHistory: z.string().optional(),
  image: z.string().optional().or(z.literal('')).refine((val) => !val || val.match(/^https?:\/\/.+/), {
    message: "If provided, must be a valid URL"
  }),
  description: z.string().max(1000).optional(),
});

type UserCarFormData = z.infer<typeof userCarFormSchema>;

type UserCarPayload = Omit<UserCarFormData, 'features'> & {
  features: string[];
};

export default function Profile() {
  const { user, isLoading } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);

  const form = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: user?.name || "",
      email: user?.email || "",
      phone: user?.phone || "",
      countryCode: (user?.countryCode === "Universal" ? "Universal" : "+91") as "+91" | "Universal",
      address: user?.address || "",
      city: user?.city || "",
      state: user?.state || "",
      zipCode: user?.zipCode || "",
      dateOfBirth: user?.dateOfBirth ? new Date(user.dateOfBirth).toISOString().split('T')[0] : "",
      registrationNumbers: user?.registrationNumbers?.join(', ') || "",
      profileImage: user?.profileImage || "",
    },
  });

  useEffect(() => {
    if (user && isEditing) {
      form.reset({
        name: user.name || "",
        email: user.email || "",
        phone: user.phone || "",
        countryCode: (user.countryCode === "Universal" ? "Universal" : "+91") as "+91" | "Universal",
        address: user.address || "",
        city: user.city || "",
        state: user.state || "",
        zipCode: user.zipCode || "",
        dateOfBirth: user.dateOfBirth ? new Date(user.dateOfBirth).toISOString().split('T')[0] : "",
        registrationNumbers: user.registrationNumbers?.join(', ') || "",
        profileImage: user.profileImage || "",
      });
    }
  }, [user, isEditing, form]);

  const updateProfileMutation = useMutation({
    mutationFn: async (data: ProfileFormData) => {

      const registrationNumbers = data.registrationNumbers 
        ? data.registrationNumbers.split(',').map(n => n.trim()).filter(n => n.length > 0)
        : [];

      let formattedDateOfBirth: string | undefined = undefined;
      if (data.dateOfBirth) {
        formattedDateOfBirth = `${data.dateOfBirth}T00:00:00.000Z`;
      }

      const updateData = {
        ...data,
        registrationNumbers: registrationNumbers.length > 0 ? registrationNumbers : undefined,
        dateOfBirth: formattedDateOfBirth,
        profileImage: data.profileImage || undefined,
      };

      const response = await apiRequest("PATCH", "/api/profile", updateData);
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["/api/auth/me"], data.user);
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      setIsEditing(false);
      toast({
        title: "Profile Updated",
        description: "Your profile has been updated successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Update Failed",
        description: error.message || "Failed to update profile. Please try again.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: ProfileFormData) => {
    updateProfileMutation.mutate(data);
  };

  

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  /**
   * Helper to parse and generate profile image URLs in multiple formats
   * 
   * @param {string | null | undefined} profileImage - Profile image URL or object
   * @returns {{webp: string | null, jpeg: string | null} | null} Image URLs in different formats or null
   */
  const getImageUrls = (profileImage: string | null | undefined) => {
    if (!profileImage) return null;

    if (typeof profileImage === 'object' && profileImage !== null) {
      const imgUrls = profileImage as { webp?: string; jpeg?: string; jpg?: string };
      return {
        webp: imgUrls.webp || null,
        jpeg: imgUrls.jpeg || imgUrls.jpg || null
      };
    }

    const baseUrl = profileImage.replace(/\.(jpg|jpeg|png|webp)$/i, '');
    return {
      webp: `${baseUrl}.webp`,
      jpeg: `${baseUrl}.jpg`
    };
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6 max-w-4xl">
        <div className="space-y-6">
          <Card>
            <CardContent className="p-6">
              <div className="animate-pulse space-y-4">
                <div className="h-24 w-24 bg-muted rounded-full"></div>
                <div className="h-4 bg-muted rounded w-1/4"></div>
                <div className="h-4 bg-muted rounded w-1/2"></div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="container mx-auto p-6 max-w-4xl">
        <Card>
          <CardContent className="p-6 text-center">
            <User className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
            <p className="text-muted-foreground">Please log in to view your profile.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Profile</h1>
            <p className="text-muted-foreground">
              Manage your account settings and personal information
            </p>
          </div>
          {!isEditing && (
            <Button 
              onClick={() => setIsEditing(true)}
              data-testid="button-edit-profile"
              className="gap-2"
            >
              <Edit3 className="h-4 w-4" />
              Edit Profile
            </Button>
          )}
        </div>

        {/* Profile Overview Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center space-x-4">
              <Avatar className="h-20 w-20">
                <AvatarImage
                  srcSet={getImageUrls(user.profileImage)?.webp || undefined}
                  src={getImageUrls(user.profileImage)?.jpeg || user.profileImage || undefined}
                  alt={user.name}
                />
                <AvatarFallback className="text-lg">
                  {getInitials(user.name)}
                </AvatarFallback>
              </Avatar>
              <div className="space-y-1">
                <h2 className="text-2xl font-semibold" data-testid="text-user-name">
                  {user.name}
                </h2>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  {user.email && (
                    <div className="flex items-center gap-1">
                      <Mail className="h-4 w-4" />
                      <span data-testid="text-user-email">{user.email}</span>
                    </div>
                  )}
                  {user.phone && (
                    <div className="flex items-center gap-1">
                      <Phone className="h-4 w-4" />
                      <span data-testid="text-user-phone">
                        {user.countryCode === "Universal" ? user.phone : `${user.countryCode}${user.phone}`}
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {'phoneVerified' in user && (
                    <Badge variant={user.phoneVerified ? "default" : "secondary"}>
                      {user.phoneVerified ? "Phone Verified" : "Phone Unverified"}
                    </Badge>
                  )}
                  <Badge variant={user.emailVerified ? "default" : "secondary"}>
                    {user.emailVerified ? "Email Verified" : "Email Unverified"}
                  </Badge>
                  <Badge variant="outline" className="capitalize">
                    {user.provider} Account
                  </Badge>
                </div>
              </div>
            </div>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Profile Information
            </CardTitle>
            <CardDescription>
              {isEditing ? "Update your personal information" : "Your current profile details"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isEditing ? (
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <div className="space-y-4">
                    <div>
                      <Label className="text-base font-semibold flex items-center gap-2">
                        <Camera className="h-5 w-5" />
                        Profile Picture
                      </Label>
                      <p className="text-sm text-muted-foreground mt-1">
                        Upload a profile picture to personalize your account
                      </p>
                    </div>
                    
                    <ImageUpload
                      uploadUrl="/api/upload/profile"
                      fieldName="profileImage"
                      currentImages={user?.profileImage ? [user.profileImage] : []}
                      multiple={false}
                      maxFiles={1}
                      accept="image/jpeg,image/jpg,image/png,image/webp"
                      onUploadComplete={(urls) => {
                        if (urls[0]) {
                          form.setValue('profileImage', urls[0]);
                          toast({
                            title: "Profile picture updated",
                            description: "Don't forget to save your changes",
                          });
                        }
                      }}
                      onRemove={() => {
                        form.setValue('profileImage', '');
                      }}
                    />
                  </div>

                  <Separator />

                  {/* Basic Information */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Full Name</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Enter your full name"
                              data-testid="input-name"
                              {...field}
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
                          <FormLabel>Email Address</FormLabel>
                          <FormControl>
                            <Input
                              type="email"
                              placeholder="Enter your email"
                              data-testid="input-email"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  {/* Contact Information */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <FormField
                      control={form.control}
                      name="countryCode"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Country Code</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-country-code">
                                <SelectValue placeholder="Select country code" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="+91">+91 (India)</SelectItem>
                              <SelectItem value="Universal">Universal</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="phone"
                      render={({ field }) => (
                        <FormItem className="md:col-span-2">
                          <FormLabel>Phone Number</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Enter your phone number"
                              data-testid="input-phone"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  {/* Address Information */}
                  <Separator />
                  <div className="space-y-4">
                    <h3 className="text-lg font-medium flex items-center gap-2">
                      <MapPin className="h-5 w-5" />
                      Address Information
                    </h3>
                    
                    <FormField
                      control={form.control}
                      name="address"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Street Address</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="Enter your street address"
                              data-testid="input-address"
                              rows={2}
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <FormField
                        control={form.control}
                        name="city"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>City</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="City"
                                data-testid="input-city"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="state"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>State</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="State"
                                data-testid="input-state"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="zipCode"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>ZIP Code</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="ZIP Code"
                                data-testid="input-zip-code"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>

                  {/* Additional Information */}
                  <Separator />
                  <div className="space-y-4">
                    <h3 className="text-lg font-medium flex items-center gap-2">
                      <User className="h-5 w-5" />
                      Additional Information
                    </h3>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="dateOfBirth"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Date of Birth</FormLabel>
                            <FormControl>
                              <Input
                                type="date"
                                data-testid="input-date-of-birth"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="profileImage"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Profile Image URL (Optional)</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="https://example.com/image.jpg"
                                data-testid="input-profile-image"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={form.control}
                      name="registrationNumbers"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex items-center gap-2">
                            <Car className="h-4 w-4" />
                            Vehicle Registration Numbers
                          </FormLabel>
                          <FormControl>
                            <Input
                              placeholder="MH12AB1234, KA05CD5678 (comma-separated)"
                              data-testid="input-registration-numbers"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center gap-3">
                    <Button
                      type="submit"
                      disabled={updateProfileMutation.isPending}
                      data-testid="button-save-profile"
                      className="gap-2"
                    >
                      <Save className="h-4 w-4" />
                      {updateProfileMutation.isPending ? "Saving..." : "Save Changes"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setIsEditing(false);
                        form.reset();
                      }}
                      data-testid="button-cancel-edit"
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              </Form>
            ) : (

              <div className="space-y-6">
                {/* Contact Details */}
                <div className="space-y-4">
                  <h3 className="text-lg font-medium flex items-center gap-2">
                    <Phone className="h-5 w-5" />
                    Contact Information
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div>
                      <Label className="text-muted-foreground">Email</Label>
                      <p className="font-medium" data-testid="text-profile-email">
                        {user.email || "Not provided"}
                      </p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Phone</Label>
                      <p className="font-medium" data-testid="text-profile-phone">
                        {user.phone ? (user.countryCode === "Universal" ? user.phone : `${user.countryCode}${user.phone}`) : "Not provided"}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Address */}
                {(user.address || user.city || user.state || user.zipCode) && (
                  <div className="space-y-4">
                    <h3 className="text-lg font-medium flex items-center gap-2">
                      <MapPin className="h-5 w-5" />
                      Address
                    </h3>
                    <div className="text-sm space-y-1">
                      {user.address && (
                        <p data-testid="text-profile-address">{user.address}</p>
                      )}
                      <p data-testid="text-profile-location">
                        {[user.city, user.state, user.zipCode].filter(Boolean).join(', ')}
                      </p>
                    </div>
                  </div>
                )}

                {/* Additional Info */}
                <div className="space-y-4">
                  <h3 className="text-lg font-medium flex items-center gap-2">
                    <Calendar className="h-5 w-5" />
                    Additional Information
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div>
                      <Label className="text-muted-foreground">Date of Birth</Label>
                      <p className="font-medium" data-testid="text-profile-dob">
                        {user.dateOfBirth 
                          ? new Date(user.dateOfBirth).toLocaleDateString('en-IN')
                          : "Not provided"
                        }
                      </p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Member Since</Label>
                      <p className="font-medium" data-testid="text-profile-member-since">
                        {new Date(user.createdAt).toLocaleDateString('en-IN')}
                      </p>
                    </div>
                  </div>
                </div>

                {user.registrationNumbers && user.registrationNumbers.length > 0 && (
                  <div className="space-y-4">
                    <h3 className="text-lg font-medium flex items-center gap-2">
                      <Car className="h-5 w-5" />
                      Vehicle Registrations
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {user.registrationNumbers.map((regNum, index) => (
                        <Badge 
                          key={index} 
                          variant="outline"
                          data-testid={`badge-vehicle-${index}`}
                        >
                          {regNum}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <MyCarsSection />
      </div>
    </div>
  );
}

function MyCarsSection() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [deleteCarId, setDeleteCarId] = useState<string | null>(null);
  const [isCarDialogOpen, setIsCarDialogOpen] = useState(false);
  const [editingCar, setEditingCar] = useState<CarType | null>(null);

  const carForm = useForm<UserCarFormData>({
    resolver: zodResolver(userCarFormSchema),
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
      features: "",
      serviceHistory: "",
      image: "",
      description: "",
    },
  });

  const { data: myCarsData, isLoading: carsLoading } = useQuery({
    queryKey: ["/api/my-cars"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/my-cars");
      return response.json();
    },
  });

  const createCarMutation = useMutation({
    mutationFn: async (data: UserCarPayload) => {
      const response = await apiRequest("POST", "/api/my-cars", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/my-cars"] });
      toast({
        title: "Car added",
        description: "Your car has been added successfully.",
      });
      setIsCarDialogOpen(false);
      carForm.reset();
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to add car",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const updateCarMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<UserCarPayload> }) => {
      const response = await apiRequest("PATCH", `/api/my-cars/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/my-cars"] });
      toast({
        title: "Car updated",
        description: "Your car has been updated successfully.",
      });
      setIsCarDialogOpen(false);
      setEditingCar(null);
      carForm.reset();
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update car",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const deleteCarMutation = useMutation({
    mutationFn: async (carId: string) => {
      await apiRequest("DELETE", `/api/my-cars/${carId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/my-cars"] });
      toast({
        title: "Car deleted",
        description: "Your car has been deleted successfully.",
      });
      setDeleteCarId(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Delete failed",
        description: error.message || "Failed to delete car. Please try again.",
        variant: "destructive",
      });
    },
  });

  const openAddDialog = () => {
    setEditingCar(null);
    carForm.reset({
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
      features: "",
      serviceHistory: "",
      image: "",
      description: "",
    });
    setIsCarDialogOpen(true);
  };

  const openEditDialog = (car: CarType) => {
    setEditingCar(car);
    carForm.reset({
      make: car.make,
      model: car.model,
      year: car.year,
      price: car.price,
      mileage: car.mileage,
      fuelType: car.fuelType,
      transmission: car.transmission || "",
      location: car.location,
      condition: car.condition,
      registrationNumber: car.registrationNumber,
      numOwners: car.numOwners || 1,
      bodyType: car.bodyType || "",
      color: car.color || "",
      engineSize: car.engineSize || "",
      features: car.features?.join(", ") || "",
      serviceHistory: car.serviceHistory || "",
      image: car.image,
      description: car.description || "",
    });
    setIsCarDialogOpen(true);
  };

  const onSubmitCar = (data: UserCarFormData) => {
    const payload = {
      ...data,
      features: data.features ? data.features.split(',').map(f => f.trim()).filter(f => f.length > 0) : [],
    };
    
    if (editingCar) {
      updateCarMutation.mutate({ id: editingCar.id, data: payload });
    } else {
      createCarMutation.mutate(payload);
    }
  };

  const cars = myCarsData?.cars || [];

  if (carsLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Car className="h-5 w-5" />
            My Cars
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            <div className="h-32 bg-muted rounded"></div>
            <div className="h-32 bg-muted rounded"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Car className="h-5 w-5" />
                My Cars
              </CardTitle>
              <CardDescription>
                Manage your vehicles and service history
              </CardDescription>
            </div>
            <Button className="gap-2" onClick={openAddDialog}>
              <Plus className="h-4 w-4" />
              Add Car
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {cars.length === 0 ? (
            <div className="text-center py-12">
              <Car className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-semibold mb-2">No cars yet</h3>
              <p className="text-muted-foreground mb-4">
                Add your first vehicle to start tracking services
              </p>
              <Button className="gap-2" onClick={openAddDialog}>
                <Plus className="h-4 w-4" />
                Add Your First Car
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {cars.map((car: CarType) => (
                <Card key={car.id} className="overflow-hidden">
                  <div className="aspect-video relative bg-muted">
                    {car.image ? (
                      <img
                        src={car.image}
                        alt={`${car.make} ${car.model}`}
                        className="object-cover w-full h-full"
                      />
                    ) : (
                      <div className="flex items-center justify-center h-full">
                        <Car className="h-12 w-12 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                  <CardContent className="p-4">
                    <h3 className="font-semibold text-lg mb-1">
                      {car.make} {car.model}
                    </h3>
                    <p className="text-sm text-muted-foreground mb-3">
                      {car.year} • {car.fuelType}
                    </p>
                    <div className="flex gap-2">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="flex-1 gap-1"
                        onClick={() => openEditDialog(car)}
                      >
                        <Edit3 className="h-3 w-3" />
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1"
                        onClick={() => setDeleteCarId(car.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isCarDialogOpen} onOpenChange={setIsCarDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingCar ? "Edit Car" : "Add New Car"}</DialogTitle>
            <DialogDescription>
              {editingCar ? "Update your vehicle information" : "Add a new vehicle to your garage"}
            </DialogDescription>
          </DialogHeader>
          <Form {...carForm}>
            <form onSubmit={carForm.handleSubmit(onSubmitCar)} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={carForm.control}
                  name="make"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Make</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., Honda, Toyota" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={carForm.control}
                  name="model"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Model</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., City, Innova" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <FormField
                  control={carForm.control}
                  name="year"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Year</FormLabel>
                      <FormControl>
                        <Input type="number" {...field} onChange={e => field.onChange(e.target.value)} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={carForm.control}
                  name="price"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Price (₹)</FormLabel>
                      <FormControl>
                        <Input type="number" {...field} onChange={e => field.onChange(e.target.value)} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={carForm.control}
                  name="mileage"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Mileage (km)</FormLabel>
                      <FormControl>
                        <Input type="number" {...field} onChange={e => field.onChange(e.target.value)} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={carForm.control}
                  name="numOwners"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Owners</FormLabel>
                      <Select onValueChange={value => field.onChange(parseInt(value))} value={field.value?.toString()}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="1">1st Owner</SelectItem>
                          <SelectItem value="2">2nd Owner</SelectItem>
                          <SelectItem value="3">3rd Owner</SelectItem>
                          <SelectItem value="4">4+ Owners</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <FormField
                  control={carForm.control}
                  name="fuelType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Fuel Type</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select" />
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
                  control={carForm.control}
                  name="transmission"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Transmission</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Manual">Manual</SelectItem>
                          <SelectItem value="Automatic">Automatic</SelectItem>
                          <SelectItem value="CVT">CVT</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={carForm.control}
                  name="condition"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Condition</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select" />
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

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <FormField
                  control={carForm.control}
                  name="bodyType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Body Type</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Sedan">Sedan</SelectItem>
                          <SelectItem value="SUV">SUV</SelectItem>
                          <SelectItem value="Hatchback">Hatchback</SelectItem>
                          <SelectItem value="Coupe">Coupe</SelectItem>
                          <SelectItem value="Convertible">Convertible</SelectItem>
                          <SelectItem value="Wagon">Wagon</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={carForm.control}
                  name="color"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Color</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., White, Black" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={carForm.control}
                  name="engineSize"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Engine Size (cc)</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., 1498" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={carForm.control}
                  name="registrationNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Registration Number</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., MH12AB1234" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={carForm.control}
                  name="location"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Location</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., Mumbai" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={carForm.control}
                name="features"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Features (comma-separated)</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Sunroof, Leather Seats, ABS" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="space-y-2">
                <Label>Car Image</Label>
                <p className="text-sm text-muted-foreground">
                  Upload a clear photo of the vehicle
                </p>
                <ImageUpload
                  uploadUrl="/api/upload/car"
                  fieldName="carImage"
                  currentImages={carForm.watch('image') ? [carForm.watch('image')!].filter((img): img is string => !!img) : []}
                  multiple={false}
                  maxFiles={1}
                  accept="image/jpeg,image/jpg,image/png,image/webp"
                  onUploadComplete={(urls) => {
                    if (urls[0]) {
                      carForm.setValue('image', urls[0]);
                    }
                  }}
                  onRemove={() => {
                    carForm.setValue('image', '');
                  }}
                />
                {carForm.formState.errors.image && (
                  <p className="text-sm font-medium text-destructive">
                    {carForm.formState.errors.image.message}
                  </p>
                )}
              </div>

              <FormField
                control={carForm.control}
                name="serviceHistory"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Service History (Optional)</FormLabel>
                    <FormControl>
                      <Textarea rows={2} placeholder="Enter service history details..." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={carForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description (Optional)</FormLabel>
                    <FormControl>
                      <Textarea rows={2} placeholder="Additional details about the car..." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end gap-2 pt-4">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setIsCarDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  disabled={createCarMutation.isPending || updateCarMutation.isPending}
                >
                  {createCarMutation.isPending || updateCarMutation.isPending
                    ? "Saving..."
                    : editingCar
                    ? "Update Car"
                    : "Add Car"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteCarId} onOpenChange={(open) => !open && setDeleteCarId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Car?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete your car record.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteCarId && deleteCarMutation.mutate(deleteCarId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
