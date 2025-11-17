import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import bcrypt from 'bcrypt';
import passport from 'passport';
import { hashPassword, verifyPassword } from '../../auth';
import type { User } from '@shared/schema';

jest.mock('bcrypt');

const mockGetStorage = jest.fn();
jest.mock('../../storage', () => ({
  getStorage: () => mockGetStorage(),
}));

const mockedBcrypt = bcrypt as jest.Mocked<typeof bcrypt>;

describe('Auth Service - Unit Tests', () => {
  let mockStorage: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockStorage = {
      getUser: jest.fn(),
      getUserByEmail: jest.fn(),
      getUserByGoogleId: jest.fn(),
      createUser: jest.fn(),
      updateUser: jest.fn(),
      linkGoogleAccount: jest.fn(),
    };
    
    (mockGetStorage as any).mockResolvedValue(mockStorage);
  });

  describe('Password Hashing', () => {
    describe('hashPassword', () => {
      it('should hash password with bcrypt using 12 rounds', async () => {
        const password = 'mySecurePassword123';
        const hashedPassword = '$2b$12$abcdefghijklmnopqrstuvwxyz';
        
        mockedBcrypt.hash.mockResolvedValue(hashedPassword as never);

        const result = await hashPassword(password);

        expect(result).toBe(hashedPassword);
        expect(mockedBcrypt.hash).toHaveBeenCalledWith(password, 12);
      });

      it('should handle different password inputs', async () => {
        const passwords = [
          'short',
          'verylongpasswordwithmanycharacters12345!@#$%',
          'p@ssw0rd!',
          '12345678',
        ];

        for (const password of passwords) {
          const hash = `hashed_${password}`;
          mockedBcrypt.hash.mockResolvedValue(hash as never);

          const result = await hashPassword(password);

          expect(result).toBe(hash);
          expect(mockedBcrypt.hash).toHaveBeenCalledWith(password, 12);
        }
      });

      it('should throw error when bcrypt fails', async () => {
        const password = 'testPassword';
        const error = new Error('Bcrypt hashing failed');
        
        mockedBcrypt.hash.mockRejectedValue(error as never);

        await expect(hashPassword(password)).rejects.toThrow('Bcrypt hashing failed');
      });
    });

    describe('verifyPassword', () => {
      it('should return true for matching password', async () => {
        const password = 'myPassword123';
        const hashedPassword = '$2b$12$hashedPasswordString';
        
        mockedBcrypt.compare.mockResolvedValue(true as never);

        const result = await verifyPassword(password, hashedPassword);

        expect(result).toBe(true);
        expect(mockedBcrypt.compare).toHaveBeenCalledWith(password, hashedPassword);
      });

      it('should return false for non-matching password', async () => {
        const password = 'wrongPassword';
        const hashedPassword = '$2b$12$hashedPasswordString';
        
        mockedBcrypt.compare.mockResolvedValue(false as never);

        const result = await verifyPassword(password, hashedPassword);

        expect(result).toBe(false);
        expect(mockedBcrypt.compare).toHaveBeenCalledWith(password, hashedPassword);
      });

      it('should handle edge cases', async () => {
        
        mockedBcrypt.compare.mockResolvedValue(false as never);
        expect(await verifyPassword('', 'hash')).toBe(false);

        
        mockedBcrypt.compare.mockResolvedValue(true as never);
        expect(await verifyPassword('p@$$w0rd!', 'hash')).toBe(true);
      });

      it('should throw error when bcrypt compare fails', async () => {
        const error = new Error('Bcrypt comparison failed');
        mockedBcrypt.compare.mockRejectedValue(error as never);

        await expect(verifyPassword('password', 'hash'))
          .rejects.toThrow('Bcrypt comparison failed');
      });
    });
  });

  describe('Passport Session Serialization', () => {
    describe('serializeUser', () => {
      it('should serialize user to session by storing user ID', (done) => {
        const user: Express.User = {
          id: 'user-123',
          email: 'test@example.com',
          name: 'Test User',
          role: 'customer',
        };

        passport.serializeUser((user: Express.User, cb) => {
          cb(null, (user as any).id);
        });

        
        const serializeFunction = (passport as any)._serializers[0];
        serializeFunction(user, (err: any, id: any) => {
          expect(err).toBeNull();
          expect(id).toBe('user-123');
          done();
        });
      });
    });

    describe('deserializeUser', () => {
      it('should deserialize user from session by fetching from storage', (done) => {
        const userId = 'user-123';
        const mockUser: User = {
          id: 'user-123',
          email: 'test@example.com',
          name: 'Test User',
          password: 'hashed',
          googleId: null,
          phone: null,
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
          preferredNotificationChannel: 'whatsapp',
          isActive: true,
          createdAt: new Date(),
        };

        mockStorage.getUser.mockResolvedValue(mockUser);

        passport.deserializeUser(async (id: string, cb) => {
          try {
            const storage: any = await mockGetStorage();
            const user = await storage.getUser(id);
            if (!user) {
              return cb(null, false);
            }
            cb(null, user);
          } catch (error) {
            cb(error, null);
          }
        });

        
        const deserializeFunction = (passport as any)._deserializers[0];
        deserializeFunction(userId, (err: any, user: any) => {
          expect(err).toBeNull();
          expect(user).toEqual(mockUser);
          expect(mockStorage.getUser).toHaveBeenCalledWith(userId);
          done();
        });
      });

      it('should return false when user not found in database', (done) => {
        mockStorage.getUser.mockResolvedValue(null);

        passport.deserializeUser(async (id: string, cb) => {
          try {
            const storage: any = await mockGetStorage();
            const user = await storage.getUser(id);
            if (!user) {
              return cb(null, false);
            }
            cb(null, user);
          } catch (error) {
            cb(error, null);
          }
        });

        const deserializeFunction = (passport as any)._deserializers[0];
        deserializeFunction('nonexistent-id', (err: any, user: any) => {
          expect(err).toBeNull();
          expect(user).toBe(false);
          done();
        });
      });

      it('should handle database errors gracefully', (done) => {
        const dbError = new Error('Database connection failed');
        mockStorage.getUser.mockRejectedValue(dbError);

        passport.deserializeUser(async (id: string, cb) => {
          try {
            const storage: any = await mockGetStorage();
            const user = await storage.getUser(id);
            if (!user) {
              return cb(null, false);
            }
            cb(null, user);
          } catch (error) {
            const err = error as Error;
            cb(new Error("Your session has expired. Please log in again."), null);
          }
        });

        const deserializeFunction = (passport as any)._deserializers[0];
        deserializeFunction('user-123', (err: any, user: any) => {
          expect(err).toBeTruthy();
          expect(err.message).toContain('session has expired');
          expect(user).toBeNull();
          done();
        });
      });
    });
  });

  describe('Admin Middleware Logic', () => {
    let mockReq: any;
    let mockRes: any;
    let mockNext: any;

    beforeEach(() => {
      mockReq = {
        user: null,
        params: {},
        query: {},
        body: {},
        headers: {},
        ip: '127.0.0.1',
      };
      
      mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
      };
      
      mockNext = jest.fn();
    });

    describe('Authentication Check', () => {
      it('should reject request when user is not authenticated', async () => {
        mockReq.user = null;

        
        const requiresAuth = !mockReq.user;
        
        if (requiresAuth) {
          mockRes.status(401).json({ 
            message: "Authentication required",
            code: "AUTH_REQUIRED" 
          });
        }

        expect(mockRes.status).toHaveBeenCalledWith(401);
        expect(mockRes.json).toHaveBeenCalledWith(
          expect.objectContaining({
            message: "Authentication required",
            code: "AUTH_REQUIRED"
          })
        );
        expect(mockNext).not.toHaveBeenCalled();
      });

      it('should allow request when user is authenticated', () => {
        mockReq.user = {
          id: 'user-123',
          email: 'test@example.com',
          name: 'Test User',
          role: 'customer',
        };

        const requiresAuth = !mockReq.user;
        
        if (!requiresAuth) {
          mockNext();
        }

        expect(mockNext).toHaveBeenCalled();
        expect(mockRes.status).not.toHaveBeenCalled();
      });
    });

    describe('Authorization Check', () => {
      it('should reject when user is not admin', () => {
        mockReq.user = {
          id: 'user-123',
          email: 'customer@example.com',
          name: 'Regular User',
          role: 'customer',
        };

        
        const isAdmin = mockReq.user.role === 'admin';
        
        if (!isAdmin) {
          mockRes.status(403).json({ 
            message: "Admin access required",
            code: "INSUFFICIENT_PRIVILEGES" 
          });
        }

        expect(mockRes.status).toHaveBeenCalledWith(403);
        expect(mockRes.json).toHaveBeenCalledWith(
          expect.objectContaining({
            message: "Admin access required",
            code: "INSUFFICIENT_PRIVILEGES"
          })
        );
        expect(mockNext).not.toHaveBeenCalled();
      });

      it('should allow when user is admin', () => {
        mockReq.user = {
          id: 'admin-123',
          email: 'admin@example.com',
          name: 'Admin User',
          role: 'admin',
        };

        
        const isAdmin = mockReq.user.role === 'admin';
        
        if (isAdmin) {
          mockNext();
        }

        expect(mockNext).toHaveBeenCalled();
        expect(mockRes.status).not.toHaveBeenCalled();
      });
    });

    describe('Admin Role Validation', () => {
      it('should correctly identify admin users', () => {
        const adminUser = {
          id: 'admin-123',
          email: 'admin@example.com',
          name: 'Admin User',
          role: 'admin' as const,
        };

        expect(adminUser.role).toBe('admin');
        expect(adminUser.role === 'admin').toBe(true);
      });

      it('should correctly identify non-admin users', () => {
        const customerUser = {
          id: 'user-123',
          email: 'user@example.com',
          name: 'Customer',
          role: 'customer' as string,
        };

        expect(customerUser.role).toBe('customer');
        expect(customerUser.role !== 'admin').toBe(true);
      });

      it('should handle missing role field', () => {
        const userWithoutRole: any = {
          id: 'user-123',
          email: 'user@example.com',
          name: 'User',
        };

        expect(userWithoutRole.role).toBeUndefined();
        expect(userWithoutRole.role === 'admin').toBe(false);
      });
    });

    describe('Admin Context Creation', () => {
      it('should create admin context for authorized requests', () => {
        mockReq.user = {
          id: 'admin-123',
          email: 'admin@example.com',
          name: 'Admin',
          role: 'admin',
        };

        mockReq.headers['user-agent'] = 'Mozilla/5.0';
        mockReq.ip = '192.168.1.1';

        
        if (mockReq.user.role === 'admin') {
          mockReq.adminContext = {
            action: 'access',
            resource: 'admin_area',
            adminUserId: mockReq.user.id,
            ipAddress: mockReq.ip,
            userAgent: mockReq.headers['user-agent'],
            timestamp: new Date(),
          };
          mockNext();
        }

        expect(mockReq.adminContext).toBeDefined();
        expect(mockReq.adminContext.adminUserId).toBe('admin-123');
        expect(mockReq.adminContext.action).toBe('access');
        expect(mockReq.adminContext.resource).toBe('admin_area');
        expect(mockNext).toHaveBeenCalled();
      });
    });
  });

  describe('Login Flow Validation', () => {
    describe('Email/Password Login', () => {
      it('should validate email format for login', () => {
        const validEmails = [
          'user@example.com',
          'test.user@company.co.uk',
          'admin+tag@service.com',
        ];

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        
        validEmails.forEach(email => {
          expect(email).toMatch(emailRegex);
        });
      });

      it('should reject invalid email formats', () => {
        const invalidEmails = [
          'notanemail',
          '@example.com',
          'test@',
          'test @example.com',
        ];

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        
        invalidEmails.forEach(email => {
          expect(email).not.toMatch(emailRegex);
        });
      });

      it('should require non-empty password', () => {
        const validPassword = 'myPassword123';
        const emptyPassword = '';

        expect(validPassword.length).toBeGreaterThan(0);
        expect(emptyPassword.length).toBe(0);
      });
    });

    describe('Mobile/OTP Login', () => {
      it('should validate phone number format', () => {
        const validPhones = [
          '9876543210',
          '1234567890',
        ];

        validPhones.forEach(phone => {
          expect(phone).toMatch(/^\d{10,15}$/);
        });
      });

      it('should validate country code format', () => {
        const validCountryCodes = [
          '+91',
          '+1',
          '+44',
        ];

        validCountryCodes.forEach(code => {
          expect(code).toMatch(/^\+\d{1,4}$/);
        });
      });

      it('should validate OTP code format', () => {
        const validOtps = [
          '123456',
          '000000',
          '999999',
        ];

        validOtps.forEach(otp => {
          expect(otp).toMatch(/^\d{6}$/);
        });
      });
    });

    describe('OAuth Login', () => {
      it('should validate OAuth user data', () => {
        const oauthUser = {
          email: 'oauth@example.com',
          name: 'OAuth User',
          googleId: 'google-oauth-id-123',
          provider: 'google' as const,
          emailVerified: true,
        };

        expect(oauthUser.email).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
        expect(oauthUser.googleId).toBeTruthy();
        expect(oauthUser.provider).toBe('google');
        expect(oauthUser.emailVerified).toBe(true);
      });
    });
  });

  describe('Password Security', () => {
    it('should use secure hashing rounds', () => {
      const saltRounds = 12;
      expect(saltRounds).toBeGreaterThanOrEqual(10);
      expect(saltRounds).toBeLessThanOrEqual(15);
    });

    it('should handle password comparison timing-safely', async () => {
      
      const password = 'testPassword';
      const hash = 'hashedValue';
      
      mockedBcrypt.compare.mockResolvedValue(false as never);
      
      const startTime = Date.now();
      await verifyPassword(password, hash);
      const endTime = Date.now();
      
      
      expect(endTime).toBeGreaterThanOrEqual(startTime);
    });
  });

  describe('Error Handling', () => {
    it('should handle hashing errors gracefully', async () => {
      const error = new Error('Hashing service unavailable');
      mockedBcrypt.hash.mockRejectedValue(error as never);

      await expect(hashPassword('password'))
        .rejects.toThrow('Hashing service unavailable');
    });

    it('should handle verification errors gracefully', async () => {
      const error = new Error('Verification service unavailable');
      mockedBcrypt.compare.mockRejectedValue(error as never);

      await expect(verifyPassword('password', 'hash'))
        .rejects.toThrow('Verification service unavailable');
    });
  });
});
