import test from 'node:test';
import assert from 'node:assert/strict';

process.env.DB_MSSQL_SERVER = 'sql.example';

const { writeDb, readDb } = await import('../models/db.js');

test('writeDb refuses to persist before SQL cache is initialized', () => {
  assert.throws(() => writeDb({
    utilisateurs: [],
    commandes: [],
    fournisseurs: [],
    historiqueStatuts: [],
    logs: [],
    archiveConfig: { autoArchiveDays: 30, enableAutoArchive: true },
    services: [],
    agences: []
  }), /hors transaction/);
  assert.throws(() => readDb(), /indisponible/);
});
