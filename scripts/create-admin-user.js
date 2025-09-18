import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

async function createAdminUser() {
  try {
    console.log('Creating admin user...');
    
    // Make the test user an admin
    const result = await sql`
      UPDATE users 
      SET role = 'admin' 
      WHERE email = 'test@example.com'
      RETURNING id, email, name, role
    `;
    
    if (result.length > 0) {
      console.log('✅ Successfully promoted user to admin:', result[0]);
    } else {
      console.log('❌ User with email test@example.com not found');
      
      // Create a new admin user
      const newAdmin = await sql`
        INSERT INTO users (email, name, password, provider, role, "emailVerified")
        VALUES ('admin@example.com', 'Admin User', '$2b$12$LQv3c1yqBCFcXz7d.sIXj.1EUy7P.Yj9r8k2j0ZJ9q1G3Hd8F6k4G', 'email', 'admin', true)
        RETURNING id, email, name, role
      `;
      
      console.log('✅ Created new admin user:', newAdmin[0]);
    }
    
    console.log('\nAdmin credentials:');
    console.log('Email: admin@example.com');
    console.log('Password: adminpassword123');
    console.log('\nOr use the promoted test user:');
    console.log('Email: test@example.com');
    console.log('Password: testpassword123');
    
  } catch (error) {
    console.error('Error creating admin user:', error);
  }
}

createAdminUser().then(() => {
  console.log('Admin user setup completed.');
}).catch(console.error);