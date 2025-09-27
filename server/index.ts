import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";

// Environment validation and logging
interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

function validateEnvironment(): void {
  const isProduction = process.env.NODE_ENV === "production";
  const result: ValidationResult = { isValid: true, errors: [], warnings: [] };

  console.log("=== RonakMotorGarage Application Starting ===");
  console.log("Environment variables check:");
  console.log("- NODE_ENV:", process.env.NODE_ENV || "development");
  
  // Validate SESSION_SECRET (always required)
  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret) {
    result.errors.push("SESSION_SECRET is required");
    console.log("- SESSION_SECRET: ✗ MISSING (REQUIRED)");
  } else if (sessionSecret.length < 32) {
    result.errors.push("SESSION_SECRET must be at least 32 characters long for security");
    console.log("- SESSION_SECRET: ✗ TOO SHORT (min 32 chars)");
  } else {
    console.log("- SESSION_SECRET: ✓ Available and secure");
  }
  
  // Validate DATABASE_URL (required in production)
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    if (isProduction) {
      result.errors.push("DATABASE_URL is required in production");
      console.log("- DATABASE_URL: ✗ MISSING (REQUIRED IN PRODUCTION)");
    } else {
      result.warnings.push("DATABASE_URL missing - will use in-memory storage (data lost on restart)");
      console.log("- DATABASE_URL: ⚠ Missing (will use in-memory storage)");
    }
  } else {
    try {
      new URL(databaseUrl);
      console.log("- DATABASE_URL: ✓ Available and valid");
    } catch {
      result.errors.push("DATABASE_URL is not a valid URL");
      console.log("- DATABASE_URL: ✗ INVALID URL FORMAT");
    }
  }
  
  // Validate Google OAuth as a pair
  const googleClientId = process.env.GOOGLE_CLIENT_ID;
  const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const hasGoogleId = !!googleClientId;
  const hasGoogleSecret = !!googleClientSecret;
  
  if (hasGoogleId && hasGoogleSecret) {
    console.log("- GOOGLE_CLIENT_ID: ✓ Available");
    console.log("- GOOGLE_CLIENT_SECRET: ✓ Available");
    console.log("- Google OAuth: ✓ Enabled");
  } else if (hasGoogleId || hasGoogleSecret) {
    const missing = hasGoogleId ? "GOOGLE_CLIENT_SECRET" : "GOOGLE_CLIENT_ID";
    if (isProduction) {
      result.errors.push(`Google OAuth partially configured: ${missing} is missing. Either set both or remove both.`);
      console.log(`- GOOGLE_CLIENT_ID: ${hasGoogleId ? "✓" : "✗"} ${hasGoogleId ? "Available" : "Missing"}`);
      console.log(`- GOOGLE_CLIENT_SECRET: ${hasGoogleSecret ? "✓" : "✗"} ${hasGoogleSecret ? "Available" : "Missing"}`);
      console.log("- Google OAuth: ✗ PARTIALLY CONFIGURED (INVALID IN PRODUCTION)");
    } else {
      result.warnings.push(`Google OAuth partially configured: ${missing} is missing. Google auth will be disabled.`);
      console.log(`- GOOGLE_CLIENT_ID: ${hasGoogleId ? "✓" : "⚠"} ${hasGoogleId ? "Available" : "Missing"}`);
      console.log(`- GOOGLE_CLIENT_SECRET: ${hasGoogleSecret ? "✓" : "⚠"} ${hasGoogleSecret ? "Available" : "Missing"}`);
      console.log("- Google OAuth: ⚠ Partially configured (disabled)");
    }
  } else {
    result.warnings.push("Google OAuth not configured - only email authentication available");
    console.log("- GOOGLE_CLIENT_ID: ⚠ Missing (Google OAuth disabled)");
    console.log("- GOOGLE_CLIENT_SECRET: ⚠ Missing (Google OAuth disabled)");
    console.log("- Google OAuth: ⚠ Disabled");
  }
  
  // Validate WhatsApp/Twilio Configuration
  const twilioSid = process.env.TWILIO_ACCOUNT_SID;
  const twilioToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioWhatsApp = process.env.TWILIO_WHATSAPP_FROM;
  const hasTwilioSid = !!twilioSid;
  const hasTwilioToken = !!twilioToken;
  
  if (hasTwilioSid && hasTwilioToken) {
    console.log("- TWILIO_ACCOUNT_SID: ✓ Available");
    console.log("- TWILIO_AUTH_TOKEN: ✓ Available");
    console.log(`- TWILIO_WHATSAPP_FROM: ${twilioWhatsApp ? "✓ Available" : "⚠ Missing (using default)"}`);
    console.log("- WhatsApp Service: ✓ Enabled");
  } else if (hasTwilioSid || hasTwilioToken) {
    const missing = hasTwilioSid ? "TWILIO_AUTH_TOKEN" : "TWILIO_ACCOUNT_SID";
    if (isProduction) {
      result.errors.push(`WhatsApp service partially configured: ${missing} is missing. Either set both or remove both.`);
      console.log(`- TWILIO_ACCOUNT_SID: ${hasTwilioSid ? "✓" : "✗"} ${hasTwilioSid ? "Available" : "Missing"}`);
      console.log(`- TWILIO_AUTH_TOKEN: ${hasTwilioToken ? "✓" : "✗"} ${hasTwilioToken ? "Available" : "Missing"}`);
      console.log("- WhatsApp Service: ✗ PARTIALLY CONFIGURED (INVALID IN PRODUCTION)");
    } else {
      result.warnings.push(`WhatsApp service partially configured: ${missing} is missing. WhatsApp will use mock client.`);
      console.log(`- TWILIO_ACCOUNT_SID: ${hasTwilioSid ? "✓" : "⚠"} ${hasTwilioSid ? "Available" : "Missing"}`);
      console.log(`- TWILIO_AUTH_TOKEN: ${hasTwilioToken ? "✓" : "⚠"} ${hasTwilioToken ? "Available" : "Missing"}`);
      console.log("- WhatsApp Service: ⚠ Mock mode (disabled)");
    }
  } else {
    result.warnings.push("WhatsApp service not configured - notifications will use mock client");
    console.log("- TWILIO_ACCOUNT_SID: ⚠ Missing (WhatsApp disabled)");
    console.log("- TWILIO_AUTH_TOKEN: ⚠ Missing (WhatsApp disabled)");
    console.log("- WhatsApp Service: ⚠ Disabled (mock mode)");
  }
  
  // Validate MessageCentral Configuration for SMS/OTP
  const messageCentralToken = process.env.MESSAGECENTRAL_AUTH_TOKEN;
  const messageCentralCustomerId = process.env.MESSAGECENTRAL_CUSTOMER_ID;
  
  if (messageCentralToken && messageCentralCustomerId) {
    console.log("- MESSAGECENTRAL_AUTH_TOKEN: ✓ Available");
    console.log("- MESSAGECENTRAL_CUSTOMER_ID: ✓ Available");
    console.log("- SMS/OTP Service: ✓ Enabled");
  } else if (messageCentralToken || messageCentralCustomerId) {
    const missing = messageCentralToken ? "MESSAGECENTRAL_CUSTOMER_ID" : "MESSAGECENTRAL_AUTH_TOKEN";
    if (isProduction) {
      result.errors.push(`SMS/OTP service partially configured: ${missing} is missing. Either set both or remove both.`);
      console.log(`- MESSAGECENTRAL_AUTH_TOKEN: ${messageCentralToken ? "✓" : "✗"} ${messageCentralToken ? "Available" : "Missing"}`);
      console.log(`- MESSAGECENTRAL_CUSTOMER_ID: ${messageCentralCustomerId ? "✓" : "✗"} ${messageCentralCustomerId ? "Available" : "Missing"}`);
      console.log("- SMS/OTP Service: ✗ PARTIALLY CONFIGURED (INVALID IN PRODUCTION)");
    } else {
      result.warnings.push(`SMS/OTP service partially configured: ${missing} is missing. OTP will use mock mode.`);
      console.log(`- MESSAGECENTRAL_AUTH_TOKEN: ${messageCentralToken ? "✓" : "⚠"} ${messageCentralToken ? "Available" : "Missing"}`);
      console.log(`- MESSAGECENTRAL_CUSTOMER_ID: ${messageCentralCustomerId ? "✓" : "⚠"} ${messageCentralCustomerId ? "Available" : "Missing"}`);
      console.log("- SMS/OTP Service: ⚠ Mock mode (disabled)");
    }
  } else {
    result.warnings.push("SMS/OTP service not configured - mobile registration will use mock mode");
    console.log("- MESSAGECENTRAL_AUTH_TOKEN: ⚠ Missing (SMS/OTP disabled)");
    console.log("- MESSAGECENTRAL_CUSTOMER_ID: ⚠ Missing (SMS/OTP disabled)");
    console.log("- SMS/OTP Service: ⚠ Disabled (mock mode)");
  }
  
  // Validate Email Service Configuration (SendGrid)
  const sendgridKey = process.env.SENDGRID_API_KEY;
  const sendgridFrom = process.env.SENDGRID_FROM_EMAIL;
  
  if (sendgridKey && sendgridFrom) {
    console.log("- SENDGRID_API_KEY: ✓ Available");
    console.log("- SENDGRID_FROM_EMAIL: ✓ Available");
    console.log("- Email Service: ✓ Enabled");
  } else if (sendgridKey || sendgridFrom) {
    const missing = sendgridKey ? "SENDGRID_FROM_EMAIL" : "SENDGRID_API_KEY";
    if (isProduction) {
      result.errors.push(`Email service partially configured: ${missing} is missing. Either set both or remove both.`);
      console.log(`- SENDGRID_API_KEY: ${sendgridKey ? "✓" : "✗"} ${sendgridKey ? "Available" : "Missing"}`);
      console.log(`- SENDGRID_FROM_EMAIL: ${sendgridFrom ? "✓" : "✗"} ${sendgridFrom ? "Available" : "Missing"}`);
      console.log("- Email Service: ✗ PARTIALLY CONFIGURED (INVALID IN PRODUCTION)");
    } else {
      result.warnings.push(`Email service partially configured: ${missing} is missing. Email notifications may fail.`);
      console.log(`- SENDGRID_API_KEY: ${sendgridKey ? "✓" : "⚠"} ${sendgridKey ? "Available" : "Missing"}`);
      console.log(`- SENDGRID_FROM_EMAIL: ${sendgridFrom ? "✓" : "⚠"} ${sendgridFrom ? "Available" : "Missing"}`);
      console.log("- Email Service: ⚠ Partially configured");
    }
  } else {
    result.warnings.push("Email service not configured - email notifications will be disabled");
    console.log("- SENDGRID_API_KEY: ⚠ Missing (Email disabled)");
    console.log("- SENDGRID_FROM_EMAIL: ⚠ Missing (Email disabled)");
    console.log("- Email Service: ⚠ Disabled");
  }
  
  // Validate PORT if provided
  const port = process.env.PORT;
  if (port && (isNaN(Number(port)) || Number(port) <= 0)) {
    result.errors.push("PORT must be a positive integer");
    console.log("- PORT: ✗ INVALID (must be positive integer)");
  } else if (port) {
    console.log(`- PORT: ✓ Available (${port})`);
  }
  
  // Admin Setup Reminder (in development only)
  if (!isProduction) {
    console.log("\n💡 Admin Setup:");
    console.log("   To create an admin user, run:");
    console.log("   ADMIN_EMAIL=admin@yourcompany.com ADMIN_PASSWORD=your_secure_password node scripts/create-admin-user.js");
  }
  
  // Handle validation results
  if (result.errors.length > 0) {
    console.error("\n❌ STARTUP FAILED:");
    result.errors.forEach(error => console.error(`  • ${error}`));
    throw new Error(`Environment validation failed: ${result.errors.join("; ")}`);
  }
  
  if (result.warnings.length > 0) {
    console.warn("\n⚠️ WARNINGS:");
    result.warnings.forEach(warning => console.warn(`  • ${warning}`));
    if (isProduction) {
      console.warn("Consider addressing these warnings for optimal production operation.\n");
    } else {
      console.warn("These warnings are acceptable in development mode.\n");
    }
  }
  
  if (result.warnings.length === 0) {
    console.log("\n✅ All environment variables configured properly!");
  } else {
    console.log("\n✅ Server starting with warnings (see above)");
  }
}

// Validate environment before starting
validateEnvironment();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
  });
})();
