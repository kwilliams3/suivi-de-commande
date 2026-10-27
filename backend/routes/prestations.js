import express from 'express';
import { randomUUID } from 'node:crypto';
import { readDb, writeDb, logAction } from '../models/db.js';
import { authenticator } from './auth.js';
import { canReadOrder, ownsOrder } from '../models/access.js';

const router = express.Router();
const statuses = ['Effectué', 'Non effectué', 'Terminé'];
const supplierTypes = ['Achat Local', 'Achat Import', 'Agence', 'Secretariat DG'];
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const editable = (order, user) => user.role === 'Administrateur' || (ownsOrder(order, user) && !order.EstArchive && order.Statut !== 'Terminé');

function saveItem(db, user, data, id, allowExisting = false) {
  const previous = id ? db.prestations.find(order => order.Id === id) : null;
  if (id && !previous) fail('Prestation introuvable', 404);
  if (previous && !editable(previous, user)) fail('Modification refusée', 403);
  const item = { ...previous, ...data };
  for (const key of ['NoBonCommande', 'Designation', 'Agence', 'Statut', 'FournisseurType']) if (typeof item[key] !== 'string' || !item[key].trim()) fail(`Champ obligatoire : ${key}`);
  for (const key of ['NoDS', 'Motif', 'FournisseurAgence']) if (item[key] !== undefined && typeof item[key] !== 'string') fail(`Champ invalide : ${key}`);
  for (const key of ['NoBonCommande', 'NoDS', 'Agence', 'FournisseurAgence']) if ((item[key] || '').length > 100) fail(`Champ trop long : ${key}`);
  if (!statuses.includes(item.Statut) || !supplierTypes.includes(item.FournisseurType)) fail('Statut ou fournisseur invalide');
  if (!db.services.includes(item.Agence)) fail('Service inconnu');
  if (user.role !== 'Administrateur' && item.Agence !== user.service) fail('Service non autorisé', 403);
  if (item.Statut === 'Terminé' && user.role !== 'Administrateur') fail('Droits administrateur requis pour terminer', 403);
  if (item.Statut === 'Terminé' && !item.Motif?.trim()) fail('Motif obligatoire pour terminer');
  if (item.FournisseurType === 'Agence' && !db.agences.includes(item.FournisseurAgence)) fail('Agence fournisseur requise');
  const number = item.NoBonCommande.trim();
  if (!previous && !allowExisting && db.prestations.some(order => order.NoBonCommande === number)) fail('Ce bon existe déjà', 409);
  if (previous && number !== previous.NoBonCommande) fail('Le numéro du bon ne peut pas être modifié');
  const now = new Date().toISOString();
  const order = {
    Id: previous?.Id || 'p-' + randomUUID(), NoBonCommande: number, NoDS: (item.NoDS || '').trim(),
    Designation: item.Designation.trim(), Agence: item.Agence, Statut: item.Statut, Motif: (item.Motif || '').trim(),
    FournisseurType: item.FournisseurType, FournisseurAgence: item.FournisseurType === 'Agence' ? item.FournisseurAgence : '',
    Fournisseur: item.FournisseurType === 'Agence' ? 'Agence - ' + item.FournisseurAgence : item.FournisseurType,
    CreeParId: previous?.CreeParId || user.userId, CreePar: previous?.CreePar || user.username,
    ServiceDemande: previous?.ServiceDemande || user.service || item.Agence,
    DateEmission: previous?.DateEmission || now, DateCreation: previous?.DateCreation || now, DateModification: now,
    ModifiePar: user.username, EstArchive: item.Statut === 'Terminé' || previous?.EstArchive || false,
    DateArchivage: item.Statut === 'Terminé' ? previous?.DateArchivage || now : previous?.DateArchivage || null,
  };
  if (previous) db.prestations[db.prestations.indexOf(previous)] = order;
  else db.prestations.push(order);
  db.historiquePrestations.push({ Id: 'hp-' + randomUUID(), PrestationId: order.Id, AncienStatut: previous?.Statut || 'Création', NouveauStatut: order.Statut, Motif: order.Motif, DateModification: now, ModifiePar: user.username });
  return order;
}

