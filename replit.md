# RonakMotorGarage - Automotive Service Management Platform

## Overview

RonakMotorGarage is a comprehensive full-stack web application designed for automotive service and sales management. The platform serves as a digital solution for garage operations, enabling customers to book services, browse cars for sale, participate in auctions, and manage appointments. The application provides both customer-facing features and administrative capabilities for managing garage operations across multiple locations.

## Recent Changes (October 2025)

**Email Verification Page Implementation** (October 7, 2025) (Latest)
- Created `/verify-email` page component to handle email verification links from registration emails
- Implemented automatic token verification on page load with proper loading, success, and error states
- Uses wouter's `useSearch` hook for reliable URL query parameter extraction
- Auto-logs users in upon successful email verification and redirects to home page
- Added route to frontend routing configuration in App.tsx
- User-friendly error messages with retry and navigation options

**Authentication System Bug Fixes** (October 7, 2025)
- Fixed Twilio ES module loading: Converted CommonJS require() to dynamic import() for ES module compatibility
- Fixed WhatsApp OTP channel storage: OTP records now correctly store channel type ('whatsapp' or 'email') and email address
- Fixed Drizzle CLI configuration: Added strict:false for non-interactive schema pushes
- All authentication flows verified working: Email/Password with verification, Password reset, Mobile OTP (WhatsApp/Email), Google OAuth
- Production note: Twilio error 63007 (WhatsApp sandbox not configured) is expected in development; requires Twilio WhatsApp sandbox setup for production

**Authentication System Enhancement - All Methods Enabled**
- Enabled all authentication methods: Email/Password, Mobile OTP, and Google OAuth
- Email/Password: Includes email verification and secure password reset functionality
- Mobile OTP: WhatsApp (default) and Email channel support with secure OTP hashing
- Google OAuth: Seamless integration with account linking
- Password Reset: Secure token-based flow with anti-enumeration protection
- Security: CSRF protection, token hashing, timing attack prevention
- Frontend: All three authentication options available in AuthDialog
- Dynamic provider API returns available methods based on environment configuration

**Image Upload Enhancement** (Latest)
- Expanded supported image formats: JPEG, PNG, WebP, GIF, SVG, BMP, TIFF, ICO, AVIF
- All formats maintain 5MB file size limit for consistent storage management
- Special handling for SVG files (no resizing, preserved as vector graphics)
- Animated GIF preservation: automatically detects multi-frame GIFs and preserves original file
- ICO multi-resolution icon preservation: maintains all icon sizes without processing
- Static GIF files processed normally for optimization
- Enhanced validation for each format type with security checks
- Admin media library endpoint for uploading branding and site images

**Admin Media Library** (Latest)
- New POST `/api/admin/media-library/upload` endpoint for admin-only uploads
- Supports branding assets: logos, banners, icons, gallery images, etc.
- GET `/api/admin/media-library` endpoint to retrieve uploaded media
- Full audit logging for all media uploads
- Filtering by image type, uploader, and active status

**Logo Update**
- Replaced the generic Wrench icon with the official Ronak Motor logo image
- Logo now displays the brand's custom automotive-themed design with orange and yellow accent colors
- Responsive logo sizing maintained across different screen sizes (sm, md, lg)

**Featured Cars Section**
- Added a new "Featured Cars for Sale" section to the homepage
- Displays the first 3 cars from the inventory in an attractive grid layout
- Includes loading states, error handling, and empty state messaging
- Properly passes through auction status and bid information
- Integrates seamlessly with existing CarCard component
- "View All Cars" button directs users to the full cars listing page

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Framework & Technologies**
- React 18 with TypeScript for type safety and modern development
- Vite as the build tool for fast development and optimized production builds
- Tailwind CSS for utility-first styling with custom design system
- shadcn/ui component library for consistent, accessible UI components
- Wouter for lightweight client-side routing

**State Management**
- TanStack Query (React Query) for server state management, caching, and data synchronization
- React Context API for shared client-side state (dialogs, auth preferences)
- Local component state with React hooks for UI-specific state
- Browser localStorage for client-side persistence (favorites, theme preferences, auth preferences)

**Context Providers** (September 2025)
- DialogContext: Centralized dialog state management for programmatic control
- AuthPreferencesContext: Shared authentication preferences with localStorage persistence
- ThemeProvider: Dark/light theme management (pre-existing)

