import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, decimal, timestamp, boolean, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Users table - enhanced for profiles and OAuth
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").unique(), // Optional for mobile-only registrations - nullable
  name: text("name").notNull(),
  password: text("password"), // nullable for OAuth users
  googleId: text("google_id").unique(), // for Google OAuth
  // Contact fields (not for authentication)
  phone: text("phone").unique(),
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
  provider: text("provider").notNull().default("email"), // "email" or "google"
  role: text("role").notNull().default("customer"), // "customer" or "admin"
  emailVerified: boolean("email_verified").default(false),
  preferredNotificationChannel: text("preferred_notification_channel").notNull().default("whatsapp"), // "whatsapp" or "email"
  isActive: boolean("is_active").default(true).notNull(), // For account suspension
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  // Ensure at least one identifier exists (email or phone)
  checkIdentifier: sql`CONSTRAINT check_user_identifier CHECK (email IS NOT NULL OR phone IS NOT NULL)`,
  // Index for role-based filtering (admin vs customer)
  roleIdx: index("idx_role").on(table.role)
}));

// Customers table - people who book services
export const customers = pgTable("customers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id, { onDelete: 'set null', onUpdate: 'cascade' }), // Link to user account (optional for legacy data)
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  phone: text("phone").notNull(),
  countryCode: text("country_code").notNull().default("+91"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  // Index on userId for user's customer records
  userIdIdx: index("idx_user_id").on(table.userId)
}));

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
}, (table) => ({
  // Index for category filtering
  categoryIdx: index("idx_service_category").on(table.category),
  // Index for popular services
  popularIdx: index("idx_service_popular").on(table.popular),
  // Composite index for category + popular queries
  categoryPopularIdx: index("idx_service_category_popular").on(table.category, table.popular)
}));

// Appointments for services
export const appointments = pgTable("appointments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  customerId: varchar("customer_id").references(() => customers.id, { onDelete: 'restrict', onUpdate: 'cascade' }).notNull(),
  serviceId: varchar("service_id").references(() => services.id, { onDelete: 'restrict', onUpdate: 'cascade' }).notNull(),
  locationId: varchar("location_id").references(() => locations.id, { onDelete: 'restrict', onUpdate: 'cascade' }).notNull(),
  carDetails: text("car_details").notNull(),
  dateTime: timestamp("date_time").notNull(),
  status: text("status").notNull().default("pending"), // pending, confirmed, in-progress, completed, cancelled
  mechanicName: text("mechanic_name"),
  estimatedDuration: text("estimated_duration").notNull(),
  price: integer("price"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  // Single column indexes for foreign keys and filtering
  customerIdIdx: index("idx_customer_id").on(table.customerId),
  serviceIdIdx: index("idx_service_id").on(table.serviceId),
  locationIdIdx: index("idx_location_id").on(table.locationId),
  statusIdx: index("idx_status").on(table.status),
  dateTimeIdx: index("idx_date_time").on(table.dateTime),
  // Composite indexes for common query patterns
  customerStatusIdx: index("idx_customer_status").on(table.customerId, table.status),
  statusDateTimeIdx: index("idx_status_datetime").on(table.status, table.dateTime),
  // Composite index for appointment conflict checks
  locationDateTimeStatusIdx: index("idx_location_datetime_status").on(table.locationId, table.dateTime, table.status)
}));

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
  transmission: text("transmission"),
  numOwners: integer("num_owners"),
  bodyType: text("body_type"),
  color: text("color"),
  engineSize: text("engine_size"),
  features: text("features"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  // Index for auction vs sale filtering
  isAuctionIdx: index("idx_is_auction").on(table.isAuction),
  // Composite index for active auctions query
  auctionEndTimeIdx: index("idx_auction_end_time").on(table.isAuction, table.auctionEndTime),
  // Index for searching by manufacturer
  makeIdx: index("idx_make").on(table.make),
  // Index for model searches
  modelIdx: index("idx_model").on(table.model),
  // Index for condition filtering
  conditionIdx: index("idx_condition").on(table.condition),
  // Index for fuel type filtering
  fuelTypeIdx: index("idx_fuel_type").on(table.fuelType),
  // Index for year filtering
  yearIdx: index("idx_year").on(table.year),
  // Composite index for sale cars (most common query)
  saleIdx: index("idx_sale").on(table.isAuction, table.year, table.price),
  // Composite index for make + model searches
  makeModelIdx: index("idx_make_model").on(table.make, table.model)
}));

