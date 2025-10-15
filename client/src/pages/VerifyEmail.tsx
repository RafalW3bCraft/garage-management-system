import { useEffect, useState, useRef } from "react";
import { useLocation, useSearch } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { CheckCircle2, XCircle, Loader2, Mail } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

/**
 * Email verification page component that handles email verification via token
 * from the URL query parameters
 */
export default function VerifyEmail() {
  const [, navigate] = useLocation();
  const searchString = useSearch();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [verificationStatus, setVerificationStatus] = useState<'idle' | 'verifying' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [resendCooldown, setResendCooldown] = useState<number>(0);
  const hasVerified = useRef(false);

  const searchParams = new URLSearchParams(searchString);
  const token = searchParams.get('token');
  const email = searchParams.get('email');

  const verifyEmailMutation = useMutation({
    mutationFn: async ({ token, email }: { token: string; email: string }) => {
      const response = await apiRequest("POST", "/api/auth/verify-email", { token, email });
      return response.json();
    },
    onSuccess: (data) => {
      setVerificationStatus('success');

      queryClient.setQueryData(["/api/auth/me"], data.data);
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });

      setTimeout(() => {
        navigate('/');
      }, 3000);
    },
    onError: (error: Error) => {
      setVerificationStatus('error');
      setErrorMessage(error.message || "Failed to verify email. The link may have expired.");
    },
  });

  const resendVerificationMutation = useMutation({
    mutationFn: async (email: string) => {
      const response = await apiRequest("POST", "/api/auth/resend-verification", { email });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Verification email sent!",
        description: "Please check your inbox and spam folder for the verification link.",
        variant: "default",
      });
      setResendCooldown(60);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to resend email",
        description: error.message || "Please try again later or contact support.",
        variant: "destructive",
      });
    },
  });

  useEffect(() => {

    if (!token || !email) {
      setVerificationStatus('error');
      setErrorMessage("Invalid verification link. Missing token or email parameter.");
      return;
    }

    if (!hasVerified.current) {
      hasVerified.current = true;
      setVerificationStatus('verifying');
      verifyEmailMutation.mutate({ token, email });
    }
  }, [token, email, verifyEmailMutation]);

  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => {
        setResendCooldown(resendCooldown - 1);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  return (
    <div className="container mx-auto p-6 max-w-2xl min-h-[60vh] flex items-center justify-center">
      <Card className="w-full">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4">
            {verificationStatus === 'verifying' && (
              <Loader2 className="h-16 w-16 animate-spin text-primary mx-auto" />
            )}
            {verificationStatus === 'success' && (
              <CheckCircle2 className="h-16 w-16 text-green-600 mx-auto" />
            )}
            {verificationStatus === 'error' && (
              <XCircle className="h-16 w-16 text-destructive mx-auto" />
            )}
            {verificationStatus === 'idle' && (
              <Mail className="h-16 w-16 text-muted-foreground mx-auto" />
            )}
          </div>
          <CardTitle className="text-2xl">
            {verificationStatus === 'verifying' && "Verifying Your Email"}
            {verificationStatus === 'success' && "Email Verified!"}
            {verificationStatus === 'error' && "Verification Failed"}
            {verificationStatus === 'idle' && "Email Verification"}
          </CardTitle>
          <CardDescription>
            {verificationStatus === 'verifying' && "Please wait while we verify your email address..."}
            {verificationStatus === 'success' && "Your email has been successfully verified. You are now logged in."}
            {verificationStatus === 'error' && "There was a problem verifying your email address."}
            {verificationStatus === 'idle' && "Preparing to verify your email..."}
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          {verificationStatus === 'success' && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                You will be redirected to the home page in a few seconds...
              </p>
              <Button 
                onClick={() => navigate('/')}
                className="w-full sm:w-auto"
              >
                Go to Home Page
              </Button>
            </div>
          )}
          
          {verificationStatus === 'error' && (
            <div className="space-y-4">
              <p className="text-sm text-destructive">
                {errorMessage}
              </p>
              {email && (
                <div className="bg-muted/50 p-4 rounded-lg space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Didn't receive the email? Check your spam folder or request a new verification link.
                  </p>
                  <Button
                    onClick={() => resendVerificationMutation.mutate(email)}
                    disabled={resendVerificationMutation.isPending || resendCooldown > 0}
                    className="w-full"
                    variant="secondary"
                  >
                    {resendVerificationMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Sending...
                      </>
                    ) : resendCooldown > 0 ? (
                      `Resend Available in ${resendCooldown}s`
                    ) : (
                      "Resend Verification Email"
                    )}
                  </Button>
                </div>
              )}
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Button 
                  onClick={() => navigate('/')}
                  variant="outline"
                  className="w-full sm:w-auto"
                >
                  Go to Home Page
                </Button>
                <Button 
                  onClick={() => window.location.reload()}
                  className="w-full sm:w-auto"
                >
                  Try Again
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
