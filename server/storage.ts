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
  type CarImage,
  type InsertCarImage,
  type Customer,
  type InsertCustomer,
  type Contact,
  type InsertContact,
  type Location,
  type InsertLocation,
  type Bid,
  type InsertBid,
  type EmailVerificationToken,
  type InsertEmailVerificationToken,
  type WhatsAppMessage,
  type InsertWhatsAppMessage,
  type AdminAuditLog,
  type InsertAdminAuditLog,
  type AdminRateLimit,
  type InsertAdminRateLimit,
  type SiteSetting,
  type InsertSiteSetting,
  type MediaLibrary,
  type InsertMediaLibrary,
  type Invoice,
  type InsertInvoice,
  type InvoiceItem,
  type InsertInvoiceItem,
  type InvoiceWithItems,
  users,
  services,
  appointments,
  cars,
  carImages,
  customers,
  contacts,
  locations,
  bids,
  emailVerificationTokens,
  whatsappMessages,
  adminAuditLogs,
  adminRateLimits,
  siteSettings,
  mediaLibrary,
  invoices,
  invoiceItems
} from "@shared/schema";
import { getDb } from "./db";
import { eq, and, desc, asc, gte, lte, ne, isNull, or, sql, inArray } from "drizzle-orm";
import { randomUUID } from "crypto";
import { LRUCache } from "lru-cache";

interface DatabaseError extends Error {
  code?: string;
  constraint?: string;
}

export interface CarFilterOptions {
  transmission?: string;
  bodyType?: string;
  color?: string;
  yearMin?: number;
  yearMax?: number;
  mileageMin?: number;
  mileageMax?: number;
  sortBy?: 'price' | 'year' | 'mileage';
  sortOrder?: 'asc' | 'desc';
}

export interface ContactFilterOptions {
  page?: number;
  limit?: number;
  status?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
}

export interface InvoiceFilterOptions {
  page?: number;
  limit?: number;
  status?: string;
  startDate?: string;
  endDate?: string;
  customerEmail?: string;
  customerPhone?: string;
}

export interface IStorage {

  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByGoogleId(googleId: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, updates: Partial<User>): Promise<User | undefined>;
  linkGoogleAccount(userId: string, googleId: string): Promise<User | undefined>;
  deleteUser(id: string): Promise<boolean>;

  getUserCount(): Promise<number>;
  getAllUsers(offset?: number, limit?: number): Promise<User[]>;

  getCustomer(id: string): Promise<Customer | undefined>;
  getCustomerByEmail(email: string): Promise<Customer | undefined>;
  getCustomerByUserId(userId: string): Promise<Customer | undefined>;
  createCustomer(customer: InsertCustomer): Promise<Customer>;
  updateCustomer(id: string, updates: Partial<InsertCustomer>): Promise<Customer | undefined>;

  getAllServices(): Promise<Service[]>;
  getService(id: string): Promise<Service | undefined>;
  getServicesByCategory(category: string): Promise<Service[]>;
  createService(service: InsertService): Promise<Service>;
  updateService(id: string, updates: Partial<Service>): Promise<Service | undefined>;
  deleteService(id: string): Promise<void>;

  getAllAppointments(offset?: number, limit?: number): Promise<AppointmentWithDetails[]>;
  getAppointmentCount(): Promise<number>;
  getAppointment(id: string): Promise<Appointment | undefined>;
  getAppointmentWithDetails(id: string): Promise<AppointmentWithDetails | undefined>;
  getAppointmentsByCustomer(customerId: string): Promise<AppointmentWithDetails[]>;
  getAppointmentsByService(serviceId: string): Promise<Appointment[]>;
  getAppointmentsByLocation(locationId: string): Promise<Appointment[]>;
  createAppointment(appointment: InsertAppointment): Promise<Appointment>;
  updateAppointmentStatus(id: string, status: string): Promise<Appointment | undefined>;
  rescheduleAppointment(id: string, dateTime: string, locationId: string): Promise<Appointment | undefined>;
  checkAppointmentConflict(locationId: string, dateTime: Date, excludeAppointmentId?: string): Promise<boolean>;
  deleteAppointment(id: string): Promise<boolean>;

  getAllCars(offset?: number, limit?: number, filters?: CarFilterOptions): Promise<Car[]>;
  getCarCount(filters?: CarFilterOptions): Promise<number>;
  getCar(id: string): Promise<Car | undefined>;
  getCarsForSale(): Promise<Car[]>;
  getAuctionCars(): Promise<Car[]>;
  createCar(car: InsertCar): Promise<Car>;
  updateCar(id: string, updates: Partial<Car>): Promise<Car | undefined>;
  deleteCar(id: string): Promise<boolean>;

  getCarImages(carId: string): Promise<CarImage[]>;
  createCarImage(data: InsertCarImage): Promise<CarImage>;
  deleteCarImage(id: string): Promise<void>;
  updateCarImageOrder(id: string, displayOrder: number): Promise<void>;
  setCarImagePrimary(carId: string, imageId: string): Promise<void>;

  createContact(contact: InsertContact): Promise<Contact>;
  getAllContacts(): Promise<Contact[]>;
  updateContact(id: string, updates: Partial<Contact>): Promise<Contact | undefined>;
  getContactsWithFilter(options: ContactFilterOptions): Promise<{ contacts: Contact[]; total: number; hasMore: boolean }>;
  getContactsForExport(options: ContactFilterOptions): Promise<Contact[]>;
  deleteContact(id: string): Promise<boolean>;
  deleteContacts(ids: string[]): Promise<number>;

  getAllLocations(): Promise<Location[]>;
  getLocation(id: string): Promise<Location | undefined>;
  createLocation(location: InsertLocation): Promise<Location>;
  updateLocation(id: string, updates: Partial<Location>): Promise<Location | undefined>;
  deleteLocation(id: string): Promise<boolean>;
  hasLocationAppointments(locationId: string): Promise<boolean>;

  placeBid(bid: InsertBid): Promise<Bid>;
  getBidsForCar(carId: string): Promise<Bid[]>;
  getHighestBidForCar(carId: string): Promise<Bid | undefined>;
  updateCarCurrentBid(carId: string, bidAmount: number): Promise<Car | undefined>;
  hasActiveBids(carId: string): Promise<boolean>;
  getAllBids(options: { page?: number; limit?: number; status?: string; carId?: string; startDate?: string; endDate?: string; minAmount?: number; maxAmount?: number }): Promise<{ bids: any[]; total: number; hasMore: boolean }>;
  updateBidStatus(bidId: string, status: string): Promise<Bid | undefined>;
  getBidById(bidId: string): Promise<Bid | undefined>;
  getBidAnalytics(): Promise<{ totalBids: number; pendingBids: number; acceptedBids: number; rejectedBids: number; totalValue: number; avgBidAmount: number }>;

  getUserByPhone(phone: string, countryCode: string): Promise<User | undefined>;

  createVerificationToken(userId: string, email: string, purpose?: string): Promise<{ token: string; tokenHash: string }>;
  getVerificationToken(tokenHash: string, email: string, purpose?: string): Promise<EmailVerificationToken | undefined>;
  consumeVerificationToken(tokenHash: string, purpose?: string): Promise<boolean>;
  cleanupExpiredVerificationTokens(cutoffDate: Date): Promise<number>;
  incrementResendCount(userId: string): Promise<boolean>;
  getActiveVerificationToken(userId: string): Promise<EmailVerificationToken | undefined>;

  logWhatsAppMessage(message: InsertWhatsAppMessage): Promise<WhatsAppMessage>;
  getWhatsAppMessageHistory(phone: string, limit?: number): Promise<WhatsAppMessage[]>;
  updateWhatsAppMessage(id: string, updates: Partial<WhatsAppMessage>): Promise<boolean>;
  getWhatsAppMessage(id: string): Promise<WhatsAppMessage | null>;
  updateWhatsAppMessageStatus(messageSid: string, updates: { status: string; providerResponse?: string }): Promise<boolean>;
  getWhatsAppMessages(options: { page: number; limit: number; status?: string }): Promise<WhatsAppMessage[]>;

  logAdminAction(auditLog: InsertAdminAuditLog): Promise<AdminAuditLog>;
  getAdminAuditLogs(adminUserId?: string, limit?: number, offset?: number): Promise<AdminAuditLog[]>;
  getAdminAuditLogsCount(adminUserId?: string): Promise<number>;
  getResourceAuditLogs(resource: string, resourceId: string, limit?: number): Promise<AdminAuditLog[]>;

  checkAndIncrementRateLimit(userId: string, windowMs: number): Promise<{ count: number; resetTime: number; withinWindow: boolean }>;
  cleanupExpiredRateLimits(): Promise<number>;

  getAllSiteSettings(): Promise<SiteSetting[]>;
  getSiteSettingByKey(key: string): Promise<SiteSetting | undefined>;
  updateSiteSetting(key: string, value: string, category?: string, description?: string): Promise<SiteSetting>;

  getAllMediaLibraryImages(filters?: { imageType?: string; uploadedBy?: string; isActive?: boolean }): Promise<MediaLibrary[]>;
  getMediaLibraryImageById(id: string): Promise<MediaLibrary | undefined>;
  createMediaLibraryImage(data: InsertMediaLibrary): Promise<MediaLibrary>;
  updateMediaLibraryImage(id: string, data: Partial<MediaLibrary>): Promise<MediaLibrary | undefined>;
  deleteMediaLibraryImage(id: string): Promise<boolean>;
  incrementMediaUsageCount(id: string): Promise<boolean>;

  createInvoice(invoiceData: InsertInvoice, items: InsertInvoiceItem[]): Promise<InvoiceWithItems>;
  getInvoices(filters?: InvoiceFilterOptions): Promise<{ invoices: InvoiceWithItems[]; total: number; hasMore: boolean }>;
  getInvoiceById(id: string): Promise<InvoiceWithItems | undefined>;
  updateInvoice(id: string, invoiceData: Partial<InsertInvoice>): Promise<InvoiceWithItems | undefined>;
  deleteInvoice(id: string): Promise<boolean>;
  getEligibleTransactionsForInvoicing(): Promise<{ appointments: any[]; bids: any[]; cars: any[] }>;
}

export class DatabaseStorage implements IStorage {
  private cache: LRUCache<string, any>;

  constructor() {
    this.cache = new LRUCache({
      max: 500,
      ttl: 1000 * 60 * 5,
      updateAgeOnGet: false,
      updateAgeOnHas: false
    });
  }

  private invalidateServicesCache(): void {
    this.cache.delete('all_services');
    const categoryKeys = Array.from(this.cache.keys()).filter(key => key.startsWith('services_category_'));
    categoryKeys.forEach(key => this.cache.delete(key));
  }

