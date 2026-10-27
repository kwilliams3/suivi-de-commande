import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { transactionalMiddleware } from '../models/unit-of-work.js';
import { readDb } from '../models/db.js';
import orders from '../routes/orders.js';
import stats from '../routes/stats.js';
import notifications from '../routes/notifications.js';
import users from '../routes/users.js';
import prestations from '../routes/prestations.js';
import { JWT_SECRET, authenticator } from '../routes/auth.js';

const accounts = [
  { Id: 'a', NomUtilisateur: 'alice', Prenom: 'Alice', Nom: 'Test', Role: 'Utilisateur', Statut: 'Actif', Service: 'IT' },
  { Id: 'b', NomUtilisateur: 'bob', Prenom: 'Bob', Nom: 'Test', Role: 'Utilisateur', Statut: 'Actif', Service: 'RH' },
  { Id: 'admin', NomUtilisateur: 'admin', Prenom: 'Admin', Nom: 'Test', Role: 'Administrateur', Statut: 'Actif' },
];
const order = (id, creator, service) => ({ Id: id, NoBonCommande: 'BC-' + id, CreeParId: creator, CreePar: creator === 'a' ? 'alice' : 'bob', Agence: service, ServiceDemande: service, Statut: 'En cours', EstArchive: false, DateEmission: new Date().toISOString(), DateLivraison: '2027-01-01', Designation: 'Article', Quantite: 2, Prix: 10 });

