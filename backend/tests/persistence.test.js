import test from 'node:test';
import assert from 'node:assert/strict';
import { saveSql, changedRows, removedRows } from '../models/persistence.js';

function driver(fail = false) {
  const statements = [], transactions = [];
  class Transaction {
    async begin() { transactions.push('begin'); }
    async commit() { transactions.push('commit'); }
    async rollback() { transactions.push('rollback'); }
  }
  class Request {
    constructor() { this.parameters = {}; }
    input(name, type, value) { this.parameters[name] = value; return this; }
    async query(query) { statements.push({ query, parameters: this.parameters }); if (fail) throw new Error('disk failure'); }
  }
  return { sql: { Transaction, Request, NVarChar: () => 'string', MAX: -1, Int: 'int', DateTime: 'date', Bit: 'bit', Decimal: () => 'decimal' }, statements, transactions };
}

test('SQL updates only changed records and preserves timestamps, Sage and system number', async () => {
  const mock = driver();
  const row = { Id: 'one', NoBonCommande: 'BC', DateEmission: '2026-01-01T00:00:00.000Z', DateModification: '2026-02-01T00:00:00.000Z', Quantite: 1, ReferenceSage: 'SAGE', NumeroSysteme: '12ABC' };
  const old = { commandes: [row, { ...row, Id: 'two' }] };
  await saveSql(mock.sql, {}, old, { commandes: [{ ...row, Designation: 'Changed' }, old.commandes[1]] });
  assert.deepEqual(mock.transactions, ['begin','commit']);
  assert.equal(mock.statements.length, 1);
  assert.match(mock.statements[0].query, /ReferenceSage/);
  assert.ok(Object.values(mock.statements[0].parameters).includes('SAGE'));
  assert.ok(Object.values(mock.statements[0].parameters).includes('12ABC'));
  assert.doesNotMatch(mock.statements[0].query, /GETDATE|NOT IN/);
});

test('SQL errors roll back the transaction and propagate to the caller', async () => {
  const mock = driver(true);
  await assert.rejects(saveSql(mock.sql, {}, {}, { commandes: [{ Id: 'one', Quantite: 1 }] }), /disk failure/);
  assert.deepEqual(mock.transactions, ['begin','rollback']);
});

test('SQL inserts the required creator column for new orders', async () => {
  for (const creator of [{ CreePar: 'creator', DemandePar: 'other' }, { DemandePar: 'legacy' }]) {
    const mock = driver();
    await saveSql(mock.sql, {}, {}, { commandes: [{ Id: 'new-order', ...creator }] });
    const { query, parameters } = mock.statements[0];
    const columns = query.match(/ELSE INSERT INTO dbo\.\[Commandes\] \(([^)]+)\)/)[1].split(',');
    const creatorIndex = columns.indexOf('[CreePar]');
    assert.ok(creatorIndex >= 0);
    assert.equal(parameters[`p${creatorIndex}`], creator.CreePar || creator.DemandePar);
  }
});

test('SQL deletions target explicit removed IDs without deleting unrelated rows', async () => {
  const mock = driver();
  await saveSql(mock.sql, {}, { commandes: [{ Id: 'one' }, { Id: 'two' }] }, { commandes: [{ Id: 'two' }] });
  assert.equal(mock.statements.length, 1);
  assert.equal(mock.statements[0].parameters.id, 'one');
  assert.match(mock.statements[0].query, /WHERE Id = @id/);
});

test('SQL stores prestations and their history in separate tables', async () => {
  const mock = driver();
  await saveSql(mock.sql, {}, {}, { prestations: [{ Id: 'p1', NoBonCommande: 'BP1', NoDS: 'DS1', Designation: 'Entretien', Agence: 'IT', Statut: 'Effectué', FournisseurType: 'Secretariat DG', Fournisseur: 'Secretariat DG' }], historiquePrestations: [{ Id: 'hp1', PrestationId: 'p1', NouveauStatut: 'Effectué' }] });
  assert.match(mock.statements[0].query, /dbo\.\[Prestations\]/);
  assert.match(mock.statements[1].query, /dbo\.\[HistoriquePrestations\]/);
  assert.ok(Object.values(mock.statements[0].parameters).includes('Secretariat DG'));
  assert.deepEqual(mock.transactions, ['begin', 'commit']);
});
