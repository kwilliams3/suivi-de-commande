import { getMssqlPool } from './backend/models/db.js';

try {
  const pool = await getMssqlPool();
  if (!pool) throw new Error('Configurez DB_MSSQL_SERVER pour migrer SQL');
  console.log('Migrations non destructives appliquées.');
  await pool.close();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
