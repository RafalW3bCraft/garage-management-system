import { 
  type User, 
  type InsertUser,
  type Service,
  type InsertService, 
  type Appointment,
  type InsertAppointment,
  type Car,
  type InsertCar,
  type Customer,
  type InsertCustomer,
  type Contact,
  type InsertContact,
  type Location,
  type InsertLocation,
  users,
  services,
  appointments,
  cars,
  customers,
  contacts,
  locations
} from "@shared/schema";
import { getDb } from "./db";
import { eq, and, desc, asc } from "drizzle-orm";
import { randomUUID } from "crypto";

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

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
  getAppointment(id: string): Promise<Appointment | undefined>;
  getAppointmentsByCustomer(customerId: string): Promise<Appointment[]>;
  createAppointment(appointment: InsertAppointment): Promise<Appointment>;
  updateAppointmentStatus(id: string, status: string): Promise<Appointment | undefined>;
  
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
}

export class DatabaseStorage implements IStorage {
  // Users
  async getUser(id: string): Promise<User | undefined> {
    const db = await getDb();
    const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return result[0];
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const db = await getDb();
    const result = await db.select().from(users).where(eq(users.username, username)).limit(1);
    return result[0];
  }

  async createUser(user: InsertUser): Promise<User> {
    const db = await getDb();
    const result = await db.insert(users).values(user).returning();
    return result[0];
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
  async getAppointment(id: string): Promise<Appointment | undefined> {
    const db = await getDb();
    const result = await db.select().from(appointments).where(eq(appointments.id, id)).limit(1);
    return result[0];
  }

  async getAppointmentsByCustomer(customerId: string): Promise<Appointment[]> {
    const db = await getDb();
    return await db.select().from(appointments)
      .where(eq(appointments.customerId, customerId))
      .orderBy(desc(appointments.dateTime));
  }

  async createAppointment(appointment: InsertAppointment): Promise<Appointment> {
    const db = await getDb();
    const result = await db.insert(appointments).values(appointment).returning();
    return result[0];
  }

  async updateAppointmentStatus(id: string, status: string): Promise<Appointment | undefined> {
    const db = await getDb();
    const result = await db.update(appointments)
      .set({ status })
      .where(eq(appointments.id, id))
      .returning();
    return result[0];
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

    // This was removed - no cars array defined yet

    console.log("MemStorage initialized with sample data");
  }

  // Users
  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(user => user.username === username);
  }

  async createUser(user: InsertUser): Promise<User> {
    const id = randomUUID();
    const newUser: User = { ...user, id };
    this.users.set(id, newUser);
    return newUser;
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
    const newService: Service = { ...service, id };
    this.services.set(id, newService);
    return newService;
  }

  // Appointments
  async getAppointment(id: string): Promise<Appointment | undefined> {
    return this.appointments.get(id);
  }

  async getAppointmentsByCustomer(customerId: string): Promise<Appointment[]> {
    return Array.from(this.appointments.values())
      .filter(apt => apt.customerId === customerId)
      .sort((a, b) => b.dateTime.getTime() - a.dateTime.getTime());
  }

  async createAppointment(appointment: InsertAppointment): Promise<Appointment> {
    const id = randomUUID();
    const newAppointment: Appointment = { ...appointment, id, status: appointment.status || "pending", createdAt: new Date() };
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
    const newCar: Car = { ...car, id, createdAt: new Date() };
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
    const newLocation: Location = { ...location, id };
    this.locations.set(id, newLocation);
    return newLocation;
  }
}

// Factory function to create storage instance
async function createStorage(): Promise<IStorage> {
  try {
    await getDb();
    console.log("Database connection successful - using DatabaseStorage");
    return new DatabaseStorage();
  } catch (error) {
    console.log("Database connection failed - using MemStorage with sample data");
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
