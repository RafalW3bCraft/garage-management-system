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
    console.error(`Session deserialization error for user ${id}:`, error.message);
    
    // Handle specific error types
    if (error.code && error.code.startsWith('2')) {
      // Database connection/constraint errors
      return done(new Error("Database connection issue. Please try logging in again."), null);
    }
    
    // Generic session error - force re-login
    done(new Error("Session validation failed. Please log in again."), null);
  }
});

// Google OAuth Strategy - only configure if credentials are available
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "/api/auth/google/callback"
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