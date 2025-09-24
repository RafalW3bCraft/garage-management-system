import { neon } from '@neondatabase/serverless';
import bcrypt from 'bcrypt';

const sql = neon(process.env.DATABASE_URL);

async function createAdminUser() {
  try {
    console.log('Setting up admin user...');
    
    // Get admin credentials from environment variables
    const adminEmail = process.env.ADMIN_EMAIL;
    const adminPassword = process.env.ADMIN_PASSWORD;
    const adminName = process.env.ADMIN_NAME || 'System Administrator';
    
    if (!adminEmail || !adminPassword) {
      console.error('❌ Admin setup requires ADMIN_EMAIL and ADMIN_PASSWORD environment variables');
      console.log('\nUsage:');
      console.log('ADMIN_EMAIL=admin@yourcompany.com ADMIN_PASSWORD=your_secure_password node scripts/create-admin-user.js');
      console.log('\nOptional: ADMIN_NAME="Your Admin Name"');
      return;
    }
    
    if (adminPassword.length < 8) {
      console.error('❌ Admin password must be at least 8 characters long');
      return;
    }
    
    // Hash the password securely
    const hashedPassword = await bcrypt.hash(adminPassword, 12);
    
    // Check if admin user already exists
    const existingAdmin = await sql`
      SELECT id, email, name, role FROM users WHERE email = ${adminEmail}
    `;
    
    if (existingAdmin.length > 0) {
      // Update existing user to admin role and reset password
      const updated = await sql`
        UPDATE users 
        SET role = 'admin', password = ${hashedPassword}, name = ${adminName}, email_verified = true
        WHERE email = ${adminEmail}
        RETURNING id, email, name, role
      `;
      console.log('✅ Updated existing user to admin:', { email: updated[0].email, name: updated[0].name });
    } else {
      // Create new admin user
      const newAdmin = await sql`
        INSERT INTO users (email, name, password, provider, role, email_verified)
        VALUES (${adminEmail}, ${adminName}, ${hashedPassword}, 'email', 'admin', true)
        RETURNING id, email, name, role
      `;
      console.log('✅ Created new admin user:', { email: newAdmin[0].email, name: newAdmin[0].name });
    }
    
    console.log('\n✅ Admin setup completed successfully');
    console.log('⚠️  Keep your admin credentials secure and consider changing them regularly');
    
  } catch (error) {
    console.error('Error setting up admin user:', error);
  }
}

createAdminUser().then(() => {
  console.log('Admin user setup completed.');
}).catch(console.error);