router.use(authenticator);
router.get('/', (req, res) => {
  const db = readDb();
  res.json((db.prestations || []).filter(order => order.EstArchive === (req.query.archived === 'true') && canReadOrder(order, req.user)).sort((a, b) => (Date.parse(b.DateEmission) || 0) - (Date.parse(a.DateEmission) || 0)));
});
router.get('/:id/history', (req, res) => {
  const db = readDb();
  const order = (db.prestations || []).find(order => order.Id === req.params.id);
  if (!order || !canReadOrder(order, req.user)) return res.status(404).json({ error: 'Prestation introuvable' });
  res.json({ order, history: (db.historiquePrestations || []).filter(event => event.PrestationId === order.Id).sort((a, b) => b.DateModification.localeCompare(a.DateModification)) });
});
router.post('/save', (req, res) => {
  const db = readDb(); db.prestations ||= []; db.historiquePrestations ||= [];
  const { items, removedIds = [] } = req.body;
  if (!Array.isArray(items) || !items.length || items.length > 200 || !Array.isArray(removedIds)) fail('Lot invalide');
  if (items.some(item => !item || typeof item !== 'object' || typeof item.NoBonCommande !== 'string' || !item.NoBonCommande.trim())) fail('Numéro de bon requis');
  const itemIds = items.filter(item => item.Id).map(item => item.Id);
  if (new Set(itemIds).size !== itemIds.length) fail('Prestation présente plusieurs fois');
  if (new Set(items.map(item => item?.NoBonCommande?.trim())).size !== 1) fail('Un seul bon par lot');
  const allExisting = db.prestations.filter(order => order.NoBonCommande === items[0].NoBonCommande.trim());
  const existing = allExisting.filter(order => !order.EstArchive);
  const editing = items.some(item => item.Id);
  if ((allExisting.length && !editing) || existing.some(order => !editable(order, req.user))) fail('Ce bon existe déjà ou ne peut pas être modifié', 409);
  if (editing && existing.some(order => !items.some(item => item.Id === order.Id) && !removedIds.includes(order.Id))) fail('Le formulaire ne contient pas tous les articles du bon');
  if (removedIds.length && req.user.role !== 'Administrateur') fail('Droits administrateur requis pour supprimer', 403);
  if (removedIds.some(id => !existing.some(order => order.Id === id))) fail('Suppression hors du bon interdite');
  db.prestations = db.prestations.filter(order => !removedIds.includes(order.Id));
  db.historiquePrestations = db.historiquePrestations.filter(event => !removedIds.includes(event.PrestationId));
  const results = items.map(item => saveItem(db, req.user, item, item.Id, editing || !existing.length));
  writeDb(db); logAction(req.user.username, 'Commande Prestation', `Enregistrement du bon ${items[0].NoBonCommande}`);
  res.status(editing ? 200 : 201).json(results);
});
router.post('/action', (req, res) => {
  if (req.user.role !== 'Administrateur') fail('Droits administrateur requis', 403);
  const { ids, action } = req.body;
  if (!Array.isArray(ids) || !ids.length || ids.length > 200 || !['archive', 'restore', 'delete'].includes(action)) fail('Action invalide');
  const db = readDb(); db.prestations ||= []; db.historiquePrestations ||= [];
  const orders = ids.map(id => db.prestations.find(order => order.Id === id));
  if (orders.some(order => !order)) fail('Prestation introuvable', 404);
  for (const order of orders) {
    if (action === 'delete') {
      db.prestations = db.prestations.filter(item => item.Id !== order.Id);
      db.historiquePrestations = db.historiquePrestations.filter(event => event.PrestationId !== order.Id);
    } else {
      const previous = order.Statut;
      order.EstArchive = action === 'archive'; order.DateArchivage = order.EstArchive ? new Date().toISOString() : null;
      if (action === 'restore' && order.Statut === 'Terminé') order.Statut = 'Non effectué';
      order.DateModification = new Date().toISOString(); order.ModifiePar = req.user.username;
      db.historiquePrestations.push({ Id: 'hp-' + randomUUID(), PrestationId: order.Id, AncienStatut: previous, NouveauStatut: order.Statut + (order.EstArchive ? ' (Archivée)' : ' (Restaurée)'), Motif: order.Motif, DateModification: order.DateModification, ModifiePar: req.user.username });
    }
  }
  writeDb(db); logAction(req.user.username, 'Commande Prestation', `${action} : ${ids.length} article(s)`);
  res.json({ success: true });
});
export default router;
