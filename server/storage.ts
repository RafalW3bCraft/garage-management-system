import { 
  type User, 
  type InsertUser,
  type Service,
  type InsertService, 
  type Appointment,
  type InsertAppointment,
  type AppointmentWithDetails,
  type Car,
  type InsertCar,
  type Customer,
  type InsertCustomer,
  type Contact,
  type InsertContact,
  type Location,
  type InsertLocation,
  type Bid,
  type InsertBid,
  type OtpVerification,
  type InsertOtpVerification,
  type WhatsAppMessage,
  type InsertWhatsAppMessage,
  users,
  services,
  appointments,
  cars,
  customers,
  contacts,
  locations,
  bids,
  otpVerifications,
  whatsappMessages
} from "@shared/schema";
import { getDb } from "./db";
import { eq, and, desc, asc, gte, lte, ne, isNull, or, sql } from "drizzle-orm";
import { randomUUID } from "crypto";

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByGoogleId(googleId: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, updates: Partial<User>): Promise<User | undefined>;
  linkGoogleAccount(userId: string, googleId: string): Promise<User | undefined>;

  // Customers
  getCustomer(id: string): Promise<Customer | undefined>;
  getCustomerByEmail(email: string): Promise<Customer | undefined>;
  createCustomer(customer: InsertCustomer): Promise<Customer>;
  
  // Services
  getAllServices(): Promise<Service[]>;
  getService(id: string): Promise<Service | undefined>;
  getServicesByCategory(category: string): Promise<Service[]>;
  createService(service: InsertService): Promise<Service>;
  
  // Appointments
  getAllAppointments(): Promise<AppointmentWithDetails[]>;
  getAppointment(id: string): Promise<Appointment | undefined>;
  getAppointmentsByCustomer(customerId: string): Promise<AppointmentWithDetails[]>;
  createAppointment(appointment: InsertAppointment): Promise<Appointment>;
  updateAppointmentStatus(id: string, status: string): Promise<Appointment | undefined>;
  rescheduleAppointment(id: string, dateTime: string, locationId: string): Promise<Appointment | undefined>;
  checkAppointmentConflict(locationId: string, dateTime: Date, excludeAppointmentId?: string): Promise<boolean>;
  
  // Cars
  getAllCars(): Promise<Car[]>;
  getCar(id: string): Promise<Car | undefined>;
  getCarsForSale(): Promise<Car[]>;
  getAuctionCars(): Promise<Car[]>;
  createCar(car: InsertCar): Promise<Car>;
  
  // Contacts
  createContact(contact: InsertContact): Promise<Contact>;
  getAllContacts(): Promise<Contact[]>;
  
  // Locations
  getAllLocations(): Promise<Location[]>;
  getLocation(id: string): Promise<Location | undefined>;
  createLocation(location: InsertLocation): Promise<Location>;
  
  // Bids
  placeBid(bid: InsertBid): Promise<Bid>;
  getBidsForCar(carId: string): Promise<Bid[]>;
  getHighestBidForCar(carId: string): Promise<Bid | undefined>;
  updateCarCurrentBid(carId: string, bidAmount: number): Promise<Car | undefined>;

  // OTP Verification
  storeOTPVerification(otp: InsertOtpVerification): Promise<OtpVerification>;
  getActiveOtpVerification(phone: string, countryCode: string, purpose: string): Promise<OtpVerification | undefined>;
  incrementOtpAttempts(otpId: string): Promise<boolean>;
  markOtpAsVerified(otpId: string): Promise<boolean>;
  markOtpAsExpired(otpId: string): Promise<boolean>;
  expireAllActiveOtpsForTarget(phone: string, countryCode: string, purpose: string): Promise<number>;
  getRecentOtpAttempts(phone: string, countryCode: string, since: Date): Promise<OtpVerification[]>;
  cleanupExpiredOtps(cutoffDate: Date): Promise<number>;

  // Phone-based user operations
  getUserByPhone(phone: string, countryCode: string): Promise<User | undefined>;

  // WhatsApp Messages
  logWhatsAppMessage(message: InsertWhatsAppMessage): Promise<WhatsAppMessage>;
  getWhatsAppMessageHistory(phone: string, limit?: number): Promise<WhatsAppMessage[]>;
}

export class DatabaseStorage implements IStorage {
  // Users
  async getUser(id: string): Promise<User | undefined> {
    const db = await getDb();
    const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return result[0];
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const db = await getDb();
    const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
    return result[0];
  }

  async getUserByGoogleId(googleId: string): Promise<User | undefined> {
    const db = await getDb();
    const result = await db.select().from(users).where(eq(users.googleId, googleId)).limit(1);
    return result[0];
  }

