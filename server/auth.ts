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
    done(null, user);
  } catch (error) {
    done(error, null);
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
      if (user) {
        // Link the Google account to existing user
        // Note: In a real app, you might want to ask for confirmation
        // For now, we'll create a new account
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
  } catch (error) {
    return done(error, undefined);
  }
  }));
} else {
  console.log("Google OAuth not configured - GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET required");
}

export { passport };