// Car images for multiple photos per car
export const carImages = pgTable("car_images", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  carId: varchar("car_id").notNull().references(() => cars.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  imageUrl: text("image_url").notNull(),
  displayOrder: integer("display_order").notNull().default(0),
  isPrimary: boolean("is_primary").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  // Index on carId for car's images
  carIdIdx: index("idx_car_images_car_id").on(table.carId),
  // Composite index for ordered image retrieval
  carIdOrderIdx: index("idx_car_images_car_order").on(table.carId, table.displayOrder)
}));

// Car auction bids
export const bids = pgTable("bids", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  carId: varchar("car_id").notNull().references(() => cars.id, { onDelete: 'restrict', onUpdate: 'cascade' }),
  userId: varchar("user_id").references(() => users.id, { onDelete: 'restrict', onUpdate: 'cascade' }),
  bidderEmail: text("bidder_email").notNull(), // Match email with customers/users
  bidAmount: integer("bid_amount").notNull(),
  status: text("status").notNull().default("pending"), // pending, accepted, rejected
  bidTime: timestamp("bid_time").defaultNow().notNull(),
}, (table) => ({
  // Index on carId for car's bids
  carIdIdx: index("idx_car_id").on(table.carId),
  // Index on bidderEmail for user's bids
  bidderEmailIdx: index("idx_bidder_email").on(table.bidderEmail),
  // Index on userId for user's bids
  bidUserIdIdx: index("idx_bid_user_id").on(table.userId),
  // Index on status for filtering
  statusIdx: index("idx_bid_status").on(table.status),
  // Composite index for ordered bid history
  carBidTimeIdx: index("idx_car_bid_time").on(table.carId, table.bidTime),
  // Composite index for status filtering
  carStatusIdx: index("idx_car_status").on(table.carId, table.status)
}));

// Contact form submissions
export const contacts = pgTable("contacts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  subject: text("subject").notNull(),
  message: text("message").notNull(),
  status: text("status").default("new"), // new, responded, resolved
  notes: text("notes"), // Admin notes (nullable for backward compatibility)
  notesUpdatedAt: timestamp("notes_updated_at"), // Last time notes were updated
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  // Index on status for filtering
  statusIdx: index("idx_contacts_status").on(table.status),
  // Index on createdAt for time-based sorting
  createdAtIdx: index("idx_contacts_created_at").on(table.createdAt),
  // Composite index for admin contact queue
  statusCreatedAtIdx: index("idx_contacts_status_created").on(table.status, table.createdAt)
}));


// Email verification tokens for email/password authentication and password reset
export const emailVerificationTokens = pgTable("email_verification_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
  email: text("email").notNull(), // Store email for verification
  tokenHash: text("token_hash").notNull().unique(), // Hashed token for security
  purpose: text("purpose").notNull().default("email_verification"), // "email_verification" or "password_reset"
  expiresAt: timestamp("expires_at").notNull(),
  consumedAt: timestamp("consumed_at"), // When token was used (nullable)
  resendCount: integer("resend_count").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  // Index for efficient token lookups
  tokenHashIdx: index("idx_token_hash").on(table.tokenHash),
  // Index for user's tokens
  userIdIdx: index("idx_email_verification_user").on(table.userId),
  // Index for cleanup of expired tokens
  expiresAtIdx: index("idx_email_verification_expires").on(table.expiresAt)
}));

