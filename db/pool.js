const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

loadEnv();

function getDatabaseUrl() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is required for PostgreSQL persistence.');
  }
  return url;
}

function createPool() {
  return new Pool({
    connectionString: getDatabaseUrl(),
    ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : undefined
  });
}

module.exports = {
  createPool,
  getDatabaseUrl
};

function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split(/\r?\n/).forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const parts = trimmed.split('=');
    if (parts.length < 2) return;
    const key = parts[0].trim();
    if (process.env[key]) return;
    const value = parts.slice(1).join('=').trim().replace(/(^['"]|['"]$)/g, '');
    process.env[key] = value;
  });
}
