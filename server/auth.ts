import bcrypt from "bcrypt";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { getStorage } from "./storage";
import { registerSchema, loginSchema, insertOAuthUserSchema } from "@shared/schema";

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
  return bcrypt.compare(password, hashedPassword);
}

passport.serializeUser((user: Express.User, done) => {
  done(null, (user as any).id);
});

passport.deserializeUser(async (id: string, done) => {
  try {
    const storage = await getStorage();
    const user = await storage.getUser(id);
    if (!user) {
      return done(null, false);
    }
    done(null, user);
  } catch (error) {

    const err = error as Error;
    console.error(`Session deserialization error for user ${id}:`, err.message);

    done(new Error("Your session has expired. Please log in again."), null);
  }
});

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  const port = process.env.PORT || "5000";
  const isReplit = !!(process.env.REPL_SLUG || process.env.REPL_OWNER || process.env.REPLIT_DB_URL);
  const isProduction = process.env.NODE_ENV === "production";
  
  let baseUrl: string;
  
  if (isReplit) {
    if (process.env.REPLIT_DOMAINS) {
      baseUrl = `https://${process.env.REPLIT_DOMAINS}`;
    } else if (process.env.REPL_SLUG && process.env.REPL_OWNER) {
      baseUrl = `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.replit.dev`;
    } else {
      const replUrl = process.env.REPLIT_URL || process.env.REPL_URL;
      baseUrl = replUrl || `https://localhost:${port}`;
      if (!replUrl) {
        console.warn("Running in Replit but cannot determine domain. Please check REPLIT_DOMAINS environment variable.");
      }
    }
  } else if (isProduction) {
    baseUrl = process.env.PRODUCTION_URL || `https://localhost:${port}`;
  } else {
    baseUrl = `http://localhost:${port}`;
  }
  
  const callbackURL = `${baseUrl}/api/auth/google/callback`;
  
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: callbackURL
  }, async (accessToken, refreshToken, profile, done) => {
  try {
    const storage = await getStorage();

    let user = await storage.getUserByGoogleId(profile.id);
    
    if (user) {
      return done(null, user);
    }

    const email = profile.emails?.[0]?.value;
    if (email) {
      user = await storage.getUserByEmail(email);
      if (user && !user.googleId) {

        try {
          const updatedUser = await storage.linkGoogleAccount(user.id, profile.id);

          if (user.email === email && !user.emailVerified) {
            await storage.updateUser(user.id, { emailVerified: true });
          }
          
          return done(null, updatedUser);
        } catch (error) {
          const err = error as Error;
          console.error("Error linking Google account:", err.message);

          if (err.message.includes("already linked to another user")) {
            return done(new Error("This Google account is already linked to another account"), undefined);
          }
          if (err.message.includes("User already linked")) {
            return done(new Error("Your account is already linked to Google"), undefined);
          }
          
          return done(new Error("Failed to link Google account. Please try again."), undefined);
        }
      } else if (user && user.googleId) {

        return done(null, user);
      }
    }

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
    const err = error as { message?: string; code?: string };
    console.error("Google OAuth strategy error:", err.message);

    if (err.message?.includes('validation')) {
      return done(new Error("Invalid Google account data. Please contact support."), undefined);
    }
    
    if (err.code && err.code === '23505') {
      return done(new Error("Account creation failed due to existing data. Please try logging in instead."), undefined);
    }
    
    if (err.code && err.code.startsWith('2')) {
      return done(new Error("Database connection issue. Please try again later."), undefined);
    }

    return done(new Error("Google authentication failed. Please try again."), undefined);
  }
  }));
} else {
}

export { passport };
