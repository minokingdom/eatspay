const fs = require('fs');
const path = require('path');

const { createPool } = require('../db/pool');

async function main() {
  const schemaPath = path.join(__dirname, '..', 'db', 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');
  const pool = createPool();

  try {
    await pool.query(schema);
    console.log('PostgreSQL schema initialized.');
  } finally {
    await pool.end();
  }
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
