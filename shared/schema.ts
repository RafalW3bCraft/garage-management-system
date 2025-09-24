import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, decimal, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Users table - enhanced for mobile auth, profiles and OAuth
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").unique(), // Optional for mobile-only registrations
  name: text("name").notNull(),
  password: text("password"), // nullable for OAuth users
  googleId: text("google_id").unique(), // for Google OAuth
  // Mobile authentication fields
  phone: text("phone").unique(), // For mobile OTP registration
  phoneVerified: boolean("phone_verified").default(false),
  countryCode: text("country_code").default("+91"), // Default to India
  // Enhanced profile fields
  registrationNumbers: text("registration_numbers").array(), // Vehicle registration numbers
  dateOfBirth: timestamp("date_of_birth"),
  profileImage: text("profile_image"), // URL to uploaded image
  address: text("address"),
  city: text("city"),
  state: text("state"),
  zipCode: text("zip_code"),
  // Account settings
  provider: text("provider").notNull().default("email"), // "email", "google", or "mobile"
  role: text("role").notNull().default("customer"), // "customer" or "admin"
  emailVerified: boolean("email_verified").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  // Ensure at least one identifier exists (email or phone)
  checkIdentifier: sql`CONSTRAINT check_user_identifier CHECK (email IS NOT NULL OR phone IS NOT NULL)`
}));

// Customers table - people who book services
export const customers = pgTable("customers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id), // Link to user account (optional for legacy data)
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  phone: text("phone").notNull(),
  countryCode: text("country_code").notNull().default("+91"),
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
  // Service provider contact information for WhatsApp notifications
  providerName: text("provider_name"), // Name of service provider/mechanic
  providerPhone: text("provider_phone"), // Phone number for WhatsApp notifications
  providerCountryCode: text("provider_country_code").default("+91"), // Country code for provider phone
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

// OTP verification tracking
export const otpVerifications = pgTable("otp_verifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  phone: text("phone").notNull(),
  countryCode: text("country_code").notNull(),
  otpCodeHash: text("otp_code_hash").notNull(), // Hashed OTP for security
  purpose: text("purpose").notNull(), // "registration", "login", "password_reset"
  verified: boolean("verified").default(false),
  attempts: integer("attempts").default(0),
  maxAttempts: integer("max_attempts").default(3),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  // Index for efficient lookups
  phoneCountryIdx: sql`INDEX idx_phone_country ON otp_verifications(phone, country_code, expires_at)`
}));

// WhatsApp message tracking
export const whatsappMessages = pgTable("whatsapp_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  phone: text("phone").notNull(),
  countryCode: text("country_code"),
  messageType: text("message_type").notNull(), // "appointment_confirmation", "booking_request", "status_update"
  content: text("content").notNull(),
  status: text("status").notNull().default("sent"), // sent, delivered, read, failed
  appointmentId: varchar("appointment_id").references(() => appointments.id),
  providerResponse: text("provider_response"), // Store API response for debugging
  sentAt: timestamp("sent_at").defaultNow().notNull(),
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
// Email registration schemas (email required)
export const registerSchema = z.object({
  email: z.string().email("Invalid email format"),
  name: z.string().min(2, "Name must be at least 2 characters"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

// Server-side email registration schema (without confirmPassword)
export const serverRegisterSchema = z.object({
  email: z.string().email("Invalid email format"),
  name: z.string().min(2, "Name must be at least 2 characters"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  provider: z.literal("email").default("email"),
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
}).extend({
  // Handle ISO string to Date conversion from frontend
  dateTime: z.coerce.date(),
  // Handle optional notes properly (convert empty strings to undefined)
  notes: z.string().trim().optional().transform(v => (v === "" ? undefined : v)).optional(),
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

export const insertOtpVerificationSchema = createInsertSchema(otpVerifications).omit({
  id: true,
  createdAt: true,
  verified: true,
  attempts: true,
});

export const insertWhatsAppMessageSchema = createInsertSchema(whatsappMessages).omit({
  id: true,
  sentAt: true,
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

// Mobile registration schemas
export const sendOtpSchema = z.object({
  phone: z.string()
    .min(10, "Phone number must be at least 10 digits")
    .max(15, "Phone number cannot exceed 15 digits")
    .regex(/^\d+$/, "Phone number must contain only digits"),
  countryCode: z.string()
    .regex(/^\+\d{1,4}$/, "Invalid country code format"),
  purpose: z.enum(["registration", "login", "password_reset"], {
    errorMap: () => ({ message: "Purpose must be registration, login, or password_reset" })
  })
});

export const verifyOtpSchema = z.object({
  phone: z.string()
    .min(10, "Phone number must be at least 10 digits")
    .max(15, "Phone number cannot exceed 15 digits")
    .regex(/^\d+$/, "Phone number must contain only digits"),
  countryCode: z.string()
    .regex(/^\+\d{1,4}$/, "Invalid country code format"),
  otpCode: z.string()
    .length(6, "OTP must be exactly 6 digits")
    .regex(/^\d{6}$/, "OTP must contain only numbers")
});

export const mobileRegisterSchema = z.object({
  phone: z.string()
    .min(10, "Phone number must be at least 10 digits")
    .max(15, "Phone number cannot exceed 15 digits")
    .regex(/^\d+$/, "Phone number must contain only digits"),
  countryCode: z.string()
    .regex(/^\+\d{1,4}$/, "Invalid country code format"),
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email format").optional(),
  dateOfBirth: z.string().datetime().optional(),
  registrationNumbers: z.array(z.string()).optional(),
  profileImage: z.string().url("Invalid image URL").optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zipCode: z.string().optional(),
});

export const updateProfileSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").optional(),
  email: z.string().email("Invalid email format").optional(),
  phone: z.string().optional(),
  countryCode: z.enum(["+91", "Universal"]).optional(),
  dateOfBirth: z.string().datetime().optional(),
  registrationNumbers: z.array(z.string()).optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zipCode: z.string().optional(),
  profileImage: z.string().url("Invalid image URL").optional(),
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

export type OtpVerification = typeof otpVerifications.$inferSelect;
export type InsertOtpVerification = z.infer<typeof insertOtpVerificationSchema>;

export type WhatsAppMessage = typeof whatsappMessages.$inferSelect;
export type InsertWhatsAppMessage = z.infer<typeof insertWhatsAppMessageSchema>;

// Enhanced appointment type with resolved names for frontend display
export type AppointmentWithDetails = Appointment & {
  serviceName: string;
  locationName: string;
  customerName: string;
};

// Mobile registration and OTP types
export type SendOtpRequest = z.infer<typeof sendOtpSchema>;
export type VerifyOtpRequest = z.infer<typeof verifyOtpSchema>;
export type MobileRegisterRequest = z.infer<typeof mobileRegisterSchema>;
export type UpdateProfileRequest = z.infer<typeof updateProfileSchema>;
