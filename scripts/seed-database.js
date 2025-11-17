import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { services, locations, cars } from '../shared/schema.js';

async function seedDatabase() {
  let url = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL;

  
  if (!url && process.env.PGHOST && process.env.PGUSER && process.env.PGPASSWORD && process.env.PGDATABASE && process.env.PGPORT) {
    url = `postgresql://${process.env.PGUSER}:${process.env.PGPASSWORD}@${process.env.PGHOST}:${process.env.PGPORT}/${process.env.PGDATABASE}`;
  }

  if (!url) {
    console.error('No database connection available. Database credentials not found in environment.');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: url });
  const db = drizzle(pool, { schema: { services, locations, cars } });

  try {
    console.log('Starting database seeding...');

    
    console.log('Seeding locations...');
    await db.insert(locations).values([
      {
        id: "loc-1",
        name: "Mumbai Branch",
        address: "123 Service Road, Andheri West, Mumbai - 400058",
        phone: "+91-22-2345-6789",
        email: "mumbai@ronakmotorgarage.com",
        hours: "Mon-Sat: 9:00 AM - 7:00 PM",
        rating: "4.8"
      },
      {
        id: "loc-2",
        name: "Delhi Branch",
        address: "456 Main Street, Connaught Place, New Delhi - 110001",
        phone: "+91-11-3456-7890",
        email: "delhi@ronakmotorgarage.com",
        hours: "Mon-Sat: 8:30 AM - 8:00 PM",
        rating: "4.6"
      },
      {
        id: "loc-3",
        name: "Bangalore Branch",
        address: "789 Tech Park Road, Whitefield, Bangalore - 560066",
        phone: "+91-80-4567-8901",
        email: "bangalore@ronakmotorgarage.com",
        hours: "Mon-Sat: 9:00 AM - 7:30 PM",
        rating: "4.7"
      }
    ]).onConflictDoNothing();

    
    console.log('Seeding services...');
    await db.insert(services).values([
      {
        id: "svc-1",
        title: "Oil Change",
        description: "Complete engine oil and filter replacement",
        price: 2500,
        duration: "30 mins",
        category: "maintenance",
        features: ["Engine oil replacement", "Oil filter change", "Free inspection", "Digital report"],
        popular: false,
        icon: "droplets"
      },
      {
        id: "svc-2", 
        title: "Complete Service",
        description: "Comprehensive vehicle maintenance",
        price: 8500,
        duration: "3 hours",
        category: "maintenance",
        features: ["Full inspection", "Oil change", "Brake check", "AC service", "Washing"],
        popular: true,
        icon: "car"
      },
      {
        id: "svc-3",
        title: "AC Service",
        description: "Air conditioning system service and repair",
        price: 3500,
        duration: "1.5 hours", 
        category: "ac",
        features: ["AC gas refill", "Filter cleaning", "Cooling check", "Leak detection"],
        popular: true,
        icon: "zap"
      },
      {
        id: "svc-4",
        title: "Brake Inspection",
        description: "Complete brake system check and service",
        price: 1500,
        duration: "45 mins",
        category: "brakes",
        features: ["Brake pad check", "Brake fluid top-up", "Performance test", "Safety report"],
        popular: false,
        icon: "alert-triangle"
      },
      {
        id: "svc-5",
        title: "Engine Diagnostics",
        description: "Computer diagnostics for engine performance",
        price: 2000,
        duration: "1 hour",
        category: "diagnostics",
        features: ["OBD scan", "Error code analysis", "Performance report", "Recommendations"],
        popular: false,
        icon: "settings"
      },
      {
        id: "svc-6",
        title: "Tire Service",
        description: "Tire rotation, balancing, and alignment",
        price: 2800,
        duration: "1 hour",
        category: "tires", 
        features: ["Tire rotation", "Wheel balancing", "Alignment check", "Pressure adjustment"],
        popular: false,
        icon: "gauge"
      }
    ]).onConflictDoNothing();

    
    console.log('Seeding cars...');
    await db.insert(cars).values([
      
      {
        id: "car-1",
        make: "Maruti Suzuki",
        model: "Swift",
        year: 2020,
        price: 650000,
        mileage: 35000,
        fuelType: "petrol",
        location: "Mumbai",
        condition: "Excellent",
        image: "https://images.unsplash.com/photo-1605559424843-9e4c228bf1c2?w=400&h=300&fit=crop&crop=center",
        isAuction: false,
        currentBid: null,
        auctionEndTime: null,
        description: "Well-maintained Swift with full service history"
      },
      {
        id: "car-2",
        make: "Hyundai", 
        model: "Creta",
        year: 2019,
        price: 1200000,
        mileage: 42000,
        fuelType: "diesel",
        location: "Delhi",
        condition: "Good",
        image: "https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?w=400&h=300&fit=crop&crop=center",
        isAuction: false,
        currentBid: null,
        auctionEndTime: null,
        description: "Popular SUV with excellent fuel efficiency"
      },
      {
        id: "car-3",
        make: "Tata",
        model: "Nexon",
        year: 2021,
        price: 950000,
        mileage: 25000,
        fuelType: "electric",
        location: "Bangalore",
        condition: "Excellent",
        image: "https://images.unsplash.com/photo-1544896478-d5c7254e1b58?w=400&h=300&fit=crop&crop=center",
        isAuction: false,
        currentBid: null,
        auctionEndTime: null,
        description: "Electric SUV with modern features"
      },
      {
        id: "car-4",
        make: "Honda",
        model: "City",
        year: 2018,
        price: 850000,
        mileage: 48000,
        fuelType: "petrol",
        location: "Pune",
        condition: "Good",
        image: "https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=400&h=300&fit=crop&crop=center",
        isAuction: false,
        currentBid: null,
        auctionEndTime: null,
        description: "Reliable sedan with excellent comfort"
      },
      
      {
        id: "car-auction-1", 
        make: "BMW",
        model: "3 Series",
        year: 2016,
        price: 1800000,
        mileage: 55000,
        fuelType: "petrol",
        location: "Mumbai",
        condition: "Good",
        image: "https://images.unsplash.com/photo-1555215695-3004980ad54e?w=400&h=300&fit=crop&crop=center",
        isAuction: true,
        currentBid: 1650000,
        auctionEndTime: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
        description: "Luxury sedan with premium features"
      },
      {
        id: "car-auction-2",
        make: "Ford",
        model: "EcoSport", 
        year: 2019,
        price: 750000,
        mileage: 35000,
        fuelType: "petrol",
        location: "Delhi",
        condition: "Excellent",
        image: "https://images.unsplash.com/photo-1503376821350-e25f4b67162f?w=400&h=300&fit=crop&crop=center",
        isAuction: true,
        currentBid: 720000,
        auctionEndTime: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000),
        description: "Compact SUV perfect for city driving"
      },
      {
        id: "car-auction-3",
        make: "Toyota",
        model: "Innova",
        year: 2020,
        price: 1650000,
        mileage: 30000,
        fuelType: "diesel",
        location: "Bangalore",
        condition: "Excellent",
        image: "https://images.unsplash.com/photo-1593941707882-a5bac6861d75?w=400&h=300&fit=crop&crop=center",
        isAuction: true,
        currentBid: 1580000,
        auctionEndTime: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
        description: "Reliable MPV with excellent build quality"
      }
    ]).onConflictDoNothing();

    console.log('Database seeding completed successfully!');
  } catch (error) {
    console.error('Error seeding database:', error);
  } finally {
    await pool.end();
  }
}

seedDatabase();