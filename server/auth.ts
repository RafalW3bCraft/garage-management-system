import bcrypt from "bcrypt";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { getStorage } from "./storage";
import { registerSchema, loginSchema, insertOAuthUserSchema } from "@shared/schema";

// Password hashing utilities
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
  return bcrypt.compare(password, hashedPassword);
}

// Passport configuration
passport.serializeUser((user: any, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id: string, done) => {
  try {
    const storage = await getStorage();
    const user = await storage.getUser(id);
    if (!user) {
      console.log(`Session user not found: ${id}`);
      return done(null, false); // Invalid session, force re-login
    }
    done(null, user);
  } catch (error: any) {
    // Log detailed error for debugging (server-side only)
    console.error(`Session deserialization error for user ${id}:`, error.message);
    
    // Always return a generic session error to prevent information disclosure
    // Don't reveal database structure, error codes, or internal system details
    done(new Error("Your session has expired. Please log in again."), null);
  }
});

// Google OAuth Strategy - only configure if credentials are available
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  // Construct callback URL dynamically for different environments
  const port = process.env.PORT || "5000";
  
  // Check if we're running in Replit by looking for Replit-specific environment variables
  const isReplit = !!(process.env.REPL_SLUG || process.env.REPL_OWNER || process.env.REPLIT_DB_URL);
  const isProduction = process.env.NODE_ENV === "production";
  
  let baseUrl: string;
  
  if (isReplit) {
    // In Replit, use the Replit domain (new format is typically .replit.dev)
    // First try the new format, fall back to old format if REPL_SLUG/REPL_OWNER are available
    if (process.env.REPL_SLUG && process.env.REPL_OWNER) {
      baseUrl = `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.replit.dev`;
    } else {
      // If running in Replit but don't have REPL_SLUG/REPL_OWNER, 
      // try to construct from other available info or use a generic approach
      const replUrl = process.env.REPLIT_URL || process.env.REPL_URL;
      if (replUrl) {
        baseUrl = replUrl;
      } else {
        // As fallback, try to detect from hostname or use current domain
        baseUrl = `https://localhost:${port}`; // This will need to be manually configured
        console.warn("Running in Replit but cannot determine domain. Please check REPL_SLUG and REPL_OWNER environment variables.");
      }
    }
  } else if (isProduction) {
    // Traditional production deployment (not Replit)
    baseUrl = process.env.PRODUCTION_URL || `https://localhost:${port}`;
  } else {
    // Local development
    baseUrl = `http://localhost:${port}`;
  }
  
  const callbackURL = `${baseUrl}/api/auth/google/callback`;
  
  console.log(`Environment detection: isReplit=${isReplit}, isProduction=${isProduction}`);
  console.log(`Google OAuth callback URL configured: ${callbackURL}`);
  
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: callbackURL
  }, async (accessToken, refreshToken, profile, done) => {
  try {
    const storage = await getStorage();
    
    // Check if user already exists with this Google ID
    let user = await storage.getUserByGoogleId(profile.id);
    
    if (user) {
      return done(null, user);
    }
    
    // Check if user exists with this email
    const email = profile.emails?.[0]?.value;
    if (email) {
      user = await storage.getUserByEmail(email);
      if (user && !user.googleId) {
        // Link the Google account to existing user
        try {
          console.log(`Linking Google account to existing user (ID: ${user.id})`);
          const updatedUser = await storage.linkGoogleAccount(user.id, profile.id);
          
          console.log(`Successfully linked Google account for user ID: ${user.id}`);
          return done(null, updatedUser);
        } catch (error: any) {
          console.error("Error linking Google account:", error.message);
          
          // Handle specific error cases with user-friendly messages
          if (error.message.includes("already linked to another user")) {
            return done(new Error("This Google account is already linked to another account"), undefined);
          }
          if (error.message.includes("User already linked")) {
            return done(new Error("Your account is already linked to Google"), undefined);
          }
          
          return done(new Error("Failed to link Google account. Please try again."), undefined);
        }
      } else if (user && user.googleId) {
        // User already linked - return existing user
        console.log(`User ID: ${user.id} already linked to Google account`);
        return done(null, user);
      }
    }
    
    // Create new user
    if (email) {
      const userData = insertOAuthUserSchema.parse({
        email,
        name: profile.displayName || profile.emails?.[0]?.value || "",
        provider: "google",
        googleId: profile.id,
        emailVerified: true,
      });
      user = await storage.createUser(userData);
    }
    
    return done(null, user || undefined);
  } catch (error: any) {
    console.error("Google OAuth strategy error:", error.message);
    
    // Handle specific OAuth errors
    if (error.message?.includes('validation')) {
      return done(new Error("Invalid Google account data. Please contact support."), undefined);
    }
    
    if (error.code && error.code === '23505') {
      return done(new Error("Account creation failed due to existing data. Please try logging in instead."), undefined);
    }
    
    if (error.code && error.code.startsWith('2')) {
      return done(new Error("Database connection issue. Please try again later."), undefined);
    }
    
    // Generic OAuth error
    return done(new Error("Google authentication failed. Please try again."), undefined);
  }
  }));
} else {
  console.log("Google OAuth not configured - GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET required");
}

export { passport };