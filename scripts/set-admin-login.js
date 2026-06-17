const crypto = require('crypto');

const { createPool } = require('../db/pool');

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME || 'Eats Pay Admin';

  if (!email || !password) {
    throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD are required.');
  }
  if (process.env.NODE_ENV === 'production' && password.length < 12) {
    throw new Error('Weak admin passwords are blocked in production.');
  }

  const pool = createPool();
  const passwordHash = await hashPassword(password);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query('ALTER TABLE users ALTER COLUMN franchise_id DROP NOT NULL');

    const existingAdmin = await client.query(
      "SELECT id FROM users WHERE role = 'ADMIN' ORDER BY id LIMIT 1"
    );

    let user;
    if (existingAdmin.rows[0]) {
      const adminId = existingAdmin.rows[0].id;
      await client.query('DELETE FROM users WHERE email = $1 AND id <> $2', [email, adminId]);

      const updated = await client.query(
        `UPDATE users
            SET email = $1,
                password_hash = $2,
                name = $3,
                role = 'ADMIN',
                franchise_name = $3,
                franchise_id = id,
                phone = NULL,
                address = NULL,
                tel = NULL,
                business_number = NULL,
                customer_id = NULL,
                agency_id = NULL,
                biz_doc_file_key = NULL,
                updated_at = now()
          WHERE id = $4
          RETURNING id, email, role, franchise_id`,
        [email, passwordHash, name, adminId]
      );
      user = updated.rows[0];
    } else {
      const inserted = await client.query(
        `INSERT INTO users (
           email, password_hash, name, role, balance,
           franchise_name, phone, address, tel, business_number,
           customer_id, agency_id, biz_doc_file_key
         )
         VALUES ($1, $2, $3, 'ADMIN', 0, $3, NULL, NULL, NULL, NULL, NULL, NULL, NULL)
         RETURNING id, email, role, franchise_id`,
        [email, passwordHash, name]
      );
      const updated = await client.query(
        'UPDATE users SET franchise_id = id, updated_at = now() WHERE id = $1 RETURNING id, email, role, franchise_id',
        [inserted.rows[0].id]
      );
      user = updated.rows[0];
    }

    await client.query('COMMIT');
    console.log(`Admin login is ready: ${user.email}`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = await new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey.toString('hex'));
    });
  });
  return `scrypt$${salt}$${hash}`;
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
