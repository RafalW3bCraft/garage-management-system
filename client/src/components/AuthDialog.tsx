import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { MobileRegistration } from "@/components/MobileRegistration";
import { Mail, Smartphone } from "lucide-react";

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

const registerSchema = z
  .object({
    name: z.string().min(2, "Name must be at least 2 characters"),
    email: z.string().email("Please enter a valid email"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

type LoginData = z.infer<typeof loginSchema>;
type RegisterData = z.infer<typeof registerSchema>;

interface AuthDialogProps {
  children: React.ReactNode;
}

export function AuthDialog({ children }: AuthDialogProps) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [showMobileRegistration, setShowMobileRegistration] = useState(false);
  const { login, register, googleLogin, loginMutation, registerMutation, isGoogleEnabled } = useAuth();
  const { toast } = useToast();

  const loginForm = useForm<LoginData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const registerForm = useForm<RegisterData>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
  });

  const onLoginSubmit = (data: LoginData) => {
    login(data);
  };

  const onRegisterSubmit = (data: RegisterData) => {
    register(data);
  };

  // Handle mutation success with useEffect
  useEffect(() => {
    if (loginMutation.isSuccess || registerMutation.isSuccess) {
      setOpen(false);
      toast({
        title: "Success",
        description: mode === "login" ? "Logged in successfully" : "Account created successfully",
      });
      
      // Reset mutations to prevent re-triggering
      loginMutation.reset();
      registerMutation.reset();
      
      // Reset forms
      loginForm.reset();
      registerForm.reset();
    }
  }, [loginMutation.isSuccess, registerMutation.isSuccess, mode, toast, loginMutation, registerMutation, loginForm, registerForm]);

  // Handle mutation errors with useEffect
  useEffect(() => {
    if (loginMutation.isError) {
      toast({
        title: "Login Failed",
        description: loginMutation.error?.message || "Please check your credentials",
        variant: "destructive",
      });
    }
  }, [loginMutation.isError, loginMutation.error?.message, toast]);

  useEffect(() => {
    if (registerMutation.isError) {
      toast({
        title: "Registration Failed",
        description: registerMutation.error?.message || "Please try again",
        variant: "destructive",
      });
    }
  }, [registerMutation.isError, registerMutation.error?.message, toast]);

  const handleGoogleLogin = () => {
    googleLogin();
  };

  const handleMobileRegistrationSuccess = () => {
    // Refresh auth state and close dialogs
    window.location.reload();
  };

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>{children}</DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {mode === "login" ? "Sign in to your account" : "Create an account"}
            </DialogTitle>
            <DialogDescription>
              {mode === "login"
                ? "Choose how you'd like to access your account"
                : "Choose how you'd like to create your account"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {mode === "register" && (
              <Tabs defaultValue="email" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="email" className="flex items-center gap-2">
                    <Mail className="w-4 h-4" />
                    Email
                  </TabsTrigger>
                  <TabsTrigger value="mobile" className="flex items-center gap-2">
                    <Smartphone className="w-4 h-4" />
                    Mobile
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="email" className="space-y-4 mt-4">
                  {/* Email registration content will go here */}
                </TabsContent>
                <TabsContent value="mobile" className="space-y-4 mt-4">
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground mb-4">
                      Register with your mobile number for quick access
                    </p>
                    <Button
                      onClick={() => {
                        setShowMobileRegistration(true);
                        setOpen(false);
                      }}
                      className="w-full"
                      data-testid="button-mobile-register"
                    >
                      <Smartphone className="w-4 h-4 mr-2" />
                      Register with Mobile Number
                    </Button>
                  </div>
                </TabsContent>
              </Tabs>
            )}

            {/* Show standard login/register for login mode or email tab */}
            {/* Google Login Button - only show if enabled */}
            {isGoogleEnabled && (
              <>
              <Button
                variant="outline"
                className="w-full"
                onClick={handleGoogleLogin}
                data-testid="button-google-login"
              >
                <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                  <path
                    fill="currentColor"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="currentColor"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                Continue with Google
              </Button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <Separator className="w-full" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">or</span>
                </div>
              </div>
              </>
            )}

            {/* Login Form */}
            {mode === "login" ? (
              <Form {...loginForm}>
                <form onSubmit={loginForm.handleSubmit(onLoginSubmit)} className="space-y-4">
                <FormField
                  control={loginForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
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
                <FormField
                  control={loginForm.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          placeholder="Enter your password"
                          data-testid="input-password"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button
                  type="submit"
                  className="w-full"
                  disabled={loginMutation.isPending}
                  data-testid="button-submit"
                >
                  {loginMutation.isPending ? "Signing in..." : "Sign in"}
                </Button>
                </form>
              </Form>
            ) : mode === "register" ? (
              /* Register Form - only show for email tab or when tabs not visible */
              <div style={{ display: mode === "register" ? "block" : "none" }}>
                <Form {...registerForm}>
                  <form onSubmit={registerForm.handleSubmit(onRegisterSubmit)} className="space-y-4">
                <FormField
                  control={registerForm.control}
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
                  control={registerForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
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
                <FormField
                  control={registerForm.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          placeholder="Enter your password"
                          data-testid="input-password"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={registerForm.control}
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Confirm Password</FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          placeholder="Confirm your password"
                          data-testid="input-confirm-password"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button
                  type="submit"
                  className="w-full"
                  disabled={registerMutation.isPending}
                  data-testid="button-submit"
                >
                  {registerMutation.isPending ? "Creating account..." : "Create account"}
                  </Button>
                  </form>
                </Form>
              </div>
            ) : null}

            {/* Mobile registration option for login mode */}
            {mode === "login" && (
              <div className="text-center">
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    setShowMobileRegistration(true);
                    setOpen(false);
                  }}
                  data-testid="button-mobile-login"
                >
                  <Smartphone className="w-4 h-4 mr-2" />
                  Continue with Mobile Number
                </Button>
              </div>
            )}

            {/* Switch between login/register */}
            <div className="text-center text-sm">
              <span className="text-muted-foreground">
                {mode === "login" ? "Don't have an account?" : "Already have an account?"}
              </span>{" "}
              <Button
                variant="ghost"
                className="p-0 h-auto font-normal underline"
                onClick={() => setMode(mode === "login" ? "register" : "login")}
                data-testid="button-switch-mode"
              >
                {mode === "login" ? "Sign up" : "Sign in"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Mobile Registration Dialog */}
      <MobileRegistration
        open={showMobileRegistration}
        onOpenChange={setShowMobileRegistration}
        onSuccess={handleMobileRegistrationSuccess}
      />
    </>
  );
}