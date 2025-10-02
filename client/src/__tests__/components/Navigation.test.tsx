import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Navigation } from '@/components/Navigation';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('wouter', () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
  useLocation: () => ['/'],
}));

vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({
    user: null,
    isLoading: false,
  }),
}));

vi.mock('@/hooks/useAuthMutations', () => ({
  useAuthMutations: () => ({
    logoutMutation: {
      mutate: vi.fn(),
      isPending: false,
    },
  }),
}));

describe('Navigation Component', () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  const renderNavigation = () => {
    return render(
      <QueryClientProvider client={queryClient}>
        <Navigation />
      </QueryClientProvider>
    );
  };

  it('should render the logo', () => {
    renderNavigation();
    const logo = screen.getByTestId('logo-link');
    expect(logo).toBeInTheDocument();
  });

  it('should render navigation links', () => {
    renderNavigation();
    
    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.getByText('Services')).toBeInTheDocument();
    expect(screen.getByText('Cars for Sale')).toBeInTheDocument();
  });

  it('should render theme toggle button', () => {
    renderNavigation();
    const themeToggle = screen.getByTestId('button-theme-toggle');
    expect(themeToggle).toBeInTheDocument();
  });

  it('should have correct navigation structure', () => {
    const { container } = renderNavigation();
    const nav = container.querySelector('nav');
    expect(nav).toBeInTheDocument();
  });

  it('should render sign in button when user is not authenticated', () => {
    renderNavigation();
    const signInButton = screen.getByTestId('button-sign-in');
    expect(signInButton).toBeInTheDocument();
    expect(signInButton).toHaveTextContent('Sign In');
  });
});