  async createUser(user: InsertUser): Promise<User> {
    const db = await getDb();
    const result = await db.insert(users).values(user).returning();
    return result[0];
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User | undefined> {
    const db = await getDb();
    const result = await db.update(users)
      .set(updates)
      .where(eq(users.id, id))
      .returning();
    return result[0];
  }

  async linkGoogleAccount(userId: string, googleId: string): Promise<User | undefined> {
    const db = await getDb();
    try {
      // Atomic update with condition to prevent race conditions
      // Only update if the user exists and googleId is not already set
      const result = await db.update(users)
        .set({
          googleId,
          provider: "google",
          emailVerified: true
        })
        .where(and(
          eq(users.id, userId),
          isNull(users.googleId) // Only link if not already linked
        ))
        .returning();
      
      if (result.length === 0) {
        // Either user doesn't exist or already has googleId
        const existingUser = await this.getUser(userId);
        if (!existingUser) {
          throw new Error("User not found");
        }
        if (existingUser.googleId) {
          throw new Error("User already linked to Google account");
        }
        throw new Error("Failed to link Google account");
      }
      
      return result[0];
    } catch (error: any) {
      // Handle unique constraint violations
      if (error.code === '23505' && error.constraint?.includes('google')) {
        throw new Error("This Google account is already linked to another user");
      }
      throw error;
    }
  }

  // Customers
  async getCustomer(id: string): Promise<Customer | undefined> {
    const db = await getDb();
    const result = await db.select().from(customers).where(eq(customers.id, id)).limit(1);
    return result[0];
  }

  async getCustomerByEmail(email: string): Promise<Customer | undefined> {
    const db = await getDb();
    const result = await db.select().from(customers).where(eq(customers.email, email)).limit(1);
    return result[0];
  }

  async createCustomer(customer: InsertCustomer): Promise<Customer> {
    const db = await getDb();
    const result = await db.insert(customers).values(customer).returning();
    return result[0];
  }

  // Services
  async getAllServices(): Promise<Service[]> {
    const db = await getDb();
    return await db.select().from(services).orderBy(asc(services.category), asc(services.title));
  }

  async getService(id: string): Promise<Service | undefined> {
    const db = await getDb();
    const result = await db.select().from(services).where(eq(services.id, id)).limit(1);
    return result[0];
  }

  async getServicesByCategory(category: string): Promise<Service[]> {
    const db = await getDb();
    return await db.select().from(services).where(eq(services.category, category)).orderBy(asc(services.title));
  }

  async createService(service: InsertService): Promise<Service> {
    const db = await getDb();
    const result = await db.insert(services).values(service).returning();
    return result[0];
  }

  // Appointments
  async getAllAppointments(): Promise<AppointmentWithDetails[]> {
    const db = await getDb();
    
    // Get all appointments with service, location, and customer names resolved
    const result = await db
      .select({
        // Appointment fields
        id: appointments.id,
        customerId: appointments.customerId,
        serviceId: appointments.serviceId,
        locationId: appointments.locationId,
        carDetails: appointments.carDetails,
        dateTime: appointments.dateTime,
        status: appointments.status,
        mechanicName: appointments.mechanicName,
        estimatedDuration: appointments.estimatedDuration,
        price: appointments.price,
        notes: appointments.notes,
        createdAt: appointments.createdAt,
        // Resolved names
        serviceName: services.title,
        locationName: locations.name,
        customerName: customers.name
      })
      .from(appointments)
      .innerJoin(services, eq(appointments.serviceId, services.id))
      .innerJoin(locations, eq(appointments.locationId, locations.id))
      .innerJoin(customers, eq(appointments.customerId, customers.id))
      .orderBy(desc(appointments.createdAt));
    
    return result;
  }

  async getAppointment(id: string): Promise<Appointment | undefined> {
    const db = await getDb();
    const result = await db.select().from(appointments).where(eq(appointments.id, id)).limit(1);
    return result[0];
  }

  async getAppointmentsByCustomer(customerId: string): Promise<AppointmentWithDetails[]> {
    const db = await getDb();
    
    // Join appointments with services, locations, and customers to get names
    const result = await db
      .select({
        // Appointment fields
        id: appointments.id,
        customerId: appointments.customerId,
        serviceId: appointments.serviceId,
        locationId: appointments.locationId,
        carDetails: appointments.carDetails,
        dateTime: appointments.dateTime,
        status: appointments.status,
        mechanicName: appointments.mechanicName,
        estimatedDuration: appointments.estimatedDuration,
        price: appointments.price,
        notes: appointments.notes,
        createdAt: appointments.createdAt,
        // Resolved names
        serviceName: services.title,
        locationName: locations.name,
        customerName: customers.name
      })
      .from(appointments)
      .innerJoin(services, eq(appointments.serviceId, services.id))
      .innerJoin(locations, eq(appointments.locationId, locations.id))
      .innerJoin(customers, eq(appointments.customerId, customers.id))
      .where(eq(appointments.customerId, customerId))
      .orderBy(desc(appointments.dateTime));
    
    return result;
  }

  async createAppointment(appointment: InsertAppointment): Promise<Appointment> {
    const db = await getDb();
    
    // Check for appointment conflicts before creating
    const hasConflict = await this.checkAppointmentConflict(
      appointment.locationId, 
      new Date(appointment.dateTime)
    );
    
    if (hasConflict) {
      throw {
        status: 409,
        message: "Appointment time conflicts with existing booking. Please choose a different time."
      };
    }
    
    const result = await db.insert(appointments).values(appointment).returning();
    return result[0];
  }

  async updateAppointmentStatus(id: string, status: string): Promise<Appointment | undefined> {
    const db = await getDb();
    
    // For "confirmed" status, we need atomic conflict checking to prevent race conditions
    if (status === "confirmed") {
      return await this.updateAppointmentStatusWithConflictCheck(id, status);
    }
    
    // For other status changes, proceed normally
    const result = await db.update(appointments)
      .set({ status })
      .where(eq(appointments.id, id))
      .returning();
    return result[0];
  }

  async updateAppointmentStatusWithConflictCheck(id: string, status: string): Promise<Appointment | undefined> {
    const db = await getDb();
    
    // Use a database transaction to ensure atomicity
    return await db.transaction(async (tx) => {
      // First, get the current appointment details
      const currentAppointment = await tx.select()
        .from(appointments)
        .where(eq(appointments.id, id))
        .limit(1);
      
      if (!currentAppointment[0]) {
        throw {
          status: 404,
          message: "Appointment not found"
        };
      }
      
      const appointment = currentAppointment[0];
      const targetDateTime = new Date(appointment.dateTime);
      const startWindow = new Date(targetDateTime.getTime() - 30 * 60000); // 30 minutes before
      const endWindow = new Date(targetDateTime.getTime() + 30 * 60000); // 30 minutes after
      
      // Check for conflicts within the transaction (ensuring consistency)
      const conflictingAppointments = await tx.select()
        .from(appointments)
        .where(and(
          eq(appointments.locationId, appointment.locationId),
          gte(appointments.dateTime, startWindow),
          lte(appointments.dateTime, endWindow),
          eq(appointments.status, "confirmed"),
          ne(appointments.id, id) // Exclude current appointment
        ));
      
      if (conflictingAppointments.length > 0) {
        throw {
          status: 409,
          message: "Cannot confirm appointment: time conflicts with existing confirmed booking"
        };
      }
      
      // No conflicts found, safe to update status
      const result = await tx.update(appointments)
        .set({ status })
        .where(eq(appointments.id, id))
        .returning();
      
      return result[0];
    });
  }

  async rescheduleAppointment(id: string, dateTime: string, locationId: string): Promise<Appointment | undefined> {
    const db = await getDb();
    
    // Check for conflicts with the new appointment time (excluding current appointment)
    const hasConflict = await this.checkAppointmentConflict(
      locationId, 
      new Date(dateTime),
      id  // Exclude current appointment from conflict check
    );
    
    if (hasConflict) {
      throw {
        status: 409,
        message: "Rescheduled time conflicts with existing booking. Please choose a different time."
      };
    }
    
    const result = await db.update(appointments)
      .set({ 
        dateTime: new Date(dateTime),
        locationId: locationId 
      })
      .where(eq(appointments.id, id))
      .returning();
    return result[0];
  }

  async checkAppointmentConflict(locationId: string, dateTime: Date, excludeAppointmentId?: string): Promise<boolean> {
    const db = await getDb();
    const targetDateTime = new Date(dateTime);
    // Check for appointments within 1 hour window to avoid overlaps
    const startWindow = new Date(targetDateTime.getTime() - 30 * 60000); // 30 minutes before
    const endWindow = new Date(targetDateTime.getTime() + 30 * 60000); // 30 minutes after
    
    let whereConditions = [
      eq(appointments.locationId, locationId),
      // Check for overlapping time slots
      gte(appointments.dateTime, startWindow),
      lte(appointments.dateTime, endWindow),
      // Only check confirmed appointments
      eq(appointments.status, "confirmed")
    ];
    
    if (excludeAppointmentId) {
      // Exclude the current appointment from conflict check
      whereConditions.push(ne(appointments.id, excludeAppointmentId));
    }
    
    const query = db.select().from(appointments).where(and(...whereConditions));
    
    const conflictingAppointments = await query;
    return conflictingAppointments.length > 0;
  }

  // Cars
  async getAllCars(): Promise<Car[]> {
    const db = await getDb();
    return await db.select().from(cars).orderBy(desc(cars.createdAt));
  }

  async getCar(id: string): Promise<Car | undefined> {
    const db = await getDb();
    const result = await db.select().from(cars).where(eq(cars.id, id)).limit(1);
    return result[0];
  }

  async getCarsForSale(): Promise<Car[]> {
    const db = await getDb();
    return await db.select().from(cars)
      .where(eq(cars.isAuction, false))
      .orderBy(desc(cars.createdAt));
  }

  async getAuctionCars(): Promise<Car[]> {
    const db = await getDb();
    return await db.select().from(cars)
      .where(eq(cars.isAuction, true))
      .orderBy(desc(cars.createdAt));
  }

  async createCar(car: InsertCar): Promise<Car> {
    const db = await getDb();
    const result = await db.insert(cars).values(car).returning();
    return result[0];
  }

  // Contacts
  async createContact(contact: InsertContact): Promise<Contact> {
    const db = await getDb();
    const result = await db.insert(contacts).values(contact).returning();
    return result[0];
  }

  async getAllContacts(): Promise<Contact[]> {
    const db = await getDb();
    return await db.select().from(contacts).orderBy(desc(contacts.createdAt));
  }

  // Locations
  async getAllLocations(): Promise<Location[]> {
    const db = await getDb();
    return await db.select().from(locations).orderBy(asc(locations.name));
  }

  async getLocation(id: string): Promise<Location | undefined> {
    const db = await getDb();
    const result = await db.select().from(locations).where(eq(locations.id, id)).limit(1);
    return result[0];
  }

  async createLocation(location: InsertLocation): Promise<Location> {
    const db = await getDb();
    const result = await db.insert(locations).values(location).returning();
    return result[0];
  }

  // Bids
  async placeBid(bid: InsertBid): Promise<Bid> {
    const db = await getDb();
    const result = await db.insert(bids).values(bid).returning();
    return result[0];
  }

  async getBidsForCar(carId: string): Promise<Bid[]> {
    const db = await getDb();
    return await db.select().from(bids)
      .where(eq(bids.carId, carId))
      .orderBy(desc(bids.bidTime));
  }

  async getHighestBidForCar(carId: string): Promise<Bid | undefined> {
    const db = await getDb();
    const result = await db.select().from(bids)
      .where(eq(bids.carId, carId))
      .orderBy(desc(bids.bidAmount))
      .limit(1);
    return result[0];
  }

  async updateCarCurrentBid(carId: string, bidAmount: number): Promise<Car | undefined> {
    const db = await getDb();
    const result = await db.update(cars)
      .set({ currentBid: bidAmount })
      .where(eq(cars.id, carId))
      .returning();
    return result[0];
  }

  // OTP Verification
  async storeOTPVerification(otp: InsertOtpVerification): Promise<OtpVerification> {
    const db = await getDb();
    const result = await db.insert(otpVerifications).values(otp).returning();
    return result[0];
  }

  async getActiveOtpVerification(phone: string, countryCode: string, purpose: string): Promise<OtpVerification | undefined> {
    const db = await getDb();
    const result = await db.select().from(otpVerifications)
      .where(and(
        eq(otpVerifications.phone, phone),
        eq(otpVerifications.countryCode, countryCode),
        eq(otpVerifications.purpose, purpose),
        eq(otpVerifications.verified, false),
        gte(otpVerifications.expiresAt, new Date())
      ))
      .orderBy(desc(otpVerifications.createdAt))
      .limit(1);
    return result[0];
  }

  async incrementOtpAttempts(otpId: string): Promise<boolean> {
    const db = await getDb();
    const result = await db.update(otpVerifications)
      .set({ attempts: sql`${otpVerifications.attempts} + 1` })
      .where(eq(otpVerifications.id, otpId))
      .returning();
    return result.length > 0;
  }

  async markOtpAsVerified(otpId: string): Promise<boolean> {
    const db = await getDb();
    const result = await db.update(otpVerifications)
      .set({ verified: true })
      .where(eq(otpVerifications.id, otpId))
      .returning();
    return result.length > 0;
  }

  async markOtpAsExpired(otpId: string): Promise<boolean> {
    const db = await getDb();
    const result = await db.update(otpVerifications)
      .set({ expiresAt: new Date() })
      .where(eq(otpVerifications.id, otpId))
      .returning();
    return result.length > 0;
  }

  async expireAllActiveOtpsForTarget(phone: string, countryCode: string, purpose: string): Promise<number> {
    const db = await getDb();
    const result = await db.update(otpVerifications)
      .set({ expiresAt: new Date() })
      .where(and(
        eq(otpVerifications.phone, phone),
        eq(otpVerifications.countryCode, countryCode),
        eq(otpVerifications.purpose, purpose),
        eq(otpVerifications.verified, false),
        gte(otpVerifications.expiresAt, new Date())
      ))
      .returning();
    return result.length;
  }

  async getRecentOtpAttempts(phone: string, countryCode: string, since: Date): Promise<OtpVerification[]> {
    const db = await getDb();
    return await db.select().from(otpVerifications)
      .where(and(
        eq(otpVerifications.phone, phone),
        eq(otpVerifications.countryCode, countryCode),
        gte(otpVerifications.createdAt, since)
      ))
      .orderBy(desc(otpVerifications.createdAt));
  }

  async cleanupExpiredOtps(cutoffDate: Date): Promise<number> {
    const db = await getDb();
    const result = await db.delete(otpVerifications)
      .where(or(
        lte(otpVerifications.createdAt, cutoffDate),
        lte(otpVerifications.expiresAt, new Date())
      ))
      .returning();
    return result.length;
  }

  // Phone-based user operations
  async getUserByPhone(phone: string, countryCode: string): Promise<User | undefined> {
    const db = await getDb();
    const result = await db.select().from(users)
      .where(and(
        eq(users.phone, phone),
        eq(users.countryCode, countryCode)
      ))
      .limit(1);
    return result[0];
  }

  // WhatsApp Messages
  async logWhatsAppMessage(message: InsertWhatsAppMessage): Promise<WhatsAppMessage> {
    const db = await getDb();
    const result = await db.insert(whatsappMessages).values(message).returning();
    return result[0];
  }

  async getWhatsAppMessageHistory(phone: string, limit: number = 50): Promise<WhatsAppMessage[]> {
    const db = await getDb();
    return await db.select().from(whatsappMessages)
      .where(eq(whatsappMessages.phone, phone))
      .orderBy(desc(whatsappMessages.sentAt))
      .limit(limit);
  }
}

// MemStorage with sample data for fallback
export class MemStorage implements IStorage {
  private users: Map<string, User> = new Map();
  private customers: Map<string, Customer> = new Map();
  private services: Map<string, Service> = new Map();
  private appointments: Map<string, Appointment> = new Map();
  private cars: Map<string, Car> = new Map();
  private contacts: Map<string, Contact> = new Map();
  private locations: Map<string, Location> = new Map();

