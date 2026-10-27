import test from 'node:test';
import assert from 'node:assert/strict';
import { countOrders, countOrdersBy, monthlyActivity } from '../models/dashboard.js';

test('active count matches purchase orders even with multiple articles and partial archives', () => {
  const orders = [
    { Id: '1', NoBonCommande: 'BC1', EstArchive: false },
    { Id: '2', NoBonCommande: 'BC1', EstArchive: false },
    { Id: '3', NoBonCommande: 'BC1', EstArchive: true },
    { Id: '4', NoBonCommande: 'BC2', EstArchive: false },
    { Id: '5', NoBonCommande: 'BC3', EstArchive: true },
  ];
  assert.equal(countOrders(orders.filter(order => !order.EstArchive)), 2);
  assert.equal(countOrders(orders), 3);
  assert.equal(countOrders([]), 0);
});

test('category counts deduplicate articles within each status or supplier', () => {
  const orders = [
    { Id: '1', NoBonCommande: 'BC1', Statut: 'En cours' },
    { Id: '2', NoBonCommande: 'BC1', Statut: 'En cours' },
    { Id: '3', NoBonCommande: 'BC1', Statut: 'Livré' },
    { Id: '4', NoBonCommande: 'BC2', Statut: 'Livré' },
  ];
  assert.deepEqual(countOrdersBy(orders, order => order.Statut), { 'En cours': 1, 'Livré': 2 });
});

test('orders without a purchase order number stay distinct', () => {
  assert.equal(countOrders([{ Id: '1' }, { Id: '2' }]), 2);
});

test('monthly activity uses events and their author rather than SQL synchronization dates', () => {
  const orders = [{ Id: '1', NoBonCommande: 'BC1', Statut: 'Livré', DateEmission: '2026-01-01', DateModification: '2026-10-01', CreePar: 'alice' }, { Id: '2', NoBonCommande: 'BC2', Statut: 'En cours', DateEmission: '2026-01-01', DateModification: '2026-10-01', CreePar: 'alice' }];
  const result = monthlyActivity(orders, [{ CommandeId: '1', DateModification: '2026-10-02', ModifiePar: 'bob' }], new Date('2026-10-07'));
  assert.equal(result.total, 1);
  assert.deepEqual(result.byUser, { bob: 1 });
});
