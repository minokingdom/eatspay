const crypto = require('crypto');

const { createPool } = require('../db/pool');
const { createRepository } = require('../db/repository');

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME || 'Eats Pay Admin';

  if (!email || !password) {
    throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD are required.');
  }
  if (password.length < 12) {
    throw new Error('ADMIN_PASSWORD must be at least 12 characters.');
  }

  const pool = createPool();
  const repo = createRepository(pool);
  try {
    const user = await repo.upsertAdminUser({
      email,
      passwordHash: await hashPassword(password),
      name
    });
    console.log(`Admin account is ready: ${user.email}`);
  } finally {
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
