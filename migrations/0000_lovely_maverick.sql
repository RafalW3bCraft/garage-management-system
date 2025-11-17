CREATE TABLE "admin_audit_logs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_user_id" varchar NOT NULL,
	"action" text NOT NULL,
	"resource" text NOT NULL,
	"resource_id" varchar,
	"old_value" text,
	"new_value" text,
	"ip_address" text,
	"user_agent" text,
	"additional_info" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_rate_limits" (
	"user_id" varchar PRIMARY KEY NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"reset_time" timestamp NOT NULL,
	"last_update" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "appointments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" varchar NOT NULL,
	"service_id" varchar NOT NULL,
	"location_id" varchar NOT NULL,
	"car_id" varchar,
	"car_details" text NOT NULL,
	"date_time" timestamp NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"mechanic_name" text,
	"estimated_duration" text NOT NULL,
	"price" integer,
	"notes" text,
	"expires_at" timestamp,
	"last_renewal_date" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bids" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"car_id" varchar NOT NULL,
	"user_id" varchar,
	"bidder_email" text NOT NULL,
	"bid_amount" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"bid_time" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "car_images" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"car_id" varchar NOT NULL,
	"image_url" text NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"is_primary" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cars" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"make" text NOT NULL,
	"model" text NOT NULL,
	"year" integer NOT NULL,
	"price" integer NOT NULL,
	"mileage" integer NOT NULL,
	"fuel_type" text NOT NULL,
	"location" text NOT NULL,
	"condition" text NOT NULL,
	"image" text NOT NULL,
	"is_auction" boolean DEFAULT false,
	"current_bid" integer,
	"auction_end_time" timestamp,
	"description" text,
	"transmission" text,
	"num_owners" integer,
	"body_type" text,
	"color" text,
	"engine_size" text,
	"features" text[],
	"registration_number" text NOT NULL,
	"service_history" text,
	"user_id" varchar,
	"created_by_admin_id" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "cars_registration_number_unique" UNIQUE("registration_number")
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text NOT NULL,
	"subject" text NOT NULL,
	"message" text NOT NULL,
	"status" text DEFAULT 'new',
	"notes" text,
	"notes_updated_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text NOT NULL,
	"country_code" text DEFAULT '+91' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "customers_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "email_verification_tokens" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"email" text NOT NULL,
	"token_hash" text NOT NULL,
	"purpose" text DEFAULT 'email_verification' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"consumed_at" timestamp,
	"resend_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "email_verification_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "invoice_items" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" varchar NOT NULL,
	"description" text NOT NULL,
	"hsn_sac_code" text,
	"quantity" numeric(10, 2) DEFAULT '1' NOT NULL,
	"unit_price" numeric(10, 2) NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"tax_rate" numeric(5, 2) DEFAULT '18' NOT NULL,
	"tax_amount" numeric(10, 2) DEFAULT '0' NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_number" text NOT NULL,
	"customer_name" text NOT NULL,
	"customer_email" text,
	"customer_phone" text,
	"customer_address" text,
	"customer_city" text,
	"customer_state" text NOT NULL,
	"customer_zip_code" text,
	"customer_gstin" text,
	"invoice_date" timestamp DEFAULT now() NOT NULL,
	"due_date" timestamp,
	"subtotal" numeric(10, 2) NOT NULL,
	"cgst_amount" numeric(10, 2) DEFAULT '0' NOT NULL,
	"sgst_amount" numeric(10, 2) DEFAULT '0' NOT NULL,
	"igst_amount" numeric(10, 2) DEFAULT '0' NOT NULL,
	"total_amount" numeric(10, 2) NOT NULL,
	"status" text DEFAULT 'unpaid' NOT NULL,
	"notes" text,
	"terms_and_conditions" text,
	"service_id" varchar,
	"appointment_id" varchar,
	"car_id" varchar,
	"bid_id" varchar,
	"business_name" text DEFAULT 'Ronak Motor Garage',
	"business_address" text,
	"business_gstin" text,
	"business_state" text DEFAULT 'Gujarat',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_invoice_number_unique" UNIQUE("invoice_number")
);
--> statement-breakpoint
CREATE TABLE "locations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"address" text NOT NULL,
	"phone" text NOT NULL,
	"email" text NOT NULL,
	"hours" text NOT NULL,
	"rating" numeric(2, 1) DEFAULT '4.5'
);
--> statement-breakpoint
CREATE TABLE "media_library" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"file_name" text NOT NULL,
	"file_url" text NOT NULL,
	"file_size" integer NOT NULL,
	"mime_type" text NOT NULL,
	"image_type" text NOT NULL,
	"alt_text" text,
	"caption" text,
	"width" integer,
	"height" integer,
	"uploaded_by" varchar,
	"usage_count" integer DEFAULT 0,
	"is_active" boolean DEFAULT true,
	"tags" text,
	"uploaded_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "promotion_campaigns" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"channel" text DEFAULT 'both' NOT NULL,
	"target_user_type" text DEFAULT 'all' NOT NULL,
	"subject" text,
	"message" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"scheduled_at" timestamp,
	"sent_at" timestamp,
	"created_by" varchar NOT NULL,
	"metadata" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "promotion_deliveries" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" varchar NOT NULL,
	"user_id" varchar,
	"channel" text NOT NULL,
	"recipient_email" text,
	"recipient_phone" text,
	"recipient_country_code" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"sent_at" timestamp,
	"delivered_at" timestamp,
	"error_message" text,
	"metadata" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "services" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"price" integer NOT NULL,
	"duration" text NOT NULL,
	"category" text NOT NULL,
	"features" text[] NOT NULL,
	"popular" boolean DEFAULT false,
	"icon" text,
	"provider_name" text,
	"provider_phone" text,
	"provider_country_code" text DEFAULT '+91'
);
--> statement-breakpoint
CREATE TABLE "site_settings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"setting_key" text NOT NULL,
	"setting_value" text NOT NULL,
	"category" text,
	"description" text,
	"is_public" boolean DEFAULT true,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "site_settings_setting_key_unique" UNIQUE("setting_key")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text,
	"name" text NOT NULL,
	"password" text,
	"google_id" text,
	"phone" text,
	"country_code" text DEFAULT '+91',
	"registration_numbers" text[],
	"date_of_birth" timestamp,
	"profile_image" text,
	"address" text,
	"city" text,
	"state" text,
	"zip_code" text,
	"provider" text DEFAULT 'email' NOT NULL,
	"role" text DEFAULT 'customer' NOT NULL,
	"email_verified" boolean DEFAULT false,
	"preferred_notification_channel" text DEFAULT 'whatsapp' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_google_id_unique" UNIQUE("google_id"),
	CONSTRAINT "users_phone_unique" UNIQUE("phone")
);
--> statement-breakpoint
CREATE TABLE "whatsapp_messages" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone" text NOT NULL,
	"country_code" text,
	"message_type" text NOT NULL,
	"content" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"appointment_id" varchar,
	"message_sid" text,
	"provider_response" text,
	"retry_count" integer DEFAULT 0,
	"max_retries" integer DEFAULT 3,
	"last_retry_at" timestamp,
	"next_retry_at" timestamp,
	"failure_reason" text,
	"sent_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin_audit_logs" ADD CONSTRAINT "admin_audit_logs_admin_user_id_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_rate_limits" ADD CONSTRAINT "admin_rate_limits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_car_id_cars_id_fk" FOREIGN KEY ("car_id") REFERENCES "public"."cars"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "bids" ADD CONSTRAINT "bids_car_id_cars_id_fk" FOREIGN KEY ("car_id") REFERENCES "public"."cars"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "bids" ADD CONSTRAINT "bids_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "car_images" ADD CONSTRAINT "car_images_car_id_cars_id_fk" FOREIGN KEY ("car_id") REFERENCES "public"."cars"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "cars" ADD CONSTRAINT "cars_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "cars" ADD CONSTRAINT "cars_created_by_admin_id_users_id_fk" FOREIGN KEY ("created_by_admin_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "email_verification_tokens" ADD CONSTRAINT "email_verification_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_car_id_cars_id_fk" FOREIGN KEY ("car_id") REFERENCES "public"."cars"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_bid_id_bids_id_fk" FOREIGN KEY ("bid_id") REFERENCES "public"."bids"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "media_library" ADD CONSTRAINT "media_library_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "promotion_campaigns" ADD CONSTRAINT "promotion_campaigns_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "promotion_deliveries" ADD CONSTRAINT "promotion_deliveries_campaign_id_promotion_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."promotion_campaigns"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "promotion_deliveries" ADD CONSTRAINT "promotion_deliveries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_admin_user" ON "admin_audit_logs" USING btree ("admin_user_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_resource" ON "admin_audit_logs" USING btree ("resource","resource_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_reset_time" ON "admin_rate_limits" USING btree ("reset_time");--> statement-breakpoint
CREATE INDEX "idx_customer_id" ON "appointments" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "idx_service_id" ON "appointments" USING btree ("service_id");--> statement-breakpoint
CREATE INDEX "idx_location_id" ON "appointments" USING btree ("location_id");--> statement-breakpoint
CREATE INDEX "idx_appointment_car_id" ON "appointments" USING btree ("car_id");--> statement-breakpoint
CREATE INDEX "idx_status" ON "appointments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_date_time" ON "appointments" USING btree ("date_time");--> statement-breakpoint
CREATE INDEX "idx_expires_at" ON "appointments" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_customer_status" ON "appointments" USING btree ("customer_id","status");--> statement-breakpoint
CREATE INDEX "idx_status_datetime" ON "appointments" USING btree ("status","date_time");--> statement-breakpoint
CREATE INDEX "idx_location_datetime_status" ON "appointments" USING btree ("location_id","date_time","status");--> statement-breakpoint
CREATE INDEX "idx_status_expires_at" ON "appointments" USING btree ("status","expires_at");--> statement-breakpoint
CREATE INDEX "idx_car_id" ON "bids" USING btree ("car_id");--> statement-breakpoint
CREATE INDEX "idx_bidder_email" ON "bids" USING btree ("bidder_email");--> statement-breakpoint
CREATE INDEX "idx_bid_user_id" ON "bids" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_bid_status" ON "bids" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_car_bid_time" ON "bids" USING btree ("car_id","bid_time");--> statement-breakpoint
CREATE INDEX "idx_car_status" ON "bids" USING btree ("car_id","status");--> statement-breakpoint
CREATE INDEX "idx_car_images_car_id" ON "car_images" USING btree ("car_id");--> statement-breakpoint
CREATE INDEX "idx_car_images_car_order" ON "car_images" USING btree ("car_id","display_order");--> statement-breakpoint
CREATE INDEX "idx_is_auction" ON "cars" USING btree ("is_auction");--> statement-breakpoint
CREATE INDEX "idx_auction_end_time" ON "cars" USING btree ("is_auction","auction_end_time");--> statement-breakpoint
CREATE INDEX "idx_make" ON "cars" USING btree ("make");--> statement-breakpoint
CREATE INDEX "idx_model" ON "cars" USING btree ("model");--> statement-breakpoint
CREATE INDEX "idx_condition" ON "cars" USING btree ("condition");--> statement-breakpoint
CREATE INDEX "idx_fuel_type" ON "cars" USING btree ("fuel_type");--> statement-breakpoint
CREATE INDEX "idx_year" ON "cars" USING btree ("year");--> statement-breakpoint
CREATE INDEX "idx_sale" ON "cars" USING btree ("is_auction","year","price");--> statement-breakpoint
CREATE INDEX "idx_make_model" ON "cars" USING btree ("make","model");--> statement-breakpoint
CREATE INDEX "idx_car_user_id" ON "cars" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_registration_number" ON "cars" USING btree ("registration_number");--> statement-breakpoint
CREATE INDEX "idx_contacts_status" ON "contacts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_contacts_created_at" ON "contacts" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_contacts_status_created" ON "contacts" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "idx_user_id" ON "customers" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_token_hash" ON "email_verification_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "idx_email_verification_user" ON "email_verification_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_email_verification_expires" ON "email_verification_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_invoice_item_invoice_id" ON "invoice_items" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "idx_invoice_item_display_order" ON "invoice_items" USING btree ("invoice_id","display_order");--> statement-breakpoint
CREATE INDEX "idx_invoice_number" ON "invoices" USING btree ("invoice_number");--> statement-breakpoint
CREATE INDEX "idx_invoice_status" ON "invoices" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_invoice_date" ON "invoices" USING btree ("invoice_date");--> statement-breakpoint
CREATE INDEX "idx_customer_email" ON "invoices" USING btree ("customer_email");--> statement-breakpoint
CREATE INDEX "idx_customer_phone" ON "invoices" USING btree ("customer_phone");--> statement-breakpoint
CREATE INDEX "idx_image_type" ON "media_library" USING btree ("image_type");--> statement-breakpoint
CREATE INDEX "idx_uploaded_by" ON "media_library" USING btree ("uploaded_by");--> statement-breakpoint
CREATE INDEX "idx_uploaded_at" ON "media_library" USING btree ("uploaded_at");--> statement-breakpoint
CREATE INDEX "idx_promotion_campaign_status" ON "promotion_campaigns" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_promotion_campaign_created_by" ON "promotion_campaigns" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "idx_promotion_campaign_scheduled_at" ON "promotion_campaigns" USING btree ("scheduled_at");--> statement-breakpoint
CREATE INDEX "idx_promotion_campaign_creator_status" ON "promotion_campaigns" USING btree ("created_by","status");--> statement-breakpoint
CREATE INDEX "idx_promotion_campaign_status_scheduled" ON "promotion_campaigns" USING btree ("status","scheduled_at");--> statement-breakpoint
CREATE INDEX "idx_promotion_campaign_sent_at" ON "promotion_campaigns" USING btree ("sent_at");--> statement-breakpoint
CREATE INDEX "idx_promotion_delivery_campaign" ON "promotion_deliveries" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "idx_promotion_delivery_user" ON "promotion_deliveries" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_promotion_delivery_status" ON "promotion_deliveries" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_promotion_delivery_channel" ON "promotion_deliveries" USING btree ("channel");--> statement-breakpoint
CREATE INDEX "idx_promotion_delivery_campaign_status" ON "promotion_deliveries" USING btree ("campaign_id","status");--> statement-breakpoint
CREATE INDEX "idx_promotion_delivery_campaign_channel" ON "promotion_deliveries" USING btree ("campaign_id","channel");--> statement-breakpoint
CREATE INDEX "idx_promotion_delivery_recipient_email" ON "promotion_deliveries" USING btree ("recipient_email");--> statement-breakpoint
CREATE INDEX "idx_promotion_delivery_recipient_phone" ON "promotion_deliveries" USING btree ("recipient_phone");--> statement-breakpoint
CREATE INDEX "idx_service_category" ON "services" USING btree ("category");--> statement-breakpoint
CREATE INDEX "idx_service_popular" ON "services" USING btree ("popular");--> statement-breakpoint
CREATE INDEX "idx_service_category_popular" ON "services" USING btree ("category","popular");--> statement-breakpoint
CREATE INDEX "idx_setting_key" ON "site_settings" USING btree ("setting_key");--> statement-breakpoint
CREATE INDEX "idx_category" ON "site_settings" USING btree ("category");--> statement-breakpoint
CREATE INDEX "idx_role" ON "users" USING btree ("role");--> statement-breakpoint
CREATE INDEX "idx_whatsapp_status" ON "whatsapp_messages" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_whatsapp_appointment" ON "whatsapp_messages" USING btree ("appointment_id");--> statement-breakpoint
CREATE INDEX "idx_message_sid" ON "whatsapp_messages" USING btree ("message_sid");--> statement-breakpoint
CREATE INDEX "idx_status_retry" ON "whatsapp_messages" USING btree ("status","next_retry_at");