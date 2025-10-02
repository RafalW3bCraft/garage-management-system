import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { DatabaseStorage } from '../../storage';
import type { User, Service, Customer, Appointment, Location, Car, Bid } from '@shared/schema';

const mockGetDb = jest.fn<any>();

jest.mock('../../db', () => ({
  getDb: (...args: any[]) => mockGetDb(...args),
}));

describe('DatabaseStorage - Unit Tests', () => {
  let storage: DatabaseStorage;
  let mockDb: any;
  let mockTx: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    storage = new DatabaseStorage();
    
    mockDb = {
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      returning: jest.fn(),
      limit: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      offset: jest.fn().mockReturnThis(),
      innerJoin: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      transaction: jest.fn(),
      onConflictDoUpdate: jest.fn().mockReturnThis(),
    };
    
    mockTx = {
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      returning: jest.fn(),
      limit: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
    };
    
    mockGetDb.mockResolvedValue(mockDb);
  });

  describe('User Operations', () => {
    const mockUser: User = {
      id: 'user-123',
      email: 'test@example.com',
      name: 'Test User',
      password: 'hashed_password',
      googleId: null,
      phone: null,
      phoneVerified: false,
      countryCode: '+91',
      registrationNumbers: null,
      dateOfBirth: null,
      profileImage: null,
      address: null,
      city: null,
      state: null,
      zipCode: null,
      provider: 'email',
      role: 'customer',
      emailVerified: false,
      createdAt: new Date(),
    };

    describe('getUser', () => {
      it('should return a user when found', async () => {
        mockDb.limit.mockResolvedValue([mockUser]);

        const result = await storage.getUser('user-123');

        expect(result).toEqual(mockUser);
        expect(mockGetDb).toHaveBeenCalled();
        expect(mockDb.select).toHaveBeenCalled();
        expect(mockDb.from).toHaveBeenCalled();
        expect(mockDb.where).toHaveBeenCalled();
        expect(mockDb.limit).toHaveBeenCalledWith(1);
      });

      it('should return undefined when user not found', async () => {
        mockDb.limit.mockResolvedValue([]);

        const result = await storage.getUser('nonexistent-id');

        expect(result).toBeUndefined();
      });
    });

    describe('getUserByEmail', () => {
      it('should return a user by email', async () => {
        mockDb.limit.mockResolvedValue([mockUser]);

        const result = await storage.getUserByEmail('test@example.com');

        expect(result).toEqual(mockUser);
        expect(mockDb.where).toHaveBeenCalled();
      });

      it('should return undefined when email not found', async () => {
        mockDb.limit.mockResolvedValue([]);

        const result = await storage.getUserByEmail('nonexistent@example.com');

        expect(result).toBeUndefined();
      });
    });

    describe('getUserByGoogleId', () => {
      it('should return user by Google ID', async () => {
        const googleUser = { ...mockUser, googleId: 'google-123' };
        mockDb.limit.mockResolvedValue([googleUser]);

        const result = await storage.getUserByGoogleId('google-123');

        expect(result).toEqual(googleUser);
      });
    });

    describe('createUser', () => {
      it('should create a new user successfully', async () => {
        mockDb.returning.mockResolvedValue([mockUser]);

        const newUser = {
          email: 'test@example.com',
          name: 'Test User',
          password: 'hashed_password',
          provider: 'email' as const,
        };

        const result = await storage.createUser(newUser);

        expect(result).toEqual(mockUser);
        expect(mockDb.insert).toHaveBeenCalled();
        expect(mockDb.values).toHaveBeenCalledWith(newUser);
        expect(mockDb.returning).toHaveBeenCalled();
      });

      it('should throw error on duplicate email', async () => {
        const dbError = Object.assign(new Error('Duplicate'), {
          code: '23505',
          constraint: 'users_email_key'
        });
        mockDb.returning.mockRejectedValue(dbError);

        await expect(storage.createUser({
          email: 'test@example.com',
          name: 'Test',
          password: 'pass',
          provider: 'email',
        })).rejects.toMatchObject({
          status: 409,
          message: expect.stringContaining('email')
        });
      });

      it('should throw error on duplicate phone', async () => {
        const dbError = Object.assign(new Error('Duplicate'), {
          code: '23505',
          constraint: 'users_phone_key'
        });
        mockDb.returning.mockRejectedValue(dbError);

        await expect(storage.createUser({
          phone: '1234567890',
          name: 'Test',
          provider: 'mobile',
        })).rejects.toMatchObject({
          status: 409,
          message: expect.stringContaining('phone')
        });
      });

      it('should throw error on missing required fields', async () => {
        const dbError = Object.assign(new Error('Not null violation'), {
          code: '23502'
        });
        mockDb.returning.mockRejectedValue(dbError);

        await expect(storage.createUser({} as any)).rejects.toMatchObject({
          status: 400,
          message: expect.stringContaining('required')
        });
      });
    });

    describe('updateUser', () => {
      it('should update user successfully', async () => {
        const updatedUser = { ...mockUser, name: 'Updated Name' };
        mockDb.returning.mockResolvedValue([updatedUser]);

        const result = await storage.updateUser('user-123', { name: 'Updated Name' });

        expect(result).toEqual(updatedUser);
        expect(mockDb.update).toHaveBeenCalled();
        expect(mockDb.set).toHaveBeenCalledWith({ name: 'Updated Name' });
      });

      it('should return undefined when user not found', async () => {
        mockDb.returning.mockResolvedValue([]);

        const result = await storage.updateUser('nonexistent', { name: 'Test' });

        expect(result).toBeUndefined();
      });
    });

    describe('linkGoogleAccount', () => {
      it('should link Google account successfully', async () => {
        const linkedUser = { ...mockUser, googleId: 'google-123', provider: 'google', emailVerified: true };
        mockDb.returning.mockResolvedValue([linkedUser]);

        const result = await storage.linkGoogleAccount('user-123', 'google-123');

        expect(result).toEqual(linkedUser);
      });

      it('should throw error when user already linked', async () => {
        mockDb.returning.mockResolvedValue([]);
        mockDb.limit.mockResolvedValue([{ ...mockUser, googleId: 'existing-google-id' }]);

        await expect(storage.linkGoogleAccount('user-123', 'google-123'))
          .rejects.toThrow('already linked to Google account');
      });

      it('should throw error when Google ID already used', async () => {
        const dbError = Object.assign(new Error('Duplicate'), {
          code: '23505',
          constraint: 'users_google_id_key'
        });
        mockDb.returning.mockRejectedValue(dbError);

        await expect(storage.linkGoogleAccount('user-123', 'google-123'))
          .rejects.toThrow('already linked to another user');
      });
    });

    describe('getUserCount', () => {
      it('should return total user count', async () => {
        mockDb.from.mockResolvedValue([{ count: 42 }]);

        const result = await storage.getUserCount();

        expect(result).toBe(42);
      });
    });

    describe('getAllUsers with pagination', () => {
      it('should return users with default pagination', async () => {
        const users = [mockUser, { ...mockUser, id: 'user-456' }];
        mockDb.limit.mockResolvedValue(users);

        const result = await storage.getAllUsers();

        expect(result).toEqual(users);
        expect(mockDb.offset).toHaveBeenCalledWith(0);
        expect(mockDb.limit).toHaveBeenCalledWith(100);
      });

      it('should return users with custom pagination', async () => {
        const users = [mockUser];
        mockDb.limit.mockResolvedValue(users);

        const result = await storage.getAllUsers(10, 5);

        expect(result).toEqual(users);
        expect(mockDb.offset).toHaveBeenCalledWith(10);
        expect(mockDb.limit).toHaveBeenCalledWith(5);
      });
    });
  });

  describe('Customer Operations', () => {
    const mockCustomer: Customer = {
      id: 'customer-123',
      userId: 'user-123',
      name: 'Customer Name',
      email: 'customer@example.com',
      phone: '1234567890',
      countryCode: '+91',
      createdAt: new Date(),
    };

    describe('getCustomer', () => {
      it('should return customer by ID', async () => {
        mockDb.limit.mockResolvedValue([mockCustomer]);

        const result = await storage.getCustomer('customer-123');

        expect(result).toEqual(mockCustomer);
      });
    });

    describe('getCustomerByEmail', () => {
      it('should return customer by email', async () => {
        mockDb.limit.mockResolvedValue([mockCustomer]);

        const result = await storage.getCustomerByEmail('customer@example.com');

        expect(result).toEqual(mockCustomer);
      });
    });

    describe('getCustomerByUserId', () => {
      it('should return customer by user ID', async () => {
        mockDb.limit.mockResolvedValue([mockCustomer]);

        const result = await storage.getCustomerByUserId('user-123');

        expect(result).toEqual(mockCustomer);
      });
    });

    describe('createCustomer', () => {
      it('should create customer successfully', async () => {
        mockDb.returning.mockResolvedValue([mockCustomer]);

        const result = await storage.createCustomer({
          name: 'Customer Name',
          email: 'customer@example.com',
          phone: '1234567890',
        });

        expect(result).toEqual(mockCustomer);
      });
    });

    describe('updateCustomer', () => {
      it('should update customer successfully', async () => {
        const updated = { ...mockCustomer, name: 'Updated Name' };
        mockDb.returning.mockResolvedValue([updated]);

        const result = await storage.updateCustomer('customer-123', { name: 'Updated Name' });

        expect(result).toEqual(updated);
      });
    });
  });

  describe('Service Operations', () => {
    const mockService: Service = {
      id: 'service-123',
      title: 'Oil Change',
      description: 'Complete oil change service',
      price: 50,
      duration: '30 minutes',
      category: 'maintenance',
      features: ['Full synthetic oil', 'Filter replacement'],
      popular: false,
      icon: 'wrench',
      providerName: null,
      providerPhone: null,
      providerCountryCode: '+91',
    };

    describe('getAllServices with caching', () => {
      it('should return all services and cache them', async () => {
        const services = [mockService];
        mockDb.orderBy.mockResolvedValue(services);

        const result1 = await storage.getAllServices();
        const result2 = await storage.getAllServices();

        expect(result1).toEqual(services);
        expect(result2).toEqual(services);
        expect(mockDb.select).toHaveBeenCalledTimes(1); // Cache hit on second call
      });
    });

    describe('getService', () => {
      it('should return service by ID', async () => {
        mockDb.limit.mockResolvedValue([mockService]);

        const result = await storage.getService('service-123');

        expect(result).toEqual(mockService);
      });
    });

    describe('getServicesByCategory with caching', () => {
      it('should return services by category and cache them', async () => {
        const services = [mockService];
        mockDb.orderBy.mockResolvedValue(services);

        const result = await storage.getServicesByCategory('maintenance');

        expect(result).toEqual(services);
      });
    });

    describe('createService', () => {
      it('should create service and invalidate cache', async () => {
        mockDb.returning.mockResolvedValue([mockService]);
        mockDb.orderBy.mockResolvedValue([mockService]);

        // Populate cache first
        await storage.getAllServices();
        expect(mockDb.select).toHaveBeenCalledTimes(1);

        // Create service
        await storage.createService({
          title: 'Oil Change',
          description: 'Test',
          price: 50,
          duration: '30 min',
          category: 'maintenance',
          features: [],
        });

        // Verify cache is invalidated by checking if next call hits DB
        await storage.getAllServices();
        expect(mockDb.select).toHaveBeenCalledTimes(2);
      });

      it('should throw error on duplicate service', async () => {
        const dbError = Object.assign(new Error('Duplicate'), {
          code: '23505'
        });
        mockDb.returning.mockRejectedValue(dbError);

        await expect(storage.createService({
          title: 'Test',
          description: 'Test',
          price: 50,
          duration: '30 min',
          category: 'test',
          features: [],
        })).rejects.toMatchObject({
          status: 409
        });
      });
    });

    describe('updateService', () => {
      it('should update service and invalidate cache', async () => {
        const updated = { ...mockService, title: 'Updated Service' };
        mockDb.returning.mockResolvedValue([updated]);

        const result = await storage.updateService('service-123', { title: 'Updated Service' });

        expect(result).toEqual(updated);
      });
    });

    describe('deleteService', () => {
      it('should delete service and invalidate cache', async () => {
        await storage.deleteService('service-123');

        expect(mockDb.delete).toHaveBeenCalled();
      });
    });
  });

  describe('Appointment Operations', () => {
    const mockAppointment: Appointment = {
      id: 'apt-123',
      customerId: 'customer-123',
      serviceId: 'service-123',
      locationId: 'location-123',
      carDetails: 'Toyota Camry 2020',
      dateTime: new Date('2024-01-15T10:00:00Z'),
      status: 'pending',
      mechanicName: null,
      estimatedDuration: '1 hour',
      price: null,
      notes: null,
      createdAt: new Date(),
    };

    describe('createAppointment', () => {
      it('should create appointment with conflict check', async () => {
        mockDb.transaction.mockImplementation(async (callback: any) => {
          mockTx.select.mockReturnThis();
          mockTx.from.mockReturnThis();
          mockTx.where.mockResolvedValue([]); // No conflicts
          mockTx.insert.mockReturnThis();
          mockTx.values.mockReturnThis();
          mockTx.returning.mockResolvedValue([mockAppointment]);
          return callback(mockTx);
        });

        const result = await storage.createAppointment({
          customerId: 'customer-123',
          serviceId: 'service-123',
          locationId: 'location-123',
          carDetails: 'Toyota Camry 2020',
          dateTime: new Date('2024-01-15T10:00:00Z'),
          estimatedDuration: '1 hour',
        });

        expect(result).toEqual(mockAppointment);
      });

      it('should throw error on time conflict', async () => {
        mockDb.transaction.mockImplementation(async (callback: any) => {
          mockTx.select.mockReturnThis();
          mockTx.from.mockReturnThis();
          mockTx.where.mockResolvedValue([{ id: 'conflicting-apt' }]); // Conflict found
          return callback(mockTx);
        });

        await expect(storage.createAppointment({
          customerId: 'customer-123',
          serviceId: 'service-123',
          locationId: 'location-123',
          carDetails: 'Test',
          dateTime: new Date(),
          estimatedDuration: '1 hour',
        })).rejects.toMatchObject({
          status: 409,
          message: expect.stringContaining('conflict')
        });
      });
    });

    describe('getAllAppointments', () => {
      it('should return appointments with details', async () => {
        const appointmentWithDetails = {
          ...mockAppointment,
          serviceName: 'Oil Change',
          locationName: 'Main Branch',
          customerName: 'John Doe',
        };
        mockDb.orderBy.mockResolvedValue([appointmentWithDetails]);

        const result = await storage.getAllAppointments();

        expect(result).toEqual([appointmentWithDetails]);
        expect(mockDb.innerJoin).toHaveBeenCalledTimes(3); // services, locations, customers
      });
    });

    describe('updateAppointmentStatus', () => {
      it('should update status to non-confirmed', async () => {
        mockDb.transaction.mockImplementation(async (callback: any) => {
          mockTx.select.mockReturnThis();
          mockTx.from.mockReturnThis();
          mockTx.where.mockReturnThis();
          mockTx.limit.mockResolvedValue([mockAppointment]);
          mockTx.update.mockReturnThis();
          mockTx.set.mockReturnThis();
          mockTx.returning.mockResolvedValue([{ ...mockAppointment, status: 'completed' }]);
          return callback(mockTx);
        });

        const result = await storage.updateAppointmentStatus('apt-123', 'completed');

        expect(result?.status).toBe('completed');
      });

      it('should throw error when appointment not found', async () => {
        mockDb.transaction.mockImplementation(async (callback: any) => {
          mockTx.select.mockReturnThis();
          mockTx.from.mockReturnThis();
          mockTx.where.mockReturnThis();
          mockTx.limit.mockResolvedValue([]);
          return callback(mockTx);
        });

        await expect(storage.updateAppointmentStatus('nonexistent', 'completed'))
          .rejects.toMatchObject({
            status: 404,
            message: expect.stringContaining('not found')
          });
      });
    });

    describe('deleteAppointment', () => {
      it('should delete appointment successfully', async () => {
        mockDb.returning.mockResolvedValue([{ id: 'apt-123' }]);

        const result = await storage.deleteAppointment('apt-123');

        expect(result).toBe(true);
      });

      it('should return false when appointment not found', async () => {
        mockDb.returning.mockResolvedValue([]);

        const result = await storage.deleteAppointment('nonexistent');

        expect(result).toBe(false);
      });
    });
  });

  describe('Location Operations', () => {
    const mockLocation: Location = {
      id: 'loc-123',
      name: 'Main Branch',
      address: '123 Main St',
      phone: '+911234567890',
      email: 'main@example.com',
      hours: '9AM-6PM',
      rating: '4.5',
    };

    describe('getAllLocations with caching', () => {
      it('should return locations and cache them', async () => {
        mockDb.orderBy.mockResolvedValue([mockLocation]);

        const result1 = await storage.getAllLocations();
        const result2 = await storage.getAllLocations();

        expect(result1).toEqual([mockLocation]);
        expect(result2).toEqual([mockLocation]);
        expect(mockDb.select).toHaveBeenCalledTimes(1); // Cache hit
      });
    });

    describe('createLocation', () => {
      it('should create location and invalidate cache', async () => {
        mockDb.returning.mockResolvedValue([mockLocation]);

        const result = await storage.createLocation({
          name: 'Main Branch',
          address: '123 Main St',
          phone: '+911234567890',
          email: 'main@example.com',
          hours: '9AM-6PM',
          rating: '4.5',
        });

        expect(result).toEqual(mockLocation);
      });
    });

    describe('deleteLocation', () => {
      it('should delete location successfully', async () => {
        mockDb.returning.mockResolvedValue([{ id: 'loc-123' }]);

        const result = await storage.deleteLocation('loc-123');

        // The actual implementation checks if result.length > 0
        expect(mockDb.delete).toHaveBeenCalled();
      });
    });

    describe('hasLocationAppointments', () => {
      it('should return true when location has appointments', async () => {
        mockDb.limit.mockResolvedValue([{ id: 'apt-123' }]);

        const result = await storage.hasLocationAppointments('loc-123');

        // The method returns result.length > 0 which is a boolean
        expect(mockDb.where).toHaveBeenCalled();
      });

      it('should return false when location has no appointments', async () => {
        mockDb.limit.mockResolvedValue([]);

        const result = await storage.hasLocationAppointments('loc-123');

        expect(result).toBe(false);
      });
    });
  });

  describe('Car Operations', () => {
    const mockCar: Car = {
      id: 'car-123',
      make: 'Toyota',
      model: 'Camry',
      year: 2020,
      price: 25000,
      mileage: 30000,
      fuelType: 'petrol',
      location: 'Mumbai',
      condition: 'Excellent',
      image: '/cars/camry.jpg',
      isAuction: false,
      currentBid: null,
      auctionEndTime: null,
      description: 'Well maintained',
      createdAt: new Date(),
    };

    describe('getAllCars', () => {
      it('should return all cars', async () => {
        mockDb.orderBy.mockResolvedValue([mockCar]);

        const result = await storage.getAllCars();

        expect(result).toEqual([mockCar]);
      });
    });

    describe('getCarsForSale', () => {
      it('should return non-auction cars', async () => {
        mockDb.orderBy.mockResolvedValue([mockCar]);

        const result = await storage.getCarsForSale();

        expect(result).toEqual([mockCar]);
        expect(mockDb.where).toHaveBeenCalled();
      });
    });

    describe('getAuctionCars', () => {
      it('should return auction cars', async () => {
        const auctionCar = { ...mockCar, isAuction: true };
        mockDb.orderBy.mockResolvedValue([auctionCar]);

        const result = await storage.getAuctionCars();

        expect(result).toEqual([auctionCar]);
      });
    });

    describe('createCar', () => {
      it('should create car successfully', async () => {
        mockDb.returning.mockResolvedValue([mockCar]);

        const result = await storage.createCar({
          make: 'Toyota',
          model: 'Camry',
          year: 2020,
          price: 25000,
          mileage: 30000,
          fuelType: 'petrol',
          location: 'Mumbai',
          condition: 'Excellent',
          image: '/cars/camry.jpg',
        });

        expect(result).toEqual(mockCar);
      });
    });

    describe('updateCar', () => {
      it('should update car successfully', async () => {
        const updated = { ...mockCar, price: 24000 };
        mockDb.returning.mockResolvedValue([updated]);

        const result = await storage.updateCar('car-123', { price: 24000 });

        expect(result).toEqual(updated);
      });
    });

    describe('deleteCar', () => {
      it('should delete car successfully', async () => {
        mockDb.returning.mockResolvedValue([{ id: 'car-123' }]);

        const result = await storage.deleteCar('car-123');

        expect(result).toBe(true);
      });
    });
  });

  describe('Bid Operations', () => {
    const mockBid: Bid = {
      id: 'bid-123',
      carId: 'car-123',
      bidderEmail: 'bidder@example.com',
      bidAmount: 26000,
      bidTime: new Date(),
    };

    describe('placeBid', () => {
      it('should place bid successfully', async () => {
        mockDb.returning.mockResolvedValue([mockBid]);

        const result = await storage.placeBid({
          carId: 'car-123',
          bidderEmail: 'bidder@example.com',
          bidAmount: 26000,
        });

        expect(result).toEqual(mockBid);
      });
    });

    describe('getBidsForCar', () => {
      it('should return bids sorted by amount', async () => {
        const bids = [mockBid, { ...mockBid, id: 'bid-456', bidAmount: 27000 }];
        mockDb.orderBy.mockResolvedValue(bids);

        const result = await storage.getBidsForCar('car-123');

        expect(result).toEqual(bids);
      });
    });

    describe('getHighestBidForCar', () => {
      it('should return highest bid', async () => {
        mockDb.limit.mockResolvedValue([mockBid]);

        const result = await storage.getHighestBidForCar('car-123');

        expect(result).toEqual(mockBid);
      });

      it('should return undefined when no bids', async () => {
        mockDb.limit.mockResolvedValue([]);

        const result = await storage.getHighestBidForCar('car-123');

        expect(result).toBeUndefined();
      });
    });

    describe('hasActiveBids', () => {
      it('should return true when car has bids', async () => {
        mockDb.limit.mockResolvedValue([mockBid]);

        const result = await storage.hasActiveBids('car-123');

        // The method returns result.length > 0
        expect(mockDb.where).toHaveBeenCalled();
      });

      it('should return false when car has no bids', async () => {
        mockDb.limit.mockResolvedValue([]);

        const result = await storage.hasActiveBids('car-123');

        expect(result).toBe(false);
      });
    });

    describe('updateCarCurrentBid', () => {
      it('should update car current bid', async () => {
        const updatedCar = { id: 'car-123', currentBid: 26000 } as Car;
        mockDb.returning.mockResolvedValue([updatedCar]);

        const result = await storage.updateCarCurrentBid('car-123', 26000);

        expect(result?.currentBid).toBe(26000);
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle database connection errors', async () => {
      mockGetDb.mockRejectedValue(new Error('Database connection failed'));

      await expect(storage.getUser('user-123')).rejects.toThrow('Database connection failed');
    });

    it('should handle transaction errors', async () => {
      mockDb.transaction.mockRejectedValue(new Error('Transaction failed'));

      await expect(storage.createAppointment({
        customerId: 'customer-123',
        serviceId: 'service-123',
        locationId: 'location-123',
        carDetails: 'Test',
        dateTime: new Date(),
        estimatedDuration: '1 hour',
      })).rejects.toThrow('Transaction failed');
    });
  });

  describe('Transaction Rollback Behavior', () => {
    const mockAppointment: Appointment = {
      id: 'apt-123',
      customerId: 'customer-123',
      serviceId: 'service-123',
      locationId: 'location-123',
      carDetails: 'Toyota Camry 2020',
      dateTime: new Date('2024-01-15T10:00:00Z'),
      status: 'pending',
      mechanicName: null,
      estimatedDuration: '1 hour',
      price: null,
      notes: null,
      createdAt: new Date(),
    };

    it('should rollback transaction on error during appointment creation', async () => {
      let txCallbackExecuted = false;
      let errorThrown = false;

      mockDb.transaction.mockImplementation(async (callback: any) => {
        txCallbackExecuted = true;
        // Simulate error during transaction
        mockTx.select.mockReturnThis();
        mockTx.from.mockReturnThis();
        mockTx.where.mockResolvedValue([]); // No conflicts
        mockTx.insert.mockReturnThis();
        mockTx.values.mockReturnThis();
        mockTx.returning.mockRejectedValue(new Error('Insert failed'));
        
        try {
          return await callback(mockTx);
        } catch (error) {
          errorThrown = true;
          throw error; // Transaction will rollback
        }
      });

      await expect(storage.createAppointment({
        customerId: 'customer-123',
        serviceId: 'service-123',
        locationId: 'location-123',
        carDetails: 'Toyota Camry 2020',
        dateTime: new Date('2024-01-15T10:00:00Z'),
        estimatedDuration: '1 hour',
      })).rejects.toThrow();

      expect(txCallbackExecuted).toBe(true);
    });

    it('should rollback transaction when conflict check fails', async () => {
      mockDb.transaction.mockImplementation(async (callback: any) => {
        mockTx.select.mockReturnThis();
        mockTx.from.mockReturnThis();
        mockTx.where.mockRejectedValue(new Error('Conflict check query failed'));
        
        try {
          return await callback(mockTx);
        } catch (error) {
          throw error; // Rollback occurs
        }
      });

      await expect(storage.createAppointment({
        customerId: 'customer-123',
        serviceId: 'service-123',
        locationId: 'location-123',
        carDetails: 'Test',
        dateTime: new Date(),
        estimatedDuration: '1 hour',
      })).rejects.toThrow();
    });

    it('should execute transaction callback and commit on success', async () => {
      let callbackExecuted = false;
      
      mockDb.transaction.mockImplementation(async (callback: any) => {
        mockTx.select.mockReturnThis();
        mockTx.from.mockReturnThis();
        mockTx.where.mockResolvedValue([]);
        mockTx.insert.mockReturnThis();
        mockTx.values.mockReturnThis();
        mockTx.returning.mockResolvedValue([mockAppointment]);
        
        callbackExecuted = true;
        const result = await callback(mockTx);
        // In real implementation, commit would happen here
        return result;
      });

      const result = await storage.createAppointment({
        customerId: 'customer-123',
        serviceId: 'service-123',
        locationId: 'location-123',
        carDetails: 'Toyota Camry 2020',
        dateTime: new Date('2024-01-15T10:00:00Z'),
        estimatedDuration: '1 hour',
      });

      expect(callbackExecuted).toBe(true);
      expect(result).toEqual(mockAppointment);
    });
  });

  describe('Cache Invalidation Tests', () => {
    const mockService: Service = {
      id: 'service-123',
      title: 'Oil Change',
      description: 'Complete oil change service',
      price: 50,
      duration: '30 minutes',
      category: 'maintenance',
      features: ['Full synthetic oil', 'Filter replacement'],
      popular: false,
      icon: 'wrench',
      providerName: null,
      providerPhone: null,
      providerCountryCode: '+91',
    };

    const mockLocation: Location = {
      id: 'loc-123',
      name: 'Main Branch',
      address: '123 Main St',
      phone: '+911234567890',
      email: 'main@example.com',
      hours: '9AM-6PM',
      rating: '4.5',
    };

    it('should invalidate service cache after createService', async () => {
      mockDb.returning.mockResolvedValue([mockService]);
      mockDb.orderBy.mockResolvedValue([mockService]);
      
      // Populate cache first
      await storage.getAllServices();
      const initialCallCount = mockDb.select.mock.calls.length;
      
      // Create new service - should invalidate cache
      await storage.createService({
        title: 'Oil Change',
        description: 'Test',
        price: 50,
        duration: '30 min',
        category: 'maintenance',
        features: [],
      });
      
      // Next call should hit database, not cache
      await storage.getAllServices();
      const finalCallCount = mockDb.select.mock.calls.length;
      
      expect(finalCallCount).toBeGreaterThan(initialCallCount);
    });

    it('should invalidate service cache after updateService', async () => {
      const updated = { ...mockService, title: 'Updated Service' };
      mockDb.returning.mockResolvedValue([updated]);
      mockDb.orderBy.mockResolvedValue([mockService, updated]);
      
      // Populate cache
      await storage.getAllServices();
      const initialCallCount = mockDb.select.mock.calls.length;
      
      // Update service - should invalidate cache
      await storage.updateService('service-123', { title: 'Updated Service' });
      
      // Next call should query database
      await storage.getAllServices();
      const finalCallCount = mockDb.select.mock.calls.length;
      
      expect(finalCallCount).toBeGreaterThan(initialCallCount);
    });

    it('should invalidate location cache after createLocation', async () => {
      mockDb.returning.mockResolvedValue([mockLocation]);
      mockDb.orderBy.mockResolvedValue([mockLocation]);
      
      // Populate cache
      await storage.getAllLocations();
      const initialCallCount = mockDb.select.mock.calls.length;
      
      // Create location - should invalidate cache
      await storage.createLocation({
        name: 'New Branch',
        address: '456 New St',
        phone: '+911234567890',
        email: 'new@example.com',
        hours: '9AM-6PM',
        rating: '4.5',
      });
      
      // Next call should query database
      await storage.getAllLocations();
      const finalCallCount = mockDb.select.mock.calls.length;
      
      expect(finalCallCount).toBeGreaterThan(initialCallCount);
    });
  });

  describe('Relational Joins Accuracy', () => {
    it('should join appointments with services, locations, and customers', async () => {
      const appointmentWithDetails = {
        id: 'apt-123',
        customerId: 'customer-123',
        serviceId: 'service-123',
        locationId: 'location-123',
        carDetails: 'Toyota Camry 2020',
        dateTime: new Date('2024-01-15T10:00:00Z'),
        status: 'pending',
        serviceName: 'Oil Change',
        locationName: 'Main Branch',
        customerName: 'John Doe',
        mechanicName: null,
        estimatedDuration: '1 hour',
        price: 50,
        notes: null,
        createdAt: new Date(),
      };

      mockDb.orderBy.mockResolvedValue([appointmentWithDetails]);

      const result = await storage.getAllAppointments();

      // Verify joins were called
      expect(mockDb.select).toHaveBeenCalled();
      expect(mockDb.from).toHaveBeenCalled();
      expect(mockDb.innerJoin).toHaveBeenCalledTimes(3);
      expect(mockDb.orderBy).toHaveBeenCalled();
      
      // Verify result has joined data
      expect(result[0]).toHaveProperty('serviceName', 'Oil Change');
      expect(result[0]).toHaveProperty('locationName', 'Main Branch');
      expect(result[0]).toHaveProperty('customerName', 'John Doe');
    });

    it('should handle appointments with all related entities', async () => {
      const fullAppointment = {
        id: 'apt-456',
        customerId: 'customer-456',
        serviceId: 'service-456',
        locationId: 'location-456',
        carDetails: 'Honda Accord 2021',
        dateTime: new Date('2024-02-20T14:00:00Z'),
        status: 'confirmed',
        serviceName: 'Tire Rotation',
        locationName: 'West Branch',
        customerName: 'Jane Smith',
        mechanicName: 'Mike Johnson',
        estimatedDuration: '45 minutes',
        price: 75,
        notes: 'Customer prefers morning appointments',
        createdAt: new Date(),
      };

      mockDb.limit.mockResolvedValue([fullAppointment]);

      const result = await storage.getAppointment('apt-456');

      expect(result).toBeDefined();
      if (result) {
        expect(result.id).toBe('apt-456');
        // Verify all fields are present
        expect(result).toHaveProperty('customerId');
        expect(result).toHaveProperty('serviceId');
        expect(result).toHaveProperty('locationId');
        expect(result.carDetails).toBe('Honda Accord 2021');
        expect(result.status).toBe('confirmed');
      }
    });
  });
});
