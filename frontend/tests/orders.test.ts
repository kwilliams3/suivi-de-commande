import test from 'node:test';
import assert from 'node:assert/strict';
import { totalPrice, filterOrders, csvCell } from '../src/utils/orderCalculations.ts';
import { uniqueOrders, countOrdersBy, getRecentOrders } from '../src/utils/dashboard.ts';
import type { Order } from '../src/types.ts';

const rows = [
  { Id: '1', NoBonCommande: 'BC1', Designation: 'Clavier', Quantite: 5, Prix: 1000, CreePar: 'alice', DateEmission: '2026-10-01', Statut: 'En cours' },
  { Id: '2', NoBonCommande: 'BC1', Designation: 'Écran', Quantite: 2, Prix: 10000, CreePar: 'alice', DateEmission: '2026-10-01', Statut: 'En cours' },
  { Id: '3', NoBonCommande: 'BC2', Designation: 'Papier', Quantite: 1, Prix: 200, CreePar: 'bob', DateEmission: '2026-09-01', Statut: 'Livré' },
] as Order[];

test('totals multiply quantities by unit prices', () => assert.equal(totalPrice(rows), 25200));
test('archive search, creator and date filters combine before pagination', () => {
  assert.deepEqual(filterOrders(rows, 'clavier', 'alice', '2026-10-01', '2026-10-07').map(row => row.Id), ['1']);
  assert.equal(filterOrders(rows, '', 'bob', '2026-10-01', '').length, 0);
});
test('recent purchase orders preserve the first, most recent representative', () => {
  assert.deepEqual(uniqueOrders(rows).map(row => row.Id), ['1','3']);
  assert.deepEqual(countOrdersBy(rows, row => row.Statut), { 'En cours': 1, 'Livré': 1 });
});
test('recent orders retain archived purchases and sort by creation rather than modification', () => {
  const archived = { ...rows[2], Id: 'archived', DateEmission: '2026-10-09', EstArchive: true };
  const modifiedOld = { ...rows[0], DateModification: '2026-10-10' };
  const input = [modifiedOld, rows[1], archived];
  assert.deepEqual(getRecentOrders(input).map(row => row.Id), ['archived', '1']);
  assert.equal(getRecentOrders(input, 1)[0].EstArchive, true);
  assert.deepEqual(input.map(row => row.Id), ['1', '2', 'archived']);
});
test('CSV preserves separators, newlines and quotes while neutralizing formulas', () => {
  assert.equal(csvCell('DS;123\n"réf"'), '"DS;123\n""réf"""');
  assert.equal(csvCell('=1+2'), '"\'=1+2"');
  assert.equal(csvCell('"déjà ""échappé"""'), '"déjà ""échappé"""');
});
