import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequestJson } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Mail, MessageSquare, ArrowLeft, Send, Users } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface User {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  countryCode?: string;
}

export default function AdminPromotions() {
  const { user, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("bulk");

  const [whatsappData, setWhatsappData] = useState({
    phone: "",
    countryCode: "+91",
    message: "",
  });

  const [emailData, setEmailData] = useState({
    email: "",
    subject: "",
    message: "",
  });

  const [bulkData, setBulkData] = useState({
    channel: "both",
    userType: "all",
    subject: "",
    message: "",
  });

  const whatsappMutation = useMutation({
    mutationFn: async (data: typeof whatsappData) => {
      return apiRequestJson("POST", "/api/admin/promotions/whatsapp", data);
    },
    onSuccess: () => {
      toast({
        title: "WhatsApp Sent",
        description: "Promotional WhatsApp message sent successfully.",
      });
      setWhatsappData({ phone: "", countryCode: "+91", message: "" });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to Send",
        description: error.message || "Failed to send WhatsApp message.",
        variant: "destructive",
      });
    },
  });

  const emailMutation = useMutation({
    mutationFn: async (data: typeof emailData) => {
      return apiRequestJson("POST", "/api/admin/promotions/email", data);
    },
    onSuccess: () => {
      toast({
        title: "Email Sent",
        description: "Promotional email sent successfully.",
      });
      setEmailData({ email: "", subject: "", message: "" });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to Send",
        description: error.message || "Failed to send email.",
        variant: "destructive",
      });
    },
  });

  const bulkMutation = useMutation({
    mutationFn: async (data: typeof bulkData) => {
      return apiRequestJson("POST", "/api/admin/promotions/bulk", data);
    },
    onSuccess: (response: any) => {
      const { sent = 0, failed = 0, skipped = 0 } = response || {};
      toast({
        title: "Bulk Messages Processed",
        description: `Sent: ${sent}, Failed: ${failed}, Skipped: ${skipped}`,
      });
      setBulkData({ channel: "both", userType: "all", subject: "", message: "" });
    },
    onError: (error: Error) => {
      toast({
        title: "Bulk Send Failed",
        description: error.message || "Failed to send bulk messages.",
        variant: "destructive",
      });
    },
  });

  const { data: usersStats } = useQuery<{ total: number; withEmail: number; withPhone: number }>({
    queryKey: ["/api/admin/users/stats"],
    enabled: isAuthenticated && user?.role === "admin",
    queryFn: async () => {
      return apiRequestJson("GET", "/api/admin/users/stats");
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

  const handleWhatsAppSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!whatsappData.phone || !whatsappData.message) {
      toast({
        title: "Validation Error",
        description: "Phone number and message are required.",
        variant: "destructive",
      });
      return;
    }
    whatsappMutation.mutate(whatsappData);
  };

  const handleEmailSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailData.email || !emailData.message) {
      toast({
        title: "Validation Error",
        description: "Email address and message are required.",
        variant: "destructive",
      });
      return;
    }
    emailMutation.mutate(emailData);
  };

  const handleBulkSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!bulkData.message) {
      toast({
        title: "Validation Error",
        description: "Message is required.",
        variant: "destructive",
      });
      return;
    }
    bulkMutation.mutate(bulkData);
  };

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

      <div className="mb-6">
        <h1 className="text-3xl font-bold">Promotional Messages</h1>
        <p className="text-muted-foreground mt-1">
          Send promotional campaigns via WhatsApp and Email to customers
        </p>
      </div>

      {usersStats && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              User Statistics
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-3 bg-muted rounded-md">
                <p className="text-sm text-muted-foreground">Total Users</p>
                <p className="text-2xl font-bold">{usersStats.total}</p>
              </div>
              <div className="p-3 bg-muted rounded-md">
                <p className="text-sm text-muted-foreground">Users with Email</p>
                <p className="text-2xl font-bold">{usersStats.withEmail}</p>
              </div>
              <div className="p-3 bg-muted rounded-md">
                <p className="text-sm text-muted-foreground">Users with Phone</p>
                <p className="text-2xl font-bold">{usersStats.withPhone}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="bulk">Bulk Campaign</TabsTrigger>
          <TabsTrigger value="whatsapp">Single WhatsApp</TabsTrigger>
          <TabsTrigger value="email">Single Email</TabsTrigger>
        </TabsList>

        <TabsContent value="bulk">
          <Card>
            <CardHeader>
              <CardTitle>Bulk Promotional Campaign</CardTitle>
              <CardDescription>
                Send promotional messages to multiple users via WhatsApp and/or Email
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleBulkSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="bulk-channel">Channel</Label>
                  <Select
                    value={bulkData.channel}
                    onValueChange={(value) => setBulkData({ ...bulkData, channel: value })}
                  >
                    <SelectTrigger id="bulk-channel">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="both">WhatsApp & Email</SelectItem>
                      <SelectItem value="whatsapp">WhatsApp Only</SelectItem>
                      <SelectItem value="email">Email Only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="bulk-userType">Target Users</Label>
                  <Select
                    value={bulkData.userType}
                    onValueChange={(value) => setBulkData({ ...bulkData, userType: value })}
                  >
                    <SelectTrigger id="bulk-userType">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Users</SelectItem>
                      <SelectItem value="customers">Customers Only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="bulk-subject">Subject (for emails)</Label>
                  <Input
                    id="bulk-subject"
                    placeholder="Special offer for our valued customers"
                    value={bulkData.subject}
                    onChange={(e) => setBulkData({ ...bulkData, subject: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="bulk-message">Message *</Label>
                  <Textarea
                    id="bulk-message"
                    placeholder="Enter your promotional message here..."
                    rows={6}
                    value={bulkData.message}
                    onChange={(e) => setBulkData({ ...bulkData, message: e.target.value })}
                    required
                  />
                </div>

                <Alert>
                  <AlertDescription>
                    This will send messages to{" "}
                    {bulkData.channel === "whatsapp"
                      ? `${usersStats?.withPhone || 0} users with phone numbers`
                      : bulkData.channel === "email"
                      ? `${usersStats?.withEmail || 0} users with email addresses`
                      : `all eligible users (${usersStats?.total || 0} total)`}
                  </AlertDescription>
                </Alert>

                <Button
                  type="submit"
                  className="w-full"
                  disabled={bulkMutation.isPending}
                >
                  {bulkMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send className="mr-2 h-4 w-4" />
                      Send Bulk Campaign
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="whatsapp">
          <Card>
            <CardHeader>
              <CardTitle>Send WhatsApp Message</CardTitle>
              <CardDescription>
                Send a promotional WhatsApp message to a specific phone number
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleWhatsAppSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="whatsapp-countryCode">Country Code</Label>
                  <Input
                    id="whatsapp-countryCode"
                    placeholder="+91"
                    value={whatsappData.countryCode}
                    onChange={(e) =>
                      setWhatsappData({ ...whatsappData, countryCode: e.target.value })
                    }
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="whatsapp-phone">Phone Number *</Label>
                  <Input
                    id="whatsapp-phone"
                    placeholder="9876543210"
                    value={whatsappData.phone}
                    onChange={(e) =>
                      setWhatsappData({ ...whatsappData, phone: e.target.value })
                    }
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="whatsapp-message">Message *</Label>
                  <Textarea
                    id="whatsapp-message"
                    placeholder="Enter your promotional message here..."
                    rows={6}
                    value={whatsappData.message}
                    onChange={(e) =>
                      setWhatsappData({ ...whatsappData, message: e.target.value })
                    }
                    required
                  />
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  disabled={whatsappMutation.isPending}
                >
                  {whatsappMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <MessageSquare className="mr-2 h-4 w-4" />
                      Send WhatsApp
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="email">
          <Card>
            <CardHeader>
              <CardTitle>Send Email</CardTitle>
              <CardDescription>
                Send a promotional email to a specific email address
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleEmailSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email-address">Email Address *</Label>
                  <Input
                    id="email-address"
                    type="email"
                    placeholder="customer@example.com"
                    value={emailData.email}
                    onChange={(e) =>
                      setEmailData({ ...emailData, email: e.target.value })
                    }
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email-subject">Subject *</Label>
                  <Input
                    id="email-subject"
                    placeholder="Special offer for our valued customers"
                    value={emailData.subject}
                    onChange={(e) =>
                      setEmailData({ ...emailData, subject: e.target.value })
                    }
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email-message">Message *</Label>
                  <Textarea
                    id="email-message"
                    placeholder="Enter your promotional message here..."
                    rows={6}
                    value={emailData.message}
                    onChange={(e) =>
                      setEmailData({ ...emailData, message: e.target.value })
                    }
                    required
                  />
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  disabled={emailMutation.isPending}
                >
                  {emailMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Mail className="mr-2 h-4 w-4" />
                      Send Email
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