  private invalidateLocationsCache(): void {
    this.cache.delete('all_locations');
  }

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
    try {
      const result = await db.insert(users).values(user).returning();
      return result[0];
    } catch (error) {
      const err = error as DatabaseError;

      if (err.code === '23505') {

        if (err.constraint?.includes('email')) {
          throw {
            status: 409,
            message: "A user with this email address already exists."
          };
        }
        if (err.constraint?.includes('phone')) {
          throw {
            status: 409,
            message: "A user with this phone number already exists."
          };
        }
        if (err.constraint?.includes('google')) {
          throw {
            status: 409,
            message: "This Google account is already linked to another user."
          };
        }
      }
      if (err.code === '23502') {

        throw {
          status: 400,
          message: "Missing required user information. Please provide all required fields."
        };
      }

      throw err;
    }
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

      const result = await db.update(users)
        .set({
          googleId,
          provider: "google",
          emailVerified: true
        })
        .where(and(
          eq(users.id, userId),
          isNull(users.googleId)
        ))
        .returning();
      
      if (result.length === 0) {

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
    } catch (error) {
      const err = error as DatabaseError;

      if (err.code === '23505' && err.constraint?.includes('google')) {
        throw new Error("This Google account is already linked to another user");
      }
      throw err;
    }
  }

  async getUserCount(): Promise<number> {
    const db = await getDb();
    const result = await db.select({ count: sql<number>`cast(count(*) as integer)` }).from(users);
    return result[0].count;
  }

  async getAllUsers(offset: number = 0, limit: number = 100): Promise<User[]> {
    const db = await getDb();
    return await db.select().from(users)
      .orderBy(desc(users.createdAt))
      .offset(offset)
      .limit(limit);
  }

  async deleteUser(id: string): Promise<boolean> {
    const db = await getDb();
    try {
      await db.delete(users).where(eq(users.id, id));
      return true;
    } catch (error) {
      const err = error as DatabaseError;
      if (err.code === '23503') {
        throw {
          status: 409,
          message: "Cannot delete user with existing related records. Please remove or reassign their appointments, bids, and other data first.",
          code: "FOREIGN_KEY_VIOLATION"
        };
      }
      throw err;
    }
  }

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

  async getCustomerByUserId(userId: string): Promise<Customer | undefined> {
    const db = await getDb();
    const result = await db.select().from(customers).where(eq(customers.userId, userId)).limit(1);
    return result[0];
  }

  async createCustomer(customer: InsertCustomer): Promise<Customer> {
    const db = await getDb();
    const result = await db.insert(customers).values(customer).returning();
    return result[0];
  }

  async updateCustomer(id: string, updates: Partial<InsertCustomer>): Promise<Customer | undefined> {
    const db = await getDb();
    const result = await db.update(customers).set(updates).where(eq(customers.id, id)).returning();
    return result[0];
  }

  async getAllServices(): Promise<Service[]> {
    const cacheKey = 'all_services';
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const db = await getDb();
    const result = await db.select().from(services).orderBy(asc(services.category), asc(services.title));
    
    this.cache.set(cacheKey, result);
    return result;
  }

  async getService(id: string): Promise<Service | undefined> {
    const db = await getDb();
    const result = await db.select().from(services).where(eq(services.id, id)).limit(1);
    return result[0];
  }

  async getServicesByCategory(category: string): Promise<Service[]> {
    const cacheKey = `services_category_${category}`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const db = await getDb();
    const result = await db.select().from(services).where(eq(services.category, category)).orderBy(asc(services.title));
    
    this.cache.set(cacheKey, result);
    return result;
  }

  async createService(service: InsertService): Promise<Service> {
    const db = await getDb();
    try {
      const result = await db.insert(services).values(service).returning();
      
      this.invalidateServicesCache();
      
      return result[0];
    } catch (error) {
      const err = error as DatabaseError;

      if (err.code === '23505') {

        throw {
          status: 409,
          message: "A service with this name or identifier already exists."
        };
      }
      if (err.code === '23502') {

        throw {
          status: 400,
          message: "Missing required service information. Please provide all required fields."
        };
      }

      throw err;
    }
  }

  async updateService(id: string, updates: Partial<Service>): Promise<Service | undefined> {
    const db = await getDb();
    const result = await db.update(services).set(updates).where(eq(services.id, id)).returning();
    
    this.invalidateServicesCache();
    
    return result[0];
  }

  async deleteService(id: string): Promise<void> {
    const db = await getDb();
    await db.delete(services).where(eq(services.id, id));
    
    this.invalidateServicesCache();
  }

  async getAllAppointments(offset: number = 0, limit: number = 100): Promise<AppointmentWithDetails[]> {
    const db = await getDb();

    const result = await db
      .select({

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

        serviceName: services.title,
        locationName: locations.name,
        customerName: customers.name
      })
      .from(appointments)
      .innerJoin(services, eq(appointments.serviceId, services.id))
      .innerJoin(locations, eq(appointments.locationId, locations.id))
      .innerJoin(customers, eq(appointments.customerId, customers.id))
      .orderBy(desc(appointments.createdAt))
      .offset(offset)
      .limit(limit);
    
    return result;
  }

  async getAppointmentCount(): Promise<number> {
    const db = await getDb();
    const result = await db.select({ count: sql<number>`cast(count(*) as integer)` }).from(appointments);
    return result[0].count;
  }

  async getAppointment(id: string): Promise<Appointment | undefined> {
    const db = await getDb();
    const result = await db.select().from(appointments).where(eq(appointments.id, id)).limit(1);
    return result[0];
  }

  async getAppointmentWithDetails(id: string): Promise<AppointmentWithDetails | undefined> {
    const db = await getDb();

    const result = await db
      .select({

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

        serviceName: services.title,
        locationName: locations.name,
        customerName: customers.name
      })
      .from(appointments)
      .innerJoin(services, eq(appointments.serviceId, services.id))
      .innerJoin(locations, eq(appointments.locationId, locations.id))
      .innerJoin(customers, eq(appointments.customerId, customers.id))
      .where(eq(appointments.id, id))
      .limit(1);
    
    return result[0];
  }

  async getAppointmentsByCustomer(customerId: string): Promise<AppointmentWithDetails[]> {
    const db = await getDb();

    const result = await db
      .select({

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

  async getAppointmentsByService(serviceId: string): Promise<Appointment[]> {
    const db = await getDb();
    const result = await db.select().from(appointments).where(eq(appointments.serviceId, serviceId));
    return result;
  }

  async getAppointmentsByLocation(locationId: string): Promise<Appointment[]> {
    const db = await getDb();
    const result = await db.select().from(appointments).where(eq(appointments.locationId, locationId));
    return result;
  }

  async createAppointment(appointment: InsertAppointment): Promise<Appointment> {
    const db = await getDb();

    return await db.transaction(async (tx) => {
      const targetDateTime = new Date(appointment.dateTime);
      const startWindow = new Date(targetDateTime.getTime() - 30 * 60000);
      const endWindow = new Date(targetDateTime.getTime() + 30 * 60000);

      const conflictingAppointments = await tx.select()
        .from(appointments)
        .where(and(
          eq(appointments.locationId, appointment.locationId),
          gte(appointments.dateTime, startWindow),
          lte(appointments.dateTime, endWindow),
          eq(appointments.status, "confirmed")
        ));
      
      if (conflictingAppointments.length > 0) {
        throw {
          status: 409,
          message: "Appointment time conflicts with existing booking. Please choose a different time."
        };
      }

      const result = await tx.insert(appointments).values(appointment).returning();
      return result[0];
    });
  }

  async updateAppointmentStatus(id: string, status: string): Promise<Appointment | undefined> {
    const db = await getDb();

    if (status === "confirmed") {
      return await this.updateAppointmentStatusWithConflictCheck(id, status);
    }

    return await db.transaction(async (tx) => {

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

      const result = await tx.update(appointments)
        .set({ status })
        .where(eq(appointments.id, id))
        .returning();
      
      return result[0];
    });
  }

  async updateAppointmentStatusWithConflictCheck(id: string, status: string): Promise<Appointment | undefined> {
    const db = await getDb();

    return await db.transaction(async (tx) => {

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
      const startWindow = new Date(targetDateTime.getTime() - 30 * 60000);
      const endWindow = new Date(targetDateTime.getTime() + 30 * 60000);

      const conflictingAppointments = await tx.select()
        .from(appointments)
        .where(and(
          eq(appointments.locationId, appointment.locationId),
          gte(appointments.dateTime, startWindow),
          lte(appointments.dateTime, endWindow),
          eq(appointments.status, "confirmed"),
          ne(appointments.id, id)
        ));
      
      if (conflictingAppointments.length > 0) {
        throw {
          status: 409,
          message: "Cannot confirm appointment: time conflicts with existing confirmed booking"
        };
      }

      const result = await tx.update(appointments)
        .set({ status })
        .where(eq(appointments.id, id))
        .returning();
      
      return result[0];
    });
  }

  async rescheduleAppointment(id: string, dateTime: string, locationId: string): Promise<Appointment | undefined> {
    const db = await getDb();

    return await db.transaction(async (tx) => {
      const targetDateTime = new Date(dateTime);
      const startWindow = new Date(targetDateTime.getTime() - 30 * 60000);
      const endWindow = new Date(targetDateTime.getTime() + 30 * 60000);

      const conflictingAppointments = await tx.select()
        .from(appointments)
        .where(and(
          eq(appointments.locationId, locationId),
          gte(appointments.dateTime, startWindow),
          lte(appointments.dateTime, endWindow),
          eq(appointments.status, "confirmed"),
          ne(appointments.id, id)
        ));
      
      if (conflictingAppointments.length > 0) {
        throw {
          status: 409,
          message: "Rescheduled time conflicts with existing booking. Please choose a different time."
        };
      }

      const result = await tx.update(appointments)
        .set({ 
          dateTime: new Date(dateTime),
          locationId: locationId 
        })
        .where(eq(appointments.id, id))
        .returning();
      return result[0];
    });
  }

  async checkAppointmentConflict(locationId: string, dateTime: Date, excludeAppointmentId?: string): Promise<boolean> {
    const db = await getDb();
    const targetDateTime = new Date(dateTime);

    const startWindow = new Date(targetDateTime.getTime() - 30 * 60000);
    const endWindow = new Date(targetDateTime.getTime() + 30 * 60000);
    
    // Use SQL EXISTS for efficient conflict checking with composite index
    let query = sql`
      SELECT EXISTS (
        SELECT 1 
        FROM ${appointments}
        WHERE ${appointments.locationId} = ${locationId}
          AND ${appointments.dateTime} >= ${startWindow}
          AND ${appointments.dateTime} <= ${endWindow}
          AND ${appointments.status} = 'confirmed'
          ${excludeAppointmentId ? sql`AND ${appointments.id} != ${excludeAppointmentId}` : sql``}
      ) as conflict_exists
    `;
    
    const result = await db.execute<{ conflict_exists: boolean }>(query);
    return result.rows[0]?.conflict_exists || false;
  }

  async deleteAppointment(id: string): Promise<boolean> {
    const db = await getDb();
    const result = await db.delete(appointments).where(eq(appointments.id, id)).returning();
    return result.length > 0;
  }

  async getAllCars(offset: number = 0, limit: number = 100, filters?: CarFilterOptions): Promise<Car[]> {
    const db = await getDb();
    
    const whereConditions: any[] = [];
    
    if (filters?.transmission) {
      whereConditions.push(eq(cars.transmission, filters.transmission));
    }
    
    if (filters?.bodyType) {
      whereConditions.push(eq(cars.bodyType, filters.bodyType));
    }
    
    if (filters?.color) {
      whereConditions.push(eq(cars.color, filters.color));
    }
    
    if (filters?.yearMin !== undefined) {
      whereConditions.push(gte(cars.year, filters.yearMin));
    }
    
    if (filters?.yearMax !== undefined) {
      whereConditions.push(lte(cars.year, filters.yearMax));
    }
    
    if (filters?.mileageMin !== undefined) {
      whereConditions.push(gte(cars.mileage, filters.mileageMin));
    }
    
    if (filters?.mileageMax !== undefined) {
      whereConditions.push(lte(cars.mileage, filters.mileageMax));
    }
    
    let query = db.select().from(cars);
    
    if (whereConditions.length > 0) {
      query = query.where(and(...whereConditions)) as any;
    }
    
    if (filters?.sortBy) {
      const sortColumn = filters.sortBy === 'price' ? cars.price : 
                        filters.sortBy === 'year' ? cars.year : 
                        cars.mileage;
      const sortFunction = filters.sortOrder === 'desc' ? desc : asc;
      query = query.orderBy(sortFunction(sortColumn)) as any;
    } else {
      query = query.orderBy(desc(cars.createdAt)) as any;
    }
    
    return await query.offset(offset).limit(limit);
  }

  async getCarCount(filters?: CarFilterOptions): Promise<number> {
    const db = await getDb();
    
    const whereConditions: any[] = [];
    
    if (filters?.transmission) {
      whereConditions.push(eq(cars.transmission, filters.transmission));
    }
    
    if (filters?.bodyType) {
      whereConditions.push(eq(cars.bodyType, filters.bodyType));
    }
    
    if (filters?.color) {
      whereConditions.push(eq(cars.color, filters.color));
    }
    
    if (filters?.yearMin !== undefined) {
      whereConditions.push(gte(cars.year, filters.yearMin));
    }
    
    if (filters?.yearMax !== undefined) {
      whereConditions.push(lte(cars.year, filters.yearMax));
    }
    
    if (filters?.mileageMin !== undefined) {
      whereConditions.push(gte(cars.mileage, filters.mileageMin));
    }
    
    if (filters?.mileageMax !== undefined) {
      whereConditions.push(lte(cars.mileage, filters.mileageMax));
    }
    
    let query = db.select({ count: sql<number>`cast(count(*) as integer)` }).from(cars);
    
    if (whereConditions.length > 0) {
      query = query.where(and(...whereConditions)) as any;
    }
    
    const result = await query;
    return result[0].count;
  }

  async getCar(id: string): Promise<Car | undefined> {
    const db = await getDb();
    
    // Use LEFT JOIN with JSON aggregation to fetch car and images in one query
    const result = await db
      .select({
        car: cars,
        images: sql<CarImage[]>`
          COALESCE(
            json_agg(
              json_build_object(
                'id', ${carImages.id},
                'carId', ${carImages.carId},
                'imageUrl', ${carImages.imageUrl},
                'displayOrder', ${carImages.displayOrder},
                'isPrimary', ${carImages.isPrimary},
                'createdAt', ${carImages.createdAt}
              ) ORDER BY ${carImages.displayOrder}
            ) FILTER (WHERE ${carImages.id} IS NOT NULL),
            '[]'::json
          )
        `
      })
      .from(cars)
      .leftJoin(carImages, eq(cars.id, carImages.carId))
      .where(eq(cars.id, id))
      .groupBy(cars.id)
      .limit(1);
    
    if (!result || result.length === 0) {
      return undefined;
    }
    
    return {
      ...result[0].car,
      images: result[0].images
    } as any;
  }

  async getCarsForSale(): Promise<Car[]> {
    const db = await getDb();
    
    // Use LEFT JOIN with JSON aggregation to fetch cars and images in one query
    const result = await db
      .select({
        car: cars,
        images: sql<CarImage[]>`
          COALESCE(
            json_agg(
              json_build_object(
                'id', ${carImages.id},
                'carId', ${carImages.carId},
                'imageUrl', ${carImages.imageUrl},
                'displayOrder', ${carImages.displayOrder},
                'isPrimary', ${carImages.isPrimary},
                'createdAt', ${carImages.createdAt}
              ) ORDER BY ${carImages.displayOrder}
            ) FILTER (WHERE ${carImages.id} IS NOT NULL),
            '[]'::json
          )
        `
      })
      .from(cars)
      .leftJoin(carImages, eq(cars.id, carImages.carId))
      .where(eq(cars.isAuction, false))
      .groupBy(cars.id)
      .orderBy(desc(cars.createdAt));
    
    return result.map(r => ({
      ...r.car,
      images: r.images
    })) as any;
  }

  async getAuctionCars(): Promise<Car[]> {
    const db = await getDb();
    
    // Use LEFT JOIN with JSON aggregation to fetch cars and images in one query
    const result = await db
      .select({
        car: cars,
        images: sql<CarImage[]>`
          COALESCE(
            json_agg(
              json_build_object(
                'id', ${carImages.id},
                'carId', ${carImages.carId},
                'imageUrl', ${carImages.imageUrl},
                'displayOrder', ${carImages.displayOrder},
                'isPrimary', ${carImages.isPrimary},
                'createdAt', ${carImages.createdAt}
              ) ORDER BY ${carImages.displayOrder}
            ) FILTER (WHERE ${carImages.id} IS NOT NULL),
            '[]'::json
          )
        `
      })
      .from(cars)
      .leftJoin(carImages, eq(cars.id, carImages.carId))
      .where(eq(cars.isAuction, true))
      .groupBy(cars.id)
      .orderBy(desc(cars.createdAt));
    
    return result.map(r => ({
      ...r.car,
      images: r.images
    })) as any;
  }

  async createCar(car: InsertCar): Promise<Car> {
    const db = await getDb();
    const result = await db.insert(cars).values(car).returning();
    return result[0];
  }

  async updateCar(id: string, updates: Partial<Car>): Promise<Car | undefined> {
    const db = await getDb();
    try {
      const result = await db.update(cars)
        .set(updates)
        .where(eq(cars.id, id))
        .returning();
      return result[0];
    } catch (error) {
      const err = error as DatabaseError;

      if (err.code === '23505') {

        throw {
          status: 409,
          message: "A car with this registration number or identifier already exists."
        };
      }
      if (err.code === '23503') {

        throw {
          status: 400,
          message: "Invalid reference in car data. Please check that all related records exist."
        };
      }
      if (err.code === '23502') {

        throw {
          status: 400,
          message: "Missing required car information. Please provide all required fields."
        };
      }

      throw err;
    }
  }

  async deleteCar(id: string): Promise<boolean> {
    const db = await getDb();
    try {
      const result = await db.delete(cars).where(eq(cars.id, id)).returning();
      return result.length > 0;
    } catch (error) {
      const err = error as DatabaseError;

      if (err.code === '23503') {

        throw {
          status: 409,
          message: "Cannot delete car as it is referenced by other records (appointments, bids, etc.). Please remove related records first."
        };
      }

      throw err;
    }
  }

  async getCarImages(carId: string): Promise<CarImage[]> {
    const db = await getDb();
    const images = await db.select()
      .from(carImages)
      .where(eq(carImages.carId, carId))
      .orderBy(asc(carImages.displayOrder));
    return images;
  }

  async createCarImage(data: InsertCarImage): Promise<CarImage> {
    const db = await getDb();
    try {
      const result = await db.insert(carImages).values(data).returning();
      return result[0];
    } catch (error) {
      const err = error as DatabaseError;
      if (err.code === '23503') {
        throw {
          status: 400,
          message: "Invalid car ID. The car does not exist."
        };
      }
      if (err.code === '23502') {
        throw {
          status: 400,
          message: "Missing required car image information. Please provide all required fields."
        };
      }
      throw err;
    }
  }

  async deleteCarImage(id: string): Promise<void> {
    const db = await getDb();
    await db.delete(carImages).where(eq(carImages.id, id));
  }

  async updateCarImageOrder(id: string, displayOrder: number): Promise<void> {
    const db = await getDb();
    await db.update(carImages)
      .set({ displayOrder })
      .where(eq(carImages.id, id));
  }

  async setCarImagePrimary(carId: string, imageId: string): Promise<void> {
    const db = await getDb();
    
    await db.transaction(async (tx) => {
      await tx.update(carImages)
        .set({ isPrimary: false })
        .where(eq(carImages.carId, carId));
      
      await tx.update(carImages)
        .set({ isPrimary: true })
        .where(and(
          eq(carImages.carId, carId),
          eq(carImages.id, imageId)
        ));
    });
  }

  async createContact(contact: InsertContact): Promise<Contact> {
    const db = await getDb();
    const result = await db.insert(contacts).values(contact).returning();
    return result[0];
  }

  async getAllContacts(): Promise<Contact[]> {
    const db = await getDb();
    return await db.select().from(contacts).orderBy(desc(contacts.createdAt));
  }

  async updateContact(id: string, updates: Partial<Contact>): Promise<Contact | undefined> {
    const db = await getDb();
    const updateData: Partial<Contact> = { ...updates };
    
    if ('notes' in updates) {
      updateData.notesUpdatedAt = new Date();
    }
    
    const result = await db.update(contacts)
      .set(updateData)
      .where(eq(contacts.id, id))
      .returning();
    return result[0];
  }

  async getContactsWithFilter(options: ContactFilterOptions): Promise<{ contacts: Contact[]; total: number; hasMore: boolean }> {
    const db = await getDb();
    const { page = 1, limit = 50, status, startDate, endDate, search } = options;
    const offset = (page - 1) * limit;

    const conditions = [];
    
    if (status) {
      conditions.push(eq(contacts.status, status));
    }
    
    if (startDate) {
      conditions.push(gte(contacts.createdAt, new Date(startDate)));
    }
    
    if (endDate) {
      const endDateTime = new Date(endDate);
      endDateTime.setHours(23, 59, 59, 999);
      conditions.push(lte(contacts.createdAt, endDateTime));
    }
    
    if (search) {
      const searchPattern = `%${search}%`;
      conditions.push(
        or(
          sql`${contacts.name} ILIKE ${searchPattern}`,
          sql`${contacts.email} ILIKE ${searchPattern}`,
          sql`${contacts.subject} ILIKE ${searchPattern}`
        )
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    
    const baseQuery = db.select().from(contacts);
    const query = whereClause ? baseQuery.where(whereClause) : baseQuery;

    const totalQuery = db.select({ count: sql<number>`cast(count(*) as integer)` }).from(contacts);
    const totalWithFilter = whereClause ? totalQuery.where(whereClause) : totalQuery;
    const [{ count: total }] = await totalWithFilter;

    const contactsResult = await query
      .orderBy(desc(contacts.createdAt))
      .offset(offset)
      .limit(limit);

    return {
      contacts: contactsResult,
      total,
      hasMore: contactsResult.length === limit && offset + limit < total
    };
  }

  async getContactsForExport(options: ContactFilterOptions): Promise<Contact[]> {
    const db = await getDb();
    const { status, startDate, endDate, search } = options;
    const exportLimit = 10000;

    const conditions = [];
    
    if (status) {
      conditions.push(eq(contacts.status, status));
    }
    
    if (startDate) {
      conditions.push(gte(contacts.createdAt, new Date(startDate)));
    }
    
    if (endDate) {
      const endDateTime = new Date(endDate);
      endDateTime.setHours(23, 59, 59, 999);
      conditions.push(lte(contacts.createdAt, endDateTime));
    }
    
    if (search) {
      const searchPattern = `%${search}%`;
      conditions.push(
        or(
          sql`${contacts.name} ILIKE ${searchPattern}`,
          sql`${contacts.email} ILIKE ${searchPattern}`,
          sql`${contacts.subject} ILIKE ${searchPattern}`
        )
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    
    const baseQuery = db.select().from(contacts);
    const query = whereClause ? baseQuery.where(whereClause) : baseQuery;

    const contactsResult = await query
      .orderBy(desc(contacts.createdAt))
      .limit(exportLimit);

    return contactsResult;
  }

  async deleteContact(id: string): Promise<boolean> {
    const db = await getDb();
    const result = await db.delete(contacts).where(eq(contacts.id, id)).returning();
    return result.length > 0;
  }

  async deleteContacts(ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;
    const db = await getDb();
    const result = await db.delete(contacts).where(inArray(contacts.id, ids)).returning();
    return result.length;
  }

  async getAllLocations(): Promise<Location[]> {
    const cacheKey = 'all_locations';
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const db = await getDb();
    const result = await db.select().from(locations).orderBy(asc(locations.name));
    
    this.cache.set(cacheKey, result);
    return result;
  }

  async getLocation(id: string): Promise<Location | undefined> {
    const db = await getDb();
    const result = await db.select().from(locations).where(eq(locations.id, id)).limit(1);
    return result[0];
  }

  async createLocation(location: InsertLocation): Promise<Location> {
    const db = await getDb();
    const result = await db.insert(locations).values(location).returning();
    
    this.invalidateLocationsCache();
    
    return result[0];
  }

  async updateLocation(id: string, updates: Partial<Location>): Promise<Location | undefined> {
    const db = await getDb();
    const result = await db.update(locations)
      .set(updates)
      .where(eq(locations.id, id))
      .returning();
    
    this.invalidateLocationsCache();
    
    return result[0];
  }

  async deleteLocation(id: string): Promise<boolean> {
    const db = await getDb();
    const result = await db.delete(locations).where(eq(locations.id, id));
    
    this.invalidateLocationsCache();
    
    return (result.rowCount ?? 0) > 0;
  }

  async hasLocationAppointments(locationId: string): Promise<boolean> {
    const db = await getDb();
    const result = await db.select({ count: sql<number>`count(*)` })
      .from(appointments)
      .where(eq(appointments.locationId, locationId));
    return result[0]?.count > 0;
  }

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

  async hasActiveBids(carId: string): Promise<boolean> {
    const db = await getDb();

    const car = await db.select().from(cars).where(eq(cars.id, carId)).limit(1);
    if (!car[0]) {
      return false;
    }

    const now = new Date();
    const isActiveAuction = car[0].isAuction && 
                           car[0].auctionEndTime && 
                           car[0].auctionEndTime > now;
    
    if (!isActiveAuction) {
      return false;
    }

    const bidRows = await db.select().from(bids).where(eq(bids.carId, carId)).limit(1);
    return bidRows.length > 0;
  }

  async getAllBids(options: { page?: number; limit?: number; status?: string; carId?: string; startDate?: string; endDate?: string; minAmount?: number; maxAmount?: number }): Promise<{ bids: any[]; total: number; hasMore: boolean }> {
    const db = await getDb();
    const page = options.page || 1;
    const limit = options.limit || 20;
    const offset = (page - 1) * limit;

    const conditions = [];

    if (options.status && options.status !== "all") {
      conditions.push(eq(bids.status, options.status));
    }

    if (options.carId) {
      conditions.push(eq(bids.carId, options.carId));
    }

    if (options.startDate) {
      conditions.push(gte(bids.bidTime, new Date(options.startDate)));
    }

    if (options.endDate) {
      const endDate = new Date(options.endDate);
      endDate.setHours(23, 59, 59, 999);
      conditions.push(lte(bids.bidTime, endDate));
    }

    if (options.minAmount !== undefined) {
      conditions.push(gte(bids.bidAmount, options.minAmount));
    }

    if (options.maxAmount !== undefined) {
      conditions.push(lte(bids.bidAmount, options.maxAmount));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [bidsData, totalResult] = await Promise.all([
      db.select({
        id: bids.id,
        carId: bids.carId,
        userId: bids.userId,
        bidderEmail: bids.bidderEmail,
        bidAmount: bids.bidAmount,
        status: bids.status,
        bidTime: bids.bidTime,
        userName: users.name,
        userEmail: users.email,
        carMake: cars.make,
        carModel: cars.model,
        carYear: cars.year
      })
        .from(bids)
        .leftJoin(users, eq(bids.userId, users.id))
        .leftJoin(cars, eq(bids.carId, cars.id))
        .where(whereClause)
        .orderBy(desc(bids.bidTime))
        .limit(limit)
        .offset(offset),
      db.select({ count: sql<number>`count(*)` })
        .from(bids)
        .where(whereClause)
    ]);

    const total = totalResult[0]?.count || 0;
    const hasMore = offset + bidsData.length < total;

    return { bids: bidsData, total, hasMore };
  }

  async updateBidStatus(bidId: string, status: string): Promise<Bid | undefined> {
    const db = await getDb();
    const result = await db.update(bids)
      .set({ status })
      .where(eq(bids.id, bidId))
      .returning();
    return result[0];
  }

  async getBidById(bidId: string): Promise<Bid | undefined> {
    const db = await getDb();
    const result = await db.select().from(bids)
      .where(eq(bids.id, bidId))
      .limit(1);
    return result[0];
  }

  async getBidAnalytics(): Promise<{ totalBids: number; pendingBids: number; acceptedBids: number; rejectedBids: number; totalValue: number; avgBidAmount: number }> {
    const db = await getDb();
    
    const [totalResult, pendingResult, acceptedResult, rejectedResult, valueResult] = await Promise.all([
      db.select({ count: sql<number>`count(*)` }).from(bids),
      db.select({ count: sql<number>`count(*)` }).from(bids).where(eq(bids.status, "pending")),
      db.select({ count: sql<number>`count(*)` }).from(bids).where(eq(bids.status, "accepted")),
      db.select({ count: sql<number>`count(*)` }).from(bids).where(eq(bids.status, "rejected")),
      db.select({ 
        totalValue: sql<number>`COALESCE(SUM(${bids.bidAmount}), 0)`,
        avgBidAmount: sql<number>`COALESCE(AVG(${bids.bidAmount}), 0)`
      }).from(bids)
    ]);

    return {
      totalBids: totalResult[0]?.count || 0,
      pendingBids: pendingResult[0]?.count || 0,
      acceptedBids: acceptedResult[0]?.count || 0,
      rejectedBids: rejectedResult[0]?.count || 0,
      totalValue: valueResult[0]?.totalValue || 0,
      avgBidAmount: valueResult[0]?.avgBidAmount || 0
    };
  }

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

  async createVerificationToken(userId: string, email: string, purpose: string = 'email_verification'): Promise<{ token: string; tokenHash: string }> {
    const db = await getDb();
    const crypto = await import('crypto');

    const token = crypto.randomBytes(32).toString('hex');

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await db.insert(emailVerificationTokens).values({
      userId,
      email,
      tokenHash,
      purpose,
      expiresAt,
      resendCount: 0
    });

    return { token, tokenHash };
  }

  async getVerificationToken(tokenHash: string, email: string, purpose?: string): Promise<EmailVerificationToken | undefined> {
    const db = await getDb();
    const now = new Date();

    const conditions = [
      eq(emailVerificationTokens.tokenHash, tokenHash),
      eq(emailVerificationTokens.email, email),
      isNull(emailVerificationTokens.consumedAt),
      gte(emailVerificationTokens.expiresAt, now)
    ];

    if (purpose) {
      conditions.push(eq(emailVerificationTokens.purpose, purpose));
    }

    const result = await db.select()
      .from(emailVerificationTokens)
      .where(and(...conditions))
      .limit(1);
    
    return result[0];
  }

  async consumeVerificationToken(tokenHash: string, purpose?: string): Promise<boolean> {
    const db = await getDb();
    
    return await db.transaction(async (tx) => {

      const tokenResult = await tx.select()
        .from(emailVerificationTokens)
        .where(eq(emailVerificationTokens.tokenHash, tokenHash))
        .limit(1);
      
      if (!tokenResult[0]) {
        return false;
      }
      
      const token = tokenResult[0];

      await tx.update(emailVerificationTokens)
        .set({ consumedAt: new Date() })
        .where(eq(emailVerificationTokens.id, token.id));

      if (token.purpose === 'email_verification') {
        await tx.update(users)
          .set({ emailVerified: true })
          .where(eq(users.id, token.userId));
      }
      
      return true;
    });
  }

  async cleanupExpiredVerificationTokens(cutoffDate: Date): Promise<number> {
    const db = await getDb();
    
    const result = await db.delete(emailVerificationTokens)
      .where(lte(emailVerificationTokens.expiresAt, cutoffDate))
      .returning({ id: emailVerificationTokens.id });
    
    return result.length;
  }

  async incrementResendCount(userId: string): Promise<boolean> {
    const db = await getDb();

    const result = await db.update(emailVerificationTokens)
      .set({ 
        resendCount: sql`${emailVerificationTokens.resendCount} + 1` 
      })
      .where(and(
        eq(emailVerificationTokens.userId, userId),
        isNull(emailVerificationTokens.consumedAt)
      ))
      .returning({ id: emailVerificationTokens.id });
    
    return result.length > 0;
  }

  async getActiveVerificationToken(userId: string): Promise<EmailVerificationToken | undefined> {
    const db = await getDb();
    const now = new Date();
    
    const result = await db.select()
      .from(emailVerificationTokens)
      .where(and(
        eq(emailVerificationTokens.userId, userId),
        isNull(emailVerificationTokens.consumedAt),
        gte(emailVerificationTokens.expiresAt, now)
      ))
      .orderBy(desc(emailVerificationTokens.createdAt))
      .limit(1);
    
    return result[0];
  }

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

  async updateWhatsAppMessageStatus(messageSid: string, updates: { status: string; providerResponse?: string }): Promise<boolean> {
    const db = await getDb();
    const result = await db.update(whatsappMessages)
      .set({ 
        status: updates.status,
        providerResponse: updates.providerResponse || null
      })
      .where(eq(whatsappMessages.messageSid, messageSid))
      .returning();
    return result.length > 0;
  }
  
  async getWhatsAppMessages(options: { page: number; limit: number; status?: string }): Promise<WhatsAppMessage[]> {
    const db = await getDb();

    const baseQuery = db.select().from(whatsappMessages)
      .orderBy(desc(whatsappMessages.sentAt))
      .offset((options.page - 1) * options.limit)
      .limit(options.limit);
    
    if (options.status) {
      return await baseQuery.where(eq(whatsappMessages.status, options.status));
    }
    
    return await baseQuery;
  }
  
  async getWhatsAppMessage(id: string): Promise<WhatsAppMessage | null> {
    const db = await getDb();
    const result = await db.select().from(whatsappMessages)
      .where(eq(whatsappMessages.id, id))
      .limit(1);
    return result[0] || null;
  }
  
  async updateWhatsAppMessage(id: string, updates: Partial<WhatsAppMessage>): Promise<boolean> {
    const db = await getDb();
    const result = await db.update(whatsappMessages)
      .set(updates)
      .where(eq(whatsappMessages.id, id))
      .returning();
    return result.length > 0;
  }

  async logAdminAction(auditLog: InsertAdminAuditLog): Promise<AdminAuditLog> {
    const db = await getDb();
    const result = await db.insert(adminAuditLogs).values(auditLog).returning();
    return result[0];
  }

  async getAdminAuditLogs(adminUserId?: string, limit: number = 50, offset: number = 0): Promise<AdminAuditLog[]> {
    const db = await getDb();
    const query = db.select().from(adminAuditLogs);
    
    if (adminUserId) {
      return await query
        .where(eq(adminAuditLogs.adminUserId, adminUserId))
        .orderBy(desc(adminAuditLogs.createdAt))
        .limit(limit)
        .offset(offset);
    }
    
    return await query
      .orderBy(desc(adminAuditLogs.createdAt))
      .limit(limit)
      .offset(offset);
  }

  async getAdminAuditLogsCount(adminUserId?: string): Promise<number> {
    const db = await getDb();
    const query = db.select({ count: sql<number>`count(*)` }).from(adminAuditLogs);
    
    if (adminUserId) {
      const result = await query.where(eq(adminAuditLogs.adminUserId, adminUserId));
      return Number(result[0]?.count || 0);
    }
    
    const result = await query;
    return Number(result[0]?.count || 0);
  }

  async getResourceAuditLogs(resource: string, resourceId: string, limit: number = 50): Promise<AdminAuditLog[]> {
    const db = await getDb();
    return await db.select().from(adminAuditLogs)
      .where(and(
        eq(adminAuditLogs.resource, resource),
        eq(adminAuditLogs.resourceId, resourceId)
      ))
      .orderBy(desc(adminAuditLogs.createdAt))
      .limit(limit);
  }

  async checkAndIncrementRateLimit(userId: string, windowMs: number): Promise<{ count: number; resetTime: number; withinWindow: boolean }> {
    const db = await getDb();
    const now = Date.now();
    const newResetTime = new Date(now + windowMs);
    const nowDate = new Date(now);

    const result = await db.insert(adminRateLimits)
      .values({
        userId,
        count: 1,
        resetTime: newResetTime,
        lastUpdate: nowDate
      })
      .onConflictDoUpdate({
        target: adminRateLimits.userId,
        set: {

          count: sql`CASE 
            WHEN ${adminRateLimits.resetTime} > ${nowDate} THEN ${adminRateLimits.count} + 1
            ELSE 1
          END`,
          resetTime: sql`CASE 
            WHEN ${adminRateLimits.resetTime} > ${nowDate} THEN ${adminRateLimits.resetTime}
            ELSE ${newResetTime}
          END`,
          lastUpdate: nowDate
        }
      })
      .returning({
        count: adminRateLimits.count,
        resetTime: adminRateLimits.resetTime
      });
    
    const record = result[0];
    const resetTimeMs = record.resetTime.getTime();
    const withinWindow = now < resetTimeMs;
    
    return {
      count: record.count,
      resetTime: resetTimeMs,
      withinWindow
    };
  }

  async cleanupExpiredRateLimits(): Promise<number> {
    const db = await getDb();
    const now = new Date();
    
    const result = await db.delete(adminRateLimits)
      .where(lte(adminRateLimits.resetTime, now))
      .returning({ userId: adminRateLimits.userId });
    
    return result.length;
  }

  async getAllSiteSettings(): Promise<SiteSetting[]> {
    const db = await getDb();
    return await db.select().from(siteSettings).orderBy(asc(siteSettings.settingKey));
  }

  async getSiteSettingByKey(key: string): Promise<SiteSetting | undefined> {
    const db = await getDb();
    const result = await db.select().from(siteSettings)
      .where(eq(siteSettings.settingKey, key))
      .limit(1);
    return result[0];
  }

  async updateSiteSetting(key: string, value: string, category?: string, description?: string): Promise<SiteSetting> {
    const db = await getDb();
    const updates: any = { 
      settingValue: value,
      updatedAt: new Date()
    };
    if (category !== undefined) updates.category = category;
    if (description !== undefined) updates.description = description;

    const result = await db.update(siteSettings)
      .set(updates)
      .where(eq(siteSettings.settingKey, key))
      .returning();
    
    return result[0];
  }

  async getAllMediaLibraryImages(filters?: { imageType?: string; uploadedBy?: string; isActive?: boolean }): Promise<MediaLibrary[]> {
    const db = await getDb();
    const conditions = [];
    
    if (filters?.imageType) {
      conditions.push(eq(mediaLibrary.imageType, filters.imageType));
    }
    if (filters?.uploadedBy) {
      conditions.push(eq(mediaLibrary.uploadedBy, filters.uploadedBy));
    }
    if (filters?.isActive !== undefined) {
      conditions.push(eq(mediaLibrary.isActive, filters.isActive));
    }

    if (conditions.length > 0) {
      return await db.select().from(mediaLibrary)
        .where(and(...conditions))
        .orderBy(desc(mediaLibrary.uploadedAt));
    }
    
    return await db.select().from(mediaLibrary)
      .orderBy(desc(mediaLibrary.uploadedAt));
  }

  async getMediaLibraryImageById(id: string): Promise<MediaLibrary | undefined> {
    const db = await getDb();
    const result = await db.select().from(mediaLibrary)
      .where(eq(mediaLibrary.id, id))
      .limit(1);
    return result[0];
  }

  async createMediaLibraryImage(data: InsertMediaLibrary): Promise<MediaLibrary> {
    const db = await getDb();
    const result = await db.insert(mediaLibrary).values(data).returning();
    return result[0];
  }

  async updateMediaLibraryImage(id: string, data: Partial<MediaLibrary>): Promise<MediaLibrary | undefined> {
    const db = await getDb();
    const result = await db.update(mediaLibrary)
      .set(data)
      .where(eq(mediaLibrary.id, id))
      .returning();
    return result[0];
  }

  async deleteMediaLibraryImage(id: string): Promise<boolean> {
    const db = await getDb();
    const result = await db.delete(mediaLibrary)
      .where(eq(mediaLibrary.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async incrementMediaUsageCount(id: string): Promise<boolean> {
    const db = await getDb();
    const result = await db.update(mediaLibrary)
      .set({ usageCount: sql`${mediaLibrary.usageCount} + 1` })
      .where(eq(mediaLibrary.id, id))
      .returning();
    return result.length > 0;
  }

  async createInvoice(invoiceData: InsertInvoice, items: InsertInvoiceItem[]): Promise<InvoiceWithItems> {
    const db = await getDb();
    
    return await db.transaction(async (tx) => {
      const [invoice] = await tx.insert(invoices).values(invoiceData).returning();
      
      const itemsWithInvoiceId = items.map(item => ({
        ...item,
        invoiceId: invoice.id
      }));
      
      const createdItems = await tx.insert(invoiceItems).values(itemsWithInvoiceId).returning();
      
      return {
        ...invoice,
        items: createdItems
      };
    });
  }

  async getInvoices(filters?: InvoiceFilterOptions): Promise<{ invoices: InvoiceWithItems[]; total: number; hasMore: boolean }> {
    const db = await getDb();
    const page = filters?.page || 1;
    const limit = filters?.limit || 20;
    const offset = (page - 1) * limit;

    const conditions = [];
    
    if (filters?.status) {
      conditions.push(eq(invoices.status, filters.status));
    }
    if (filters?.customerEmail) {
      conditions.push(eq(invoices.customerEmail, filters.customerEmail));
    }
    if (filters?.customerPhone) {
      conditions.push(eq(invoices.customerPhone, filters.customerPhone));
    }
    if (filters?.startDate) {
      conditions.push(gte(invoices.invoiceDate, new Date(filters.startDate)));
    }
    if (filters?.endDate) {
      conditions.push(lte(invoices.invoiceDate, new Date(filters.endDate)));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const invoicesList = whereClause
      ? await db.select().from(invoices).where(whereClause).orderBy(desc(invoices.invoiceDate)).limit(limit + 1).offset(offset)
      : await db.select().from(invoices).orderBy(desc(invoices.invoiceDate)).limit(limit + 1).offset(offset);

    const hasMore = invoicesList.length > limit;
    const paginatedInvoices = hasMore ? invoicesList.slice(0, limit) : invoicesList;

    const invoicesWithItems: InvoiceWithItems[] = await Promise.all(
      paginatedInvoices.map(async (invoice) => {
        const items = await db.select().from(invoiceItems)
          .where(eq(invoiceItems.invoiceId, invoice.id))
          .orderBy(asc(invoiceItems.displayOrder));
        
        return {
          ...invoice,
          items
        };
      })
    );

    const totalResult = whereClause
      ? await db.select({ count: sql<number>`count(*)` }).from(invoices).where(whereClause)
      : await db.select({ count: sql<number>`count(*)` }).from(invoices);
    
    const total = Number(totalResult[0]?.count || 0);

    return {
      invoices: invoicesWithItems,
      total,
      hasMore
    };
  }

  async getInvoiceById(id: string): Promise<InvoiceWithItems | undefined> {
    const db = await getDb();
    
    const [invoice] = await db.select().from(invoices).where(eq(invoices.id, id)).limit(1);
    
    if (!invoice) {
      return undefined;
    }

    const items = await db.select().from(invoiceItems)
      .where(eq(invoiceItems.invoiceId, invoice.id))
      .orderBy(asc(invoiceItems.displayOrder));

    return {
      ...invoice,
      items
    };
  }

  async deleteInvoice(id: string): Promise<boolean> {
    const db = await getDb();
    const result = await db.delete(invoices).where(eq(invoices.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async updateInvoice(id: string, invoiceData: Partial<InsertInvoice>): Promise<InvoiceWithItems | undefined> {
    const db = await getDb();
    
    const [updatedInvoice] = await db.update(invoices)
      .set({ ...invoiceData, updatedAt: new Date() })
      .where(eq(invoices.id, id))
      .returning();

    if (!updatedInvoice) {
      return undefined;
    }

    const items = await db.select().from(invoiceItems)
      .where(eq(invoiceItems.invoiceId, updatedInvoice.id))
      .orderBy(asc(invoiceItems.displayOrder));

    return {
      ...updatedInvoice,
      items
    };
  }

  async getEligibleTransactionsForInvoicing(): Promise<{ appointments: any[]; bids: any[]; cars: any[] }> {
    const db = await getDb();
    
    const completedAppointments = await db
      .select({
        id: appointments.id,
        customerName: customers.name,
        customerEmail: customers.email,
        customerPhone: customers.phone,
        customerCountryCode: customers.countryCode,
        serviceName: services.title,
        servicePrice: services.price,
        status: appointments.status,
        dateTime: appointments.dateTime,
        type: sql<string>`'service'`.as('type')
      })
      .from(appointments)
      .leftJoin(customers, eq(appointments.customerId, customers.id))
      .leftJoin(services, eq(appointments.serviceId, services.id))
      .where(eq(appointments.status, 'completed'));

    const acceptedBids = await db
      .select({
        id: bids.id,
        customerEmail: bids.bidderEmail,
        bidAmount: bids.bidAmount,
        carMake: cars.make,
        carModel: cars.model,
        carYear: cars.year,
        status: bids.status,
        bidTime: bids.bidTime,
        type: sql<string>`'auction'`.as('type')
      })
      .from(bids)
      .leftJoin(cars, eq(bids.carId, cars.id))
      .where(eq(bids.status, 'accepted'));

    return {
      appointments: completedAppointments,
      bids: acceptedBids,
      cars: []
    };
  }
}

export class MemStorage implements IStorage {
  private users: Map<string, User> = new Map();
  private customers: Map<string, Customer> = new Map();
  private services: Map<string, Service> = new Map();
  private appointments: Map<string, Appointment> = new Map();
  private cars: Map<string, Car> = new Map();
  private carImages: Map<string, CarImage> = new Map();
  private contacts: Map<string, Contact> = new Map();
  private locations: Map<string, Location> = new Map();
  private auditLogs: Map<string, AdminAuditLog> = new Map();
  private rateLimits: Map<string, { count: number; resetTime: number }> = new Map();

  constructor() {
    this.seedData();
  }

  private seedData() {

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
        icon: "droplets",
        providerName: "Rajesh Kumar",
        providerPhone: "9876543210",
        providerCountryCode: "+91"
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
        icon: "car",
        providerName: "Amit Sharma",
        providerPhone: "9876543211",
        providerCountryCode: "+91"
      }
    ];

    services.forEach(service => this.services.set(service.id, service));

    const cars: Car[] = [

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
        transmission: null,
        numOwners: null,
        bodyType: null,
        color: null,
        engineSize: null,
        features: null,
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
        transmission: null,
        numOwners: null,
        bodyType: null,
        color: null,
        engineSize: null,
        features: null,
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
        transmission: null,
        numOwners: null,
        bodyType: null,
        color: null,
        engineSize: null,
        features: null,
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
        transmission: null,
        numOwners: null,
        bodyType: null,
        color: null,
        engineSize: null,
        features: null,
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
        transmission: null,
        numOwners: null,
        bodyType: null,
        color: null,
        engineSize: null,
        features: null,
        createdAt: new Date()
      },

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
        auctionEndTime: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
        description: "Luxury sedan with premium features",
        transmission: null,
        numOwners: null,
        bodyType: null,
        color: null,
        engineSize: null,
        features: null,
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
        auctionEndTime: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000),
        description: "Compact SUV perfect for city driving",
        transmission: null,
        numOwners: null,
        bodyType: null,
        color: null,
        engineSize: null,
        features: null,
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
        auctionEndTime: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
        description: "Reliable MPV with excellent build quality",
        transmission: null,
        numOwners: null,
        bodyType: null,
        color: null,
        engineSize: null,
        features: null,
        createdAt: new Date()
      }
    ];

    cars.forEach(car => this.cars.set(car.id, car));

  }

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
      role: user.role ?? "customer",
      preferredNotificationChannel: user.preferredNotificationChannel ?? "whatsapp",
      isActive: user.isActive ?? true
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

    const duplicateUser = Array.from(this.users.values()).find(user => user.googleId === googleId);
    if (duplicateUser) {
      throw new Error("This Google account is already linked to another user");
    }

    const updatedUser: User = {
      ...existingUser,
      googleId,
      provider: "google",
      emailVerified: true
    };
    
    this.users.set(userId, updatedUser);
    return updatedUser;
  }

  async getUserCount(): Promise<number> {
    return this.users.size;
  }

  async getAllUsers(offset: number = 0, limit: number = 100): Promise<User[]> {
    const allUsers = Array.from(this.users.values()).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return allUsers.slice(offset, offset + limit);
  }

  async deleteUser(id: string): Promise<boolean> {
    this.users.delete(id);
    return true;
  }

  async getCustomer(id: string): Promise<Customer | undefined> {
    return this.customers.get(id);
  }

  async getCustomerByEmail(email: string): Promise<Customer | undefined> {
    return Array.from(this.customers.values()).find(customer => customer.email === email);
  }

  async getCustomerByUserId(userId: string): Promise<Customer | undefined> {
    return Array.from(this.customers.values()).find(customer => customer.userId === userId);
  }

  async createCustomer(customer: InsertCustomer): Promise<Customer> {
    const id = randomUUID();
    const newCustomer: Customer = { 
      ...customer, 
      id, 
      userId: customer.userId || null,
      countryCode: customer.countryCode || "+91",
      createdAt: new Date() 
    };
    this.customers.set(id, newCustomer);
    return newCustomer;
  }

  async updateCustomer(id: string, updates: Partial<InsertCustomer>): Promise<Customer | undefined> {
    const existingCustomer = this.customers.get(id);
    if (!existingCustomer) {
      return undefined;
    }
    
    const updatedCustomer: Customer = {
      ...existingCustomer,
      ...updates
    };
    
    this.customers.set(id, updatedCustomer);
    return updatedCustomer;
  }

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
    const newService: Service = { 
      ...service, 
      id, 
      popular: service.popular ?? false, 
      icon: service.icon ?? null,
      providerName: service.providerName ?? null,
      providerPhone: service.providerPhone ?? null,
      providerCountryCode: service.providerCountryCode ?? null
    };
    this.services.set(id, newService);
    return newService;
  }

  async updateService(id: string, updates: Partial<Service>): Promise<Service | undefined> {
    const service = this.services.get(id);
    if (!service) return undefined;
    
    const updatedService = { ...service, ...updates };
    this.services.set(id, updatedService);
    return updatedService;
  }

  async deleteService(id: string): Promise<void> {
    this.services.delete(id);
  }

  async getAllAppointments(): Promise<AppointmentWithDetails[]> {
    const allAppointments = Array.from(this.appointments.values())
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

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

  async getAppointmentWithDetails(id: string): Promise<AppointmentWithDetails | undefined> {
    const appointment = this.appointments.get(id);
    if (!appointment) {
      return undefined;
    }

    const service = this.services.get(appointment.serviceId);
    const location = this.locations.get(appointment.locationId);
    const customer = this.customers.get(appointment.customerId);
    
    return {
      ...appointment,
      serviceName: service?.title || `Unknown Service (${appointment.serviceId})`,
      locationName: location?.name || `Unknown Location (${appointment.locationId})`,
      customerName: customer?.name || `Unknown Customer (${appointment.customerId})`
    };
  }

  async getAppointmentsByCustomer(customerId: string): Promise<AppointmentWithDetails[]> {
    const customerAppointments = Array.from(this.appointments.values())
      .filter(apt => apt.customerId === customerId)
      .sort((a, b) => b.dateTime.getTime() - a.dateTime.getTime());

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

  async getAppointmentsByService(serviceId: string): Promise<Appointment[]> {
    return Array.from(this.appointments.values())
      .filter(apt => apt.serviceId === serviceId);
  }

  async getAppointmentsByLocation(locationId: string): Promise<Appointment[]> {
    return Array.from(this.appointments.values())
      .filter(apt => apt.locationId === locationId);
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

    const startWindow = new Date(targetDateTime.getTime() - 30 * 60000);
    const endWindow = new Date(targetDateTime.getTime() + 30 * 60000);
    
    const conflictingAppointments = Array.from(this.appointments.values()).filter(apt => {

      if (apt.status !== "confirmed") return false;

      if (apt.locationId !== locationId) return false;

      if (excludeAppointmentId && apt.id === excludeAppointmentId) return false;

      return apt.dateTime >= startWindow && apt.dateTime <= endWindow;
    });
    
    return conflictingAppointments.length > 0;
  }

  async deleteAppointment(id: string): Promise<boolean> {
    return this.appointments.delete(id);
  }

  async getAllCars(offset: number = 0, limit: number = 100, filters?: CarFilterOptions): Promise<Car[]> {
    let carsArray = Array.from(this.cars.values());
    
    if (filters) {
      if (filters.transmission) {
        carsArray = carsArray.filter(car => car.transmission === filters.transmission);
      }
      
      if (filters.bodyType) {
        carsArray = carsArray.filter(car => car.bodyType === filters.bodyType);
      }
      
      if (filters.color) {
        carsArray = carsArray.filter(car => car.color === filters.color);
      }
      
      if (filters.yearMin !== undefined) {
        carsArray = carsArray.filter(car => car.year >= filters.yearMin!);
      }
      
      if (filters.yearMax !== undefined) {
        carsArray = carsArray.filter(car => car.year <= filters.yearMax!);
      }
      
      if (filters.mileageMin !== undefined) {
        carsArray = carsArray.filter(car => car.mileage >= filters.mileageMin!);
      }
      
      if (filters.mileageMax !== undefined) {
        carsArray = carsArray.filter(car => car.mileage <= filters.mileageMax!);
      }
      
      if (filters.sortBy) {
        const sortField = filters.sortBy;
        const sortOrder = filters.sortOrder === 'desc' ? -1 : 1;
        carsArray.sort((a, b) => {
          const aVal = a[sortField];
          const bVal = b[sortField];
          return sortOrder * (aVal > bVal ? 1 : aVal < bVal ? -1 : 0);
        });
      } else {
        carsArray.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      }
    } else {
      carsArray.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    }
    
    return carsArray.slice(offset, offset + limit);
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
    const newCar: Car = { ...car, id, createdAt: new Date(), description: car.description ?? null, isAuction: car.isAuction ?? false, currentBid: car.currentBid ?? null, auctionEndTime: car.auctionEndTime ?? null, transmission: car.transmission ?? null, numOwners: car.numOwners ?? null, bodyType: car.bodyType ?? null, color: car.color ?? null, engineSize: car.engineSize ?? null, features: car.features ?? null };
    this.cars.set(id, newCar);
    return newCar;
  }

  async updateCar(id: string, updates: Partial<Car>): Promise<Car | undefined> {
    const car = this.cars.get(id);
    if (!car) return undefined;
    
    const updatedCar = { ...car, ...updates };
    this.cars.set(id, updatedCar);
    return updatedCar;
  }

  async deleteCar(id: string): Promise<boolean> {
    return this.cars.delete(id);
  }

  async getCarCount(filters?: CarFilterOptions): Promise<number> {
    if (!filters) {
      return this.cars.size;
    }
    
    let carsArray = Array.from(this.cars.values());
    
    if (filters.transmission) {
      carsArray = carsArray.filter(car => car.transmission === filters.transmission);
    }
    
    if (filters.bodyType) {
      carsArray = carsArray.filter(car => car.bodyType === filters.bodyType);
    }
    
    if (filters.color) {
      carsArray = carsArray.filter(car => car.color === filters.color);
    }
    
    if (filters.yearMin !== undefined) {
      carsArray = carsArray.filter(car => car.year >= filters.yearMin!);
    }
    
    if (filters.yearMax !== undefined) {
      carsArray = carsArray.filter(car => car.year <= filters.yearMax!);
    }
    
    if (filters.mileageMin !== undefined) {
      carsArray = carsArray.filter(car => car.mileage >= filters.mileageMin!);
    }
    
    if (filters.mileageMax !== undefined) {
      carsArray = carsArray.filter(car => car.mileage <= filters.mileageMax!);
    }
    
    return carsArray.length;
  }

  async getAppointmentCount(): Promise<number> {
    return this.appointments.size;
  }

  async getCarImages(carId: string): Promise<CarImage[]> {
    return Array.from(this.carImages.values())
      .filter(img => img.carId === carId)
      .sort((a, b) => a.displayOrder - b.displayOrder);
  }

  async createCarImage(data: InsertCarImage): Promise<CarImage> {
    const id = randomUUID();
    const newImage: CarImage = { 
      ...data, 
      id, 
      createdAt: new Date(),
      displayOrder: data.displayOrder ?? 0,
      isPrimary: data.isPrimary ?? false
    };
    this.carImages.set(id, newImage);
    return newImage;
  }

  async deleteCarImage(id: string): Promise<void> {
    this.carImages.delete(id);
  }

  async updateCarImageOrder(id: string, displayOrder: number): Promise<void> {
    const image = this.carImages.get(id);
    if (image) {
      this.carImages.set(id, { ...image, displayOrder });
    }
  }

  async setCarImagePrimary(carId: string, imageId: string): Promise<void> {
    const carImagesList = Array.from(this.carImages.values()).filter(img => img.carId === carId);
    
    carImagesList.forEach(img => {
      if (img.id === imageId) {
        this.carImages.set(img.id, { ...img, isPrimary: true });
      } else {
        this.carImages.set(img.id, { ...img, isPrimary: false });
      }
    });
  }

  async createContact(contact: InsertContact): Promise<Contact> {
    const id = randomUUID();
    const newContact: Contact = { 
      ...contact, 
      id, 
      status: "new", 
      createdAt: new Date(),
      notes: contact.notes ?? null,
      notesUpdatedAt: contact.notesUpdatedAt ?? null
    };
    this.contacts.set(id, newContact);
    return newContact;
  }

  async getAllContacts(): Promise<Contact[]> {
    return Array.from(this.contacts.values()).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async updateContact(id: string, updates: Partial<Contact>): Promise<Contact | undefined> {
    const contact = this.contacts.get(id);
    if (!contact) return undefined;
    
    const updatedContact = { ...contact, ...updates };
    this.contacts.set(id, updatedContact);
    return updatedContact;
  }

  async getContactsWithFilter(options: { page?: number; limit?: number; status?: string }): Promise<{ contacts: Contact[]; total: number; hasMore: boolean }> {
    const { page = 1, limit = 50, status } = options;
    const offset = (page - 1) * limit;

    let allContacts = Array.from(this.contacts.values());
    if (status) {
      allContacts = allContacts.filter(contact => contact.status === status);
    }

    allContacts.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const total = allContacts.length;
    const contacts = allContacts.slice(offset, offset + limit);

    return {
      contacts,
      total,
      hasMore: offset + limit < total
    };
  }

  async deleteContact(id: string): Promise<boolean> {
    return this.contacts.delete(id);
  }

  async deleteContacts(ids: string[]): Promise<number> {
    let count = 0;
    for (const id of ids) {
      if (this.contacts.delete(id)) {
        count++;
      }
    }
    return count;
  }

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

  async updateLocation(id: string, updates: Partial<Location>): Promise<Location | undefined> {
    const existing = this.locations.get(id);
    if (!existing) return undefined;
    
    const updated: Location = { ...existing, ...updates };
    this.locations.set(id, updated);
    return updated;
  }

  async deleteLocation(id: string): Promise<boolean> {
    return this.locations.delete(id);
  }

  async hasLocationAppointments(locationId: string): Promise<boolean> {
    const appointmentsList = Array.from(this.appointments.values());
    return appointmentsList.some(appointment => appointment.locationId === locationId);
  }

  private bids: Map<string, Bid> = new Map();

  async placeBid(bid: InsertBid): Promise<Bid> {
    const id = randomUUID();
    const newBid: Bid = { 
      ...bid, 
      id, 
      bidTime: new Date(),
      status: bid.status || "pending",
      userId: bid.userId || null
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

  async hasActiveBids(carId: string): Promise<boolean> {

    const car = this.cars.get(carId);
    if (!car) {
      return false;
    }

    const now = new Date();
    const isActiveAuction = car.isAuction && 
                           car.auctionEndTime && 
                           car.auctionEndTime > now;
    
    if (!isActiveAuction) {
      return false;
    }

    const carBids = Array.from(this.bids.values()).filter(bid => bid.carId === carId);
    return carBids.length > 0;
  }

  async getAllBids(options: { page?: number; limit?: number; status?: string; carId?: string; startDate?: string; endDate?: string; minAmount?: number; maxAmount?: number }): Promise<{ bids: any[]; total: number; hasMore: boolean }> {
    let filteredBids = Array.from(this.bids.values());
    
    if (options.status && options.status !== "all") {
      filteredBids = filteredBids.filter(bid => (bid as any).status === options.status);
    }
    
    if (options.carId) {
      filteredBids = filteredBids.filter(bid => bid.carId === options.carId);
    }
    
    filteredBids.sort((a, b) => b.bidTime.getTime() - a.bidTime.getTime());
    
    const total = filteredBids.length;
    const page = options.page || 1;
    const limit = options.limit || 20;
    const offset = (page - 1) * limit;
    
    return {
      bids: filteredBids.slice(offset, offset + limit),
      total,
      hasMore: offset + limit < total
    };
  }

  async updateBidStatus(bidId: string, status: string): Promise<Bid | undefined> {
    const bid = this.bids.get(bidId);
    if (bid) {
      const updatedBid = { ...bid, status } as Bid;
      this.bids.set(bidId, updatedBid);
      return updatedBid;
    }
    return undefined;
  }

  async getBidById(bidId: string): Promise<Bid | undefined> {
    return this.bids.get(bidId);
  }

  async getBidAnalytics(): Promise<{ totalBids: number; pendingBids: number; acceptedBids: number; rejectedBids: number; totalValue: number; avgBidAmount: number }> {
    const allBids = Array.from(this.bids.values());
    const totalBids = allBids.length;
    const pendingBids = allBids.filter(b => (b as any).status === "pending").length;
    const acceptedBids = allBids.filter(b => (b as any).status === "accepted").length;
    const rejectedBids = allBids.filter(b => (b as any).status === "rejected").length;
    const totalValue = allBids.reduce((sum, b) => sum + b.bidAmount, 0);
    const avgBidAmount = totalBids > 0 ? totalValue / totalBids : 0;
    
    return {
      totalBids,
      pendingBids,
      acceptedBids,
      rejectedBids,
      totalValue,
      avgBidAmount
    };
  }

  async getUserByPhone(phone: string, countryCode: string): Promise<User | undefined> {
    return Array.from(this.users.values())
      .find(user => user.phone === phone && user.countryCode === countryCode);
  }

  private whatsappMessages: Map<string, WhatsAppMessage> = new Map();

  async logWhatsAppMessage(message: InsertWhatsAppMessage): Promise<WhatsAppMessage> {
    const id = randomUUID();
    const newMessage: WhatsAppMessage = {
      ...message,
      id,
      countryCode: message.countryCode ?? null,
      status: message.status ?? "pending",
      appointmentId: message.appointmentId ?? null,
      messageSid: message.messageSid ?? null,
      providerResponse: message.providerResponse ?? null,
      retryCount: 0,
      maxRetries: 3,
      lastRetryAt: null,
      nextRetryAt: null,
      failureReason: null,
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

  async updateWhatsAppMessageStatus(messageSid: string, updates: { status: string; providerResponse?: string }): Promise<boolean> {
    for (const [id, message] of Array.from(this.whatsappMessages.entries())) {
      if (message.messageSid === messageSid) {
        this.whatsappMessages.set(id, {
          ...message,
          status: updates.status,
          providerResponse: updates.providerResponse || message.providerResponse
        });
        return true;
      }
    }
    return false;
  }
  
  async getWhatsAppMessages(options: { page: number; limit: number; status?: string }): Promise<WhatsAppMessage[]> {
    let messages = Array.from(this.whatsappMessages.values())
      .sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime());
    
    if (options.status) {
      messages = messages.filter(msg => msg.status === options.status);
    }
    
    const start = (options.page - 1) * options.limit;
    return messages.slice(start, start + options.limit);
  }
  
  async getWhatsAppMessage(id: string): Promise<WhatsAppMessage | null> {
    return this.whatsappMessages.get(id) || null;
  }
  
  async updateWhatsAppMessage(id: string, updates: Partial<WhatsAppMessage>): Promise<boolean> {
    const message = this.whatsappMessages.get(id);
    if (!message) return false;
    
    this.whatsappMessages.set(id, { ...message, ...updates });
    return true;
  }

  private adminAuditLogs: Map<string, AdminAuditLog> = new Map();

  async logAdminAction(auditLog: InsertAdminAuditLog): Promise<AdminAuditLog> {
    const id = randomUUID();
    const newAuditLog: AdminAuditLog = {
      ...auditLog,
      id,
      resourceId: auditLog.resourceId ?? null,
      oldValue: auditLog.oldValue ?? null,
      newValue: auditLog.newValue ?? null,
      ipAddress: auditLog.ipAddress ?? null,
      userAgent: auditLog.userAgent ?? null,
      additionalInfo: auditLog.additionalInfo ?? null,
      createdAt: new Date()
    };
    this.adminAuditLogs.set(id, newAuditLog);
    return newAuditLog;
  }

  async getAdminAuditLogs(adminUserId?: string, limit: number = 50, offset: number = 0): Promise<AdminAuditLog[]> {
    let logs = Array.from(this.adminAuditLogs.values());
    
    if (adminUserId) {
      logs = logs.filter(log => log.adminUserId === adminUserId);
    }
    
    return logs
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(offset, offset + limit);
  }

  async getAdminAuditLogsCount(adminUserId?: string): Promise<number> {
    let logs = Array.from(this.adminAuditLogs.values());
    
    if (adminUserId) {
      logs = logs.filter(log => log.adminUserId === adminUserId);
    }
    
    return logs.length;
  }

  async getResourceAuditLogs(resource: string, resourceId: string, limit: number = 50): Promise<AdminAuditLog[]> {
    return Array.from(this.adminAuditLogs.values())
      .filter(log => log.resource === resource && log.resourceId === resourceId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }

  async checkAndIncrementRateLimit(userId: string, windowMs: number): Promise<{ count: number; resetTime: number; withinWindow: boolean }> {
    const now = Date.now();
    const newResetTime = now + windowMs;
    
    const existing = this.rateLimits.get(userId);
    
    if (!existing) {

      this.rateLimits.set(userId, { count: 1, resetTime: newResetTime });
      return { count: 1, resetTime: newResetTime, withinWindow: true };
    }
    
    if (now >= existing.resetTime) {

      this.rateLimits.set(userId, { count: 1, resetTime: newResetTime });
      return { count: 1, resetTime: newResetTime, withinWindow: true };
    }

    const newCount = existing.count + 1;
    this.rateLimits.set(userId, { count: newCount, resetTime: existing.resetTime });
    return { count: newCount, resetTime: existing.resetTime, withinWindow: true };
  }

  async cleanupExpiredRateLimits(): Promise<number> {
    const now = Date.now();
    let cleanedCount = 0;
    
    for (const [userId, limit] of Array.from(this.rateLimits.entries())) {
      if (limit.resetTime <= now) {
        this.rateLimits.delete(userId);
        cleanedCount++;
      }
    }
    
    return cleanedCount;
  }

  async getContactsForExport(options: ContactFilterOptions): Promise<Contact[]> {
    const { status, startDate, endDate, search } = options;
    const exportLimit = 10000;
    
    let filtered = Array.from(this.contacts.values());
    
    if (status) {
      filtered = filtered.filter(contact => contact.status === status);
    }
    
    if (startDate) {
      const start = new Date(startDate);
      filtered = filtered.filter(contact => contact.createdAt >= start);
    }
    
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      filtered = filtered.filter(contact => contact.createdAt <= end);
    }
    
    if (search) {
      const searchLower = search.toLowerCase();
      filtered = filtered.filter(contact =>
        contact.name.toLowerCase().includes(searchLower) ||
        contact.email.toLowerCase().includes(searchLower) ||
        contact.subject.toLowerCase().includes(searchLower)
      );
    }
    
    return filtered
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, exportLimit);
  }

  private emailVerificationTokens: Map<string, EmailVerificationToken> = new Map();

  async createVerificationToken(userId: string, email: string, purpose: string = 'email_verification'): Promise<{ token: string; tokenHash: string }> {
    const crypto = await import('crypto');
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    
    const id = randomUUID();
    const newToken: EmailVerificationToken = {
      id,
      userId,
      email,
      tokenHash,
      purpose,
      expiresAt,
      consumedAt: null,
      resendCount: 0,
      createdAt: new Date()
    };
    
    this.emailVerificationTokens.set(id, newToken);
    return { token, tokenHash };
  }

  async getVerificationToken(tokenHash: string, email: string, purpose?: string): Promise<EmailVerificationToken | undefined> {
    const now = new Date();
    
    return Array.from(this.emailVerificationTokens.values()).find(token =>
      token.tokenHash === tokenHash &&
      token.email === email &&
      token.consumedAt === null &&
      token.expiresAt >= now &&
      (!purpose || token.purpose === purpose)
    );
  }

  async consumeVerificationToken(tokenHash: string, purpose?: string): Promise<boolean> {
    const token = Array.from(this.emailVerificationTokens.values()).find(t =>
      t.tokenHash === tokenHash &&
      (!purpose || t.purpose === purpose)
    );
    
    if (!token) return false;
    
    this.emailVerificationTokens.set(token.id, {
      ...token,
      consumedAt: new Date()
    });
    
    if (token.purpose === 'email_verification') {
      const user = this.users.get(token.userId);
      if (user) {
        this.users.set(token.userId, {
          ...user,
          emailVerified: true
        });
      }
    }
    
    return true;
  }

  async cleanupExpiredVerificationTokens(cutoffDate: Date): Promise<number> {
    const expired = Array.from(this.emailVerificationTokens.entries())
      .filter(([_, token]) => token.expiresAt <= cutoffDate);
    
    expired.forEach(([id]) => this.emailVerificationTokens.delete(id));
    return expired.length;
  }

  async incrementResendCount(userId: string): Promise<boolean> {
    for (const [id, token] of Array.from(this.emailVerificationTokens.entries())) {
      if (token.userId === userId && token.consumedAt === null) {
        this.emailVerificationTokens.set(id, {
          ...token,
          resendCount: token.resendCount + 1
        });
        return true;
      }
    }
    return false;
  }

  async getActiveVerificationToken(userId: string): Promise<EmailVerificationToken | undefined> {
    const now = new Date();
    
    return Array.from(this.emailVerificationTokens.values())
      .filter(token =>
        token.userId === userId &&
        token.consumedAt === null &&
        token.expiresAt >= now
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  }

  async getAllSiteSettings(): Promise<SiteSetting[]> {
    const db = await getDb();
    const result = await db.select().from(siteSettings).orderBy(asc(siteSettings.category), asc(siteSettings.settingKey));
    return result;
  }

  async getSiteSettingByKey(key: string): Promise<SiteSetting | undefined> {
    const db = await getDb();
    const result = await db.select().from(siteSettings).where(eq(siteSettings.settingKey, key)).limit(1);
    return result[0];
  }

  async updateSiteSetting(key: string, value: string, category?: string, description?: string): Promise<SiteSetting> {
    const db = await getDb();
    const existing = await this.getSiteSettingByKey(key);
    
    if (existing) {
      const updates: Partial<SiteSetting> = {
        settingValue: value,
        updatedAt: new Date()
      };
      if (category !== undefined) updates.category = category;
      if (description !== undefined) updates.description = description;
      
      const result = await db.update(siteSettings)
        .set(updates)
        .where(eq(siteSettings.settingKey, key))
        .returning();
      return result[0];
    } else {
      const newSetting: InsertSiteSetting = {
        settingKey: key,
        settingValue: value,
        category: category || null,
        description: description || null
      };
      const result = await db.insert(siteSettings).values(newSetting).returning();
      return result[0];
    }
  }

  async getAllMediaLibraryImages(filters?: { imageType?: string; uploadedBy?: string; isActive?: boolean }): Promise<MediaLibrary[]> {
    const db = await getDb();
    const conditions = [];
    
    if (filters?.imageType) {
      conditions.push(eq(mediaLibrary.imageType, filters.imageType));
    }
    if (filters?.uploadedBy) {
      conditions.push(eq(mediaLibrary.uploadedBy, filters.uploadedBy));
    }
    if (filters?.isActive !== undefined) {
      conditions.push(eq(mediaLibrary.isActive, filters.isActive));
    }
    
    const query = conditions.length > 0
      ? db.select().from(mediaLibrary).where(and(...conditions))
      : db.select().from(mediaLibrary);
    
    const result = await query.orderBy(desc(mediaLibrary.uploadedAt));
    return result;
  }

  async getMediaLibraryImageById(id: string): Promise<MediaLibrary | undefined> {
    const db = await getDb();
    const result = await db.select().from(mediaLibrary).where(eq(mediaLibrary.id, id)).limit(1);
    return result[0];
  }

  async createMediaLibraryImage(data: InsertMediaLibrary): Promise<MediaLibrary> {
    const db = await getDb();
    const result = await db.insert(mediaLibrary).values(data).returning();
    return result[0];
  }

  async updateMediaLibraryImage(id: string, data: Partial<MediaLibrary>): Promise<MediaLibrary | undefined> {
    const db = await getDb();
    const result = await db.update(mediaLibrary)
      .set(data)
      .where(eq(mediaLibrary.id, id))
      .returning();
    return result[0];
  }

  async deleteMediaLibraryImage(id: string): Promise<boolean> {
    const db = await getDb();
    const result = await db.delete(mediaLibrary).where(eq(mediaLibrary.id, id)).returning();
    return result.length > 0;
  }

  async incrementMediaUsageCount(id: string): Promise<boolean> {
    const db = await getDb();
    const image = await this.getMediaLibraryImageById(id);
    if (!image) return false;
    
    const result = await db.update(mediaLibrary)
      .set({ usageCount: (image.usageCount || 0) + 1 })
      .where(eq(mediaLibrary.id, id))
      .returning();
    return result.length > 0;
  }

  async createInvoice(invoiceData: InsertInvoice, items: InsertInvoiceItem[]): Promise<InvoiceWithItems> {
    throw new Error("Invoice operations not supported in memory storage");
  }

  async getInvoices(filters?: InvoiceFilterOptions): Promise<{ invoices: InvoiceWithItems[]; total: number; hasMore: boolean }> {
    throw new Error("Invoice operations not supported in memory storage");
  }

  async getInvoiceById(id: string): Promise<InvoiceWithItems | undefined> {
    throw new Error("Invoice operations not supported in memory storage");
  }

  async deleteInvoice(id: string): Promise<boolean> {
    throw new Error("Invoice operations not supported in memory storage");
  }

  async updateInvoice(id: string, invoiceData: Partial<InsertInvoice>): Promise<InvoiceWithItems | undefined> {
    throw new Error("Invoice operations not supported in memory storage");
  }

  async getEligibleTransactionsForInvoicing(): Promise<{ appointments: any[]; bids: any[]; cars: any[] }> {
    throw new Error("Invoice operations not supported in memory storage");
  }
}

async function createStorage(): Promise<IStorage> {
  try {
    const db = await getDb();

    await db.select().from(users).limit(1);
    
    return new DatabaseStorage();
  } catch (error) {
    console.error("Database connection failed:", error instanceof Error ? error.message : error);
    console.error("Full error:", error);
    return new MemStorage();
  }
}

let storageInstance: IStorage | null = null;

export async function getStorage(): Promise<IStorage> {
  if (!storageInstance) {
    storageInstance = await createStorage();
  }
  return storageInstance;
}

export const storage = new Proxy({} as IStorage, {
  get(target, prop) {
    throw new Error("Use getStorage() instead of direct storage access for lazy initialization.");
  }
});
