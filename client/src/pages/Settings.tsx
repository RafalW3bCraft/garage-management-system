import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Settings as SettingsIcon, Bell, Save, Mail, MessageCircle, Loader2 } from "lucide-react";

interface UserSettings {
  preferredNotificationChannel: "whatsapp" | "email";
}

export default function Settings() {
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedChannel, setSelectedChannel] = useState<"whatsapp" | "email">("whatsapp");

  const { data: settings, isLoading: settingsLoading, isError: settingsError } = useQuery<UserSettings>({
    queryKey: ["/api/user/settings"],
    queryFn: async () => {
      const response = await fetch("/api/user/settings", {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Failed to load settings");
      }
      const result = await response.json();
      if (!result.data) {
        throw new Error("Invalid settings response");
      }
      return result.data;
    },
    enabled: !!user,
    retry: false,
    throwOnError: false,
  });

  useEffect(() => {
    if (settings?.preferredNotificationChannel) {
      setSelectedChannel(settings.preferredNotificationChannel);
    }
  }, [settings]);

  const updateSettingsMutation = useMutation({
    mutationFn: async (data: UserSettings) => {
      const response = await apiRequest("PUT", "/api/user/settings", data);
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.message || "Failed to update settings");
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user/settings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({
        title: "Settings Updated",
        description: "Your notification preferences have been saved successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Update Failed",
        description: error.message || "Failed to update settings. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSave = () => {
    updateSettingsMutation.mutate({
      preferredNotificationChannel: selectedChannel,
    });
  };

  const hasChanges = settings?.preferredNotificationChannel !== selectedChannel;

  if (authLoading || settingsLoading) {
    return (
      <div className="container mx-auto p-6 max-w-4xl">
        <div className="space-y-6">
          <Card>
            <CardContent className="p-6">
              <div className="animate-pulse space-y-4">
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
            <SettingsIcon className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
            <p className="text-muted-foreground">Please log in to view your settings.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (settingsError) {
    return (
      <div className="container mx-auto p-6 max-w-4xl">
        <Card>
          <CardContent className="p-6 text-center">
            <SettingsIcon className="h-12 w-12 mx-auto mb-4 text-destructive" />
            <h2 className="text-xl font-semibold mb-2">Failed to Load Settings</h2>
            <p className="text-muted-foreground">Unable to load your notification preferences. Please try refreshing the page.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
            <p className="text-muted-foreground">
              Manage your account preferences and notification settings
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              Notification Preferences
            </CardTitle>
            <CardDescription>
              Choose how you want to receive notifications for appointments, bookings, and updates
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <Label className="text-base font-medium">Preferred Notification Channel</Label>
              <RadioGroup
                value={selectedChannel}
                onValueChange={(value) => setSelectedChannel(value as "whatsapp" | "email")}
                className="space-y-3"
              >
                <div className="flex items-start space-x-3 p-4 rounded-lg border hover:bg-accent transition-colors">
                  <RadioGroupItem value="whatsapp" id="whatsapp" className="mt-1" />
                  <div className="flex-1 space-y-1">
                    <Label htmlFor="whatsapp" className="flex items-center gap-2 cursor-pointer font-medium">
                      <MessageCircle className="h-4 w-4 text-green-600" />
                      WhatsApp
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Receive instant notifications via WhatsApp. Fast and convenient for real-time updates.
                    </p>
                  </div>
                </div>

                <div className="flex items-start space-x-3 p-4 rounded-lg border hover:bg-accent transition-colors">
                  <RadioGroupItem value="email" id="email" className="mt-1" />
                  <div className="flex-1 space-y-1">
                    <Label htmlFor="email" className="flex items-center gap-2 cursor-pointer font-medium">
                      <Mail className="h-4 w-4 text-blue-600" />
                      Email
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Receive notifications via email. Good for detailed records and archiving.
                    </p>
                  </div>
                </div>
              </RadioGroup>
            </div>

            <Separator />

            <div className="bg-muted/50 p-4 rounded-lg">
              <h4 className="text-sm font-medium mb-2">What notifications will you receive?</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Appointment confirmations and reminders</li>
                <li>• Service status updates</li>
                <li>• Bid notifications for car auctions</li>
                <li>• Important account updates</li>
              </ul>
            </div>

            {hasChanges && (
              <div className="flex items-center gap-3 pt-2">
                <Button
                  onClick={handleSave}
                  disabled={updateSettingsMutation.isPending}
                  className="gap-2"
                >
                  {updateSettingsMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4" />
                      Save Changes
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setSelectedChannel(settings?.preferredNotificationChannel || "whatsapp")}
                  disabled={updateSettingsMutation.isPending}
                >
                  Cancel
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
