import type { Express } from "express";
import { createServer, type Server } from "http";
import session from "express-session";
import express from "express";
import { getStorage } from "./storage";
import { 
  insertServiceSchema,
  insertAppointmentSchema,
  insertCarSchema,
  insertCustomerSchema,
  insertContactSchema,
  insertLocationSchema,
  registerSchema,
  serverRegisterSchema,
  loginSchema,
  rescheduleAppointmentSchema,
  placeBidSchema,
  mobileRegisterSchema,
  verifyOtpSchema,
  sendOtpSchema,
  updateProfileSchema
} from "@shared/schema";
import { fromZodError } from "zod-validation-error";
import { hashPassword, verifyPassword, passport } from "./auth";
import { EmailNotificationService } from "./email-service";
import { OTPService } from "./otp-service";
import { WhatsAppService } from "./whatsapp-service";
import { ImageService, profileUpload, carUpload, IMAGE_CONFIG } from "./image-service";
import path from "path";

// Centralized error handling types
interface DatabaseError extends Error {
  code?: string;
  constraint?: string;
  detail?: string;
}

// Enhanced error handler function with sanitized database errors
function handleDatabaseError(error: DatabaseError, operation: string) {
  console.error(`Database error during ${operation}:`, error);
  
  // Handle specific PostgreSQL error codes with user-friendly messages (no internal details)
  switch (error.code) {
    case '23505': // Unique constraint violation
      return {
        status: 409,
        message: `This ${operation} conflicts with existing data. Please check for duplicates.`
      };
    case '23503': // Foreign key constraint violation  
      return {
        status: 400,
        message: `Invalid reference in ${operation}. Referenced data does not exist.`
      };
    case '23502': // Not null constraint violation
      return {
        status: 400,
        message: `Missing required field in ${operation}. All required fields must be provided.`
      };
    case '22001': // String data too long
      return {
        status: 400,
        message: `Data too long for ${operation}. Please reduce the length of your input.`
      };
    default:
      return {
        status: 500,
        message: `Database error occurred during ${operation}. Please try again later.`
      };
  }
}

// Enhanced error response handler with consistent response shape
function handleApiError(error: any, operation: string, res: any) {
  // Handle Zod validation errors
  if (error && typeof error === "object" && "name" in error && error.name === "ZodError") {
    const errorMessage = fromZodError(error).toString();
    console.error(`[VALIDATION ERROR] ${operation}:`, errorMessage);
    return res.status(400).json({ 
      message: "Validation failed",
      errors: errorMessage
    });
  }
  
  // Handle database errors
  if (error && (error.code || error.constraint)) {
    const dbError = handleDatabaseError(error as DatabaseError, operation);
    return res.status(dbError.status).json({ message: dbError.message });
  }
  
  // Handle custom errors with status codes
  if (error && error.status) {
    return res.status(error.status).json({ 
      message: error.message || `Failed to ${operation}` 
    });
  }
  
  // Generic server error
  console.error(`Unexpected error during ${operation}:`, error);
  return res.status(500).json({ 
    message: `Failed to ${operation}. Please try again later.` 
  });
}

// Standardized async route wrapper for consistent error handling
function asyncRoute(operation: string, handler: Function) {
  return async (req: any, res: any, next: any) => {
    try {
      await handler(req, res, next);
    } catch (error) {
      handleApiError(error, operation, res);
    }
  };
}

