const { createPool } = require('../db/pool');

async function main() {
  const pool = createPool();
  try {
    await pool.query('BEGIN');
    const accountRequests = await pool.query(
      "DELETE FROM account_requests WHERE status = 'PENDING' RETURNING request_id"
    );
    const deliveryAccounts = await pool.query(
      "DELETE FROM delivery_accounts WHERE account_status = 'PENDING' RETURNING id"
    );
    await pool.query('COMMIT');
    console.log(JSON.stringify({
      deletedPendingAccountRequests: accountRequests.rowCount,
      deletedPendingDeliveryAccounts: deliveryAccounts.rowCount
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
