const { createPool } = require('../db/pool');

async function main() {
  const pool = createPool();
  try {
    await pool.query('BEGIN');
    const delivery = await pool.query(
      'DELETE FROM delivery_accounts WHERE franchise_id = ANY($1::bigint[]) RETURNING id',
      [[1001, 1002, 1003]]
    );
    const requests = await pool.query(
      "DELETE FROM account_requests WHERE request_id LIKE 'DEMO-REQ-%' RETURNING request_id"
    );
    await pool.query('COMMIT');
    console.log(JSON.stringify({
      deletedDeliveryAccounts: delivery.rowCount,
      deletedDemoRequests: requests.rowCount
    }));
  } catch (error) {
    await pool.query('ROLLBACK');
    throw error;
  } finally {
    await pool.end();
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
