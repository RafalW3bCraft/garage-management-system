import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, decimal, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Users table - enhanced for email auth and Google OAuth
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  password: text("password"), // nullable for OAuth users
  googleId: text("google_id").unique(), // for Google OAuth
  provider: text("provider").notNull().default("email"), // "email" or "google"
  emailVerified: boolean("email_verified").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Customers table - people who book services
export const customers = pgTable("customers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  phone: text("phone").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Service locations/branches
export const locations = pgTable("locations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  address: text("address").notNull(),
  phone: text("phone").notNull(),
  email: text("email").notNull(),
  hours: text("hours").notNull(),
  rating: decimal("rating", { precision: 2, scale: 1 }).default("4.5"),
});

// Services offered
export const services = pgTable("services", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  description: text("description").notNull(),
  price: integer("price").notNull(),
  duration: text("duration").notNull(),
  category: text("category").notNull(),
  features: text("features").array().notNull(),
  popular: boolean("popular").default(false),
  icon: text("icon"), // store icon name/identifier
});

// Appointments for services
export const appointments = pgTable("appointments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  customerId: varchar("customer_id").references(() => customers.id).notNull(),
  serviceId: varchar("service_id").references(() => services.id).notNull(),
  locationId: varchar("location_id").references(() => locations.id).notNull(),
  carDetails: text("car_details").notNull(),
  dateTime: timestamp("date_time").notNull(),
  status: text("status").notNull().default("pending"), // pending, confirmed, in-progress, completed, cancelled
  mechanicName: text("mechanic_name"),
  estimatedDuration: text("estimated_duration").notNull(),
  price: integer("price"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Cars for sale and auction
export const cars = pgTable("cars", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  make: text("make").notNull(),
  model: text("model").notNull(),
  year: integer("year").notNull(),
  price: integer("price").notNull(),
  mileage: integer("mileage").notNull(),
  fuelType: text("fuel_type").notNull(),
  location: text("location").notNull(),
  condition: text("condition").notNull(), // Excellent, Good, Fair
  image: text("image").notNull(),
  isAuction: boolean("is_auction").default(false),
  currentBid: integer("current_bid"),
  auctionEndTime: timestamp("auction_end_time"),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Car auction bids
export const bids = pgTable("bids", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  carId: varchar("car_id").notNull().references(() => cars.id),
  bidderEmail: text("bidder_email").notNull(), // Match email with customers/users
  bidAmount: integer("bid_amount").notNull(),
  bidTime: timestamp("bid_time").defaultNow().notNull(),
});

// Contact form submissions
export const contacts = pgTable("contacts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  subject: text("subject").notNull(),
  message: text("message").notNull(),
  status: text("status").default("new"), // new, responded, resolved
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Insert schemas for validation
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
});

// Internal schema for OAuth user creation (includes googleId)
export const insertOAuthUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  password: true, // OAuth users don't have passwords
});

// Separate schemas for different auth flows
export const registerSchema = insertUserSchema.pick({
  email: true,
  name: true,
  password: true,
}).extend({
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, "Password is required"),
});

export const insertCustomerSchema = createInsertSchema(customers).omit({
  id: true,
  createdAt: true,
});

export const insertServiceSchema = createInsertSchema(services).omit({
  id: true,
});

export const insertAppointmentSchema = createInsertSchema(appointments).omit({
  id: true,
  createdAt: true,
});

export const insertCarSchema = createInsertSchema(cars).omit({
  id: true,
  createdAt: true,
});

export const insertContactSchema = createInsertSchema(contacts).omit({
  id: true,
  status: true,
  createdAt: true,
});

export const insertLocationSchema = createInsertSchema(locations).omit({
  id: true,
});

export const insertBidSchema = createInsertSchema(bids).omit({
  id: true,
  bidTime: true,
});

// Place bid schema with validation
export const placeBidSchema = z.object({
  carId: z.string().uuid({ message: "Car ID must be a valid UUID" }),
  bidAmount: z.number()
    .int({ message: "Bid amount must be a whole number" })
    .positive({ message: "Bid amount must be positive" })
    .min(1000, { message: "Minimum bid is ₹1,000" })
});

// Reschedule appointment schema with validation
export const rescheduleAppointmentSchema = z.object({
  dateTime: z.string()
    .datetime({ message: "Invalid datetime format. Use ISO 8601 format (YYYY-MM-DDTHH:MM:SSZ)" })
    .refine((dateStr) => new Date(dateStr) > new Date(), {
      message: "Appointment date must be in the future"
    }),
  locationId: z.string()
    .uuid({ message: "Location ID must be a valid UUID" })
});

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type Customer = typeof customers.$inferSelect;
export type InsertCustomer = z.infer<typeof insertCustomerSchema>;

export type Service = typeof services.$inferSelect;
export type InsertService = z.infer<typeof insertServiceSchema>;

export type Appointment = typeof appointments.$inferSelect;
export type InsertAppointment = z.infer<typeof insertAppointmentSchema>;

export type Car = typeof cars.$inferSelect;
export type InsertCar = z.infer<typeof insertCarSchema>;

export type Contact = typeof contacts.$inferSelect;
export type InsertContact = z.infer<typeof insertContactSchema>;

export type Location = typeof locations.$inferSelect;
export type InsertLocation = z.infer<typeof insertLocationSchema>;

export type Bid = typeof bids.$inferSelect;
export type InsertBid = z.infer<typeof insertBidSchema>;