  constructor() {
    this.seedData();
  }

  private seedData() {
    // Seed sample locations
    const location1: Location = {
      id: "loc-1",
      name: "Mumbai Branch",
      address: "123 Service Road, Andheri West, Mumbai - 400058",
      phone: "+91-22-2345-6789",
      email: "mumbai@ronakmotorgarage.com",
      hours: "Mon-Sat: 9:00 AM - 7:00 PM",
      rating: "4.8"
    };
    this.locations.set(location1.id, location1);

    // Seed sample services
    const services: Service[] = [
      {
        id: "svc-1",
        title: "Oil Change",
        description: "Complete engine oil and filter replacement",
        price: 2500,
        duration: "30 mins",
        category: "maintenance",
        features: ["Engine oil replacement", "Oil filter change", "Free inspection", "Digital report"],
        popular: false,
        icon: "droplets"
      },
      {
        id: "svc-2",
        title: "Complete Service",
        description: "Comprehensive vehicle maintenance",
        price: 8500,
        duration: "3 hours",
        category: "maintenance",
        features: ["Full inspection", "Oil change", "Brake check", "AC service", "Washing"],
        popular: true,
        icon: "car"
      }
    ];

    services.forEach(service => this.services.set(service.id, service));

    // Seed sample cars
    const cars: Car[] = [
      // Cars for sale
      {
        id: "car-1",
        make: "Maruti Suzuki",
        model: "Swift",
        year: 2020,
        price: 650000,
        mileage: 35000,
        fuelType: "petrol",
        location: "Mumbai",
        condition: "Excellent",
        image: "https://images.unsplash.com/photo-1605559424843-9e4c228bf1c2?w=400&h=300&fit=crop&crop=center",
        isAuction: false,
        currentBid: null,
        auctionEndTime: null,
        description: "Well-maintained Swift with full service history",
        createdAt: new Date()
      },
      {
        id: "car-2", 
        make: "Hyundai",
        model: "Creta",
        year: 2019,
        price: 1200000,
        mileage: 42000,
        fuelType: "diesel",
        location: "Delhi",
        condition: "Good",
        image: "https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?w=400&h=300&fit=crop&crop=center",
        isAuction: false,
        currentBid: null,
        auctionEndTime: null,
        description: "Popular SUV with excellent fuel efficiency",
        createdAt: new Date()
      },
      {
        id: "car-3",
        make: "Tata",
        model: "Nexon",
        year: 2021,
        price: 950000,
        mileage: 25000,
        fuelType: "electric",
        location: "Bangalore",
        condition: "Excellent",
        image: "https://images.unsplash.com/photo-1544896478-d5c7254e1b58?w=400&h=300&fit=crop&crop=center",
        isAuction: false,
        currentBid: null,
        auctionEndTime: null,
        description: "Electric SUV with modern features",
        createdAt: new Date()
      },
      {
        id: "car-4",
        make: "Honda",
        model: "City",
        year: 2018,
        price: 850000,
        mileage: 48000,
        fuelType: "petrol",
        location: "Pune",
        condition: "Good", 
        image: "https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=400&h=300&fit=crop&crop=center",
        isAuction: false,
        currentBid: null,
        auctionEndTime: null,
        description: "Reliable sedan with excellent comfort",
        createdAt: new Date()
      },
      {
        id: "car-5",
        make: "Mahindra",
        model: "XUV500",
        year: 2017,
        price: 1100000,
        mileage: 65000,
        fuelType: "diesel",
        location: "Chennai",
        condition: "Fair",
        image: "https://images.unsplash.com/photo-1581540222194-0def2dda95b8?w=400&h=300&fit=crop&crop=center",
        isAuction: false,
        currentBid: null,
        auctionEndTime: null,
        description: "Spacious 7-seater SUV",
        createdAt: new Date()
      },
      // Auction cars
      {
        id: "car-auction-1",
        make: "BMW",
        model: "3 Series",
        year: 2016,
        price: 1800000,
        mileage: 55000,
        fuelType: "petrol",
        location: "Mumbai",
        condition: "Good",
        image: "https://images.unsplash.com/photo-1555215695-3004980ad54e?w=400&h=300&fit=crop&crop=center",
        isAuction: true,
        currentBid: 1650000,
        auctionEndTime: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // 3 days from now
        description: "Luxury sedan with premium features",
        createdAt: new Date()
      },
      {
        id: "car-auction-2",
        make: "Ford",
        model: "EcoSport",
        year: 2019,
        price: 750000,
        mileage: 35000,
        fuelType: "petrol",
        location: "Delhi",
        condition: "Excellent",
        image: "https://images.unsplash.com/photo-1503376821350-e25f4b67162f?w=400&h=300&fit=crop&crop=center",
        isAuction: true,
        currentBid: 720000,
        auctionEndTime: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000), // 1 day from now
        description: "Compact SUV perfect for city driving",
        createdAt: new Date()
      },
      {
        id: "car-auction-3",
        make: "Toyota",
        model: "Innova",
        year: 2020,
        price: 1650000,
        mileage: 30000,
        fuelType: "diesel",
        location: "Bangalore",
        condition: "Excellent",
        image: "https://images.unsplash.com/photo-1593941707882-a5bac6861d75?w=400&h=300&fit=crop&crop=center",
        isAuction: true,
        currentBid: 1580000,
        auctionEndTime: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), // 5 days from now
        description: "Reliable MPV with excellent build quality",
        createdAt: new Date()
      }
    ];

