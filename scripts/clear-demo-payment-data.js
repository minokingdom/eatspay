const { createPool } = require('../db/pool');

async function main() {
  const pool = createPool();
  try {
    await pool.query('BEGIN');
    const latest = await pool.query(
      "SELECT transaction_id FROM transactions WHERE status = 'SUCCESS' ORDER BY created_at DESC LIMIT 1"
    );
    const keepTransactionId = latest.rows[0]?.transaction_id || null;
    const transactions = keepTransactionId
      ? await pool.query(
        'DELETE FROM transactions WHERE transaction_id <> $1 RETURNING transaction_id',
        [keepTransactionId]
      )
      : await pool.query('DELETE FROM transactions RETURNING transaction_id');
    const settlements = await pool.query('DELETE FROM pg_settlements RETURNING id');
    await pool.query('COMMIT');
    console.log(JSON.stringify({
      keptTransactionId: keepTransactionId,
      deletedTransactions: transactions.rowCount,
      deletedPgSettlements: settlements.rowCount
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
