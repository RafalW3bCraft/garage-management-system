import sanitizeHtml from 'sanitize-html';

export interface SanitizationOptions {
  allowedTags?: string[];
  allowedAttributes?: Record<string, string[]>;
  allowedSchemes?: string[];
  stripAll?: boolean;
}

const DEFAULT_OPTIONS: SanitizationOptions = {
  allowedTags: [],
  allowedAttributes: {},
  allowedSchemes: ['http', 'https', 'mailto'],
  stripAll: true
};

const RELAXED_OPTIONS: SanitizationOptions = {
  allowedTags: ['b', 'i', 'em', 'strong', 'br', 'p'],
  allowedAttributes: {},
  allowedSchemes: ['http', 'https', 'mailto'],
  stripAll: false
};

export function sanitizeString(input: string | null | undefined, options: SanitizationOptions = DEFAULT_OPTIONS): string {
  if (!input) return '';
  
  const sanitizeOptions = {
    allowedTags: options.allowedTags || [],
    allowedAttributes: options.allowedAttributes || {},
    allowedSchemes: options.allowedSchemes || ['http', 'https', 'mailto'],
    disallowedTagsMode: 'discard' as const,
    selfClosing: ['br'],
    allowedSchemesByTag: {},
    allowProtocolRelative: false
  };
  
  let sanitized = sanitizeHtml(input.trim(), sanitizeOptions);
  
  sanitized = sanitized
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/data:/gi, '');
  
  return sanitized.trim();
}

export function sanitizeUsername(username: string | null | undefined): string {
  if (!username) return '';
  
  let sanitized = sanitizeString(username, DEFAULT_OPTIONS);
  
  sanitized = sanitized
    .replace(/[<>\"'`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  
  if (sanitized.length > 100) {
    sanitized = sanitized.substring(0, 100);
  }
  
  return sanitized;
}

export function sanitizeEmail(email: string | null | undefined): string {
  if (!email) return '';
  
  let sanitized = sanitizeString(email, DEFAULT_OPTIONS)
    .toLowerCase()
    .replace(/[^a-z0-9@._+-]/g, '')
    .trim();
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(sanitized)) {
    return '';
  }
  
  return sanitized;
}

export function sanitizePhone(phone: string | null | undefined): string {
  if (!phone) return '';
  
  let sanitized = sanitizeString(phone, DEFAULT_OPTIONS)
    .replace(/[^\d+\-() ]/g, '')
    .trim();
  
  if (sanitized.length > 20) {
    sanitized = sanitized.substring(0, 20);
  }
  
  return sanitized;
}

export function sanitizeMessage(message: string | null | undefined): string {
  if (!message) return '';
  
  let sanitized = sanitizeString(message, RELAXED_OPTIONS);
  
  if (sanitized.length > 5000) {
    sanitized = sanitized.substring(0, 5000);
  }
  
  return sanitized;
}

export function sanitizeAddress(address: string | null | undefined): string {
  if (!address) return '';
  
  let sanitized = sanitizeString(address, RELAXED_OPTIONS);
  
  if (sanitized.length > 500) {
    sanitized = sanitized.substring(0, 500);
  }
  
  return sanitized;
}

export function sanitizeUrl(url: string | null | undefined): string {
  if (!url) return '';
  
  let sanitized = sanitizeString(url, DEFAULT_OPTIONS).trim();
  
  const urlRegex = /^https?:\/\//i;
  if (!urlRegex.test(sanitized)) {
    return '';
  }
  
  try {
    const parsedUrl = new URL(sanitized);
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return '';
    }
    return parsedUrl.toString();
  } catch {
    return '';
  }
}

export function sanitizeObject<T extends Record<string, any>>(
  obj: T,
  fieldSanitizers: Partial<Record<keyof T, (value: any) => any>>
): T {
  const sanitized = { ...obj };
  
  for (const [key, sanitizer] of Object.entries(fieldSanitizers)) {
    if (key in sanitized && sanitizer) {
      sanitized[key as keyof T] = sanitizer(sanitized[key as keyof T]);
    }
  }
  
  return sanitized;
}

export const sanitizers = {
  string: sanitizeString,
  username: sanitizeUsername,
  email: sanitizeEmail,
  phone: sanitizePhone,
  message: sanitizeMessage,
  address: sanitizeAddress,
  url: sanitizeUrl,
  object: sanitizeObject
};

export default sanitizers;