// WhatsApp message tracking
export const whatsappMessages = pgTable("whatsapp_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  phone: text("phone").notNull(),
  countryCode: text("country_code"),
  messageType: text("message_type").notNull(), // "appointment_confirmation", "booking_request", "status_update"
  content: text("content").notNull(),
  status: text("status").notNull().default("pending"), // pending, sent, delivered, read, failed, retry_failed
  appointmentId: varchar("appointment_id").references(() => appointments.id),
  messageSid: text("message_sid"), // Twilio message SID for webhook matching
  providerResponse: text("provider_response"), // Store API response for debugging
  // Retry tracking fields
  retryCount: integer("retry_count").default(0),
  maxRetries: integer("max_retries").default(3),
  lastRetryAt: timestamp("last_retry_at"),
  nextRetryAt: timestamp("next_retry_at"), // Scheduled next retry time
  failureReason: text("failure_reason"), // Store last failure reason
  sentAt: timestamp("sent_at").defaultNow().notNull(),
}, (table) => ({
  // Index on status for filtering messages
  statusIdx: index("idx_whatsapp_status").on(table.status),
  // Index on appointmentId for appointment messages
  appointmentIdIdx: index("idx_whatsapp_appointment").on(table.appointmentId),
  // Index on messageSid for webhook matching
  messageSidIdx: index("idx_message_sid").on(table.messageSid),
  // Composite index for retry processing queue
  statusRetryIdx: index("idx_status_retry").on(table.status, table.nextRetryAt)
}));

// Admin audit log tracking for security and compliance
export const adminAuditLogs = pgTable("admin_audit_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  adminUserId: varchar("admin_user_id").notNull().references(() => users.id),
  action: text("action").notNull(), // "create", "update", "delete", "role_change", "status_update"
  resource: text("resource").notNull(), // "user", "service", "appointment", "location", "car"
  resourceId: varchar("resource_id"), // ID of the affected resource
  oldValue: text("old_value"), // JSON string of previous state (for updates)
  newValue: text("new_value"), // JSON string of new state
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  additionalInfo: text("additional_info"), // Any extra context
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  // Index for efficient admin activity lookups
  adminUserIdx: index("idx_admin_user").on(table.adminUserId, table.createdAt),
  // Index for resource lookups
  resourceIdx: index("idx_resource").on(table.resource, table.resourceId, table.createdAt)
}));

// Admin rate limiting storage for persistent rate limits
export const adminRateLimits = pgTable("admin_rate_limits", {
  userId: varchar("user_id").primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  count: integer("count").notNull().default(0),
  resetTime: timestamp("reset_time").notNull(),
  lastUpdate: timestamp("last_update").defaultNow().notNull(),
}, (table) => ({
  // Index for efficient cleanup of expired entries
  resetTimeIdx: index("idx_reset_time").on(table.resetTime)
}));

// Site settings for branding and configuration
export const siteSettings = pgTable("site_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  settingKey: text("setting_key").notNull().unique(), // e.g., 'site_logo', 'banner_image', 'favicon'
  settingValue: text("setting_value").notNull(), // stores image URL or JSON data
  category: text("category"), // e.g., 'branding', 'seo', 'general'
  description: text("description"),
  isPublic: boolean("is_public").default(true), // whether non-admins can read it
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  // Unique index on settingKey (already unique constraint above)
  settingKeyIdx: index("idx_setting_key").on(table.settingKey),
  // Index on category for filtering
  categoryIdx: index("idx_category").on(table.category)
}));

// Media library for admin branding and general media management
export const mediaLibrary = pgTable("media_library", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  fileName: text("file_name").notNull(),
  fileUrl: text("file_url").notNull(), // S3/storage URL
  fileSize: integer("file_size").notNull(), // in bytes
  mimeType: text("mime_type").notNull(), // image/webp, image/jpeg, image/png
  imageType: text("image_type").notNull(), // 'logo', 'banner', 'gallery', 'service', 'testimonial', 'icon', 'general'
  altText: text("alt_text"),
  caption: text("caption"),
  width: integer("width"),
  height: integer("height"),
  uploadedBy: varchar("uploaded_by").references(() => users.id, { onDelete: 'set null', onUpdate: 'cascade' }),
  usageCount: integer("usage_count").default(0), // track how many times image is used
  isActive: boolean("is_active").default(true),
  tags: text("tags"), // JSON array of tags
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
}, (table) => ({
  // Index on imageType for filtering by type
  imageTypeIdx: index("idx_image_type").on(table.imageType),
  // Index on uploadedBy for user's uploads
  uploadedByIdx: index("idx_uploaded_by").on(table.uploadedBy),
  // Index on uploadedAt for sorting
  uploadedAtIdx: index("idx_uploaded_at").on(table.uploadedAt)
}));

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

