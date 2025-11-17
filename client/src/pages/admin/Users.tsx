import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Users, Search, Eye, Mail, Phone, MapPin, Calendar, Shield, User, UserCheck, ChevronLeft, ChevronRight, UserPlus, Edit, Trash2, Key } from "lucide-react";
import { Link } from "wouter";
import type { User as UserType } from "@shared/schema";
import { useState, useMemo } from "react";
import { format } from "date-fns";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const getImageUrls = (imageUrl: string | null | undefined) => {
  if (!imageUrl) return null;

  if (typeof imageUrl === 'object' && imageUrl !== null) {
    const imgUrls = imageUrl as any;
    return {
      webp: imgUrls.webp || null,
      jpeg: imgUrls.jpeg || imgUrls.jpg || null
    };
  }

  const baseUrl = imageUrl.replace(/\.(jpg|jpeg|png|webp)$/i, '');
  return {
    webp: `${baseUrl}.webp`,
    jpeg: `${baseUrl}.jpg`
  };
};

/**
 * Admin users management component for viewing and managing user accounts.
 * Features comprehensive user search and filtering by role/provider, user details viewing,
 * and role management with protection against self-demotion.
 * 
 * @returns {JSX.Element} The rendered admin users management page
 * 
 * @example
 * ```tsx
 * <Route path="/admin/users" component={AdminUsers} />
 * ```
 */
