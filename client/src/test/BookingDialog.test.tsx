
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BookingDialog } from '../components/BookingDialog';
import { useAuth } from '../hooks/use-auth';
import { apiRequest } from '../lib/queryClient';

// Mock dependencies
jest.mock('../hooks/use-auth');
jest.mock('../lib/queryClient');
jest.mock('../hooks/use-toast', () => ({
  useToast: () => ({
    toast: jest.fn()
  })
}));

const mockUser = {
  id: 'user-1',
  email: 'test@example.com',
  name: 'Test User'
};

const mockService = {
  id: 'service-1',
  title: 'Oil Change',
  price: 2500,
  duration: '30 minutes'
};

const mockLocations = [
  {
    id: 'loc-1',
    name: 'Mumbai Branch',
    address: 'Mumbai, Maharashtra'
  }
];

describe('BookingDialog', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false }
      }
    });
    
    (useAuth as jest.Mock).mockReturnValue({
      user: mockUser
    });
    
    (apiRequest as jest.Mock).mockImplementation((method, url) => {
      if (url === '/api/locations') {
        return Promise.resolve(mockLocations);
      }
      if (url.includes('/api/customers/email/')) {
        return Promise.reject({ status: 404 });
      }
      if (url === '/api/customers') {
        return Promise.resolve({ id: 'customer-1', ...mockUser });
      }
      if (url === '/api/appointments/check-conflict') {
        return Promise.resolve({ hasConflict: false });
      }
      if (url === '/api/appointments') {
        return Promise.resolve({ id: 'appointment-1' });
      }
      return Promise.resolve({});
    });
  });

  const renderBookingDialog = () => {
    return render(
      <QueryClientProvider client={queryClient}>
        <BookingDialog service={mockService}>
          <button>Book Service</button>
        </BookingDialog>
      </QueryClientProvider>
    );
  };

  test('should open dialog when trigger is clicked', async () => {
    renderBookingDialog();
    
    fireEvent.click(screen.getByText('Book Service'));
    
    await waitFor(() => {
      expect(screen.getByText('Book Oil Change')).toBeInTheDocument();
    });
  });

  test('should validate required fields', async () => {
    renderBookingDialog();
    
    fireEvent.click(screen.getByText('Book Service'));
    
    await waitFor(() => {
      const bookButton = screen.getByTestId('button-confirm-booking');
      fireEvent.click(bookButton);
    });

    await waitFor(() => {
      expect(screen.getByText(/Please provide car details/)).toBeInTheDocument();
    });
  });

  test('should successfully create appointment with valid data', async () => {
    renderBookingDialog();
    
    fireEvent.click(screen.getByText('Book Service'));
    
    await waitFor(() => {
      const carDetailsInput = screen.getByTestId('input-car-details');
      fireEvent.change(carDetailsInput, { 
        target: { value: 'Maruti Swift 2020 (MH-01-AB-1234)' } 
      });
    });

    // Select date
    const dateButton = screen.getByTestId('button-date-picker');
    fireEvent.click(dateButton);
    
    // Select tomorrow's date
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowElement = screen.getByText(tomorrow.getDate().toString());
    fireEvent.click(tomorrowElement);

    // Select time slot
    const timeSelect = screen.getByTestId('select-time-slot');
    fireEvent.click(timeSelect);
    fireEvent.click(screen.getByText('10:00'));

    // Select location
    const locationSelect = screen.getByTestId('select-location');
    fireEvent.click(locationSelect);
    fireEvent.click(screen.getByText(/Mumbai Branch/));

    // Submit form
    const bookButton = screen.getByTestId('button-confirm-booking');
    fireEvent.click(bookButton);

    await waitFor(() => {
      expect(apiRequest).toHaveBeenCalledWith('POST', '/api/appointments', expect.any(Object));
    });
  });

  test('should handle time slot conflicts', async () => {
    (apiRequest as jest.Mock).mockImplementation((method, url) => {
      if (url === '/api/appointments/check-conflict') {
        return Promise.resolve({ hasConflict: true });
      }
      return Promise.resolve({});
    });

    renderBookingDialog();
    
    fireEvent.click(screen.getByText('Book Service'));
    
    // Fill form and submit
    await waitFor(() => {
      const carDetailsInput = screen.getByTestId('input-car-details');
      fireEvent.change(carDetailsInput, { 
        target: { value: 'Maruti Swift 2020 (MH-01-AB-1234)' } 
      });
    });

    const bookButton = screen.getByTestId('button-confirm-booking');
    fireEvent.click(bookButton);

    await waitFor(() => {
      expect(screen.getByText(/time slot is no longer available/)).toBeInTheDocument();
    });
  });
});
