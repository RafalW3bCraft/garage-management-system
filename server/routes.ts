import type { Express } from "express";
import { createServer, type Server } from "http";
import { getStorage } from "./storage";
import { 
  insertServiceSchema,
  insertAppointmentSchema,
  insertCarSchema,
  insertCustomerSchema,
  insertContactSchema,
  insertLocationSchema
} from "@shared/schema";
import { fromZodError } from "zod-validation-error";

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
  // Services API
  app.get("/api/services", async (req, res) => {
    try {
      const storage = await getStorage();
      const services = await storage.getAllServices();
      res.json(services);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch services" });
    }
  });

  app.get("/api/services/category/:category", async (req, res) => {
    try {
      const { category } = req.params;
      const services = await storage.getServicesByCategory(category);
      res.json(services);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch services" });
    }
  });

  app.post("/api/services", async (req, res) => {
    try {
      const validatedData = insertServiceSchema.parse(req.body);
      const service = await storage.createService(validatedData);
      res.status(201).json(service);
    } catch (error) {
      if (error && typeof error === "object" && "name" in error && error.name === "ZodError") {
        res.status(400).json({ message: fromZodError(error as any).toString() });
      } else {
        res.status(500).json({ message: "Failed to create service" });
      }
    }
  });

  // Customers API
  app.post("/api/customers", async (req, res) => {
    try {
      const validatedData = insertCustomerSchema.parse(req.body);
      const customer = await storage.createCustomer(validatedData);
      res.status(201).json(customer);
    } catch (error) {
      if (error && typeof error === "object" && "name" in error && error.name === "ZodError") {
        res.status(400).json({ message: fromZodError(error as any).toString() });
      } else {
        res.status(500).json({ message: "Failed to create customer" });
      }
    }
  });

  app.get("/api/customers/email/:email", async (req, res) => {
    try {
      const { email } = req.params;
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
  app.get("/api/appointments/customer/:customerId", async (req, res) => {
    try {
      const { customerId } = req.params;
      const appointments = await storage.getAppointmentsByCustomer(customerId);
      res.json(appointments);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch appointments" });
    }
  });

  app.post("/api/appointments", async (req, res) => {
    try {
      const validatedData = insertAppointmentSchema.parse(req.body);
      const appointment = await storage.createAppointment(validatedData);
      res.status(201).json(appointment);
    } catch (error) {
      if (error && typeof error === "object" && "name" in error && error.name === "ZodError") {
        res.status(400).json({ message: fromZodError(error as any).toString() });
      } else {
        res.status(500).json({ message: "Failed to create appointment" });
      }
    }
  });

  app.patch("/api/appointments/:id/status", async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;
      
      if (!status || typeof status !== "string") {
        return res.status(400).json({ message: "Status is required" });
      }
      
      const appointment = await storage.updateAppointmentStatus(id, status);
      if (!appointment) {
        return res.status(404).json({ message: "Appointment not found" });
      }
      res.json(appointment);
    } catch (error) {
      res.status(500).json({ message: "Failed to update appointment status" });
    }
  });

  // Cars API
  app.get("/api/cars", async (req, res) => {
    try {
      const cars = await storage.getAllCars();
      res.json(cars);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch cars" });
    }
  });

  app.get("/api/cars/sale", async (req, res) => {
    try {
      const cars = await storage.getCarsForSale();
      res.json(cars);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch cars for sale" });
    }
  });

  app.get("/api/cars/auctions", async (req, res) => {
    try {
      const cars = await storage.getAuctionCars();
      res.json(cars);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch auction cars" });
    }
  });

  app.get("/api/cars/:id", async (req, res) => {
    try {
      const { id } = req.params;
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

  // Contacts API
  app.post("/api/contacts", async (req, res) => {
    try {
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
      const locations = await storage.getAllLocations();
      res.json(locations);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch locations" });
    }
  });

  app.post("/api/locations", async (req, res) => {
    try {
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