    cars.forEach(car => this.cars.set(car.id, car));

    console.log("MemStorage initialized with sample data");
  }

  // Users
  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(user => user.email === email);
  }

  async getUserByGoogleId(googleId: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(user => user.googleId === googleId);
  }

  async createUser(user: InsertUser): Promise<User> {
    const id = randomUUID();
    const newUser: User = { 
      ...user, 
      id, 
      email: user.email ?? null,
      phone: user.phone ?? null,
      phoneVerified: user.phoneVerified ?? false,
      countryCode: user.countryCode ?? "+91",
      registrationNumbers: user.registrationNumbers ?? null,
      dateOfBirth: user.dateOfBirth ?? null,
      profileImage: user.profileImage ?? null,
      address: user.address ?? null,
      city: user.city ?? null,
      state: user.state ?? null,
      zipCode: user.zipCode ?? null,
      createdAt: new Date(),
      provider: user.provider ?? "email",
      emailVerified: user.emailVerified ?? false,
      password: user.password ?? null,
      googleId: user.googleId ?? null,
      role: user.role ?? "customer"
    };
    this.users.set(id, newUser);
    return newUser;
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User | undefined> {
    const existingUser = this.users.get(id);
    if (!existingUser) {
      return undefined;
    }
    
    const updatedUser: User = { ...existingUser, ...updates };
    this.users.set(id, updatedUser);
    return updatedUser;
  }

  async linkGoogleAccount(userId: string, googleId: string): Promise<User | undefined> {
    const existingUser = this.users.get(userId);
    if (!existingUser) {
      throw new Error("User not found");
    }
    
    if (existingUser.googleId) {
      throw new Error("User already linked to Google account");
    }
    
    // Check if this googleId is already linked to another user
    const duplicateUser = Array.from(this.users.values()).find(user => user.googleId === googleId);
    if (duplicateUser) {
      throw new Error("This Google account is already linked to another user");
    }
    
    // Atomic update in memory
    const updatedUser: User = {
      ...existingUser,
      googleId,
      provider: "google",
      emailVerified: true
    };
    
    this.users.set(userId, updatedUser);
    return updatedUser;
  }

  // Customers
  async getCustomer(id: string): Promise<Customer | undefined> {
    return this.customers.get(id);
  }

  async getCustomerByEmail(email: string): Promise<Customer | undefined> {
    return Array.from(this.customers.values()).find(customer => customer.email === email);
  }

  async createCustomer(customer: InsertCustomer): Promise<Customer> {
    const id = randomUUID();
    const newCustomer: Customer = { ...customer, id, createdAt: new Date() };
    this.customers.set(id, newCustomer);
    return newCustomer;
  }

  // Services
  async getAllServices(): Promise<Service[]> {
    return Array.from(this.services.values()).sort((a, b) => a.category.localeCompare(b.category) || a.title.localeCompare(b.title));
  }

  async getService(id: string): Promise<Service | undefined> {
    return this.services.get(id);
  }

  async getServicesByCategory(category: string): Promise<Service[]> {
    return Array.from(this.services.values())
      .filter(service => service.category === category)
      .sort((a, b) => a.title.localeCompare(b.title));
  }

  async createService(service: InsertService): Promise<Service> {
    const id = randomUUID();
    const newService: Service = { ...service, id, popular: service.popular ?? false, icon: service.icon ?? null };
    this.services.set(id, newService);
    return newService;
  }

  // Appointments
  async getAllAppointments(): Promise<AppointmentWithDetails[]> {
    const allAppointments = Array.from(this.appointments.values())
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    
    // Resolve service, location, and customer names
    return allAppointments.map(apt => {
      const service = this.services.get(apt.serviceId);
      const location = this.locations.get(apt.locationId);
      const customer = this.customers.get(apt.customerId);
      
      return {
        ...apt,
        serviceName: service?.title || `Unknown Service (${apt.serviceId})`,
        locationName: location?.name || `Unknown Location (${apt.locationId})`,
        customerName: customer?.name || `Unknown Customer (${apt.customerId})`
      };
    });
  }

  async getAppointment(id: string): Promise<Appointment | undefined> {
    return this.appointments.get(id);
  }

  async getAppointmentsByCustomer(customerId: string): Promise<AppointmentWithDetails[]> {
    const customerAppointments = Array.from(this.appointments.values())
      .filter(apt => apt.customerId === customerId)
      .sort((a, b) => b.dateTime.getTime() - a.dateTime.getTime());
    
    // Resolve service, location, and customer names
    return customerAppointments.map(apt => {
      const service = this.services.get(apt.serviceId);
      const location = this.locations.get(apt.locationId);
      const customer = this.customers.get(apt.customerId);
      
      return {
        ...apt,
        serviceName: service?.title || `Unknown Service (${apt.serviceId})`,
        locationName: location?.name || `Unknown Location (${apt.locationId})`,
        customerName: customer?.name || `Unknown Customer (${apt.customerId})`
      };
    });
  }

  async createAppointment(appointment: InsertAppointment): Promise<Appointment> {
    const id = randomUUID();
    const newAppointment: Appointment = { ...appointment, id, status: appointment.status || "pending", createdAt: new Date(), price: appointment.price ?? null, mechanicName: appointment.mechanicName ?? null, notes: appointment.notes ?? null };
    this.appointments.set(id, newAppointment);
    return newAppointment;
  }

  async updateAppointmentStatus(id: string, status: string): Promise<Appointment | undefined> {
    const appointment = this.appointments.get(id);
    if (appointment) {
      appointment.status = status;
      this.appointments.set(id, appointment);
      return appointment;
    }
    return undefined;
  }

  async rescheduleAppointment(id: string, dateTime: string, locationId: string): Promise<Appointment | undefined> {
    const appointment = this.appointments.get(id);
    if (appointment) {
      appointment.dateTime = new Date(dateTime);
      appointment.locationId = locationId;
      this.appointments.set(id, appointment);
      return appointment;
    }
    return undefined;
  }

  async checkAppointmentConflict(locationId: string, dateTime: Date, excludeAppointmentId?: string): Promise<boolean> {
    const targetDateTime = new Date(dateTime);
    // Check for appointments within 1 hour window to avoid overlaps
    const startWindow = new Date(targetDateTime.getTime() - 30 * 60000); // 30 minutes before
    const endWindow = new Date(targetDateTime.getTime() + 30 * 60000); // 30 minutes after
    
    const conflictingAppointments = Array.from(this.appointments.values()).filter(apt => {
      // Skip cancelled or pending appointments
      if (apt.status !== "confirmed") return false;
      
      // Skip if different location
      if (apt.locationId !== locationId) return false;
      
      // Skip the current appointment being rescheduled
      if (excludeAppointmentId && apt.id === excludeAppointmentId) return false;
      
      // Check if appointment falls within the time window
      return apt.dateTime >= startWindow && apt.dateTime <= endWindow;
    });
    
    return conflictingAppointments.length > 0;
  }

  // Cars
  async getAllCars(): Promise<Car[]> {
    return Array.from(this.cars.values()).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async getCar(id: string): Promise<Car | undefined> {
    return this.cars.get(id);
  }

  async getCarsForSale(): Promise<Car[]> {
    return Array.from(this.cars.values())
      .filter(car => !car.isAuction)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async getAuctionCars(): Promise<Car[]> {
    return Array.from(this.cars.values())
      .filter(car => car.isAuction)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async createCar(car: InsertCar): Promise<Car> {
    const id = randomUUID();
    const newCar: Car = { ...car, id, createdAt: new Date(), description: car.description ?? null, isAuction: car.isAuction ?? false, currentBid: car.currentBid ?? null, auctionEndTime: car.auctionEndTime ?? null };
    this.cars.set(id, newCar);
    return newCar;
  }

  // Contacts
  async createContact(contact: InsertContact): Promise<Contact> {
    const id = randomUUID();
    const newContact: Contact = { ...contact, id, status: "new", createdAt: new Date() };
    this.contacts.set(id, newContact);
    return newContact;
  }

  async getAllContacts(): Promise<Contact[]> {
    return Array.from(this.contacts.values()).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  // Locations
  async getAllLocations(): Promise<Location[]> {
    return Array.from(this.locations.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  async getLocation(id: string): Promise<Location | undefined> {
    return this.locations.get(id);
  }

  async createLocation(location: InsertLocation): Promise<Location> {
    const id = randomUUID();
    const newLocation: Location = { ...location, id, rating: location.rating ?? null };
    this.locations.set(id, newLocation);
    return newLocation;
  }

  // Bids
  private bids: Map<string, Bid> = new Map();

  async placeBid(bid: InsertBid): Promise<Bid> {
    const id = randomUUID();
    const newBid: Bid = { 
      ...bid, 
      id, 
      bidTime: new Date() 
    };
    this.bids.set(id, newBid);
    return newBid;
  }

  async getBidsForCar(carId: string): Promise<Bid[]> {
    return Array.from(this.bids.values())
      .filter(bid => bid.carId === carId)
      .sort((a, b) => b.bidTime.getTime() - a.bidTime.getTime());
  }

  async getHighestBidForCar(carId: string): Promise<Bid | undefined> {
    const carBids = Array.from(this.bids.values())
      .filter(bid => bid.carId === carId)
      .sort((a, b) => b.bidAmount - a.bidAmount);
    return carBids[0];
  }

  async updateCarCurrentBid(carId: string, bidAmount: number): Promise<Car | undefined> {
    const car = this.cars.get(carId);
    if (car) {
      const updatedCar = { ...car, currentBid: bidAmount };
      this.cars.set(carId, updatedCar);
      return updatedCar;
    }
    return undefined;
  }

  // OTP Verification
  private otpVerifications: Map<string, OtpVerification> = new Map();

  async storeOTPVerification(otp: InsertOtpVerification): Promise<OtpVerification> {
    const id = randomUUID();
    const newOtp: OtpVerification = {
      ...otp,
      id,
      verified: false,
      attempts: 0,
      maxAttempts: otp.maxAttempts ?? 3,
      createdAt: new Date()
    };
    this.otpVerifications.set(id, newOtp);
    return newOtp;
  }

  async getActiveOtpVerification(phone: string, countryCode: string, purpose: string): Promise<OtpVerification | undefined> {
    return Array.from(this.otpVerifications.values())
      .filter(otp => 
        otp.phone === phone && 
        otp.countryCode === countryCode && 
        otp.purpose === purpose && 
        !otp.verified && 
        new Date() < otp.expiresAt
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  }

  async incrementOtpAttempts(otpId: string): Promise<boolean> {
    const otp = this.otpVerifications.get(otpId);
    if (otp) {
      otp.attempts = (otp.attempts ?? 0) + 1;
      this.otpVerifications.set(otpId, otp);
      return true;
    }
    return false;
  }

  async markOtpAsVerified(otpId: string): Promise<boolean> {
    const otp = this.otpVerifications.get(otpId);
    if (otp) {
      otp.verified = true;
      this.otpVerifications.set(otpId, otp);
      return true;
    }
    return false;
  }

  async markOtpAsExpired(otpId: string): Promise<boolean> {
    const otp = this.otpVerifications.get(otpId);
    if (otp) {
      otp.expiresAt = new Date(); // Mark as expired by setting expiry to now
      this.otpVerifications.set(otpId, otp);
      return true;
    }
    return false;
  }

  async expireAllActiveOtpsForTarget(phone: string, countryCode: string, purpose: string): Promise<number> {
    let expiredCount = 0;
    const now = new Date();
    
    Array.from(this.otpVerifications.entries()).forEach(([id, otp]) => {
      if (otp.phone === phone && 
          otp.countryCode === countryCode && 
          otp.purpose === purpose && 
          !otp.verified && 
          otp.expiresAt > now) {
        otp.expiresAt = now;
        this.otpVerifications.set(id, otp);
        expiredCount++;
      }
    });
    
    return expiredCount;
  }

  async getRecentOtpAttempts(phone: string, countryCode: string, since: Date): Promise<OtpVerification[]> {
    return Array.from(this.otpVerifications.values())
      .filter(otp => 
        otp.phone === phone && 
        otp.countryCode === countryCode && 
        otp.createdAt >= since
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async cleanupExpiredOtps(cutoffDate: Date): Promise<number> {
    const expired = Array.from(this.otpVerifications.entries())
      .filter(([_, otp]) => otp.createdAt < cutoffDate || otp.expiresAt < new Date());
    
    expired.forEach(([id]) => this.otpVerifications.delete(id));
    return expired.length;
  }

  // Phone-based user operations
  async getUserByPhone(phone: string, countryCode: string): Promise<User | undefined> {
    return Array.from(this.users.values())
      .find(user => user.phone === phone && user.countryCode === countryCode);
  }

  // WhatsApp Messages
  private whatsappMessages: Map<string, WhatsAppMessage> = new Map();

  async logWhatsAppMessage(message: InsertWhatsAppMessage): Promise<WhatsAppMessage> {
    const id = randomUUID();
    const newMessage: WhatsAppMessage = {
      ...message,
      id,
      countryCode: message.countryCode ?? null,
      status: message.status ?? "sent",
      appointmentId: message.appointmentId ?? null,
      providerResponse: message.providerResponse ?? null,
      sentAt: new Date()
    };
    this.whatsappMessages.set(id, newMessage);
    return newMessage;
  }

  async getWhatsAppMessageHistory(phone: string, limit: number = 50): Promise<WhatsAppMessage[]> {
    return Array.from(this.whatsappMessages.values())
      .filter(msg => msg.phone === phone)
      .sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime())
      .slice(0, limit);
  }
}

// Factory function to create storage instance
async function createStorage(): Promise<IStorage> {
  try {
    console.log("Attempting database connection...");
    const db = await getDb();
    console.log("Database connection successful - using DatabaseStorage");
    
    // Test the connection with a simple query
    await db.select().from(users).limit(1);
    console.log("Database query test successful");
    
    return new DatabaseStorage();
  } catch (error) {
    console.error("Database connection failed:", error instanceof Error ? error.message : error);
    console.error("Full error:", error);
    console.log("Falling back to MemStorage with sample data");
    return new MemStorage();
  }
}

// Export storage instance
let storageInstance: IStorage | null = null;

export async function getStorage(): Promise<IStorage> {
  if (!storageInstance) {
    storageInstance = await createStorage();
  }
  return storageInstance;
}

// For backward compatibility - this will be lazy-initialized on first use
export const storage = new Proxy({} as IStorage, {
  get(target, prop) {
    throw new Error("Use getStorage() instead of direct storage access for lazy initialization.");
  }
});
