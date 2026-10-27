import express from 'express';
import { randomUUID } from 'node:crypto';
import { readDb, writeDb } from '../models/db.js';
import { authenticator } from './auth.js';
import { canReadOrder } from '../models/access.js';
import { afterCommit } from '../models/unit-of-work.js';

const router = express.Router();
const clients = new Set();
const visible = (notification, user, db) => canReadOrder(db.commandes.find(order => order.Id === notification.CommandeId) || notification, user);
const userNotifications = (db, user) => (db.notifications || []).filter(notification => !(notification.MasqueePar || []).includes(user.userId) && visible(notification, user, db)).map(notification => ({ ...notification, Lue: (notification.LuePar || []).includes(user.userId) }));

router.get('/', authenticator, (req, res) => res.json(userNotifications(readDb(), req.user)));
const markAll = (req, res) => {
  const db = readDb();
  for (const notification of db.notifications || []) if (visible(notification, req.user, db)) {
    if (req.path === '/clear') notification.MasqueePar = [...new Set([...(notification.MasqueePar || []), req.user.userId])];
    else notification.LuePar = [...new Set([...(notification.LuePar || []), req.user.userId])];
  }
  writeDb(db);
  res.json({ success: true, notifications: userNotifications(db, req.user) });
};
router.post('/clear', authenticator, markAll);
router.post('/read-all', authenticator, markAll);
router.patch('/:id/read', authenticator, (req, res) => {
  const db = readDb();
  const notification = (db.notifications || []).find(notification => notification.Id === req.params.id && visible(notification, req.user, db));
  if (!notification) return res.status(404).json({ error: 'Notification introuvable' });
  notification.LuePar = [...new Set([...(notification.LuePar || []), req.user.userId])];
  writeDb(db);
  res.json({ success: true, notifications: userNotifications(db, req.user) });
});
router.get('/stream', authenticator, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  const client = { res, userId: req.user.userId, sessionVersion: readDb().utilisateurs.find(user => user.Id === req.user.userId)?.SessionVersion || 0 };
  clients.add(client);
  res.write('data: {"type":"connected"}\n\n');
  const heartbeat = setInterval(() => {
    try {
      const user = readDb().utilisateurs.find(user => user.Id === client.userId);
      if (!user || user.Statut !== 'Actif' || (user.SessionVersion || 0) !== client.sessionVersion) return res.end();
      res.write(': keepalive\n\n');
    } catch { res.end(); }
  }, 25000);
  const expiry = setTimeout(() => res.end(), Math.max(1, Math.min(3600000, (req.user.tokenExpires * 1000) - Date.now())));
  res.on('close', () => { clearInterval(heartbeat); clearTimeout(expiry); clients.delete(client); });
});

export function createAndSendNotification({ commandeId, noBonCommande, designat, ancienStatut, nouveauStatut, modifiePar, agence }) {
  const db = readDb();
  const order = db.commandes.find(order => order.Id === commandeId);
  const notification = { Id: `notif-${randomUUID()}`, CommandeId: commandeId, NoBonCommande: noBonCommande, Designation: designat, AncienStatut: ancienStatut, NouveauStatut: nouveauStatut, ModifiePar: modifiePar, Agence: agence, ServiceDemande: order?.ServiceDemande || '', CreeParId: order?.CreeParId || '', CreePar: order?.CreePar || '', Date: new Date().toISOString(), Lue: false, LuePar: [] };
  db.notifications = [notification, ...(db.notifications || [])].slice(0, 100);
  writeDb(db);
  afterCommit(() => {
    const current = readDb();
    for (const client of clients) {
      const account = current.utilisateurs.find(user => user.Id === client.userId);
      if (!account || account.Statut !== 'Actif' || (account.SessionVersion || 0) !== client.sessionVersion) { client.res.end(); continue; }
      const user = { userId: account.Id, username: account.NomUtilisateur, role: account.Role, service: account.Service, fullName: `${account.Prenom} ${account.Nom}` };
      if (visible(notification, user, current)) client.res.write(`data: ${JSON.stringify({ type: 'notification', data: notification })}\n\n`);
    }
  });
  return notification;
}

export default router;