// Helper wrapper to ensure storage is available for each route
function withStorage<T extends any[]>(
  handler: (storage: Awaited<ReturnType<typeof getStorage>>, ...args: T) => Promise<any>
) {
  return async (...args: T) => {
    try {
      const storage = await getStorage();
      return await handler(storage, ...args);
    } catch (error) {
      console.error('Storage connection error:', error);
      // Don't throw - let the asyncRoute wrapper handle the error properly
      return Promise.reject({
        status: 500,
        message: 'Database connection failed. Please try again later.'
      });
    }
  };
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Session middleware
  // Note: SESSION_SECRET is validated at startup - no fallback needed
  app.use(session({
    secret: process.env.SESSION_SECRET!,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax",
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
  }));

  // Passport middleware
  app.use(passport.initialize());
  app.use(passport.session());
  
  // CSRF Protection Middleware for state-changing requests
  const csrfProtection = (req: any, res: any, next: any) => {
    // Only protect state-changing methods
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      return next();
    }
    
    // Skip CSRF only for Google OAuth routes (they use state parameter protection)
    // Note: paths are relative to /api mount point
    const skipRoutes = [
      '/auth/google',
      '/auth/google/callback'
    ];
    
    if (skipRoutes.some(route => req.path.startsWith(route))) {
      console.log(`[CSRF] Skipping CSRF protection for OAuth route: ${req.path}`);
      return next();
    }
    
    // Additional Origin/Referer validation for critical auth routes  
    // Note: req.path is relative to mount point, so use '/auth/login' not '/api/auth/login'
    if (['/auth/login', '/auth/register'].includes(req.path)) {
      const origin = req.headers.origin;
      const referer = req.headers.referer;
      // More robust protocol detection for development environments
      const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
      const host = req.get('host');
      const expectedOrigin = `${protocol}://${host}`;
      
      console.log(`[CSRF] Auth route: ${req.path}`);
      console.log(`[CSRF] Origin: ${origin}, Referer: ${referer}`);
      console.log(`[CSRF] Expected origin: ${expectedOrigin}`);
      
      if (!origin && !referer) {
        console.log(`[CSRF] REJECTED: Missing origin/referer for ${req.path}`);
        return res.status(403).json({ message: "CSRF protection: Missing origin/referer header" });
      }
      
      if (origin && origin !== expectedOrigin) {
        console.log(`[CSRF] REJECTED: Invalid origin ${origin} (expected ${expectedOrigin}) for ${req.path}`);
        return res.status(403).json({ message: "CSRF protection: Invalid origin" });
      }
      
      if (referer && !referer.startsWith(expectedOrigin)) {
        console.log(`[CSRF] REJECTED: Invalid referer ${referer} (expected to start with ${expectedOrigin}) for ${req.path}`);
        return res.status(403).json({ message: "CSRF protection: Invalid referer" });
      }
      
      console.log(`[CSRF] PASSED: Auth route ${req.path} passed origin/referer validation`);
      return next();
    }
    
    // Require custom header for API calls (SPA CSRF protection)
    // Check for the header with case-insensitive lookup
    const customHeader = req.headers['x-csrf-protection'];
    if (!customHeader || customHeader !== 'ronak-garage') {
      console.log(`[CSRF] REJECTED: Missing/invalid security header for ${req.path}. Got: "${customHeader}"`);
      console.log(`[CSRF] Available headers:`, Object.keys(req.headers).filter(h => h.toLowerCase().includes('csrf')));
      return res.status(403).json({ 
        message: "CSRF protection: Missing or invalid security header" 
      });
    }
    
    console.log(`[CSRF] PASSED: API route ${req.path} passed security header validation`);
    next();
  };
  
  // Apply CSRF protection to all API routes
  app.use('/api', csrfProtection);

  // Authentication Routes
  app.post("/api/auth/register", async (req, res) => {
    try {
      const validatedData = serverRegisterSchema.parse(req.body);
      const storage = await getStorage();

      // Check if user already exists
      const existingUser = await storage.getUserByEmail(validatedData.email);
      if (existingUser) {
        return res.status(409).json({ message: "User already exists with this email" });
      }

      // Hash password and create user
      const hashedPassword = await hashPassword(validatedData.password);
      const user = await storage.createUser({
        email: validatedData.email,
        name: validatedData.name,
        password: hashedPassword,
        provider: "email",
        emailVerified: false
      });

      // Session fixation mitigation: regenerate session before auto-login after registration
      req.session.regenerate((err) => {
        if (err) {
          console.error("Session regeneration failed during registration:", err);
          return res.status(500).json({ message: "Registration successful but session setup failed. Please log in manually." });
        }
        
        // Log the user in immediately after registration
        req.login(user, (err) => {
          if (err) {
            console.error("Login after registration failed:", err);
            return res.status(500).json({ message: "Registration successful but failed to log in. Please try logging in manually." });
          }
          
          // Don't return password in response
          const { password, ...userResponse } = user;
          res.status(201).json({ 
            message: "Account created and logged in successfully",
            user: userResponse
          });
        });
      });
    } catch (error) {
      handleApiError(error, "register user", res);
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const validatedData = loginSchema.parse(req.body);
      const storage = await getStorage();

      // Find user by email
      const user = await storage.getUserByEmail(validatedData.email);
      if (!user || !user.password) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      // Verify password
      const isValidPassword = await verifyPassword(validatedData.password, user.password);
      if (!isValidPassword) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      // Session fixation mitigation: regenerate session before login
      req.session.regenerate((err) => {
        if (err) {
          console.error("Session regeneration failed:", err);
          return res.status(500).json({ message: "Session setup failed. Please try again." });
        }
        
        // Login user via passport after session regeneration
        req.login(user, (err) => {
          if (err) {
            console.error("Passport login error:", err.message);
            
            // More specific login session errors
            if (err.message?.includes('session')) {
              return res.status(500).json({ message: "Session creation failed. Please try again." });
            }
            
            if (err.message?.includes('serialize')) {
              return res.status(500).json({ message: "Login processing error. Please clear your cookies and try again." });
            }
            
            return res.status(500).json({ message: "Login failed. Please try again later." });
          }
          
          const { password, ...userResponse } = user;
          res.json({ 
            message: "Login successful",
            user: userResponse
          });
        });
      });
    } catch (error) {
      // unified-error-handler
      handleApiError(error, "log in", res);
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    req.logout((err) => {
      if (err) {
        return res.status(500).json({ message: "Logout failed" });
      }
      res.json({ message: "Logout successful" });
    });
  });

  // Google OAuth routes
  app.get("/api/auth/google", passport.authenticate("google", {
    scope: ["profile", "email"]
  }));

  app.get("/api/auth/google/callback", 
    passport.authenticate("google", { failureRedirect: "/login?error=oauth_failed" }),
    (req, res) => {
      // Successful authentication, redirect to dashboard or home
      res.redirect("/?login=success");
    }
  );

  // Get current user
  app.get("/api/auth/me", (req, res) => {
    if (req.user) {
      const { password, ...userResponse } = req.user as any;
      res.json({ user: userResponse });
    } else {
      res.status(401).json({ message: "Not authenticated" });
    }
  });

  // Get available auth providers
  app.get("/api/auth/providers", (req, res) => {
    const providers = ["email"]; // Email auth is always available
    
    // Check if Google OAuth is configured
    if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
      providers.push("google");
    }
    
    res.json({ providers });
  });

  // Mobile Registration Routes
  app.post("/api/auth/mobile/send-otp", asyncRoute("send mobile OTP", async (req: any, res: any) => {
    // Validate request data using sendOtpSchema
    const validationResult = sendOtpSchema.safeParse(req.body);
    
    if (!validationResult.success) {
      return res.status(400).json({
        message: "Validation failed",
        errors: fromZodError(validationResult.error).toString()
      });
    }

    const { phone, countryCode, purpose } = validationResult.data;
    const result = await OTPService.sendOTP(phone, countryCode, purpose);
    
    if (result.success) {
      res.json({
        message: "OTP sent successfully",
        expiresIn: result.expiresIn
      });
    } else {
      res.status(400).json({
        message: result.message,
        attempts: result.attempts,
        maxAttempts: result.maxAttempts
      });
    }
  }));

  app.post("/api/auth/mobile/verify-otp", asyncRoute("verify mobile OTP", async (req: any, res: any) => {
    // Validate request data using the updated schema with purpose
    const validationResult = verifyOtpSchema.safeParse(req.body);
    
    if (!validationResult.success) {
      return res.status(400).json({
        message: "Validation failed",
        errors: fromZodError(validationResult.error).toString()
      });
    }

    const { phone, countryCode, otpCode, purpose } = validationResult.data;
    const storage = await getStorage();

    // Verify OTP with the correct purpose
    const result = await OTPService.verifyOTP(phone, countryCode, otpCode, purpose);
    
    if (!result.success) {
      return res.status(400).json({
        message: result.message,
        attempts: result.attempts,
        maxAttempts: result.maxAttempts,
        expired: result.expired
      });
    }

    // OTP verified successfully - handle different purposes
    if (purpose === "login") {
      // For login: find existing user and establish session
      const user = await storage.getUserByPhone(phone, countryCode);
      
      if (!user) {
        return res.status(404).json({ 
          message: "No account found with this phone number. Please register first." 
        });
      }

      // Session fixation mitigation: regenerate session before mobile login
      req.session.regenerate((sessionErr: any) => {
        if (sessionErr) {
          console.error("Session regeneration failed for mobile login:", sessionErr);
          return res.status(500).json({ 
            message: "OTP verified but session setup failed. Please try again." 
          });
        }
        
        // Log the user in via passport after session regeneration
        req.login(user, (loginErr: any) => {
          if (loginErr) {
            console.error("Login after mobile OTP verification failed:", loginErr);
            
            // More specific login session errors
            if (loginErr.message?.includes('session')) {
              return res.status(500).json({ 
                message: "Session creation failed. Please try again." 
              });
            }
            
            if (loginErr.message?.includes('serialize')) {
              return res.status(500).json({ 
                message: "Login processing error. Please clear your cookies and try again." 
              });
            }
            
            return res.status(500).json({ 
              message: "Login failed. Please try again later." 
            });
          }
          
          const { password, ...userResponse } = user;
          res.json({ 
            message: "Login successful",
            user: userResponse
          });
        });
      });
    } else {
      // For registration and password_reset: just verify OTP
      res.json({ 
        message: "OTP verified successfully. Please complete registration.",
        verified: true
      });
    }
  }));

  // Complete mobile registration with profile data
  app.post("/api/auth/mobile/register", asyncRoute("complete mobile registration", async (req: any, res: any) => {
    // Validate request data using schema
    const validationResult = mobileRegisterSchema.safeParse(req.body);
    
    if (!validationResult.success) {
      return res.status(400).json({
        message: "Validation failed",
        errors: fromZodError(validationResult.error).toString()
      });
    }

    const {
      phone,
      countryCode,
      name,
      email,
      dateOfBirth,
      registrationNumbers,
      profileImage,
      address,
      city,
      state,
      zipCode
    } = validationResult.data;

    const storage = await getStorage();
    
    // Check if user already exists with this phone number
    let user = await storage.getUserByPhone(phone, countryCode);
    
    if (user) {
      // User exists, just log them in and update profile if needed
      if (email || dateOfBirth || registrationNumbers || profileImage || address || city || state || zipCode) {
        // Update profile with new data
        const updateData: any = {};
        if (email) updateData.email = email;
        if (dateOfBirth) updateData.dateOfBirth = new Date(dateOfBirth);
        if (registrationNumbers) updateData.registrationNumbers = registrationNumbers;
        if (profileImage) updateData.profileImage = profileImage;
        if (address) updateData.address = address;
        if (city) updateData.city = city;
        if (state) updateData.state = state;
        if (zipCode) updateData.zipCode = zipCode;
        
        user = await storage.updateUser(user.id, updateData);
      }
      
      // Session fixation mitigation: regenerate session before mobile login (existing user)
      req.session.regenerate((sessionErr: any) => {
        if (sessionErr) {
          console.error("Session regeneration failed for mobile user:", sessionErr);
          return res.status(500).json({ message: "Profile updated but session setup failed. Please log in manually." });
        }
        
        req.login(user!, async (err: any) => {
          if (err) {
            console.error("Login after mobile registration failed:", err);
            return res.status(500).json({ 
              message: "Registration completed but login failed. Please try logging in." 
            });
          }
        
        // Send welcome WhatsApp message for new registrations
        try {
          if (user!.phone && user!.countryCode) {
            const welcomeResult = await WhatsAppService.sendWelcomeMessage(
              user!.phone,
              user!.countryCode,
              user!.name
            );
            
            if (welcomeResult.success) {
              console.log(`[REGISTRATION] Welcome WhatsApp sent to ${user!.countryCode}${user!.phone}`);
            } else {
              console.error(`[REGISTRATION] Welcome WhatsApp failed: ${welcomeResult.error}`);
            }
          }
        } catch (welcomeError: any) {
          console.error(`[REGISTRATION] Welcome message error: ${welcomeError.message}`);
        }
        
          const { password, ...userResponse } = user!;
          res.json({ 
            message: "Profile updated and logged in successfully",
            user: userResponse
          });
        });
      });
    } else {
      // Create new user with complete profile
      const userData: any = {
        phone,
        countryCode,
        phoneVerified: true,
        name,
        provider: "mobile",
        role: "customer"
      };
      
      if (email) userData.email = email;
      if (dateOfBirth) userData.dateOfBirth = new Date(dateOfBirth);
      if (registrationNumbers) userData.registrationNumbers = registrationNumbers;
      if (profileImage) userData.profileImage = profileImage;
      if (address) userData.address = address;
      if (city) userData.city = city;
      if (state) userData.state = state;
      if (zipCode) userData.zipCode = zipCode;

      const newUser = await storage.createUser(userData);

      // Session fixation mitigation: regenerate session before mobile login (new user)
      req.session.regenerate((sessionErr: any) => {
        if (sessionErr) {
          console.error("Session regeneration failed for new mobile user:", sessionErr);
          return res.status(500).json({ message: "Account created but session setup failed. Please log in manually." });
        }
        
        req.login(newUser, async (err: any) => {
          if (err) {
            console.error("Login after mobile registration failed:", err);
            return res.status(500).json({ 
              message: "Account created but login failed. Please try logging in." 
            });
          }
        
        // Send welcome WhatsApp message for new registrations
        try {
          if (newUser.phone && newUser.countryCode) {
            const welcomeResult = await WhatsAppService.sendWelcomeMessage(
              newUser.phone,
              newUser.countryCode,
              newUser.name
            );
            
            if (welcomeResult.success) {
              console.log(`[REGISTRATION] Welcome WhatsApp sent to ${newUser.countryCode}${newUser.phone}`);
            } else {
              console.error(`[REGISTRATION] Welcome WhatsApp failed: ${welcomeResult.error}`);
            }
          }
        } catch (welcomeError: any) {
          console.error(`[REGISTRATION] Welcome message error: ${welcomeError.message}`);
        }
        
          const { password, ...userResponse } = newUser;
          res.status(201).json({ 
            message: "Account created and logged in successfully",
            user: userResponse
          });
        });
      });
    }
  }));

  // Authentication middleware for protected routes
  const requireAuth = (req: any, res: any, next: any) => {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required" });
    }
    next();
  };

  // Get user profile
  app.get("/api/profile", requireAuth, asyncRoute("get user profile", async (req: any, res: any) => {
    const { password, ...userProfile } = req.user;
    res.json({ user: userProfile });
  }));

  // Update user profile
  app.patch("/api/profile", requireAuth, asyncRoute("update user profile", async (req: any, res: any) => {
    const validationResult = updateProfileSchema.safeParse(req.body);
    
    if (!validationResult.success) {
      return res.status(400).json({
        message: "Validation failed",
        errors: fromZodError(validationResult.error).toString()
      });
    }

    const updateData: any = { ...validationResult.data };
    const storage = await getStorage();
    
    // Convert dateOfBirth to Date if provided
    if (updateData.dateOfBirth) {
      updateData.dateOfBirth = new Date(updateData.dateOfBirth);
    }

    const updatedUser = await storage.updateUser(req.user.id, updateData);
    const { password, ...userResponse } = updatedUser!;
    
    res.json({ 
      message: "Profile updated successfully",
      user: userResponse 
    });
  }));

  // WhatsApp Messaging Routes
  app.post("/api/whatsapp/send-confirmation", requireAuth, asyncRoute("send WhatsApp confirmation", async (req: any, res: any) => {
    const { phone, countryCode, appointmentData, appointmentId } = req.body;
    
    // Validate required fields
    if (!phone || !countryCode || !appointmentData) {
      return res.status(400).json({ 
        message: "Phone number, country code, and appointment data are required" 
      });
    }

    // Validate phone number format
    const validation = WhatsAppService.validateWhatsAppNumber(phone, countryCode);
    if (!validation.valid) {
      return res.status(400).json({ message: validation.message });
    }

    const result = await WhatsAppService.sendAppointmentConfirmation(
      phone, 
      countryCode, 
      appointmentData,
      appointmentId
    );
    
    if (result.success) {
      res.json({
        message: "WhatsApp confirmation sent successfully",
        messageSid: result.messageSid
      });
    } else {
      res.status(500).json({
        message: result.message,
        error: result.error
      });
    }
  }));

  app.post("/api/whatsapp/send-status-update", requireAuth, asyncRoute("send WhatsApp status update", async (req: any, res: any) => {
    const { phone, countryCode, statusData, appointmentId } = req.body;
    
    if (!phone || !countryCode || !statusData) {
      return res.status(400).json({ 
        message: "Phone number, country code, and status data are required" 
      });
    }

    const result = await WhatsAppService.sendStatusUpdate(
      phone, 
      countryCode, 
      statusData,
      appointmentId
    );
    
    if (result.success) {
      res.json({
        message: "WhatsApp status update sent successfully",
        messageSid: result.messageSid
      });
    } else {
      res.status(500).json({
        message: result.message,
        error: result.error
      });
    }
  }));

  app.post("/api/whatsapp/send-bid-notification", requireAuth, asyncRoute("send WhatsApp bid notification", async (req: any, res: any) => {
    const { phone, countryCode, bidData } = req.body;
    
    if (!phone || !countryCode || !bidData) {
      return res.status(400).json({ 
        message: "Phone number, country code, and bid data are required" 
      });
    }

    const result = await WhatsAppService.sendBidNotification(
      phone, 
      countryCode, 
      bidData
    );
    
    if (result.success) {
      res.json({
        message: "WhatsApp bid notification sent successfully",
        messageSid: result.messageSid
      });
    } else {
      res.status(500).json({
        message: result.message,
        error: result.error
      });
    }
  }));

  app.get("/api/whatsapp/history/:phone", requireAuth, asyncRoute("get WhatsApp message history", async (req: any, res: any) => {
    const { phone } = req.params;
    const limit = parseInt(req.query.limit as string) || 20;
    
    if (!phone) {
      return res.status(400).json({ message: "Phone number is required" });
    }

    const history = await WhatsAppService.getMessageHistory(phone, limit);
    res.json({ 
      messages: history,
      count: history.length 
    });
  }));

  // Admin authorization middleware
  const requireAdmin = (req: any, res: any, next: any) => {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required" });
    }
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    next();
  };

  // Admin user management API
  app.get("/api/admin/users/count", requireAdmin, asyncRoute("get user count", async (req: any, res: any) => {
    const storage = await getStorage();
    const count = await storage.getUserCount();
    res.json({ count });
  }));

  app.get("/api/admin/users", requireAdmin, asyncRoute("get all users", async (req: any, res: any) => {
    const storage = await getStorage();
    const offset = parseInt(req.query.offset as string) || 0;
    const limit = parseInt(req.query.limit as string) || 100;
    
    const users = await storage.getAllUsers(offset, limit);
    // Remove passwords from response for security
    const safeUsers = users.map(({ password, ...user }) => user);
    
    res.json({ 
      users: safeUsers,
      offset,
      limit,
      hasMore: users.length === limit
    });
  }));

  // Services API
  app.get("/api/services", asyncRoute("fetch services", async (req: any, res: any) => {
    const storage = await getStorage();
    const services = await storage.getAllServices();
    res.json(services);
  }));

  app.get("/api/services/category/:category", asyncRoute("fetch services by category", async (req: any, res: any) => {
    const { category } = req.params;
    const storage = await getStorage();
    const services = await storage.getServicesByCategory(category);
    res.json(services);
  }));

  app.get("/api/services/:id", asyncRoute("fetch service", async (req: any, res: any) => {
    const { id } = req.params;
    const storage = await getStorage();
    const service = await storage.getService(id);
    
    if (!service) {
      return res.status(404).json({ message: "Service not found" });
    }
    
    res.json(service);
  }));

  app.post("/api/services", requireAdmin, async (req, res) => {
    try {
      const storage = await getStorage();
      const validatedData = insertServiceSchema.parse(req.body);
      const service = await storage.createService(validatedData);
      res.status(201).json(service);
    } catch (error) {
      // unified-error-handler
      handleApiError(error, "create service", res);
    }
  });

  // Update service (admin only)
  app.put("/api/services/:id", requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const storage = await getStorage();
      
      // Check if service exists
      const existingService = await storage.getService(id);
      if (!existingService) {
        return res.status(404).json({ message: "Service not found" });
      }
      
      // Validate update data (allow partial updates)
      const validatedData = insertServiceSchema.partial().parse(req.body);
      const updatedService = await storage.updateService(id, validatedData);
      
      if (!updatedService) {
        return res.status(500).json({ message: "Failed to update service" });
      }
      
      res.json(updatedService);
    } catch (error) {
      // unified-error-handler
      handleApiError(error, "update service", res);
    }
  });

  // Delete service (admin only)
  app.delete("/api/services/:id", requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const storage = await getStorage();
      
      // Check if service exists
      const existingService = await storage.getService(id);
      if (!existingService) {
        return res.status(404).json({ message: "Service not found" });
      }
      
      // Check if service is used in any appointments
      const appointments = await storage.getAppointmentsByService(id);
      if (appointments && appointments.length > 0) {
        return res.status(400).json({ 
          message: "Cannot delete service with existing appointments. Please cancel or complete all appointments first." 
        });
      }
      
      await storage.deleteService(id);
      res.status(204).send();
    } catch (error) {
      // unified-error-handler
      handleApiError(error, "delete service", res);
    }
  });

  // Customers API
  app.post("/api/customers", requireAuth, async (req: any, res: any) => {
    try {
      const storage = await getStorage();
      const user = req.user as any;
      
      // Security: Always enforce userId to authenticated user, prevent mass-assignment
      const requestData = { ...req.body, userId: user.id };
      const validatedData = insertCustomerSchema.parse(requestData);
      const customer = await storage.createCustomer(validatedData);
      res.status(201).json(customer);
    } catch (error) {
      // unified-error-handler
      handleApiError(error, "create customer", res);
    }
  });

  // REMOVED: GET /api/customers/email/:email - Email enumeration vulnerability
  // Secure replacement: authenticated customer lookup/creation for current user only
  app.post("/api/customers/ensure-own", requireAuth, async (req: any, res: any) => {
    try {
      const user = req.user as any;
      const storage = await getStorage();
      
      // First try to find existing customer by userId (preferred method)
      let customer = await storage.getCustomerByUserId(user.id);
      
      // Fall back to finding by email for backward compatibility
      if (!customer) {
        customer = await storage.getCustomerByEmail(user.email);
        
        // If found by email but userId is missing, backfill the relationship
        if (customer && !customer.userId) {
          try {
            const updatedCustomer = await storage.updateCustomer(customer.id, { userId: user.id });
            customer = updatedCustomer || customer; // Use updated version if successful
          } catch (error) {
            // If update fails (e.g., due to unique constraint), continue with existing customer
            console.warn("Failed to backfill userId for customer", customer.id, error);
          }
        }
      }
      
      if (!customer) {
        // Customer doesn't exist, create one linked to the authenticated user
        const customerData = {
          userId: user.id, // Link to user account
          name: user.name || "User",
          email: user.email,
          phone: user.phone || "Not provided", // Use user's phone if available
          countryCode: user.countryCode || "+91"
        };
        
        const validatedData = insertCustomerSchema.parse(customerData);
        customer = await storage.createCustomer(validatedData);
      }
      
      res.json(customer);
    } catch (error) {
      handleApiError(error, "ensure customer", res);
    }
  });

  // Customer by User endpoint - needed for frontend appointment queries
  app.get("/api/customer/by-user/:userId", requireAuth, asyncRoute("get customer by user ID", async (req: any, res: any) => {
    const { userId } = req.params;
    const user = req.user as any;
    
    // Authorization: user can only access their own customer record
    if (user.id !== userId) {
      return res.status(403).json({ message: "Unauthorized: You can only access your own customer information" });
    }
    
    const storage = await getStorage();
    const customer = await storage.getCustomerByUserId(userId);
    
    // Return customer data or null if not found (don't return 404, just null)
    res.json(customer || null);
  }));

  // Admin Routes - must be defined before other appointment routes
  app.get("/api/admin/appointments", requireAdmin, asyncRoute("fetch all appointments for admin", async (req: any, res: any) => {
    const storage = await getStorage();
    const appointments = await storage.getAllAppointments();
    res.json(appointments);
  }));

  app.patch("/api/admin/appointments/:id/status", requireAdmin, asyncRoute("update appointment status as admin", async (req: any, res: any) => {
    const { id } = req.params;
    const { status } = req.body;
    
    if (!["pending", "confirmed", "in-progress", "completed", "cancelled"].includes(status)) {
      return res.status(400).json({ message: "Invalid status value" });
    }
    
    const storage = await getStorage();
    const success = await storage.updateAppointmentStatus(id, status);
    
    if (!success) {
      return res.status(404).json({ message: "Appointment not found" });
    }
    
    res.json({ message: "Appointment status updated successfully" });
  }));

  // Conflict checking endpoint
  app.post("/api/appointments/check-conflict", requireAuth, asyncRoute("check appointment conflict", async (req: any, res: any) => {
    const { locationId, dateTime } = req.body;
    
    if (!locationId || !dateTime) {
      return res.status(400).json({ 
        message: "locationId and dateTime are required" 
      });
    }
    
    const storage = await getStorage();
    const hasConflict = await storage.checkAppointmentConflict(
      locationId, 
      new Date(dateTime)
    );
    
    res.json({ hasConflict });
  }));

  // Appointments API
  app.get("/api/appointments/customer/:customerId", requireAuth, asyncRoute("fetch customer appointments", async (req: any, res: any) => {
    const { customerId } = req.params;
    const user = req.user as any;
    const storage = await getStorage();
    
    // Verify the customer exists
    const customer = await storage.getCustomer(customerId);
    if (!customer) {
      return res.status(404).json({ message: "Customer not found" });
    }
    
    // Ownership validation: user can only access their own appointments  
    // Use direct user ID relationship instead of fragile email comparison
    if (customer.userId !== user.id) {
      return res.status(403).json({ 
        message: "Unauthorized: You can only access your own appointments" 
      });
    }
    
    const appointments = await storage.getAppointmentsByCustomer(customerId);
    res.json(appointments);
  }));

  app.post("/api/appointments", requireAuth, asyncRoute("create appointment", async (req: any, res: any) => {
    try {
      const storage = await getStorage();
      const user = req.user as any;
      const validatedData = insertAppointmentSchema.parse(req.body);
      
      // Ensure customer record exists for the authenticated user
      let customer = await storage.getCustomerByUserId(user.id);
      if (!customer) {
        // Customer doesn't exist, create one linked to the authenticated user
        const customerData = {
          userId: user.id, // Link to user account
          name: user.name || "User",
          email: user.email || `user-${user.id}@example.com`, // Fallback email if none
          phone: user.phone || "Not provided", // Use user's phone if available
          countryCode: user.countryCode || "+91"
        };
        
        const validatedCustomerData = insertCustomerSchema.parse(customerData);
        customer = await storage.createCustomer(validatedCustomerData);
      }
      
      // Ensure the appointment uses the correct customer ID
      const appointmentWithCustomer = {
        ...validatedData,
        customerId: customer.id
      };
      
      const appointment = await storage.createAppointment(appointmentWithCustomer);
      
      // Send appointment confirmation notifications asynchronously (non-blocking)
      try {
        const customer = await storage.getCustomer(appointment.customerId);
        const service = await storage.getService(appointment.serviceId);
        const location = await storage.getLocation(appointment.locationId);
        
        if (customer && service && location) {
          const appointmentData = {
            customerName: customer.name,
            serviceName: service.title,
            dateTime: new Date(appointment.dateTime).toLocaleString('en-IN'),
            location: location.name,
            carDetails: appointment.carDetails,
            mechanicName: appointment.mechanicName || undefined,
            price: appointment.price || undefined,
            bookingId: appointment.id
          };

          // Send email confirmation
          EmailNotificationService.sendAppointmentConfirmationAsync(customer.email, appointmentData);
          console.log(`[APPOINTMENT] Confirmation email queued for ${customer.email}`);
          
          // Send WhatsApp confirmation if customer has phone number
          if (customer.phone && customer.countryCode) {
            // Send WhatsApp confirmation asynchronously
            WhatsAppService.sendAppointmentConfirmation(
              customer.phone,
              customer.countryCode,
              appointmentData,
              appointment.id
            ).then((result) => {
              if (result.success) {
                console.log(`[APPOINTMENT] WhatsApp confirmation sent to ${customer.countryCode}${customer.phone}`);
              } else {
                console.error(`[APPOINTMENT] WhatsApp confirmation failed: ${result.error}`);
              }
            }).catch((error) => {
              console.error(`[APPOINTMENT] WhatsApp confirmation error: ${error.message}`);
            });
          } else {
            console.log("[APPOINTMENT] No phone number available for WhatsApp confirmation");
          }

          // Send WhatsApp notification to service provider if contact info is available
          if (service.providerPhone && service.providerCountryCode) {
            const serviceProviderData = {
              providerName: service.providerName || service.title,
              customerName: customer.name,
              serviceName: service.title,
              dateTime: new Date(appointment.dateTime).toLocaleString('en-IN'),
              location: location.name,
              carDetails: appointment.carDetails,
              bookingId: appointment.id,
              customerPhone: customer.phone ? `${customer.countryCode}${customer.phone}` : undefined,
              price: appointment.price || undefined
            };

            // Send WhatsApp notification to service provider asynchronously
            WhatsAppService.sendServiceProviderBookingNotification(
              service.providerPhone,
              service.providerCountryCode,
              serviceProviderData,
              appointment.id
            ).then((result) => {
              if (result.success) {
                console.log(`[APPOINTMENT] Service provider notification sent to ${service.providerCountryCode}${service.providerPhone}`);
              } else {
                console.error(`[APPOINTMENT] Service provider notification failed: ${result.error}`);
              }
            }).catch((error) => {
              console.error(`[APPOINTMENT] Service provider notification error: ${error.message}`);
            });
          } else {
            console.log("[APPOINTMENT] No service provider contact information available for WhatsApp notification");
          }
        } else {
          console.error("[APPOINTMENT] Missing customer, service, or location data for notifications");
        }
      } catch (notificationError: any) {
        console.error(`[APPOINTMENT] Notification setup failed: ${notificationError.message}`);
      }
      
      // Return appointment immediately without waiting for email
      res.status(201).json(appointment);
    } catch (error) {
      // unified-error-handler
      handleApiError(error, "create appointment", res);
    }
  }));

  app.patch("/api/appointments/:id/status", requireAuth, asyncRoute("update appointment status", async (req: any, res: any) => {
    const { id } = req.params;
    const { status } = req.body;
    
    // Validate status is provided
    if (!status || typeof status !== "string") {
      return res.status(400).json({ message: "Status is required" });
    }
    
    // Validate status is one of allowed values
    const allowedStatuses = ["pending", "confirmed", "in-progress", "completed", "cancelled"];
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ 
        message: `Invalid status. Allowed values: ${allowedStatuses.join(", ")}` 
      });
    }
    
    const storage = await getStorage();
    const user = req.user as any;
    
    // Get current appointment to validate status transition and ownership
    const currentAppointment = await storage.getAppointment(id);
    if (!currentAppointment) {
      return res.status(404).json({ message: "Appointment not found" });
    }
    
    // Check ownership - user must own the appointment or be admin
    // Use direct user ID relationship instead of fragile email comparison
    const customer = await storage.getCustomer(currentAppointment.customerId);
    if (!customer || customer.userId !== user.id) {
      return res.status(403).json({ 
        message: "Unauthorized: You can only update your own appointments" 
      });
    }
    
    // Validate status transition is logical
    const validTransitions: { [key: string]: string[] } = {
      "pending": ["confirmed", "cancelled"],
      "confirmed": ["in-progress", "cancelled"],
      "in-progress": ["completed", "cancelled"],
      "completed": [], // Final state
      "cancelled": []  // Final state
    };
    
    if (!validTransitions[currentAppointment.status]?.includes(status)) {
      return res.status(400).json({ 
        message: `Invalid status transition from '${currentAppointment.status}' to '${status}'` 
      });
    }
    
    // Atomic conflict checking is now handled in storage layer for "confirmed" status
    const updatedAppointment = await storage.updateAppointmentStatus(id, status);
    
    // Send notifications for status updates with feedback
    let statusEmailSent = false;
    let statusWhatsAppSent = false;
    try {
      const service = await storage.getService(updatedAppointment!.serviceId);
      const location = await storage.getLocation(updatedAppointment!.locationId);
      
      if (customer && service && location) {
        const statusData = {
          customerName: customer.name,
          serviceName: service.title,
          dateTime: new Date(updatedAppointment!.dateTime).toLocaleString('en-IN'),
          location: location.name,
          carDetails: updatedAppointment!.carDetails,
          mechanicName: updatedAppointment!.mechanicName || undefined,
          price: updatedAppointment!.price || undefined,
          status: status,
          bookingId: updatedAppointment!.id
        };

        // Send email notification
        statusEmailSent = await EmailNotificationService.sendAppointmentStatusUpdate(customer.email, statusData);
        
        if (!statusEmailSent) {
          console.error("Email service unavailable for status update notification");
        }

        // Send WhatsApp status update if customer has phone number
        if (customer.phone && customer.countryCode) {
          try {
            const whatsappResult = await WhatsAppService.sendStatusUpdate(
              customer.phone,
              customer.countryCode,
              statusData,
              updatedAppointment!.id
            );
            statusWhatsAppSent = whatsappResult.success;
            
            if (statusWhatsAppSent) {
              console.log(`[STATUS] WhatsApp update sent to ${customer.countryCode}${customer.phone}`);
            } else {
              console.error(`[STATUS] WhatsApp update failed: ${whatsappResult.error}`);
            }
          } catch (whatsappError: any) {
            console.error(`[STATUS] WhatsApp update error: ${whatsappError.message}`);
            statusWhatsAppSent = false;
          }
        } else {
          console.log("[STATUS] No phone number available for WhatsApp update");
        }
      }
    } catch (notificationError: any) {
      console.error("Failed to send status update notifications:", notificationError.message);
      statusEmailSent = false;
      statusWhatsAppSent = false;
    }
    
    res.json({
      message: "Appointment status updated successfully",
      appointment: updatedAppointment,
      notifications: {
        email: {
          sent: statusEmailSent,
          message: statusEmailSent 
            ? "Status update email sent successfully"
            : "Status updated but notification email could not be sent"
        },
        whatsapp: {
          sent: statusWhatsAppSent,
          message: statusWhatsAppSent
            ? "Status update WhatsApp message sent successfully"
            : customer?.phone && customer?.countryCode
              ? "Status updated but WhatsApp message could not be sent"
              : "No phone number available for WhatsApp notification"
        }
      }
    });
  }));

  // Reschedule appointment with full security and validation
  app.patch("/api/appointments/:id/reschedule", requireAuth, asyncRoute("reschedule appointment", async (req: any, res: any) => {
    try {
      const { id } = req.params;
      const user = req.user as any;
      
      // Validate the reschedule payload
      const validationResult = rescheduleAppointmentSchema.safeParse(req.body);
      if (!validationResult.success) {
        const errorMessages = validationResult.error.errors.map(err => err.message).join(", ");
        return res.status(400).json({ 
          message: "Validation failed", 
          errors: errorMessages 
        });
      }
      
      const { dateTime, locationId } = validationResult.data;
      const storage = await getStorage();
      
      // Check if appointment exists
      const appointment = await storage.getAppointment(id);
      if (!appointment) {
        return res.status(404).json({ message: "Appointment not found" });
      }
      
      // Authorization: Check if user owns the appointment or has admin role
      // Admin users can reschedule any appointment, regular users can only reschedule their own
      const customer = await storage.getCustomer(appointment.customerId);
      
      // Check if user is admin
      const isAdmin = user.role === 'admin';
      
      // Allow if user is admin OR if user owns the appointment (via user ID relationship)
      if (!isAdmin && (!customer || customer.userId !== user.id)) {
        return res.status(403).json({ message: "You can only reschedule your own appointments" });
      }
      
      // Verify appointment is in a reschedulable state
      if (appointment.status !== "confirmed") {
        return res.status(400).json({ 
          message: `Cannot reschedule appointment with status '${appointment.status}'. Only confirmed appointments can be rescheduled.` 
        });
      }
      
      // Verify the location exists
      const location = await storage.getLocation(locationId);
      if (!location) {
        return res.status(400).json({ message: "Invalid location ID. The specified location does not exist." });
      }
      
      // Check for appointment conflicts at the new time slot
      const hasConflict = await storage.checkAppointmentConflict(
        locationId, 
        new Date(dateTime), 
        id // exclude current appointment from conflict check
      );
      
      if (hasConflict) {
        return res.status(409).json({ 
          message: "Time slot conflict. Another appointment is already scheduled at this location and time. Please choose a different time." 
        });
      }
      
      // All checks passed - perform the reschedule
      const rescheduledAppointment = await storage.rescheduleAppointment(id, dateTime, locationId);
      if (!rescheduledAppointment) {
        return res.status(500).json({ message: "Failed to update appointment. Please try again." });
      }
      
      res.json({
        message: "Appointment rescheduled successfully",
        appointment: rescheduledAppointment
      });
      
    } catch (error) {
      console.error("Reschedule appointment error:", error);
      if (error && typeof error === "object" && "name" in error && error.name === "ZodError") {
        res.status(400).json({ message: fromZodError(error as any).toString() });
      } else {
        res.status(500).json({ message: "Failed to reschedule appointment. Please try again." });
      }
    }
  }));

  // Cars API
  app.get("/api/cars", async (req, res) => {
    try {
      const storage = await getStorage();
      const cars = await storage.getAllCars();
      res.json(cars);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch cars" });
    }
  });

  app.get("/api/cars/sale", async (req, res) => {
    try {
      const storage = await getStorage();
      const cars = await storage.getCarsForSale();
      res.json(cars);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch cars for sale" });
    }
  });

  app.get("/api/cars/auctions", async (req, res) => {
    try {
      const storage = await getStorage();
      const cars = await storage.getAuctionCars();
      res.json(cars);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch auction cars" });
    }
  });

  app.get("/api/cars/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const storage = await getStorage();
      const car = await storage.getCar(id);
      if (!car) {
        return res.status(404).json({ message: "Car not found" });
      }
      res.json(car);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch car" });
    }
  });

  app.post("/api/cars", requireAuth, async (req: any, res: any) => {
    try {
      const storage = await getStorage();
      const validatedData = insertCarSchema.parse(req.body);
      const car = await storage.createCar(validatedData);
      res.status(201).json(car);
    } catch (error) {
      if (error && typeof error === "object" && "name" in error && error.name === "ZodError") {
        res.status(400).json({ message: fromZodError(error as any).toString() });
      } else {
        res.status(500).json({ message: "Failed to create car" });
      }
    }
  });

  // Bid endpoints - RE-ENABLED
  app.post("/api/cars/:carId/bids", requireAuth, async (req, res) => {
    try {
      const { carId } = req.params;
      const user = req.user as any;
      const storage = await getStorage();
      
      // Validate the bid payload
      const validationResult = placeBidSchema.safeParse({ ...req.body, carId });
      if (!validationResult.success) {
        const errorMessages = validationResult.error.errors.map(err => err.message).join(", ");
        return res.status(400).json({ 
          message: "Validation failed", 
          errors: errorMessages 
        });
      }
      
      const { bidAmount } = validationResult.data;
      
      // Check if car exists and is auction
      const car = await storage.getCar(carId);
      if (!car) {
        return res.status(404).json({ message: "Car not found" });
      }
      
      if (!car.isAuction) {
        return res.status(400).json({ message: "This car is not available for auction" });
      }
      
      // Check if auction is still active
      if (car.auctionEndTime && new Date() > new Date(car.auctionEndTime)) {
        return res.status(400).json({ message: "Auction has ended" });
      }
      
      // Check if bid is higher than current bid
      const currentHighestBid = await storage.getHighestBidForCar(carId);
      const minimumBid = currentHighestBid ? currentHighestBid.bidAmount + 1000 : car.price;
      
      if (bidAmount < minimumBid) {
        return res.status(400).json({ 
          message: `Bid must be at least ₹${minimumBid.toLocaleString('en-IN')}` 
        });
      }
      
      // Place the bid
      const bid = await storage.placeBid({
        carId,
        bidderEmail: user.email,
        bidAmount
      });
      
      // Update car's current bid
      await storage.updateCarCurrentBid(carId, bidAmount);
      
      // Send bid confirmation WhatsApp message asynchronously (non-blocking)
      setImmediate(async () => {
        try {
          const carDetails = `${car.make} ${car.model} ${car.year}`;
          
          // Find current bidder (new highest bidder) and send confirmation
          const currentBidder = await storage.getCustomerByEmail(user.email);
          
          if (currentBidder && currentBidder.phone && currentBidder.countryCode) {
            const result = await WhatsAppService.sendBidNotification(
              currentBidder.phone,
              currentBidder.countryCode,
              {
                customerName: currentBidder.name,
                carDetails: carDetails,
                bidAmount: bidAmount,
                bidId: bid.id
              }
            );
            
            if (result.success) {
              console.log(`[BID] WhatsApp confirmation sent to bidder ${currentBidder.countryCode}${currentBidder.phone}`);
            } else {
              console.error(`[BID] WhatsApp confirmation failed: ${result.error}`);
            }
          } else {
            console.log("[BID] No phone number available for WhatsApp confirmation");
          }
          
        } catch (notificationError: any) {
          console.error(`[BID] WhatsApp notification failed: ${notificationError.message}`);
        }
      });
      
      res.status(201).json({
        message: "Bid placed successfully",
        bid
      });
      
    } catch (error) {
      console.error("Place bid error:", error);
      if (error && typeof error === "object" && "name" in error && error.name === "ZodError") {
        res.status(400).json({ message: fromZodError(error as any).toString() });
      } else {
        res.status(500).json({ message: "Failed to place bid" });
      }
    }
  });

  app.get("/api/cars/:carId/bids", async (req, res) => {
    try {
      const { carId } = req.params;
      const storage = await getStorage();
      
      // Check if car exists
      const car = await storage.getCar(carId);
      if (!car) {
        return res.status(404).json({ message: "Car not found" });
      }
      
      // Get all bids for the car
      const bids = await storage.getBidsForCar(carId);
      res.json(bids);
      
    } catch (error) {
      console.error("Get bids error:", error);
      res.status(500).json({ message: "Failed to fetch bids" });
    }
  });

  // Contacts API
  app.post("/api/contacts", requireAuth, async (req: any, res: any) => {
    try {
      const storage = await getStorage();
      const validatedData = insertContactSchema.parse(req.body);
      const contact = await storage.createContact(validatedData);
      res.status(201).json(contact);
    } catch (error) {
      if (error && typeof error === "object" && "name" in error && error.name === "ZodError") {
        res.status(400).json({ message: fromZodError(error as any).toString() });
      } else {
        res.status(500).json({ message: "Failed to create contact" });
      }
    }
  });

  // Locations API
  app.get("/api/locations", async (req: any, res: any) => {
    try {
      const storage = await getStorage();
      const locations = await storage.getAllLocations();
      res.json(locations);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch locations" });
    }
  });

  app.post("/api/locations", requireAdmin, async (req: any, res: any) => {
    try {
      const storage = await getStorage();
      const validatedData = insertLocationSchema.parse(req.body);
      const location = await storage.createLocation(validatedData);
      res.status(201).json(location);
    } catch (error) {
      if (error && typeof error === "object" && "name" in error && error.name === "ZodError") {
        res.status(400).json({ message: fromZodError(error as any).toString() });
      } else {
        res.status(500).json({ message: "Failed to create location" });
      }
    }
  });

  // Image Upload Routes
  
  // Upload profile image
  app.post("/api/upload/profile", requireAuth, profileUpload.single('profileImage'), asyncRoute("upload profile image", async (req: any, res: any) => {
    const storage = await getStorage();
    const user = req.user;
    
    if (!req.file) {
      return res.status(400).json({ message: "No image file provided" });
    }

    const inputPath = req.file.path;
    const filename = `profile-${user.id}-${Date.now()}.jpg`;
    const outputPath = path.join('public/uploads/profiles', filename);
    const thumbnailPath = path.join('public/uploads/thumbs', `thumb-${filename}`);

    try {
      // Validate the uploaded image
      const isValid = await ImageService.validateImage(inputPath);
      if (!isValid) {
        await ImageService.deleteImage(inputPath);
        return res.status(400).json({ message: "Invalid image file. Please upload a valid image." });
      }

      // Process the image
      await ImageService.processProfileImage(inputPath, outputPath);
      await ImageService.createThumbnail(outputPath, thumbnailPath);

      // Update user profile with image URL
      const imageUrl = ImageService.generateImageUrl(filename, 'profiles');
      await storage.updateUser(user.id, { profileImage: imageUrl });

      // Clean up original uploaded file
      await ImageService.deleteImage(inputPath);

      res.json({ 
        message: "Profile image uploaded successfully",
        imageUrl: imageUrl
      });
    } catch (error) {
      // Clean up files on error
      await ImageService.deleteImage(inputPath);
      await ImageService.deleteImage(outputPath);
      await ImageService.deleteImage(thumbnailPath);
      // Don't throw - let asyncRoute handle error properly
      console.error('Profile image upload error:', error);
      return res.status(500).json({
        message: 'Profile image upload failed. Please try again later.'
      });
    }
  }));

  // Upload car image
  app.post("/api/upload/car", requireAuth, carUpload.single('carImage'), asyncRoute("upload car image", async (req: any, res: any) => {
    if (!req.file) {
      return res.status(400).json({ message: "No image file provided" });
    }

    const inputPath = req.file.path;
    const filename = `car-${Date.now()}-${Math.round(Math.random() * 1E9)}.jpg`;
    const outputPath = path.join('public/uploads/cars', filename);
    const thumbnailPath = path.join('public/uploads/thumbs', `thumb-${filename}`);

    try {
      // Validate the uploaded image
      const isValid = await ImageService.validateImage(inputPath);
      if (!isValid) {
        await ImageService.deleteImage(inputPath);
        return res.status(400).json({ message: "Invalid image file. Please upload a valid image." });
      }

      // Process the image
      await ImageService.processCarImage(inputPath, outputPath);
      await ImageService.createThumbnail(outputPath, thumbnailPath);

      // Clean up original uploaded file
      await ImageService.deleteImage(inputPath);

      const imageUrl = ImageService.generateImageUrl(filename, 'cars');
      
      res.json({ 
        message: "Car image uploaded successfully",
        imageUrl: imageUrl,
        filename: filename
      });
    } catch (error) {
      // Clean up files on error
      await ImageService.deleteImage(inputPath);
      await ImageService.deleteImage(outputPath);
      await ImageService.deleteImage(thumbnailPath);
      // Don't throw - let asyncRoute handle error properly
      console.error('Car image upload error:', error);
      return res.status(500).json({
        message: 'Car image upload failed. Please try again later.'
      });
    }
  }));

  // Serve uploaded images
  app.use('/uploads', express.static(path.join(process.cwd(), 'public/uploads')));

  // Delete image (admin only)
  app.delete("/api/upload/:type/:filename", requireAdmin, asyncRoute("delete image", async (req: any, res: any) => {
    const { type, filename } = req.params;
    
    if (!['profiles', 'cars'].includes(type)) {
      return res.status(400).json({ message: "Invalid image type" });
    }

    const imagePath = path.join('public/uploads', type, filename);
    const thumbnailPath = path.join('public/uploads/thumbs', `thumb-${filename}`);

    try {
      await ImageService.deleteImage(imagePath);
      await ImageService.deleteImage(thumbnailPath);
      
      res.json({ message: "Image deleted successfully" });
    } catch (error) {
      console.warn("Error deleting image:", error);
      res.json({ message: "Image deletion completed (some files may not have existed)" });
    }
  }));

  // New CRUD endpoints

  // Delete appointment (auth + ownership or admin)
  app.delete("/api/appointments/:id", requireAuth, asyncRoute("delete appointment", async (req: any, res: any) => {
    const { id } = req.params;
    const user = req.user as any;
    const storage = await getStorage();

    // Check if appointment exists
    const appointment = await storage.getAppointment(id);
    if (!appointment) {
      return res.status(404).json({ message: "Appointment not found" });
    }

    // Check ownership (user can delete their own appointments, or admin can delete any)
    if (user.role !== "admin") {
      const customer = await storage.getCustomer(appointment.customerId);
      if (!customer || customer.userId !== user.id) {
        return res.status(403).json({ 
          message: "Unauthorized: You can only delete your own appointments" 
        });
      }
    }

    const success = await storage.deleteAppointment(id);
    if (!success) {
      return res.status(500).json({ message: "Failed to delete appointment" });
    }

    res.status(204).send();
  }));

  // Update car (admin only since no ownership model)
  app.put("/api/cars/:id", requireAdmin, asyncRoute("update car", async (req: any, res: any) => {
    const { id } = req.params;
    const storage = await getStorage();

    // Check if car exists
    const existingCar = await storage.getCar(id);
    if (!existingCar) {
      return res.status(404).json({ message: "Car not found" });
    }

    // Validate update data (insertCarSchema already excludes id and createdAt)
    const validatedData = insertCarSchema.partial().parse(req.body);
    const updatedCar = await storage.updateCar(id, validatedData);

    if (!updatedCar) {
      return res.status(500).json({ message: "Failed to update car" });
    }

    res.json(updatedCar);
  }));

  // Delete car (admin only since no ownership model)
  app.delete("/api/cars/:id", requireAdmin, asyncRoute("delete car", async (req: any, res: any) => {
    const { id } = req.params;
    const storage = await getStorage();

    // Check if car exists
    const existingCar = await storage.getCar(id);
    if (!existingCar) {
      return res.status(404).json({ message: "Car not found" });
    }

    // Check if car has active bids (prevent deletion of cars with bids)
    const bids = await storage.getBidsForCar(id);
    if (bids && bids.length > 0) {
      return res.status(400).json({ 
        message: "Cannot delete car with existing bids. Please resolve all bids first." 
      });
    }

    const success = await storage.deleteCar(id);
    if (!success) {
      return res.status(500).json({ message: "Failed to delete car" });
    }

    res.status(204).send();
  }));

  // Get customer by ID (auth + ownership or admin)
  app.get("/api/customers/:id", requireAuth, asyncRoute("get customer by ID", async (req: any, res: any) => {
    const { id } = req.params;
    const user = req.user as any;
    const storage = await getStorage();

    const customer = await storage.getCustomer(id);
    if (!customer) {
      return res.status(404).json({ message: "Customer not found" });
    }

    // Check ownership (user can access their own customer record, or admin can access any)
    if (user.role !== "admin" && customer.userId !== user.id) {
      return res.status(403).json({ 
        message: "Unauthorized: You can only access your own customer information" 
      });
    }

    res.json(customer);
  }));

  // Update customer (auth + ownership)
  app.put("/api/customers/:id", requireAuth, asyncRoute("update customer", async (req: any, res: any) => {
    const { id } = req.params;
    const user = req.user as any;
    const storage = await getStorage();

    // Check if customer exists
    const existingCustomer = await storage.getCustomer(id);
    if (!existingCustomer) {
      return res.status(404).json({ message: "Customer not found" });
    }

    // Check ownership (user can only update their own customer record)
    if (existingCustomer.userId !== user.id) {
      return res.status(403).json({ 
        message: "Unauthorized: You can only update your own customer information" 
      });
    }

    // Validate update data with field whitelisting (prevent userId changes, id/createdAt already excluded by schema)
    const validatedData = insertCustomerSchema.omit({ userId: true }).partial().parse(req.body);

    const updatedCustomer = await storage.updateCustomer(id, validatedData);

    if (!updatedCustomer) {
      return res.status(500).json({ message: "Failed to update customer" });
    }

    res.json(updatedCustomer);
  }));

  // Test endpoint to verify database connection
  app.get("/api/health", async (req, res) => {
    try {
      // Try to fetch services to test storage connection
      const storage = await getStorage();
      await storage.getAllServices();
      res.json({ status: "ok", message: "Storage connected successfully" });
    } catch (error) {
      res.status(500).json({ status: "error", message: "Storage connection failed" });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