export default function AdminUsers() {
  const { user, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [providerFilter, setProviderFilter] = useState<string>("all");
  const [viewingUser, setViewingUser] = useState<UserType | null>(null);
  const [changingRoleUser, setChangingRoleUser] = useState<UserType | null>(null);
  const [creatingUser, setCreatingUser] = useState(false);
  const [editingUser, setEditingUser] = useState<UserType | null>(null);
  const [deletingUser, setDeletingUser] = useState<UserType | null>(null);
  const [resettingPasswordUser, setResettingPasswordUser] = useState<UserType | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 50;
  
  const [createFormErrors, setCreateFormErrors] = useState<Record<string, string>>({});
  const [editFormErrors, setEditFormErrors] = useState<Record<string, string>>({});
  const [resetPasswordErrors, setResetPasswordErrors] = useState<Record<string, string>>({});

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

  const { data, isLoading, isError } = useQuery({
    queryKey: ["/api/admin/users", currentPage, pageSize],
    queryFn: async () => {
      const offset = (currentPage - 1) * pageSize;
      const response = await apiRequest("GET", `/api/admin/users?offset=${offset}&limit=${pageSize}`);
      return response.json();
    },
  });

  const users = data?.users || [];
  const totalCount = data?.total || 0;
  const totalPages = Math.ceil(totalCount / pageSize);
  const startIndex = (currentPage - 1) * pageSize + 1;
  const endIndex = Math.min(currentPage * pageSize, totalCount);

  const updateUserRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: "customer" | "admin" }) => {
      const response = await apiRequest("PATCH", `/api/admin/users/${userId}`, { role });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setChangingRoleUser(null);
      toast({
        title: "Success",
        description: "User role updated successfully!",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update user role",
        variant: "destructive",
      });
    },
  });

  const toggleStatusMutation = useMutation({
    mutationFn: async ({ userId, isActive }: { userId: string; isActive: boolean }) => {
      const response = await apiRequest("PATCH", `/api/admin/users/${userId}/status`, { isActive });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "Success", description: "User account status updated!" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const createUserMutation = useMutation({
    mutationFn: async (data: { email: string; name: string; password: string; role: string; phone?: string; countryCode?: string }) => {
      const response = await apiRequest("POST", "/api/admin/users", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setCreatingUser(false);
      toast({
        title: "Success",
        description: "User created successfully!",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create user",
        variant: "destructive",
      });
    },
  });

  const updateUserMutation = useMutation({
    mutationFn: async ({ userId, data }: { userId: string; data: any }) => {
      const response = await apiRequest("PUT", `/api/admin/users/${userId}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setEditingUser(null);
      toast({
        title: "Success",
        description: "User updated successfully!",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update user",
        variant: "destructive",
      });
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const response = await apiRequest("DELETE", `/api/admin/users/${userId}`, {});
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setDeletingUser(null);
      toast({
        title: "Success",
        description: "User deleted successfully!",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete user",
        variant: "destructive",
      });
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async ({ userId, newPassword }: { userId: string; newPassword: string }) => {
      const response = await apiRequest("POST", `/api/admin/users/${userId}/reset-password`, { newPassword });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setResettingPasswordUser(null);
      toast({
        title: "Success",
        description: "Password reset successfully!",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to reset password",
        variant: "destructive",
      });
    },
  });

  const handleRoleChange = (user: UserType) => {
    setChangingRoleUser(user);
  };

  const confirmRoleChange = (newRole: "customer" | "admin") => {
    if (changingRoleUser) {
      updateUserRoleMutation.mutate({
        userId: changingRoleUser.id,
        role: newRole,
      });
    }
  };

  const canChangeRole = (targetUser: UserType) => {
    return user && user.id !== targetUser.id;
  };

  const filteredUsers = useMemo(() => {
    return users.filter((u: UserType) => {
      const matchesSearch = !searchTerm || 
        u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.phone?.includes(searchTerm);
      
      const matchesRole = roleFilter === "all" || u.role === roleFilter;
      const matchesProvider = providerFilter === "all" || u.provider === providerFilter;
      
      return matchesSearch && matchesRole && matchesProvider;
    });
  }, [users, searchTerm, roleFilter, providerFilter]);

  const stats = {
    totalUsers: users.length,
    customers: users.filter((u: UserType) => u.role === "customer").length,
    admins: users.filter((u: UserType) => u.role === "admin").length,
    emailUsers: users.filter((u: UserType) => u.provider === "email").length,
    googleUsers: users.filter((u: UserType) => u.provider === "google").length,
    mobileUsers: users.filter((u: UserType) => u.provider === "mobile").length,
    verifiedEmails: users.filter((u: UserType) => u.emailVerified).length,
    verifiedPhones: users.filter((u: UserType) => u.phoneVerified).length,
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case "admin": return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300";
      case "customer": return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300";
      default: return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300";
    }
  };

  const getProviderColor = (provider: string) => {
    switch (provider) {
      case "email": return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300";
      case "google": return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300";
      case "mobile": return "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300";
      default: return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300";
    }
  };

  const getUserInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const validateEmail = (email: string): string | null => {
    if (!email || email.trim() === '') {
      return 'Email is required';
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return 'Please enter a valid email address';
    }
    return null;
  };

  const validatePassword = (password: string): string | null => {
    if (!password || password.trim() === '') {
      return 'Password is required';
    }
    if (password.length < 8) {
      return 'Password must be at least 8 characters long';
    }
    return null;
  };

  const validateRequiredField = (value: string | null | undefined, fieldName: string): string | null => {
    if (!value || value.trim() === '') {
      return `${fieldName} is required`;
    }
    return null;
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-6">Manage Users</h1>
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
        <h1 className="text-2xl font-bold text-destructive mb-4">Error Loading Users</h1>
        <p className="text-muted-foreground mb-4">Failed to load users. Please try again.</p>
        <Button onClick={() => window.location.reload()}>Retry</Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="heading-admin-users">
            Manage Users
          </h1>
          <p className="text-muted-foreground">
            {totalCount > 0 ? `Showing ${startIndex}-${endIndex} of ${totalCount} users` : 'No users'}
            {filteredUsers.length !== users.length && ` • ${filteredUsers.length} filtered`}
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setCreatingUser(true)} variant="default">
            <UserPlus className="w-4 h-4 mr-2" />
            Create User
          </Button>
          <Link href="/admin">
            <Button variant="outline">Back to Dashboard</Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Users</p>
                <p className="text-2xl font-bold" data-testid="stat-total-users">{stats.totalUsers}</p>
              </div>
              <Users className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Customers</p>
                <p className="text-2xl font-bold" data-testid="stat-customers">{stats.customers}</p>
              </div>
              <User className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Admins</p>
                <p className="text-2xl font-bold" data-testid="stat-admins">{stats.admins}</p>
              </div>
              <Shield className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Verified Users</p>
                <p className="text-2xl font-bold" data-testid="stat-verified">
                  {stats.verifiedEmails + stats.verifiedPhones}
                </p>
              </div>
              <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300">
                Verified
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="md:col-span-2">
              <Label htmlFor="search">Search Users</Label>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="search"
                  placeholder="Search by name, email, or phone..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                  data-testid="input-search-users"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="role-filter">Filter by Role</Label>
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger data-testid="select-role-filter">
                  <SelectValue placeholder="All Roles" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Roles</SelectItem>
                  <SelectItem value="customer">Customers</SelectItem>
                  <SelectItem value="admin">Admins</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="provider-filter">Filter by Provider</Label>
              <Select value={providerFilter} onValueChange={setProviderFilter}>
                <SelectTrigger data-testid="select-provider-filter">
                  <SelectValue placeholder="All Providers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Providers</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="google">Google</SelectItem>
                  <SelectItem value="mobile">Mobile</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-4">
            <Badge variant="secondary" data-testid="badge-filtered-count">
              {filteredUsers.length} users found
            </Badge>
            {(searchTerm || roleFilter !== "all" || providerFilter !== "all") && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearchTerm("");
                  setRoleFilter("all");
                  setProviderFilter("all");
                }}
                data-testid="button-clear-filters"
              >
                Clear Filters
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {filteredUsers.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Users Found</h3>
            <p className="text-muted-foreground">
              {searchTerm || roleFilter !== "all" || providerFilter !== "all"
                ? "No users match your current filters."
                : "No users have been registered yet."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {filteredUsers.map((usr: UserType) => (
            <Card key={usr.id} className="hover-elevate">
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <Avatar className="h-12 w-12">
                      <AvatarImage
                        srcSet={getImageUrls(usr.profileImage)?.webp || undefined}
                        src={getImageUrls(usr.profileImage)?.jpeg || usr.profileImage || undefined}
                        alt={usr.name}
                      />
                      <AvatarFallback>{getUserInitials(usr.name)}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="font-semibold text-lg" data-testid={`user-name-${usr.id}`}>
                          {usr.name}
                        </h3>
                        <Badge className={getRoleColor(usr.role)} data-testid={`role-${usr.id}`}>
                          {usr.role}
                        </Badge>
                        <Badge className={getProviderColor(usr.provider)} data-testid={`provider-${usr.id}`}>
                          {usr.provider}
                        </Badge>
                        <Badge variant={usr.isActive ? "default" : "destructive"} data-testid={`status-${usr.id}`}>
                          {usr.isActive ? "Active" : "Suspended"}
                        </Badge>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-muted-foreground">
                        {usr.email && (
                          <div className="flex items-center gap-2">
                            <Mail className="h-4 w-4" />
                            <span data-testid={`email-${usr.id}`}>{usr.email}</span>
                            {usr.emailVerified && (
                              <Badge variant="outline" className="text-xs px-1 py-0">✓</Badge>
                            )}
                          </div>
                        )}
                        {usr.phone && (
                          <div className="flex items-center gap-2">
                            <Phone className="h-4 w-4" />
                            <span data-testid={`phone-${usr.id}`}>
                              {usr.countryCode}{usr.phone}
                            </span>
                            {usr.phoneVerified && (
                              <Badge variant="outline" className="text-xs px-1 py-0">✓</Badge>
                            )}
                          </div>
                        )}
                        {usr.address && (
                          <div className="flex items-center gap-2">
                            <MapPin className="h-4 w-4" />
                            <span data-testid={`address-${usr.id}`}>
                              {usr.city ? `${usr.city}, ${usr.state}` : usr.address}
                            </span>
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4" />
                          <span data-testid={`created-${usr.id}`}>
                            Joined {format(new Date(usr.createdAt), "MMM dd, yyyy")}
                          </span>
                        </div>
                      </div>

                      {usr.registrationNumbers && usr.registrationNumbers.length > 0 && (
                        <div className="mt-3">
                          <div className="text-xs text-muted-foreground mb-1">Registered Vehicles:</div>
                          <div className="flex flex-wrap gap-1">
                            {usr.registrationNumbers.map((regNum: string, index: number) => (
                              <Badge key={index} variant="outline" className="text-xs">
                                {regNum}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setEditingUser(usr)}
                      data-testid={`button-edit-${usr.id}`}
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setResettingPasswordUser(usr)}
                      data-testid={`button-reset-password-${usr.id}`}
                    >
                      <Key className="w-4 h-4" />
                    </Button>
                    {canChangeRole(usr) && (
                      <Button
                        variant={usr.isActive ? "destructive" : "default"}
                        size="sm"
                        onClick={() => toggleStatusMutation.mutate({ userId: usr.id, isActive: !usr.isActive })}
                        data-testid={`button-toggle-status-${usr.id}`}
                      >
                        {usr.isActive ? "Suspend" : "Activate"}
                      </Button>
                    )}
                    {user?.id !== usr.id && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setDeletingUser(usr)}
                        data-testid={`button-delete-${usr.id}`}
                        className="text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setViewingUser(usr)}
                          data-testid={`button-view-${usr.id}`}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-2xl">
                        <DialogHeader>
                          <DialogTitle>User Details</DialogTitle>
                          <DialogDescription>
                            Complete information for {usr.name}
                          </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-6">
                          <div className="flex items-center gap-4">
                            <Avatar className="h-16 w-16">
                              <AvatarImage
                                srcSet={getImageUrls(usr.profileImage)?.webp || undefined}
                                src={getImageUrls(usr.profileImage)?.jpeg || usr.profileImage || undefined}
                                alt={usr.name}
                              />
                              <AvatarFallback className="text-lg">{getUserInitials(usr.name)}</AvatarFallback>
                            </Avatar>
                            <div>
                              <h3 className="text-xl font-semibold">{usr.name}</h3>
                              <div className="flex gap-2 mt-2">
                                <Badge className={getRoleColor(usr.role)}>{usr.role}</Badge>
                                <Badge className={getProviderColor(usr.provider)}>{usr.provider}</Badge>
                              </div>
                            </div>
                          </div>

                          <Separator />

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                              <h4 className="font-semibold mb-3">Contact Information</h4>
                              <div className="space-y-2">
                                {usr.email && (
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">Email:</span>
                                    <div className="flex items-center gap-2">
                                      <span>{usr.email}</span>
                                      {usr.emailVerified && <Badge variant="outline" className="text-xs">Verified</Badge>}
                                    </div>
                                  </div>
                                )}
                                {usr.phone && (
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">Phone:</span>
                                    <div className="flex items-center gap-2">
                                      <span>{usr.countryCode}{usr.phone}</span>
                                      {usr.phoneVerified && <Badge variant="outline" className="text-xs">Verified</Badge>}
                                    </div>
                                  </div>
                                )}
                                {usr.dateOfBirth && (
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">Date of Birth:</span>
                                    <span>{format(new Date(usr.dateOfBirth), "MMM dd, yyyy")}</span>
                                  </div>
                                )}
                              </div>
                            </div>

                            <div>
                              <h4 className="font-semibold mb-3">Address</h4>
                              <div className="space-y-2">
                                {usr.address && (
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">Street:</span>
                                    <span className="text-right">{usr.address}</span>
                                  </div>
                                )}
                                {usr.city && (
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">City:</span>
                                    <span>{usr.city}</span>
                                  </div>
                                )}
                                {usr.state && (
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">State:</span>
                                    <span>{usr.state}</span>
                                  </div>
                                )}
                                {usr.zipCode && (
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">ZIP:</span>
                                    <span>{usr.zipCode}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>

                          {usr.registrationNumbers && usr.registrationNumbers.length > 0 && (
                            <>
                              <Separator />
                              <div>
                                <h4 className="font-semibold mb-3">Registered Vehicles</h4>
                                <div className="flex flex-wrap gap-2">
                                  {usr.registrationNumbers.map((regNum: string, index: number) => (
                                    <Badge key={index} variant="outline">
                                      {regNum}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            </>
                          )}

                          <Separator />

                          <div>
                            <h4 className="font-semibold mb-3">Account Information</h4>
                            <div className="space-y-2">
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">User ID:</span>
                                <span className="font-mono text-sm">{usr.id}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Created:</span>
                                <span>{format(new Date(usr.createdAt), "PPP 'at' p")}</span>
                              </div>
                            </div>
                          </div>

                          <div className="p-4 bg-muted/30 rounded-md">
                            <h4 className="font-semibold mb-3 flex items-center gap-2">
                              <UserCheck className="w-4 h-4" />
                              Role Management
                            </h4>
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-sm text-muted-foreground mb-1">Current Role:</p>
                                <Badge className={getRoleColor(usr.role)}>{usr.role}</Badge>
                              </div>
                              {canChangeRole(usr) ? (
                                <div className="flex gap-2">
                                  {usr.role === "customer" ? (
                                    <AlertDialog>
                                      <AlertDialogTrigger asChild>
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          onClick={() => handleRoleChange(usr)}
                                          data-testid={`button-promote-${usr.id}`}
                                        >
                                          <Shield className="w-3 h-3 mr-1" />
                                          Promote to Admin
                                        </Button>
                                      </AlertDialogTrigger>
                                      <AlertDialogContent>
                                        <AlertDialogHeader>
                                          <AlertDialogTitle>Promote User to Admin</AlertDialogTitle>
                                          <AlertDialogDescription>
                                            Are you sure you want to promote "{usr.name}" to admin? This will give them full administrative privileges including the ability to manage other users.
                                          </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                                          <AlertDialogAction
                                            onClick={() => confirmRoleChange("admin")}
                                            disabled={updateUserRoleMutation.isPending}
                                            className="bg-orange-600 text-white hover:bg-orange-700"
                                          >
                                            {updateUserRoleMutation.isPending ? "Promoting..." : "Promote to Admin"}
                                          </AlertDialogAction>
                                        </AlertDialogFooter>
                                      </AlertDialogContent>
                                    </AlertDialog>
                                  ) : (
                                    <AlertDialog>
                                      <AlertDialogTrigger asChild>
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          onClick={() => handleRoleChange(usr)}
                                          data-testid={`button-demote-${usr.id}`}
                                        >
                                          <User className="w-3 h-3 mr-1" />
                                          Demote to Customer
                                        </Button>
                                      </AlertDialogTrigger>
                                      <AlertDialogContent>
                                        <AlertDialogHeader>
                                          <AlertDialogTitle>Demote Admin to Customer</AlertDialogTitle>
                                          <AlertDialogDescription>
                                            Are you sure you want to demote "{usr.name}" to customer? This will remove their administrative privileges and they will only have customer access.
                                          </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                                          <AlertDialogAction
                                            onClick={() => confirmRoleChange("customer")}
                                            disabled={updateUserRoleMutation.isPending}
                                            className="bg-blue-600 text-white hover:bg-blue-700"
                                          >
                                            {updateUserRoleMutation.isPending ? "Demoting..." : "Demote to Customer"}
                                          </AlertDialogAction>
                                        </AlertDialogFooter>
                                      </AlertDialogContent>
                                    </AlertDialog>
                                  )}
                                </div>
                              ) : (
                                <Badge variant="outline" className="text-xs">
                                  Cannot modify own role
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {users.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-lg">User Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <h4 className="font-semibold mb-3">By Authentication Method</h4>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Email:</span>
                    <span data-testid="stat-email-users">{stats.emailUsers}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Google OAuth:</span>
                    <span data-testid="stat-google-users">{stats.googleUsers}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Mobile:</span>
                    <span data-testid="stat-mobile-users">{stats.mobileUsers}</span>
                  </div>
                </div>
              </div>
              
              <div>
                <h4 className="font-semibold mb-3">Verification Status</h4>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Email Verified:</span>
                    <span data-testid="stat-verified-emails">{stats.verifiedEmails}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Phone Verified:</span>
                    <span data-testid="stat-verified-phones">{stats.verifiedPhones}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Unverified:</span>
                    <span>{stats.totalUsers - stats.verifiedEmails - stats.verifiedPhones}</span>
                  </div>
                </div>
              </div>
              
              <div>
                <h4 className="font-semibold mb-3">User Roles</h4>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Customers:</span>
                    <span data-testid="stat-role-customers">{stats.customers}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Administrators:</span>
                    <span data-testid="stat-role-admins">{stats.admins}</span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

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

      <Dialog open={creatingUser} onOpenChange={(open) => {
        setCreatingUser(open);
        if (!open) setCreateFormErrors({});
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create New User</DialogTitle>
            <DialogDescription>
              Add a new user to the system with email and password authentication.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => {
            e.preventDefault();
            const formData = new FormData(e.currentTarget);
            const email = formData.get('email') as string;
            const name = formData.get('name') as string;
            const password = formData.get('password') as string;
            const role = formData.get('role') as string;
            
            const errors: Record<string, string> = {};
            
            const nameError = validateRequiredField(name, 'Name');
            if (nameError) errors.name = nameError;
            
            const emailError = validateEmail(email);
            if (emailError) errors.email = emailError;
            
            const passwordError = validatePassword(password);
            if (passwordError) errors.password = passwordError;
            
            if (Object.keys(errors).length > 0) {
              setCreateFormErrors(errors);
              return;
            }
            
            setCreateFormErrors({});
            createUserMutation.mutate({
              email,
              name,
              password,
              role,
              phone: formData.get('phone') as string || undefined,
              countryCode: formData.get('countryCode') as string || undefined,
            });
          }}>
            <div className="space-y-4">
              <div>
                <Label htmlFor="create-name">Full Name *</Label>
                <Input
                  id="create-name"
                  name="name"
                  placeholder="John Doe"
                  className={createFormErrors.name ? "border-destructive" : ""}
                />
                {createFormErrors.name && (
                  <p className="text-sm text-destructive mt-1">{createFormErrors.name}</p>
                )}
              </div>
              <div>
                <Label htmlFor="create-email">Email *</Label>
                <Input
                  id="create-email"
                  name="email"
                  type="email"
                  placeholder="john@example.com"
                  className={createFormErrors.email ? "border-destructive" : ""}
                />
                {createFormErrors.email && (
                  <p className="text-sm text-destructive mt-1">{createFormErrors.email}</p>
                )}
              </div>
              <div>
                <Label htmlFor="create-password">Password *</Label>
                <Input
                  id="create-password"
                  name="password"
                  type="password"
                  placeholder="Minimum 8 characters"
                  className={createFormErrors.password ? "border-destructive" : ""}
                />
                {createFormErrors.password ? (
                  <p className="text-sm text-destructive mt-1">{createFormErrors.password}</p>
                ) : (
                  <p className="text-xs text-muted-foreground mt-1">
                    Must be at least 8 characters long
                  </p>
                )}
              </div>
              <div>
                <Label htmlFor="create-role">Role *</Label>
                <Select name="role" defaultValue="customer" required>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="customer">Customer</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label htmlFor="create-countryCode">Code</Label>
                  <Input
                    id="create-countryCode"
                    name="countryCode"
                    placeholder="+91"
                    defaultValue="+91"
                  />
                </div>
                <div className="col-span-2">
                  <Label htmlFor="create-phone">Phone (Optional)</Label>
                  <Input
                    id="create-phone"
                    name="phone"
                    placeholder="9876543210"
                  />
                </div>
              </div>
            </div>
            <DialogFooter className="mt-6">
              <Button type="button" variant="outline" onClick={() => {
                setCreatingUser(false);
                setCreateFormErrors({});
              }}>
                Cancel
              </Button>
              <Button type="submit" disabled={createUserMutation.isPending}>
                {createUserMutation.isPending ? "Creating..." : "Create User"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingUser} onOpenChange={(open) => {
        if (!open) {
          setEditingUser(null);
          setEditFormErrors({});
        }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>
              Update user profile information.
            </DialogDescription>
          </DialogHeader>
          {editingUser && (
            <form onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              const email = formData.get('email') as string;
              const name = formData.get('name') as string;
              
              const errors: Record<string, string> = {};
              
              if (email) {
                const emailError = validateEmail(email);
                if (emailError) errors.email = emailError;
              }
              
              if (Object.keys(errors).length > 0) {
                setEditFormErrors(errors);
                return;
              }
              
              setEditFormErrors({});
              const data: any = {};
              if (name) data.name = name;
              if (email) data.email = email;
              if (formData.get('phone')) data.phone = formData.get('phone');
              if (formData.get('countryCode')) data.countryCode = formData.get('countryCode');
              if (formData.get('address')) data.address = formData.get('address');
              if (formData.get('city')) data.city = formData.get('city');
              if (formData.get('state')) data.state = formData.get('state');
              if (formData.get('zipCode')) data.zipCode = formData.get('zipCode');
              updateUserMutation.mutate({ userId: editingUser.id, data });
            }}>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="edit-name">Full Name</Label>
                  <Input
                    id="edit-name"
                    name="name"
                    defaultValue={editingUser.name}
                    placeholder="John Doe"
                  />
                </div>
                <div>
                  <Label htmlFor="edit-email">Email</Label>
                  <Input
                    id="edit-email"
                    name="email"
                    type="email"
                    defaultValue={editingUser.email || ''}
                    placeholder="john@example.com"
                    className={editFormErrors.email ? "border-destructive" : ""}
                  />
                  {editFormErrors.email && (
                    <p className="text-sm text-destructive mt-1">{editFormErrors.email}</p>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label htmlFor="edit-countryCode">Code</Label>
                    <Input
                      id="edit-countryCode"
                      name="countryCode"
                      defaultValue={editingUser.countryCode || '+91'}
                    />
                  </div>
                  <div className="col-span-2">
                    <Label htmlFor="edit-phone">Phone</Label>
                    <Input
                      id="edit-phone"
                      name="phone"
                      defaultValue={editingUser.phone || ''}
                      placeholder="9876543210"
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="edit-address">Address</Label>
                  <Input
                    id="edit-address"
                    name="address"
                    defaultValue={editingUser.address || ''}
                    placeholder="Street address"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label htmlFor="edit-city">City</Label>
                    <Input
                      id="edit-city"
                      name="city"
                      defaultValue={editingUser.city || ''}
                      placeholder="City"
                    />
                  </div>
                  <div>
                    <Label htmlFor="edit-state">State</Label>
                    <Input
                      id="edit-state"
                      name="state"
                      defaultValue={editingUser.state || ''}
                      placeholder="State"
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="edit-zipCode">ZIP Code</Label>
                  <Input
                    id="edit-zipCode"
                    name="zipCode"
                    defaultValue={editingUser.zipCode || ''}
                    placeholder="12345"
                  />
                </div>
              </div>
              <DialogFooter className="mt-6">
                <Button type="button" variant="outline" onClick={() => {
                  setEditingUser(null);
                  setEditFormErrors({});
                }}>
                  Cancel
                </Button>
                <Button type="submit" disabled={updateUserMutation.isPending}>
                  {updateUserMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete User Dialog */}
      <AlertDialog open={!!deletingUser} onOpenChange={(open) => !open && setDeletingUser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete User</AlertDialogTitle>
            <AlertDialogDescription>
              {deletingUser && (
                <>
                  Are you sure you want to delete <strong>{deletingUser.name}</strong> ({deletingUser.email || deletingUser.phone})?
                  <br /><br />
                  <span className="text-destructive font-medium">
                    This action cannot be undone. All user data will be permanently deleted.
                  </span>
                  {deletingUser.role === 'admin' && (
                    <>
                      <br /><br />
                      <span className="text-orange-600 font-medium">
                        ⚠️ Warning: This user is an administrator. Deleting them will remove their admin access.
                      </span>
                    </>
                  )}
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingUser && deleteUserMutation.mutate(deletingUser.id)}
              disabled={deleteUserMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteUserMutation.isPending ? "Deleting..." : "Delete User"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!resettingPasswordUser} onOpenChange={(open) => {
        if (!open) {
          setResettingPasswordUser(null);
          setResetPasswordErrors({});
        }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reset User Password</DialogTitle>
            <DialogDescription>
              {resettingPasswordUser && `Set a new password for ${resettingPasswordUser.name}`}
            </DialogDescription>
          </DialogHeader>
          {resettingPasswordUser && (
            <form onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              const newPassword = formData.get('newPassword') as string;
              
              const errors: Record<string, string> = {};
              
              const passwordError = validatePassword(newPassword);
              if (passwordError) errors.password = passwordError;
              
              if (Object.keys(errors).length > 0) {
                setResetPasswordErrors(errors);
                return;
              }
              
              setResetPasswordErrors({});
              resetPasswordMutation.mutate({ userId: resettingPasswordUser.id, newPassword });
            }}>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="reset-password">New Password *</Label>
                  <Input
                    id="reset-password"
                    name="newPassword"
                    type="password"
                    placeholder="Enter new password"
                    className={resetPasswordErrors.password ? "border-destructive" : ""}
                  />
                  {resetPasswordErrors.password ? (
                    <p className="text-sm text-destructive mt-1">{resetPasswordErrors.password}</p>
                  ) : (
                    <p className="text-xs text-muted-foreground mt-1">
                      Must be at least 8 characters long
                    </p>
                  )}
                </div>
                <div className="p-3 bg-muted rounded-md">
                  <p className="text-sm">
                    <strong>User:</strong> {resettingPasswordUser.name}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {resettingPasswordUser.email || resettingPasswordUser.phone}
                  </p>
                </div>
              </div>
              <DialogFooter className="mt-6">
                <Button type="button" variant="outline" onClick={() => {
                  setResettingPasswordUser(null);
                  setResetPasswordErrors({});
                }}>
                  Cancel
                </Button>
                <Button type="submit" disabled={resetPasswordMutation.isPending}>
                  {resetPasswordMutation.isPending ? "Resetting..." : "Reset Password"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