// Shared password validation schema with strict security requirements
export const passwordValidation = z.string()
  .min(8, "Password must be at least 8 characters")
  .max(100, "Password cannot exceed 100 characters")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[a-z]/, "Password must contain at least one lowercase letter")
  .regex(/[0-9]/, "Password must contain at least one number")
  .regex(/[^A-Za-z0-9]/, "Password must contain at least one special character");

// Separate schemas for different auth flows
// Email registration schemas (email required)
export const registerSchema = z.object({
  email: z.string().email("Invalid email format"),
  name: z.string().min(2, "Name must be at least 2 characters"),
  password: passwordValidation,
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

// Server-side email registration schema (without confirmPassword)
export const serverRegisterSchema = z.object({
  email: z.string().email("Invalid email format"),
  name: z.string().min(2, "Name must be at least 2 characters"),
  password: passwordValidation,
  provider: z.literal("email").default("email"),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, "Password is required"),
});

export const passwordResetRequestSchema = z.object({
  email: z.string().email("Invalid email format"),
});

export const passwordResetVerifySchema = z.object({
  token: z.string().min(1, "Reset token is required"),
  email: z.string().email("Invalid email format"),
  newPassword: passwordValidation,
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

export const insertCarImageSchema = createInsertSchema(carImages).omit({
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
}).extend({
  name: z.string()
    .min(1, "Name is required")
    .min(3, "Name must be at least 3 characters")
    .max(100, "Name cannot exceed 100 characters"),
  address: z.string()
    .min(1, "Address is required")
    .min(10, "Address must be at least 10 characters")
    .max(300, "Address cannot exceed 300 characters"),
  phone: z.string()
    .min(1, "Phone is required")
    .regex(/^[0-9]{7,15}$/, "Phone number must be 7-15 digits"),
  email: z.string()
    .min(1, "Email is required")
    .email("Please enter a valid email address")
    .toLowerCase(),
  hours: z.string()
    .min(1, "Hours are required")
    .min(5, "Hours must be at least 5 characters (e.g., '9-6')")
    .max(100, "Hours cannot exceed 100 characters"),
  rating: z.string()
    .regex(/^\d(\.\d)?$/, "Rating must be a number between 0.0 and 5.0")
    .refine((val) => {
      const num = parseFloat(val);
      return num >= 0 && num <= 5;
    }, "Rating must be between 0.0 and 5.0")
    .default("4.5"),
});

export const insertBidSchema = createInsertSchema(bids).omit({
  id: true,
  bidTime: true,
});


export const insertWhatsAppMessageSchema = createInsertSchema(whatsappMessages).omit({
  id: true,
  sentAt: true,
  retryCount: true,
  lastRetryAt: true,
  nextRetryAt: true,
  failureReason: true,
});

export const insertAdminAuditLogSchema = createInsertSchema(adminAuditLogs).omit({
  id: true,
  createdAt: true,
});

export const insertAdminRateLimitSchema = createInsertSchema(adminRateLimits).omit({
  lastUpdate: true,
});

export const insertSiteSettingSchema = createInsertSchema(siteSettings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertMediaLibrarySchema = createInsertSchema(mediaLibrary).omit({
  id: true,
  uploadedAt: true,
});

// Export the update contact schema
export type UpdateContactRequest = z.infer<typeof updateContactSchema>;

// Place bid schema with validation
export const placeBidSchema = z.object({
  carId: z.string().min(1, { message: "Car ID is required" }),
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

// Contact status update schema for admin management
export const updateContactSchema = z.object({
  status: z.enum(["new", "responded", "resolved"], {
    errorMap: () => ({ message: "Status must be one of: new, responded, resolved" })
  }).optional(),
  notes: z.string().optional()
});

// User settings schema for notification preferences
export const updateUserSettingsSchema = z.object({
  preferredNotificationChannel: z.enum(["whatsapp", "email"], {
    errorMap: () => ({ message: "Notification channel must be either whatsapp or email" })
  })
});

// Admin user management schemas
export const adminCreateUserSchema = z.object({
  email: z.string().email("Invalid email format"),
  name: z.string().min(2, "Name must be at least 2 characters"),
  password: passwordValidation,
  role: z.enum(["customer", "admin"], {
    errorMap: () => ({ message: "Role must be either customer or admin" })
  }),
  phone: z.string().optional(),
  countryCode: z.string().optional(),
});

export const adminUpdateUserSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").optional(),
  email: z.string().email("Invalid email format").optional(),
  phone: z.string().optional(),
  countryCode: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zipCode: z.string().optional(),
});

export const adminResetPasswordSchema = z.object({
  newPassword: passwordValidation,
});

// WhatsApp messaging schemas for standardized validation
export const whatsappConfirmationSchema = z.object({
  phone: z.string()
    .min(10, "Phone number must be at least 10 digits")
    .max(15, "Phone number cannot exceed 15 digits")
    .regex(/^\d+$/, "Phone number must contain only digits"),
  countryCode: z.string()
    .regex(/^\+\d{1,4}$/, "Invalid country code format"),
  appointmentData: z.object({
    serviceName: z.string().min(1, "Service name is required"),
    locationName: z.string().min(1, "Location name is required"),
    dateTime: z.string().min(1, "Date and time is required"),
    customerName: z.string().min(1, "Customer name is required"),
    mechanicName: z.string().optional(),
    estimatedDuration: z.string().min(1, "Estimated duration is required"),
    price: z.number().positive("Price must be positive").optional()
  }),
  appointmentId: z.string().optional()
});

export const whatsappStatusUpdateSchema = z.object({
  phone: z.string()
    .min(10, "Phone number must be at least 10 digits")
    .max(15, "Phone number cannot exceed 15 digits")
    .regex(/^\d+$/, "Phone number must contain only digits"),
  countryCode: z.string()
    .regex(/^\+\d{1,4}$/, "Invalid country code format"),
  statusData: z.object({
    status: z.enum(["confirmed", "in-progress", "completed", "cancelled"], {
      errorMap: () => ({ message: "Status must be one of: confirmed, in-progress, completed, cancelled" })
    }),
    serviceName: z.string().min(1, "Service name is required"),
    locationName: z.string().min(1, "Location name is required"),
    dateTime: z.string().min(1, "Date and time is required"),
    customerName: z.string().min(1, "Customer name is required"),
    mechanicName: z.string().optional(),
    notes: z.string().optional()
  }),
  appointmentId: z.string().optional()
});

export const whatsappBidNotificationSchema = z.object({
  phone: z.string()
    .min(10, "Phone number must be at least 10 digits")
    .max(15, "Phone number cannot exceed 15 digits")
    .regex(/^\d+$/, "Phone number must contain only digits"),
  countryCode: z.string()
    .regex(/^\+\d{1,4}$/, "Invalid country code format"),
  bidData: z.object({
    carMake: z.string().min(1, "Car make is required"),
    carModel: z.string().min(1, "Car model is required"),
    carYear: z.number().int().positive("Car year must be a positive integer"),
    bidAmount: z.number().int().positive("Bid amount must be positive"),
    currentHighestBid: z.number().int().positive("Current highest bid must be positive").optional(),
    auctionEndTime: z.string().min(1, "Auction end time is required"),
    bidderName: z.string().min(1, "Bidder name is required")
  })
});

// WhatsApp webhook validation schema
export const whatsappWebhookSchema = z.object({
  MessageSid: z.string().min(1, "MessageSid is required"),
  MessageStatus: z.enum(["queued", "sent", "delivered", "read", "failed", "undelivered"], {
    errorMap: () => ({ message: "Invalid MessageStatus value" })
  }),
  From: z.string().optional(),
  To: z.string().optional(),
  ErrorCode: z.string().optional(),
  ErrorMessage: z.string().optional()
});

// Invoices - Manual invoice creation with Indian GST standards
export const invoices = pgTable("invoices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  invoiceNumber: text("invoice_number").notNull().unique(),
  
  // Customer details
  customerName: text("customer_name").notNull(),
  customerEmail: text("customer_email"),
  customerPhone: text("customer_phone"),
  customerAddress: text("customer_address"),
  customerCity: text("customer_city"),
  customerState: text("customer_state").notNull(), // Required for GST calculation
  customerZipCode: text("customer_zip_code"),
  customerGSTIN: text("customer_gstin"), // Optional GSTIN number
  
  // Invoice dates
  invoiceDate: timestamp("invoice_date").notNull().defaultNow(),
  dueDate: timestamp("due_date"),
  
  // Amounts
  subtotal: decimal("subtotal", { precision: 10, scale: 2 }).notNull(),
  cgstAmount: decimal("cgst_amount", { precision: 10, scale: 2 }).default("0").notNull(), // Central GST (intra-state)
  sgstAmount: decimal("sgst_amount", { precision: 10, scale: 2 }).default("0").notNull(), // State GST (intra-state)
  igstAmount: decimal("igst_amount", { precision: 10, scale: 2 }).default("0").notNull(), // Integrated GST (inter-state)
  totalAmount: decimal("total_amount", { precision: 10, scale: 2 }).notNull(),
  
  // Status and metadata
  status: text("status").notNull().default("unpaid"), // unpaid, paid, cancelled
  notes: text("notes"),
  termsAndConditions: text("terms_and_conditions"),
  
  // Reference links
  serviceId: varchar("service_id").references(() => services.id, { onDelete: 'set null', onUpdate: 'cascade' }),
  appointmentId: varchar("appointment_id").references(() => appointments.id, { onDelete: 'set null', onUpdate: 'cascade' }),
  carId: varchar("car_id").references(() => cars.id, { onDelete: 'set null', onUpdate: 'cascade' }),
  bidId: varchar("bid_id").references(() => bids.id, { onDelete: 'set null', onUpdate: 'cascade' }),
  
  // Business details (from settings or hardcoded)
  businessName: text("business_name").default("Ronak Motor Garage"),
  businessAddress: text("business_address"),
  businessGSTIN: text("business_gstin"),
  businessState: text("business_state").default("Gujarat"), // Required for GST calculation
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  invoiceNumberIdx: index("idx_invoice_number").on(table.invoiceNumber),
  statusIdx: index("idx_invoice_status").on(table.status),
  invoiceDateIdx: index("idx_invoice_date").on(table.invoiceDate),
  customerEmailIdx: index("idx_customer_email").on(table.customerEmail),
  customerPhoneIdx: index("idx_customer_phone").on(table.customerPhone),
}));

// Invoice line items
export const invoiceItems = pgTable("invoice_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  invoiceId: varchar("invoice_id").references(() => invoices.id, { onDelete: 'cascade', onUpdate: 'cascade' }).notNull(),
  
  // Item details
  description: text("description").notNull(),
  hsnSacCode: text("hsn_sac_code"), // HSN for goods, SAC for services
  quantity: decimal("quantity", { precision: 10, scale: 2 }).notNull().default("1"),
  unitPrice: decimal("unit_price", { precision: 10, scale: 2 }).notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(), // quantity * unitPrice
  
  // Tax details
  taxRate: decimal("tax_rate", { precision: 5, scale: 2 }).notNull().default("18"), // GST rate (0, 5, 12, 18, 28)
  taxAmount: decimal("tax_amount", { precision: 10, scale: 2 }).notNull().default("0"),
  
  displayOrder: integer("display_order").notNull().default(0),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  invoiceIdIdx: index("idx_invoice_item_invoice_id").on(table.invoiceId),
  displayOrderIdx: index("idx_invoice_item_display_order").on(table.invoiceId, table.displayOrder),
}));

