import { useState, lazy, Suspense } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Logo } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";
import { Menu, X, User, LogOut, Settings, Car, Shield } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useAuthMutations } from "@/hooks/useAuthMutations";

/**
 * Lazy load AuthDialog to reduce initial bundle size
 */
const AuthDialog = lazy(() => import("./AuthDialog").then(module => ({ default: module.AuthDialog })));

/**
 * Main navigation component with responsive design, user authentication state,
 * and dropdown menu. Features sticky positioning, mobile menu, theme toggle,
 * and role-based navigation items (admin access).
 * 
 * @returns {JSX.Element} The rendered navigation bar
 * 
 * @example
 * ```tsx
 * <Navigation />
 * ```
 */
export function Navigation() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [location] = useLocation();
  const { user, isLoading } = useAuth();
  const { logoutMutation } = useAuthMutations();
  
  const isActive = (path: string) => location === path;

  const navItems = [
    { href: "/", label: "Home" },
    { href: "/services", label: "Services" },
    { href: "/cars", label: "Cars for Sale" },
    { href: "/appointments", label: "My Appointments" },
    { href: "/contact", label: "Contact" },
  ];

  const handleLogout = () => {
    logoutMutation.mutate();
  };

  return (
    <nav className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60" aria-label="Main navigation">
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <Link href="/" data-testid="link-home" aria-label="Ronak Motor Garage - Home">
            <Logo />
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-6" role="navigation" aria-label="Primary navigation">
            {navItems.map((item) => (
              <Link key={item.href} href={item.href} data-testid={`link-${item.label.toLowerCase().replace(/\s+/g, '-')}`}>
                <Button
                  variant={isActive(item.href) ? "default" : "ghost"}
                  size="sm"
                  className="text-sm"
                  aria-current={isActive(item.href) ? "page" : undefined}
                >
                  {item.label}
                </Button>
              </Link>
            ))}
          </div>

          {/* Right Side - User Menu & Theme Toggle */}
          <div className="flex items-center flex-wrap gap-2">
            <ThemeToggle />
            
            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    variant="ghost" 
                    className="relative h-9 w-9 rounded-full" 
                    data-testid="button-user-menu"
                    aria-label={`User menu for ${user.name}`}
                  >
                    <Avatar className="h-9 w-9">
                      <AvatarImage src="" alt={`${user.name}'s profile picture`} />
                      <AvatarFallback>
                        {user.name.split(' ').map(n => n[0]).join('')}
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56" align="end" forceMount>
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium leading-none">{user.name}</p>
                      <p className="text-xs leading-none text-muted-foreground">
                        {user.email}
                      </p>
                      <Badge variant="secondary" className="w-fit mt-1">
                        {user.provider === "google" ? "Google" : "Email"}
                      </Badge>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild data-testid="menu-profile">
                    <Link href="/profile">
                      <User className="mr-2 h-4 w-4" aria-hidden="true" />
                      <span>Profile</span>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild data-testid="menu-appointments">
                    <Link href="/appointments">
                      <Settings className="mr-2 h-4 w-4" aria-hidden="true" />
                      <span>My Appointments</span>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild data-testid="menu-my-cars">
                    <Link href="/cars">
                      <Car className="mr-2 h-4 w-4" aria-hidden="true" />
                      <span>Browse Cars</span>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild data-testid="menu-services">
                    <Link href="/services">
                      <Car className="mr-2 h-4 w-4" aria-hidden="true" />
                      <span>Book Service</span>
                    </Link>
                  </DropdownMenuItem>
                  {user.role === "admin" && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem asChild data-testid="menu-admin">
                        <Link href="/admin">
                          <Shield className="mr-2 h-4 w-4" aria-hidden="true" />
                          <span>Admin Dashboard</span>
                        </Link>
                      </DropdownMenuItem>
                    </>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout} data-testid="menu-logout">
                    <LogOut className="mr-2 h-4 w-4" aria-hidden="true" />
                    <span>Log out</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : isLoading ? (
              <Button variant="ghost" disabled data-testid="button-loading">
                Loading...
              </Button>
            ) : (
              <Suspense fallback={
                <Button data-testid="button-login">
                  Login
                </Button>
              }>
                <AuthDialog>
                  <Button data-testid="button-login">
                    Login
                  </Button>
                </AuthDialog>
              </Suspense>
            )}

            {/* Mobile Menu Button */}
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              data-testid="button-mobile-menu"
              aria-label={isMenuOpen ? "Close menu" : "Open menu"}
              aria-expanded={isMenuOpen}
              aria-controls="mobile-navigation"
            >
              {isMenuOpen ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
            </Button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {isMenuOpen && (
          <div 
            id="mobile-navigation" 
            className="md:hidden flex flex-col gap-3 py-4" 
            role="navigation" 
            aria-label="Mobile navigation"
          >
            {navItems.map((item) => (
              <Link key={item.href} href={item.href}>
                <Button
                  variant={isActive(item.href) ? "default" : "ghost"}
                  className="w-full min-h-11 justify-start"
                  onClick={() => setIsMenuOpen(false)}
                  aria-current={isActive(item.href) ? "page" : undefined}
                >
                  {item.label}
                </Button>
              </Link>
            ))}
          </div>
        )}
      </div>
    </nav>
  );
}
