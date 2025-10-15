import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { getStorage } from "./storage";
import { performanceMiddleware } from "./performance-monitor";
import { 
  generalApiLimiter,
  healthCheckLimiter 
} from "./rate-limiters";

interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

function validateEnvironment(): void {
  const isProduction = process.env.NODE_ENV === "production";
  const result: ValidationResult = { isValid: true, errors: [], warnings: [] };

  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret) {
    result.errors.push("SESSION_SECRET is required");
  } else if (sessionSecret.length < 32) {
    result.errors.push("SESSION_SECRET must be at least 32 characters long for security");
  } else {

    const hasUppercase = /[A-Z]/.test(sessionSecret);
    const hasLowercase = /[a-z]/.test(sessionSecret);
    const hasNumbers = /[0-9]/.test(sessionSecret);
    const hasSpecialChars = /[^A-Za-z0-9]/.test(sessionSecret);

    const allSameChar = /^(.)\1+$/.test(sessionSecret);
    const hasSequentialChars = /012|123|234|345|456|567|678|789|890|abc|bcd|cde|def|efg|fgh|ghi|hij|ijk|jkl|klm|lmn|mno|nop|opq|pqr|qrs|rst|stu|tuv|uvw|vwx|wxy|xyz/i.test(sessionSecret);
    
    if (allSameChar) {
      result.errors.push("SESSION_SECRET is too weak: contains only repeated characters. Generate a secure secret using: openssl rand -base64 48");
    } else if (hasSequentialChars) {
      result.errors.push("SESSION_SECRET is too weak: contains sequential patterns. Generate a secure secret using: openssl rand -base64 48");
    } else if (!hasUppercase || !hasLowercase || !hasNumbers || !hasSpecialChars) {
      const missing: string[] = [];
      if (!hasUppercase) missing.push("uppercase letters");
      if (!hasLowercase) missing.push("lowercase letters");
      if (!hasNumbers) missing.push("numbers");
      if (!hasSpecialChars) missing.push("special characters");
      
      result.errors.push(`SESSION_SECRET lacks sufficient entropy: missing ${missing.join(", ")}. Generate a secure secret using: openssl rand -base64 48`);
    } else {
    }
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    if (isProduction) {
      result.errors.push("DATABASE_URL is required in production");
    } else {
      result.warnings.push("DATABASE_URL missing - will use in-memory storage (data lost on restart)");
    }
  } else {
    try {
      new URL(databaseUrl);
    } catch {
      result.errors.push("DATABASE_URL is not a valid URL");
    }
  }

  const googleClientId = process.env.GOOGLE_CLIENT_ID;
  const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const hasGoogleId = !!googleClientId;
  const hasGoogleSecret = !!googleClientSecret;
  
  if (hasGoogleId && hasGoogleSecret) {
  } else if (hasGoogleId || hasGoogleSecret) {
    const missing = hasGoogleId ? "GOOGLE_CLIENT_SECRET" : "GOOGLE_CLIENT_ID";
    if (isProduction) {
      result.errors.push(`Google OAuth partially configured: ${missing} is missing. Either set both or remove both.`);
    } else {
      result.warnings.push(`Google OAuth partially configured: ${missing} is missing. Google auth will be disabled.`);
    }
  } else {
    result.warnings.push("Google OAuth not configured - only email authentication available");
  }

  const twilioSid = process.env.TWILIO_ACCOUNT_SID;
  const twilioToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioWhatsApp = process.env.TWILIO_WHATSAPP_NUMBER;
  const hasTwilioSid = !!twilioSid;
  const hasTwilioToken = !!twilioToken;
  
  if (hasTwilioSid && hasTwilioToken) {
  } else if (hasTwilioSid || hasTwilioToken) {
    const missing = hasTwilioSid ? "TWILIO_AUTH_TOKEN" : "TWILIO_ACCOUNT_SID";
    if (isProduction) {
      result.errors.push(`WhatsApp service partially configured: ${missing} is missing. Either set both or remove both.`);
    } else {
      result.warnings.push(`WhatsApp service partially configured: ${missing} is missing. WhatsApp will use mock client.`);
    }
  } else {
    result.warnings.push("WhatsApp service not configured - notifications will use mock client");
  }

  const sendgridKey = process.env.SENDGRID_API_KEY;
  const sendgridFrom = process.env.SENDGRID_FROM_EMAIL;
  
  if (sendgridKey && sendgridFrom) {
  } else if (sendgridKey || sendgridFrom) {
    const missing = sendgridKey ? "SENDGRID_FROM_EMAIL" : "SENDGRID_API_KEY";
    if (isProduction) {
      result.errors.push(`Email service partially configured: ${missing} is missing. Either set both or remove both.`);
    } else {
      result.warnings.push(`Email service partially configured: ${missing} is missing. Email notifications may fail.`);
    }
  } else {
    result.warnings.push("Email service not configured - email notifications will be disabled");
  }

  const port = process.env.PORT;
  if (port && (isNaN(Number(port)) || Number(port) <= 0)) {
    result.errors.push("PORT must be a positive integer");
  } else if (port) {
  }

  if (!isProduction) {
  }

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
  } else {
  }
}