// Invoice schemas for validation
export const insertInvoiceSchema = createInsertSchema(invoices, {
  customerName: z.string().min(1, "Customer name is required"),
  customerState: z.string().min(1, "Customer state is required for GST calculation"),
  invoiceNumber: z.string().min(1, "Invoice number is required"),
  subtotal: z.coerce.number().nonnegative("Subtotal must be non-negative").transform(val => String(val)),
  cgstAmount: z.coerce.number().nonnegative("CGST amount must be non-negative").transform(val => String(val)).optional(),
  sgstAmount: z.coerce.number().nonnegative("SGST amount must be non-negative").transform(val => String(val)).optional(),
  igstAmount: z.coerce.number().nonnegative("IGST amount must be non-negative").transform(val => String(val)).optional(),
  totalAmount: z.coerce.number().positive("Total amount must be positive").transform(val => String(val)),
  businessState: z.string().default("Gujarat"),
}).omit({ id: true, createdAt: true, updatedAt: true }).superRefine((data, ctx) => {
  const subtotal = parseFloat(data.subtotal);
  const cgst = parseFloat(data.cgstAmount || "0");
  const sgst = parseFloat(data.sgstAmount || "0");
  const igst = parseFloat(data.igstAmount || "0");
  const total = parseFloat(data.totalAmount);
  const isIntraState = data.customerState === data.businessState;
  
  // GST Exclusivity: For intra-state use CGST+SGST, for inter-state use IGST
  if (isIntraState) {
    if (igst !== 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "For intra-state transactions, IGST must be 0. Use CGST and SGST instead.",
        path: ["igstAmount"]
      });
    }
    // CGST and SGST must be EQUAL for intra-state transactions (Indian GST rule)
    if (cgst !== sgst) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "For intra-state transactions, CGST and SGST must be equal (each is half of total GST).",
        path: ["cgstAmount"]
      });
    }
  } else {
    if (cgst !== 0 || sgst !== 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "For inter-state transactions, CGST and SGST must be 0. Use IGST instead.",
        path: ["cgstAmount"]
      });
    }
  }
  
  // Total amount validation: total = subtotal + (cgst + sgst + igst)
  const expectedTotal = subtotal + cgst + sgst + igst;
  if (Math.abs(total - expectedTotal) > 0.01) { // Allow 1 paisa tolerance for rounding
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Total amount (${total}) must equal subtotal (${subtotal}) + taxes (${cgst + sgst + igst}). Expected: ${expectedTotal}`,
      path: ["totalAmount"]
    });
  }
});

export const insertInvoiceItemSchema = createInsertSchema(invoiceItems, {
  description: z.string().min(1, "Item description is required"),
  quantity: z.string().or(z.number()).transform(val => String(val)),
  unitPrice: z.string().or(z.number()).transform(val => String(val)),
  amount: z.string().or(z.number()).transform(val => String(val)),
  taxRate: z.string().or(z.number()).transform(val => String(val)),
  taxAmount: z.string().or(z.number()).transform(val => String(val)),
}).omit({ id: true, createdAt: true });

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

export type CarImage = typeof carImages.$inferSelect;
export type InsertCarImage = z.infer<typeof insertCarImageSchema>;

export type Contact = typeof contacts.$inferSelect;
export type InsertContact = z.infer<typeof insertContactSchema>;

export type Location = typeof locations.$inferSelect;
export type InsertLocation = z.infer<typeof insertLocationSchema>;

export type Bid = typeof bids.$inferSelect;
export type InsertBid = z.infer<typeof insertBidSchema>;

export type EmailVerificationToken = typeof emailVerificationTokens.$inferSelect;
export type InsertEmailVerificationToken = typeof emailVerificationTokens.$inferInsert;

export type WhatsAppMessage = typeof whatsappMessages.$inferSelect;
export type InsertWhatsAppMessage = z.infer<typeof insertWhatsAppMessageSchema>;

// Enhanced WhatsApp status types
export type WhatsAppMessageStatus = 'pending' | 'sent' | 'delivered' | 'read' | 'failed' | 'retry_failed';

export type AdminAuditLog = typeof adminAuditLogs.$inferSelect;
export type InsertAdminAuditLog = z.infer<typeof insertAdminAuditLogSchema>;
export type AdminRateLimit = typeof adminRateLimits.$inferSelect;
export type InsertAdminRateLimit = z.infer<typeof insertAdminRateLimitSchema>;

export type SiteSetting = typeof siteSettings.$inferSelect;
export type InsertSiteSetting = z.infer<typeof insertSiteSettingSchema>;

export type MediaLibrary = typeof mediaLibrary.$inferSelect;
export type InsertMediaLibrary = z.infer<typeof insertMediaLibrarySchema>;

export type Invoice = typeof invoices.$inferSelect;
export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;

export type InvoiceItem = typeof invoiceItems.$inferSelect;
export type InsertInvoiceItem = z.infer<typeof insertInvoiceItemSchema>;

// Enhanced appointment type with resolved names for frontend display
export type AppointmentWithDetails = Appointment & {
  serviceName: string;
  locationName: string;
  customerName: string;
};

// Enhanced invoice type with line items
export type InvoiceWithItems = Invoice & {
  items: InvoiceItem[];
};

export type UpdateProfileRequest = z.infer<typeof updateProfileSchema>;