**Design System**
- Professional automotive-inspired color palette with blue primary colors and orange accents
- Inter font family for professional appearance
- Responsive design with mobile-first approach
- Dark/light theme support with system preference detection
- Consistent spacing using Tailwind's spacing scale

### Backend Architecture

**Server Framework**
- Express.js with TypeScript for type-safe API development
- Session-based authentication with express-session
- RESTful API design with standardized error handling

**Authentication System**
- Multi-method authentication: Email/Password, Mobile OTP, and Google OAuth
- Email/Password: Secure bcrypt hashing, email verification, password reset with token-based flow
- Mobile OTP: WhatsApp (default) or Email channel support with secure OTP hashing
- Google OAuth: Passport.js integration with automatic account linking
- Role-based access control (customer/admin roles)
- Session management with secure cookie configuration and CSRF protection
- Security features: Token hashing (SHA-256), timing attack prevention, anti-enumeration
- Rate limiting and security measures across all authentication methods

**Database Layer**
- PostgreSQL as the primary database for reliability and ACID compliance
- Drizzle ORM for type-safe database operations and schema management
- Connection pooling for efficient database resource management
- Database migrations managed through Drizzle Kit

**API Structure**
- Modular route organization by feature (auth, appointments, cars, services, etc.)
- Zod schemas for request/response validation
- Centralized error handling with user-friendly error messages
- Standardized response formats for consistent client integration

### Data Storage Solutions

**Database Schema Design**
- Users table with support for multiple authentication providers
- Customers table for service booking information
- Services table with categorization and pricing
- Appointments table with status tracking and scheduling
- Cars table supporting both sales and auction functionality
- Locations table for multi-branch garage operations
- Bids table for auction system implementation

**Data Relationships**
- Foreign key constraints ensuring data integrity
- Indexed columns for performance optimization
- UUID primary keys for security and scalability

### Authentication and Authorization

**Authentication Flow**
- Email/password: Registration with email verification, bcrypt password hashing, password reset via secure token
- Mobile OTP: Phone verification via WhatsApp/Email, secure OTP hashing, automatic user creation on verification
- Google OAuth: Integration via Passport.js with automatic account linking
- Session-based authentication with secure session management and CSRF protection
- Session timestamp initialization on login for admin session validation
- Email verification required for email/password accounts before login
- Password reset: Token-based flow with anti-enumeration protection and 24-hour expiration

**Authorization Levels**
- Customer role: Service booking, appointment management, car browsing/bidding
- Admin role: Full system access, appointment management, service configuration, audit logging
- Route-level protection based on authentication status and role
- Enhanced admin middleware with rate limiting, session validation, and security checks

**Admin Setup** (October 2025)
- Admin users can be created using `scripts/create-admin-user.js`
- Default admin credentials: admin@ronakmotor.com (change password after first login)
- Admin sessions include timestamp validation and IP monitoring for security

## External Dependencies

### Core Infrastructure
- **PostgreSQL Database**: Primary data storage with support for connection string or individual credential configuration
- **Node.js Runtime**: Server-side JavaScript execution environment

### Authentication Services
- **Google OAuth**: Optional Google authentication integration requiring GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET
- **Passport.js**: Authentication middleware for OAuth strategy implementation

### Email Services
- **SendGrid**: Optional email notification service for appointment confirmations and updates
- Requires SENDGRID_API_KEY environment variable for activation

### Frontend Libraries
- **Radix UI**: Headless UI primitives for accessible component development
- **Lucide React**: Icon library for consistent iconography
- **React Hook Form**: Form management with validation
- **date-fns**: Date manipulation and formatting utilities

### Development Tools
- **Drizzle Kit**: Database schema management and migration tools
- **ESBuild**: Fast JavaScript bundling for production builds
- **TypeScript**: Static type checking across the entire codebase

### Environment Configuration
- **SESSION_SECRET**: Required for secure session management (minimum 32 characters)
- **DATABASE_URL**: PostgreSQL connection string
- **GOOGLE_CLIENT_ID/SECRET**: Optional for Google OAuth
- **SENDGRID_API_KEY**: Optional for email notifications

The application is designed to be deployment-ready with proper error handling, logging, and graceful degradation when optional services are unavailable.