async function fixture(work, failCommit = false) {
  let db = { utilisateurs: structuredClone(accounts), commandes: [order('1','a','IT'),order('2','b','RH')], historiqueStatuts: [], notifications: [], logs: [], fournisseurs: [], commandeFournisseurs: [], services: ['IT','RH'], agences: [], archiveConfig: { autoArchiveDays: 30, enableAutoArchive: true } };
  const app = express();
  app.use(express.json());
  const api = express.Router();
  api.use(transactionalMiddleware(() => db, async data => { if (failCommit) throw new Error('SQL failed'); db = structuredClone(data); }));
  api.use('/orders', orders); api.use('/stats', stats); api.use('/notifications', notifications);
  api.use('/users', users);
  api.use('/prestations', prestations);
  api.get('/me', authenticator, (req, res) => res.json(req.user));
  app.use('/api/appro', api); app.use('/api', api);
  app.use('/api', (req, res) => res.status(404).json({ error: 'Route inconnue' }));
  app.use((error, req, res, next) => res.status(error.status || 500).json({ error: error.message }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/appro`;
  const request = async (path, method = 'GET', body, user = 'a') => {
    const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(user ? { Authorization: 'Bearer ' + jwt.sign({ userId: user, sessionVersion: 0 }, JWT_SECRET, { expiresIn: '1h' }) } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  };
  try { await work(request, () => db); }
  finally { await new Promise(resolve => server.close(resolve)); }
}

test('orders sort by emission date even after restoring an older purchase', () => fixture(async (request, db) => {
  db().commandes[0].DateEmission = '2026-09-03T12:00:00Z';
  db().commandes[0].DateModification = '2026-10-10T12:00:00Z';
  db().commandes[1].DateEmission = '2026-10-09T12:00:00Z';
  assert.deepEqual((await request('/orders', 'GET', undefined, 'admin')).body.map(row => row.Id), ['2', '1']);
  db().commandes.forEach(row => { row.EstArchive = true; });
  assert.deepEqual((await request('/orders?archived=true', 'GET', undefined, 'admin')).body.map(row => row.Id), ['2', '1']);
}));

test('service boundaries protect list, history, update and status', () => fixture(async request => {
  assert.equal((await request('/orders')).body.length, 1);
  assert.equal((await request('/orders/2/history')).status, 403);
  assert.equal((await request('/orders/2', 'PUT', { Designation: 'Changed' })).status, 403);
  assert.equal((await request('/orders/2/status', 'PATCH', { Statut: 'Non livré' })).status, 403);
}));

test('unknown routes through API aliases return 404 without blocking later requests', () => fixture(async request => {
  assert.equal((await request('/unknown')).status, 404);
  assert.equal((await request('/orders')).status, 200);
}));

test('batch update rolls back all articles when one operation fails', () => fixture(async (request, db) => {
  db().commandes[1].NoBonCommande = 'BC-1';
  const response = await request('/orders/batch', 'POST', { operations: [{ action: 'update', id: '1', data: { Designation: 'Changed' } }, { action: 'update', id: '2', data: { Designation: 'Changed' } }] });
  assert.equal(response.status, 403);
  assert.equal(db().commandes[0].Designation, 'Article');
  assert.equal(db().notifications.length, 0);
}));

test('renaming all articles in a purchase order succeeds atomically', () => fixture(async (request, db) => {
  db().commandes[1] = { ...db().commandes[0], Id: 'another' };
  assert.equal((await request('/orders/batch', 'POST', { operations: [{ action: 'update', id: '1', data: { NoBonCommande: 'BC-renamed' } }, { action: 'update', id: 'another', data: { NoBonCommande: 'BC-renamed' } }] })).status, 200);
  assert.deepEqual(db().commandes.map(order => order.NoBonCommande), ['BC-renamed','BC-renamed']);
}));

test('SQL failure returns an error and leaves committed data unchanged', () => fixture(async (request, db) => {
  const response = await request('/orders/1', 'PUT', { Designation: 'Changed' });
  assert.equal(response.status, 503);
  assert.equal(db().commandes[0].Designation, 'Article');
}, true));

test('bulk creation preserves DS and does not archive deliveries', () => fixture(async (request, db) => {
  const response = await request('/orders', 'POST', { items: [{ NoBonCommande: 'BC-new', NoDS: 'DS-123', Designation: 'New', Quantite: 3, Prix: 12, Statut: 'Livré', ReferenceSage: 'SAGE-1', Agence: 'IT', Fournisseur: 'Achat Local', DateLivraison: '2027-01-01' }] });
  assert.equal(response.status, 201);
  const created = db().commandes.at(-1);
  assert.equal(created.NoDS, 'DS-123'); assert.equal(created.ReferenceSage, 'SAGE-1');
  assert.equal(created.Statut, 'Livré'); assert.equal(created.EstArchive, false); assert.equal(created.CreeParId, 'a');
}));

test('invalid second article never creates the first article', () => fixture(async (request, db) => {
  const item = { NoBonCommande: 'BC-new', Designation: 'New', Quantite: 3, Statut: 'En cours', Agence: 'IT', Fournisseur: 'Achat Local', DateLivraison: '2027-01-01' };
  assert.equal((await request('/orders', 'POST', { items: [item, { ...item, Quantite: -1 }] })).status, 400);
  assert.equal(db().commandes.length, 2);
}));

test('disabled accounts and revoked sessions cannot use the API', () => fixture(async (request, db) => {
  db().utilisateurs[0].Statut = 'Desactive'; assert.equal((await request('/me')).status, 401);
  db().utilisateurs[0].Statut = 'Actif'; db().utilisateurs[0].SessionVersion = 1;
  assert.equal((await request('/me')).status, 401);
}));

test('notifications require authentication and read status is per user', () => fixture(async (request, db) => {
  assert.equal((await request('/notifications/stream', 'GET', undefined, null)).status, 401);
  db().notifications = [{ Id: 'n', CommandeId: '1', LuePar: [] }];
  assert.equal((await request('/notifications', 'GET', undefined, 'b')).body.length, 0);
  await request('/notifications/n/read', 'PATCH', {});
  assert.equal((await request('/notifications')).body[0].Lue, true);
  assert.equal((await request('/notifications', 'GET', undefined, 'admin')).body[0].Lue, false);
}));

test('restoring a closed order returns it to an active status', () => fixture(async (request, db) => {
  db().commandes[0].Statut = 'Terminé'; db().commandes[0].EstArchive = true;
  assert.equal((await request('/orders/1/restore', 'POST', {}, 'admin')).status, 200);
  assert.equal(db().commandes[0].Statut, 'En cours');
  assert.equal(db().historiqueStatuts.at(-1).AncienStatut, 'Terminé (Archivée)');
  assert.equal(db().notifications[0].AncienStatut, 'Terminé (Archivée)');
  assert.equal((await request('/stats')).body.enCours, 1);
}));

test('password changes revoke previously issued tokens', () => fixture(async (request, db) => {
  db().utilisateurs[0].MotDePasse = bcrypt.hashSync('previous-password', 4);
  assert.equal((await request('/users/change-password', 'POST', { oldPassword: 'previous-password', newPassword: 'updated-password' })).status, 200);
  assert.equal((await request('/me')).status, 401);
}));

test('clearing notifications affects only the current account', () => fixture(async (request, db) => {
  db().notifications = [{ Id: 'n', CommandeId: '1', LuePar: [] }];
  await request('/notifications/clear', 'POST', {});
  assert.equal((await request('/notifications')).body.length, 0);
  assert.equal((await request('/notifications', 'GET', undefined, 'admin')).body.length, 1);
}));

test('existing purchase order numbers cannot silently merge new orders', () => fixture(async (request, db) => {
  const body = { NoBonCommande: 'BC-1', NoDS: 'DS', Designation: 'New', Quantite: 1, Statut: 'En cours', Agence: 'IT', Fournisseur: 'Achat Local', DateLivraison: '2027-01-01' };
  assert.equal((await request('/orders', 'POST', { items: [body] })).status, 409);
  assert.equal((await request('/orders/batch', 'POST', { operations: [{ action: 'create', id: '', data: body }] })).status, 200);
  assert.equal(db().commandes.length, 3);
}));

const prestation = { NoBonCommande: 'BP-1', NoDS: 'DS-45', Designation: 'Entretien des locaux', Agence: 'IT', Statut: 'Effectué', Motif: '', FournisseurType: 'Secretariat DG' };

test('prestation module preserves DS and Secretariat DG without mixing goods orders', () => fixture(async (request, db) => {
  const response = await request('/prestations/save', 'POST', { items: [prestation, { ...prestation, Designation: 'Maintenance' }] });
  assert.equal(response.status, 201);
  assert.equal(db().prestations.length, 2);
  assert.equal(db().prestations[0].NoDS, 'DS-45');
  assert.equal(db().prestations[0].Fournisseur, 'Secretariat DG');
  assert.equal(db().commandes.length, 2);
  assert.equal((await request('/prestations', 'GET', undefined, 'b')).body.length, 0);
  assert.equal((await request('/prestations/' + response.body[0].Id + '/history')).body.history.length, 1);
}));

test('prestation lot validation rolls back all changes', () => fixture(async (request, db) => {
  assert.equal((await request('/prestations/save', 'POST', { items: [prestation, { ...prestation, Statut: 'Livré' }] })).status, 400);
  assert.equal((db().prestations || []).length, 0);
}));

test('prestation closure requires admin and motive, and restoration uses Non effectué', () => fixture(async (request, db) => {
  assert.equal((await request('/prestations/save', 'POST', { items: [{ ...prestation, Statut: 'Terminé', Motif: 'Validé' }] })).status, 403);
  assert.equal((await request('/prestations/save', 'POST', { items: [{ ...prestation, Statut: 'Terminé' }] }, 'admin')).status, 400);
  const response = await request('/prestations/save', 'POST', { items: [{ ...prestation, Statut: 'Terminé', Motif: 'Validé' }] }, 'admin');
  assert.equal(response.status, 201); assert.equal(db().prestations[0].EstArchive, true);
  assert.equal((await request('/prestations?archived=true', 'GET', undefined, 'admin')).body.length, 1);
  await request('/prestations/action', 'POST', { ids: [response.body[0].Id], action: 'restore' }, 'admin');
  assert.equal(db().prestations[0].Statut, 'Non effectué'); assert.equal(db().prestations[0].EstArchive, false);
}));