validateEnvironment();

const app = express();

app.set('trust proxy', 1);

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use(performanceMiddleware());

app.use('/api/health', healthCheckLimiter);
app.use('/api', generalApiLimiter);

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, unknown> | undefined = undefined;

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

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const error = err as { status?: number; statusCode?: number; message?: string };
    const status = error.status || error.statusCode || 500;
    const message = error.message || "Internal Server Error";

    console.error("[ERROR_HANDLER] Unhandled error:", {
      status,
      message,
      stack: (err as Error).stack,
      timestamp: new Date().toISOString(),
      url: _req.url,
      method: _req.method
    });

    const isProduction = process.env.NODE_ENV === "production";
    const clientMessage = isProduction && status === 500 ? "Internal Server Error" : message;

    res.status(status).json({ message: clientMessage });
  });

  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);

    startEmailVerificationCleanupScheduler();
  });
})();

/**
 * Email Verification Token Cleanup Scheduler
 * Runs cleanup every 6 hours and performs initial cleanup on startup
 */
function startEmailVerificationCleanupScheduler(): void {
  const CLEANUP_INTERVAL_HOURS: number = 6;
  const CLEANUP_INTERVAL_MS = CLEANUP_INTERVAL_HOURS * 60 * 60 * 1000;
  
  const performCleanup = async (isStartup: boolean = false): Promise<void> => {
    const startTime = Date.now();
    const cleanupType = isStartup ? 'STARTUP' : 'SCHEDULED';
    
    try {
      
      const storage = await getStorage();

      const cutoffDate = new Date(Date.now() - (48 * 60 * 60 * 1000));
      const deletedCount = await storage.cleanupExpiredVerificationTokens(cutoffDate);
      
      const duration = Date.now() - startTime;
      
    } catch (error: unknown) {
      const duration = Date.now() - startTime;
      const errorObj = error as Error;
      console.error(`[EMAIL_VERIFICATION_CLEANUP] ${cleanupType} cleanup failed after ${duration}ms:`, {
        message: errorObj.message,
        stack: errorObj.stack,
        timestamp: new Date().toISOString()
      });

      if (process.env.NODE_ENV === 'production') {
        console.error(`[EMAIL_VERIFICATION_CLEANUP] Production error logged - application continues running`);
      } else {
        console.warn(`[EMAIL_VERIFICATION_CLEANUP] Development mode - cleanup failure is non-critical`);
      }
    }
  };

  setTimeout(async () => {
    await performCleanup(true);
  }, 3000);

  const intervalId = setInterval(async () => {
    await performCleanup(false);
  }, CLEANUP_INTERVAL_MS);
  
  const gracefulShutdown = (signal: string) => {
    clearInterval(intervalId);
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  (global as any).__emailVerificationCleanupInterval = intervalId;
}
