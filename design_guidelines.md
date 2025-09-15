# RonakMotorGarage Design Guidelines

## Design Approach
**Reference-Based Approach**: Drawing inspiration from professional automotive service platforms like Jiffy Lube, Valvoline Instant Oil Change, and automotive CRM systems like DealerSocket. The design emphasizes trust, professionalism, and efficiency - critical for automotive service businesses.

## Core Design Elements

### A. Color Palette
**Primary Colors:**
- Dark Mode: Deep automotive blue (220 85% 15%) for headers/navigation
- Light Mode: Professional blue (220 75% 25%) 
- Accent: Bright orange (25 90% 55%) for CTAs and important actions
- Success: Green (140 65% 45%) for completed services
- Warning: Amber (45 85% 55%) for pending appointments

**Supporting Colors:**
- Neutral grays (220 10% variations) for text and backgrounds
- White/off-white for content areas

### B. Typography
**Primary Font**: Inter (professional, automotive industry standard)
**Secondary Font**: Roboto Mono for technical data (VIN numbers, license plates)

**Hierarchy:**
- H1: 2.5rem/bold for page titles
- H2: 2rem/semibold for section headers  
- H3: 1.5rem/medium for card titles
- Body: 1rem/normal for content
- Small: 0.875rem for metadata/captions

### C. Layout System
**Spacing Units**: Tailwind units of 2, 4, 6, and 8 (p-2, m-4, h-6, gap-8)
- Consistent 6-unit spacing between major sections
- 4-unit spacing within components
- 2-unit spacing for tight elements

### D. Component Library

**Navigation:**
- Fixed top navigation with garage logo and user profile
- Side navigation for admin dashboard with automotive icons
- Breadcrumb navigation for multi-step processes

**Cards:**
- Service appointment cards with status indicators
- Car registration cards showing vehicle details and thumbnail
- Invoice cards with pricing breakdown
- Clean shadows and rounded corners (rounded-lg)

**Forms:**
- Multi-step forms for car registration and service booking
- Clear field grouping with automotive-specific inputs
- Real-time validation with inline error messages
- Progress indicators for multi-step processes

**Data Tables:**
- Service history tables with sortable columns
- Customer management grids with search/filter
- Appointment scheduling calendar views
- Export functionality for reports

**Status Indicators:**
- Color-coded service status badges
- Progress bars for service completion
- Icon-based vehicle condition indicators

### E. Automotive-Specific Elements

**Vehicle Display:**
- Car cards with make/model/year prominence
- License plate styling for registration numbers
- Service history timelines with visual progress
- Maintenance scheduling with calendar integration

**Dashboard Widgets:**
- Revenue charts for admin users
- Upcoming appointments overview
- Service completion metrics
- Customer satisfaction scores

## Images
**Hero Section**: Large automotive garage interior image showing professional service bays, clean environment, and modern equipment. Should convey trust and professionalism.

**Car Placeholders**: Use automotive stock photos for car listings in resale section. Images should be high-quality, consistent aspect ratios.

**Service Icons**: Professional automotive service icons (oil change, brake service, tire rotation) throughout the interface.

**Profile Avatars**: Default professional headshots for user profiles, with upload capability.

## Key Principles
1. **Trust-Building**: Professional color scheme and clean layouts to build customer confidence
2. **Efficiency**: Quick access to common actions (book appointment, view service history)
3. **Data Clarity**: Clear presentation of technical automotive data and service information
4. **Mobile-First**: Responsive design for customers checking appointments on mobile
5. **Status Transparency**: Always show current service status and next steps clearly

## Responsive Behavior
- Mobile: Single column, collapsible navigation, touch-friendly buttons
- Tablet: Two-column layouts, sidebar navigation
- Desktop: Full dashboard layouts with multiple data panels

This design system creates a professional, trustworthy automotive service platform that serves both customers and garage administrators effectively.