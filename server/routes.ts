import type { Express } from "express";
import { createServer, type Server } from "http";
import session from "express-session";
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
  placeBidSchema
} from "@shared/schema";
import { fromZodError } from "zod-validation-error";
import { hashPassword, verifyPassword, passport } from "./auth";
import { EmailNotificationService } from "./email-service";

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
    return res.status(400).json({ 
      message: "Validation failed",
      errors: fromZodError(error).toString()
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
      console.error('Storage error:', error);
      throw error;
    }
  };
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Session middleware
  app.use(session({
    secret: process.env.SESSION_SECRET || "your-secret-key-change-in-production",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
  }));

  // Passport middleware
  app.use(passport.initialize());
  app.use(passport.session());

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

      // Login user via passport
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

  // Authentication middleware for protected routes
  const requireAuth = (req: any, res: any, next: any) => {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required" });
    }
    next();
  };

  // Services API
  app.get("/api/services", asyncRoute("fetch services", async (req, res) => {
    const storage = await getStorage();
    const services = await storage.getAllServices();
    res.json(services);
  }));

  app.get("/api/services/category/:category", asyncRoute("fetch services by category", async (req, res) => {
    const { category } = req.params;
    const storage = await getStorage();
    const services = await storage.getServicesByCategory(category);
    res.json(services);
  }));

  app.get("/api/services/:id", asyncRoute("fetch service", async (req, res) => {
    const { id } = req.params;
    const storage = await getStorage();
    const service = await storage.getService(id);
    
    if (!service) {
      return res.status(404).json({ message: "Service not found" });
    }
    
    res.json(service);
  }));

  app.post("/api/services", async (req, res) => {
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

  // Customers API
  app.post("/api/customers", async (req, res) => {
    try {
      const storage = await getStorage();
      const validatedData = insertCustomerSchema.parse(req.body);
      const customer = await storage.createCustomer(validatedData);
      res.status(201).json(customer);
    } catch (error) {
      // unified-error-handler
      handleApiError(error, "create customer", res);
    }
  });

  app.get("/api/customers/email/:email", async (req, res) => {
    try {
      const { email } = req.params;
      const storage = await getStorage();
      const customer = await storage.getCustomerByEmail(email);
      if (!customer) {
        return res.status(404).json({ message: "Customer not found" });
      }
      res.json(customer);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch customer" });
    }
  });

  // Appointments API
  app.get("/api/appointments/customer/:customerId", requireAuth, asyncRoute("fetch customer appointments", async (req, res) => {
    const { customerId } = req.params;
    const user = req.user as any;
    const storage = await getStorage();
    
    // Verify the customer exists
    const customer = await storage.getCustomer(customerId);
    if (!customer) {
      return res.status(404).json({ message: "Customer not found" });
    }
    
    // Ownership validation: user can only access their own appointments
    if (customer.email !== user.email) {
      return res.status(403).json({ 
        message: "Unauthorized: You can only access your own appointments" 
      });
    }
    
    const appointments = await storage.getAppointmentsByCustomer(customerId);
    res.json(appointments);
  }));

  app.post("/api/appointments", async (req, res) => {
    try {
      const storage = await getStorage();
      const validatedData = insertAppointmentSchema.parse(req.body);
      const appointment = await storage.createAppointment(validatedData);
      
      // Send appointment confirmation email with user feedback
      let emailStatus = "success";
      try {
        const customer = await storage.getCustomer(appointment.customerId);
        const service = await storage.getService(appointment.serviceId);
        const location = await storage.getLocation(appointment.locationId);
        
        if (customer && service && location) {
          const emailSent = await EmailNotificationService.sendAppointmentConfirmation(customer.email, {
            customerName: customer.name,
            serviceName: service.title,
            dateTime: new Date(appointment.dateTime).toLocaleString('en-IN'),
            location: location.name,
            carDetails: appointment.carDetails,
            mechanicName: appointment.mechanicName || undefined,
            price: appointment.price || undefined
          });
          
          if (!emailSent) {
            emailStatus = "failed";
            console.error("Email service unavailable for appointment confirmation");
          }
        } else {
          emailStatus = "missing_data";
          console.error("Missing customer, service, or location data for email");
        }
      } catch (emailError: any) {
        emailStatus = "error";
        console.error("Failed to send appointment confirmation email:", emailError.message);
      }
      
      // Include email status in response for better user feedback
      const response: any = {
        ...appointment,
        emailNotification: {
          status: emailStatus,
          message: emailStatus === "success" 
            ? "Confirmation email sent successfully"
            : emailStatus === "failed"
            ? "Appointment created but confirmation email could not be sent"
            : emailStatus === "missing_data"
            ? "Appointment created but email data incomplete"
            : "Appointment created but email service encountered an error"
        }
      };
      
      res.status(201).json(response);
    } catch (error) {
      // unified-error-handler
      handleApiError(error, "create appointment", res);
    }
  });

  app.patch("/api/appointments/:id/status", requireAuth, asyncRoute("update appointment status", async (req, res) => {
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
    // For now, checking if user's email matches customer email in appointment
    const customer = await storage.getCustomer(currentAppointment.customerId);
    if (!customer || customer.email !== user.email) {
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
    
    // Send email notification for status updates with feedback
    let statusEmailSent = false;
    try {
      const service = await storage.getService(updatedAppointment!.serviceId);
      const location = await storage.getLocation(updatedAppointment!.locationId);
      
      if (customer && service && location) {
        statusEmailSent = await EmailNotificationService.sendAppointmentStatusUpdate(customer.email, {
          customerName: customer.name,
          serviceName: service.title,
          dateTime: new Date(updatedAppointment!.dateTime).toLocaleString('en-IN'),
          location: location.name,
          carDetails: updatedAppointment!.carDetails,
          mechanicName: updatedAppointment!.mechanicName || undefined,
          price: updatedAppointment!.price || undefined,
          status: status
        });
        
        if (!statusEmailSent) {
          console.error("Email service unavailable for status update notification");
        }
      }
    } catch (emailError: any) {
      console.error("Failed to send status update email:", emailError.message);
      statusEmailSent = false;
    }
    
    res.json({
      message: "Appointment status updated successfully",
      appointment: updatedAppointment,
      emailNotification: {
        sent: statusEmailSent,
        message: statusEmailSent 
          ? "Status update email sent successfully"
          : "Status updated but notification email could not be sent"
      }
    });
  }));

  // Reschedule appointment with full security and validation
  app.patch("/api/appointments/:id/reschedule", requireAuth, async (req, res) => {
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
      
      // Authorization: Check if user owns the appointment (via customer email)
      // For now, we'll check if user's email matches a customer's email
      // In a full implementation, you'd have proper user-customer relationships
      const customer = await storage.getCustomer(appointment.customerId);
      if (!customer || customer.email !== user.email) {
        // Only allow users to reschedule their own appointments
        // TODO: Add admin role check here if needed
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
  });

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

  app.post("/api/cars", async (req, res) => {
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
  app.post("/api/contacts", async (req, res) => {
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
  app.get("/api/locations", async (req, res) => {
    try {
      const storage = await getStorage();
      const locations = await storage.getAllLocations();
      res.json(locations);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch locations" });
    }
  });

  app.post("/api/locations", async (req, res) => {
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
