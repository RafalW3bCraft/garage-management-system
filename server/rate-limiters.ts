import rateLimit, { type Options } from "express-rate-limit";
import type { Request, Response } from "express";

interface RateLimitResponse {
  success: false;
  message: string;
  retryAfter?: number;
}

const createRateLimitHandler = (message: string) => {
  return (_req: Request, res: Response): void => {
    const retryAfter = res.getHeader('Retry-After');
    const response: RateLimitResponse = {
      success: false,
      message,
    };
    
    if (retryAfter) {
      response.retryAfter = typeof retryAfter === 'string' ? parseInt(retryAfter, 10) : Number(retryAfter);
    }
    
    res.status(429).json(response);
  };
};

const baseConfig: Partial<Options> = {
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
};

export const generalApiLimiter = rateLimit({
  ...baseConfig,
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: "Too many requests from this IP, please try again later",
  handler: createRateLimitHandler("Too many requests from this IP, please try again after 15 minutes"),
  skip: (req) => {
    return !req.path.startsWith('/api');
  }
});

export const authLimiter = rateLimit({
  ...baseConfig,
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: "Too many authentication attempts, please try again later",
  handler: createRateLimitHandler("Too many authentication attempts from this IP, please try again after 15 minutes"),
});

export const strictAuthLimiter = rateLimit({
  ...baseConfig,
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: "Too many login attempts, please try again later",
  handler: createRateLimitHandler("Too many login attempts from this IP, please try again after 1 hour"),
});

export const passwordResetLimiter = rateLimit({
  ...baseConfig,
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: "Too many password reset attempts, please try again later",
  handler: createRateLimitHandler("Too many password reset requests from this IP, please try again after 1 hour"),
  skipSuccessfulRequests: true,
});

export const emailVerificationLimiter = rateLimit({
  ...baseConfig,
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: "Too many verification email requests, please try again later",
  handler: createRateLimitHandler("Too many verification email requests from this IP, please try again after 1 hour"),
});

export const contactFormLimiter = rateLimit({
  ...baseConfig,
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: "Too many contact form submissions, please try again later",
  handler: createRateLimitHandler("Too many contact form submissions from this IP, please try again after 1 hour"),
  skipSuccessfulRequests: true,
});

export const appointmentCreationLimiter = rateLimit({
  ...baseConfig,
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: "Too many appointment requests, please try again later",
  handler: createRateLimitHandler("Too many appointment creation requests from this IP, please try again after 1 hour"),
  skipSuccessfulRequests: true,
});

export const bidPlacementLimiter = rateLimit({
  ...baseConfig,
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: "Too many bid attempts, please try again later",
  handler: createRateLimitHandler("Too many bid placement attempts from this IP, please try again after 1 hour"),
  skipSuccessfulRequests: true,
});

export const imageUploadLimiter = rateLimit({
  ...baseConfig,
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: "Too many image uploads, please try again later",
  handler: createRateLimitHandler("Too many image upload attempts from this IP, please try again after 1 hour"),
  skipSuccessfulRequests: true,
});

export const searchQueryLimiter = rateLimit({
  ...baseConfig,
  windowMs: 15 * 60 * 1000,
  max: 50,
  message: "Too many search requests, please try again later",
  handler: createRateLimitHandler("Too many search requests from this IP, please try again after 15 minutes"),
});

export const webhookLimiter = rateLimit({
  ...baseConfig,
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: "Too many webhook requests, please try again later",
  handler: createRateLimitHandler("Too many webhook requests from this IP, please try again after 15 minutes"),
});

export const whatsappLimiter = rateLimit({
  ...baseConfig,
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: "Too many WhatsApp notification requests, please try again later",
  handler: createRateLimitHandler("Too many WhatsApp notification requests from this IP, please try again after 15 minutes"),
});

export const publicDataLimiter = rateLimit({
  ...baseConfig,
  windowMs: 15 * 60 * 1000,
  max: 150,
  message: "Too many requests, please try again later",
  handler: createRateLimitHandler("Too many requests from this IP, please try again after 15 minutes"),
});

export const healthCheckLimiter = rateLimit({
  ...baseConfig,
  windowMs: 1 * 60 * 1000,
  max: 60,
  message: "Too many health check requests, please try again later",
  handler: createRateLimitHandler("Too many health check requests from this IP, please try again after 1 minute"),
});
