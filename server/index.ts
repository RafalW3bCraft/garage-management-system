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
  
  // Validate PORT if provided
  const port = process.env.PORT;
  if (port && (isNaN(Number(port)) || Number(port) <= 0)) {
    result.errors.push("PORT must be a positive integer");
    console.log("- PORT: ✗ INVALID (must be positive integer)");
  } else if (port) {
    console.log(`- PORT: ✓ Available (${port})`);
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
