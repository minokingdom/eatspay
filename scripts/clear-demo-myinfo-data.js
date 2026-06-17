const { createPool } = require('../db/pool');

async function main() {
  const pool = createPool();
  try {
    await pool.query('BEGIN');

    const demoUsers = await pool.query(`
      SELECT id, franchise_id
      FROM users
      WHERE franchise_name ILIKE 'E2E%'
         OR franchise_name IN ('수수불곱창', '지코바 합안점', '칠암상회')
         OR franchise_id IN (1001, 1002, 1003)
    `);
    const userIds = demoUsers.rows.map(row => row.id);
    const franchiseIds = demoUsers.rows.map(row => row.franchise_id).filter(Boolean);

    const deletedCards = userIds.length
      ? await pool.query('DELETE FROM cards WHERE user_id = ANY($1::bigint[]) RETURNING id', [userIds])
      : { rowCount: 0 };

    const deletedRequests = franchiseIds.length
      ? await pool.query(
        `DELETE FROM account_requests
         WHERE franchise_id = ANY($1::bigint[])
            OR franchise_name ILIKE 'E2E%'
            OR franchise_name IN ('수수불곱창', '지코바 합안점', '칠암상회')
         RETURNING request_id`,
        [franchiseIds]
      )
      : await pool.query(
        `DELETE FROM account_requests
         WHERE franchise_name ILIKE 'E2E%'
            OR franchise_name IN ('수수불곱창', '지코바 합안점', '칠암상회')
         RETURNING request_id`
      );

    const deletedDeliveryAccounts = franchiseIds.length
      ? await pool.query('DELETE FROM delivery_accounts WHERE franchise_id = ANY($1::bigint[]) RETURNING id', [franchiseIds])
      : { rowCount: 0 };

    const deletedTransactions = franchiseIds.length
      ? await pool.query('DELETE FROM transactions WHERE franchise_id = ANY($1::bigint[]) RETURNING transaction_id', [franchiseIds])
      : { rowCount: 0 };

    const deletedUsers = userIds.length
      ? await pool.query('DELETE FROM users WHERE id = ANY($1::bigint[]) RETURNING id', [userIds])
      : { rowCount: 0 };

    await pool.query('COMMIT');
    console.log(JSON.stringify({
      demoUsers: demoUsers.rowCount,
      deletedCards: deletedCards.rowCount,
      deletedAccountRequests: deletedRequests.rowCount,
      deletedDeliveryAccounts: deletedDeliveryAccounts.rowCount,
      deletedTransactions: deletedTransactions.rowCount,
      deletedUsers: deletedUsers.rowCount
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
