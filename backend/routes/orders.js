import express from "express";
import { randomBytes, randomUUID } from 'crypto';
import { readDb, writeDb, logAction } from "../models/db.js";
import { authenticator, adminOnly } from "./auth.js";
import { createAndSendNotification } from "./notifications.js";

import { canReadOrder, canModifyOrder } from '../models/access.js';
import { validateOrder, validateArchiveConfig } from '../models/validation.js';
const router = express.Router();

const SYSTEM_NUMBER_DIGITS = '0123456789';
const SYSTEM_NUMBER_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const SYSTEM_NUMBER_PATTERN = /^\d{2}[A-Z]{3}$/;

function createSystemNumber(usedNumbers) {
  do {
    const bytes = randomBytes(5);
    const number = [
      SYSTEM_NUMBER_DIGITS[bytes[0] % SYSTEM_NUMBER_DIGITS.length],
      SYSTEM_NUMBER_DIGITS[bytes[1] % SYSTEM_NUMBER_DIGITS.length],
      SYSTEM_NUMBER_LETTERS[bytes[2] % SYSTEM_NUMBER_LETTERS.length],
      SYSTEM_NUMBER_LETTERS[bytes[3] % SYSTEM_NUMBER_LETTERS.length],
      SYSTEM_NUMBER_LETTERS[bytes[4] % SYSTEM_NUMBER_LETTERS.length]
    ].join('');
    if (!usedNumbers.has(number)) return number;
  } while (true);
}

function ensureSystemNumbers(db) {
  const groups = new Map();
  for (const command of db.commandes) {
    const key = command.NoBonCommande || command.Id;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(command);
  }
  let changed = false;
  const usedNumbers = new Set();
  for (const commands of groups.values()) {
    const currentNumber = commands.map((command) => command.NumeroSysteme).find((number) => typeof number === 'string' && SYSTEM_NUMBER_PATTERN.test(number) && !usedNumbers.has(number));
    const systemNumber = currentNumber || createSystemNumber(usedNumbers);
    for (const command of commands) { if (command.NumeroSysteme !== systemNumber) { command.NumeroSysteme = systemNumber; changed = true; } }
    usedNumbers.add(systemNumber);
  }
  return changed;
}

function getNewSystemNumber(db) {
  const usedNumbers = new Set(db.commandes.map((command) => command.NumeroSysteme).filter((number) => typeof number === 'string' && SYSTEM_NUMBER_PATTERN.test(number)));
  return createSystemNumber(usedNumbers);
}

function resolveDeliveredStatus(statut, referenceSage) {
  return statut;
}

function isAdministrator(user) {
  return (user?.role || "").trim().toLowerCase() === "administrateur";
}

// GET /api/orders
router.get("/", authenticator, (req, res) => {
  const db = readDb();
  if (ensureSystemNumbers(db)) writeDb(db);
  const showArchived = req.query.archived === "true";

  let foundCommands = db.commandes.filter((c) => c.EstArchive === showArchived);

  foundCommands = foundCommands.filter(order => canReadOrder(order, req.user));

  const ordersHydrated = foundCommands.map((cmd) => {
    const fourName = cmd.Fournisseur || "Achat Local";
    const defaultSupplier = {
      Id: `f-temp-${cmd.Id}`,
      NomFournisseur: fourName,
      TypeFournisseur: (fourName === "Achat Import") ? "Achat Import" : "Achat Local"
    };

    return {
      ...cmd,
      Fournisseur: fourName,
      Fournisseurs: [defaultSupplier]
    };
  });

  // La restauration ou la modification ne change pas l'ordre d'émission.
  ordersHydrated.sort((a, b) => {
    const bDate = Date.parse(b.DateEmission) || 0;
    const aDate = Date.parse(a.DateEmission) || 0;
    return bDate - aDate;
  });

  res.json(ordersHydrated);
});

// GET /api/orders/:id/history
router.get("/:id/history", authenticator, (req, res) => {
  const { id } = req.params;
  const db = readDb();

  const command = db.commandes.find((c) => c.Id === id);
  if (!command) {
    return res.status(404).json({ error: "Commande non trouvée" });
  }

  if (!canReadOrder(command, req.user)) return res.status(403).json({ error: 'Accès refusé à cette commande' });
  const history = db.historiqueStatuts
    .filter((h) => h.CommandeId === id)
    .sort((a, b) => new Date(b.DateModification).getTime() - new Date(a.DateModification).getTime());

  res.json({
    order: command,
    history
  });
});

// POST /api/orders
router.post("/", authenticator, (req, res) => {
  const db = readDb();
  const items = req.body.items ?? [req.body];
  if (!Array.isArray(items) || items.length < 1 || items.length > 200) return res.status(400).json({ error: 'Lot invalide (1 à 200 articles)' });
  for (const item of items) {
    validateOrder(item);
    if (!(db.services || []).includes(item.Agence)) return res.status(400).json({ error: 'Service inconnu' });
    if (req.user.role !== 'Administrateur' && item.Agence !== req.user.service) return res.status(403).json({ error: 'Création limitée à votre service' });
    const existing = db.commandes.filter(order => order.NoBonCommande === item.NoBonCommande.trim());
    if (existing.length && (!req.batchOperation || existing.some(order => !canModifyOrder(order, req.user)))) return res.status(409).json({ error: 'Ce numéro de bon existe déjà. Utilisez la modification du bon.' });
  }
  if (new Set(items.map(item => item.NoBonCommande.trim())).size !== 1) return res.status(400).json({ error: 'Les articles du lot doivent appartenir au même bon' });
  if (req.body.items && Array.isArray(req.body.items)) {
    const createdOrders = [];
    const baseTime = Date.now();
    const systemNumber = db.commandes.find(order => order.NoBonCommande === items[0].NoBonCommande.trim())?.NumeroSysteme || getNewSystemNumber(db);

    for (let i = 0; i < req.body.items.length; i++) {
      const item = req.body.items[i];
      const { NoBonCommande, NoDS, Designation, Quantite, Prix, ReferenceSage, DateLivraison, Statut, Agence, Fournisseur, Observation } = item;

      if (Statut === "Livré" && (!ReferenceSage || !ReferenceSage.trim())) {
        return res.status(400).json({ error: "Le N° Réception Sage X3 est obligatoire pour valider une livraison." });
      }

      if (Statut === "Terminé" && !isAdministrator(req.user)) {
        return res.status(403).json({ error: "Seuls les administrateurs peuvent utiliser le statut 'Terminé'." });
      }

      const finalStatus = resolveDeliveredStatus(Statut, ReferenceSage);
      const salt = Math.random().toString(36).substring(2, 6);
      const orderId = 'c-' + baseTime + '-' + i + '-' + salt;
      const newOrder = {
        Id: orderId,
        NumeroSysteme: systemNumber,
        NoBonCommande: NoBonCommande.trim(),
        NoDS: NoDS ? NoDS.trim() : "",
        CreeParId: req.user.userId,
        DateCreation: new Date().toISOString(),
        DateEmission: new Date().toISOString(),
        Designation: Designation.trim(),
        Quantite: Number(Quantite),
        Prix: Prix ? Number(Prix) : undefined,
        ReferenceSage: ReferenceSage ? ReferenceSage.trim() : undefined,
        DateLivraison: DateLivraison,
        Statut: finalStatus,
        CreePar: req.user.username,
        DemandePar: req.user.username,
        ServiceDemande: req.user.service || "",
        Agence: Agence,
        EstArchive: finalStatus === "Terminé",
        DateArchivage: finalStatus === "Terminé" ? new Date().toISOString() : undefined,
        Observation: Observation && Observation.trim() ? Observation.trim() : undefined,
        Fournisseur: Fournisseur.trim()
      };

      // Debug: log incoming observation for each created item
      try {
        console.log(`[ORDERS.CREATE.BULK] NoBonCommande=${NoBonCommande} Observation=${JSON.stringify(newOrder.Observation)}`);
      } catch (e) {}

      db.commandes.push(newOrder);

      db.historiqueStatuts.push({
        Id: `h-${baseTime}-${i}-${salt}`,
        CommandeId: orderId,
        AncienStatut: "Nouveau",
        NouveauStatut: finalStatus,
        DateModification: new Date().toISOString(),
        ModifiePar: req.user.username
      });

      createAndSendNotification({
        commandeId: orderId,
        noBonCommande: NoBonCommande.trim(),
        designat: Designation.trim(),
        ancienStatut: "Création",
        nouveauStatut: finalStatus,
        modifiePar: req.user.username,
        agence: Agence
      });

      createdOrders.push(newOrder);
    }

    writeDb(db);

    logAction(
      req.user.username,
      "Création commandes (Lot)",
      `Création de ${createdOrders.length} commandes en lot pour le bon de commande ${req.body.items[0]?.NoBonCommande}`
    );

    return res.status(201).json(createdOrders[0]);
  }

  const {
    NoBonCommande,
    NoDS,
    Designation,
    Quantite,
    Prix,
    ReferenceSage,
    DateLivraison,
    Statut,
    Agence,
    Fournisseur,
    Observation
  } = req.body;

  if (!NoBonCommande || !Designation || !Quantite || !DateLivraison || !Statut || !Agence || !Fournisseur) {
    return res.status(400).json({ error: "Tous les champs obligatoires doivent être renseignés, incluant le fournisseur" });
  }

  if (Statut === "Livré" && (!ReferenceSage || !ReferenceSage.trim())) {
    return res.status(400).json({ error: "Le N° Réception Sage X3 est obligatoire pour valider une livraison." });
  }

  if (Statut === "Terminé" && !isAdministrator(req.user)) {
    return res.status(403).json({ error: "Seuls les administrateurs peuvent utiliser le statut 'Terminé'." });
  }


  const finalStatus = resolveDeliveredStatus(Statut, ReferenceSage);
  const orderId = `c-${randomUUID()}`;
  const systemNumber = db.commandes.find(order => order.NoBonCommande === NoBonCommande.trim())?.NumeroSysteme || getNewSystemNumber(db);
  const newOrder = {
    Id: orderId,
    NumeroSysteme: systemNumber,
    NoBonCommande: NoBonCommande.trim(),
    CreeParId: req.user.userId,
    DateCreation: new Date().toISOString(),
    NoDS: NoDS ? NoDS.trim() : "",
    DateEmission: new Date().toISOString(),
    Designation: Designation.trim(),
    Quantite: Number(Quantite),
    Prix: Prix ? Number(Prix) : undefined,
    ReferenceSage: ReferenceSage ? ReferenceSage.trim() : undefined,
    DateLivraison: DateLivraison,
    Statut: finalStatus,
    CreePar: req.user.username,
    DemandePar: req.user.username,
    ServiceDemande: req.user.service || "",
    Agence: Agence,
    EstArchive: finalStatus === "Terminé",
    DateArchivage: finalStatus === "Terminé" ? new Date().toISOString() : undefined,
    Observation: Observation && Observation.trim() ? Observation.trim() : undefined,
    Fournisseur: Fournisseur.trim()
  };

  // Debug: log incoming single-create observation
  try {
    console.log(`[ORDERS.CREATE] NoBonCommande=${NoBonCommande} Observation=${JSON.stringify(newOrder.Observation)}`);
  } catch (e) {}

  db.commandes.push(newOrder);

  db.historiqueStatuts.push({
    Id: `h-${randomUUID()}`,
    CommandeId: orderId,
    AncienStatut: "Nouveau",
    NouveauStatut: finalStatus,
    DateModification: new Date().toISOString(),
    ModifiePar: req.user.username
  });

  writeDb(db);

  createAndSendNotification({
    commandeId: orderId,
    noBonCommande: NoBonCommande.trim(),
    designat: Designation.trim(),
    ancienStatut: "Création",
    nouveauStatut: Statut,
    modifiePar: req.user.username,
    agence: Agence
  });

  logAction(
    req.user.username,
    "Création commande",
    `Création de la commande ${newOrder.NoBonCommande} pour l'agence: ${newOrder.Agence}. Statut initial: ${newOrder.Statut}`
  );

  res.status(201).json(newOrder);
});

// PUT /api/orders/:id
router.put("/:id", authenticator, (req, res) => {
  validateOrder(req.body, true);
  const { id } = req.params;
  const {
    NoBonCommande,
    NoDS,
    Designation,
    Quantite,
    Prix,
    ReferenceSage,
    DateLivraison,
    Statut,
    Agence,
    Fournisseur,
    Observation
  } = req.body;

  const db = readDb();
  const index = db.commandes.findIndex((c) => c.Id === id);

  if (index === -1) {
    return res.status(404).json({ error: "Commande non trouvée" });
  }

  const cmd = db.commandes[index];
  if (!canModifyOrder(cmd, req.user)) return res.status(403).json({ error: 'Modification refusée pour cette commande' });
  if (NoBonCommande && NoBonCommande.trim() !== cmd.NoBonCommande && db.commandes.some(order => order.NoBonCommande === NoBonCommande.trim() && !(req.allowedOrderIds || []).includes(order.Id))) return res.status(409).json({ error: 'Ce numéro de bon existe déjà' });
  if (req.body.Agence && (!(db.services || []).includes(req.body.Agence) || (req.user.role !== 'Administrateur' && req.body.Agence !== req.user.service))) return res.status(400).json({ error: 'Service invalide' });
  cmd.ModifiePar = req.user.username;

  if (cmd.Statut === "Livré" && req.user?.role !== "Administrateur") {
    return res.status(403).json({ error: "Seuls les administrateurs peuvent modifier une commande livrée" });
  }

  if (Statut === "Livré" && (!ReferenceSage || !ReferenceSage.trim())) {
    return res.status(400).json({ error: "Le N° Réception Sage X3 est obligatoire pour valider une livraison." });
  }

  if (Statut === "Terminé" && !isAdministrator(req.user)) {
    return res.status(403).json({ error: "Seuls les administrateurs peuvent utiliser le statut 'Terminé'." });
  }


  const previousStatut = cmd.Statut;
  const finalStatus = resolveDeliveredStatus(Statut || cmd.Statut, ReferenceSage ?? cmd.ReferenceSage);

  cmd.NoBonCommande = NoBonCommande !== undefined ? NoBonCommande.trim() : cmd.NoBonCommande;
  cmd.NoDS = NoDS !== undefined ? NoDS.trim() : cmd.NoDS;
  cmd.Designation = Designation ? Designation.trim() : cmd.Designation;
  cmd.Quantite = Quantite !== undefined ? Number(Quantite) : cmd.Quantite;
  cmd.Prix = Prix !== undefined ? Number(Prix) : cmd.Prix;
  cmd.ReferenceSage = ReferenceSage !== undefined ? ReferenceSage.trim() : cmd.ReferenceSage;
  cmd.DateLivraison = DateLivraison || cmd.DateLivraison;
  cmd.Statut = finalStatus;
  cmd.Agence = Agence || cmd.Agence;
  
  if (Fournisseur) {
    cmd.Fournisseur = Fournisseur.trim();
  }

  if (cmd.Statut === "Terminé") {
    cmd.EstArchive = true;
    cmd.DateArchivage = new Date().toISOString();
  }

  if (Observation !== undefined) {
    cmd.Observation = Observation && Observation.trim() ? Observation.trim() : undefined;
    try {
      console.log(`[ORDERS.PUT] id=${id} Observation=${JSON.stringify(cmd.Observation)}`);
    } catch (e) {}
  }

  cmd.DateModification = new Date().toISOString();
  db.commandes[index] = cmd;

  {
    db.historiqueStatuts.push({
      Id: `h-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      CommandeId: id,
      AncienStatut: previousStatut,
      NouveauStatut: finalStatus,
      DateModification: new Date().toISOString(),
      ModifiePar: req.user.username
    });

    createAndSendNotification({
      commandeId: id,
      noBonCommande: cmd.NoBonCommande,
      designat: cmd.Designation,
      ancienStatut: previousStatut,
      nouveauStatut: finalStatus,
      modifiePar: req.user.username,
      agence: cmd.Agence
    });
  }

  writeDb(db);

  logAction(
    req.user.username,
    "Modification commande",
    `Mise à jour de la commande ${cmd.NoBonCommande}. Statut: ${previousStatut}->${cmd.Statut}`
  );

  res.json(cmd);
});

// PATCH /api/orders/:id/status
router.patch("/:id/status", authenticator, (req, res) => {
  validateOrder(req.body, true);
  const { id } = req.params;
  const { Statut, Observation, ReferenceSage } = req.body;

  if (!Statut || !["En cours", "Livré", "Non livré", "Terminé"].includes(Statut)) {
    return res.status(400).json({ error: "Statut de commande invalide" });
  }

  if (Statut === "Terminé" && !isAdministrator(req.user)) {
    return res.status(403).json({ error: "Seuls les administrateurs peuvent utiliser le statut 'Terminé'." });
  }

  if (Statut === "Livré" && (!ReferenceSage || !ReferenceSage.trim())) {
    return res.status(400).json({ error: "Le N° Réception Sage X3 est obligatoire pour valider une livraison." });
  }


  const db = readDb();
  const index = db.commandes.findIndex((c) => c.Id === id);

  if (index === -1) {
    return res.status(404).json({ error: "Commande non trouvée" });
  }

  const cmd = db.commandes[index];
  if (!canModifyOrder(cmd, req.user)) return res.status(403).json({ error: 'Modification refusée pour cette commande' });
  if (req.body.Agence && (!(db.services || []).includes(req.body.Agence) || (req.user.role !== 'Administrateur' && req.body.Agence !== req.user.service))) return res.status(400).json({ error: 'Service invalide' });
  cmd.ModifiePar = req.user.username;

  if (cmd.Statut === "Livré" && req.user?.role !== "Administrateur") {
    return res.status(403).json({ error: "Seuls les administrateurs peuvent modifier le statut d'une commande déjà livrée" });
  }

  const previousStatut = cmd.Statut;
  const finalStatus = resolveDeliveredStatus(Statut, ReferenceSage ?? cmd.ReferenceSage);
  cmd.Statut = finalStatus;
  cmd.ReferenceSage = ReferenceSage !== undefined ? ReferenceSage.trim() : cmd.ReferenceSage;

  if (finalStatus === "Terminé") {
    cmd.EstArchive = true;
    cmd.DateArchivage = new Date().toISOString();
  }

  if (Observation !== undefined) {
    cmd.Observation = Observation && Observation.trim() ? Observation.trim() : undefined;
  }

  db.historiqueStatuts.push({
    Id: `h-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    CommandeId: id,
    AncienStatut: previousStatut,
    NouveauStatut: finalStatus,
    DateModification: new Date().toISOString(),
    ModifiePar: req.user.username
  });

  cmd.DateModification = new Date().toISOString();
  db.commandes[index] = cmd;
  writeDb(db);

  createAndSendNotification({
    commandeId: id,
    noBonCommande: cmd.NoBonCommande,
    designat: cmd.Designation,
    ancienStatut: previousStatut,
    nouveauStatut: finalStatus,
    modifiePar: req.user.username,
    agence: cmd.Agence
  });

  logAction(
    req.user.username,
    "Changement Statut Direct",
    `Commande ${cmd.NoBonCommande} statut modifié: ${previousStatut} -> ${Statut}`
  );

  res.json(cmd);
});

// DELETE /api/orders/:id
router.delete("/:id", authenticator, adminOnly, (req, res) => {
  const { id } = req.params;
  const db = readDb();

  const index = db.commandes.findIndex((c) => c.Id === id);
  if (index === -1) {
    return res.status(404).json({ error: "Commande non trouvée" });
  }

  const orderNum = db.commandes[index].NoBonCommande;

  db.commandeFournisseurs = db.commandeFournisseurs.filter((cf) => cf.CommandeId !== id);
  db.historiqueStatuts = db.historiqueStatuts.filter((h) => h.CommandeId !== id);
  db.commandes.splice(index, 1);
  for (const notification of db.notifications || []) if (notification.CommandeId === id) notification.CommandeId = null;

  writeDb(db);

  logAction(
    req.user.username,
    "Suppression commande",
    `Suppression irréversible de la commande ${orderNum} de la base de données.`
  );

  res.json({ success: true, message: "Commande supprimée définitivement" });
});

// POST /api/orders/:id/archive
router.post("/:id/archive", authenticator, adminOnly, (req, res) => {
  const { id } = req.params;
  const db = readDb();

  const index = db.commandes.findIndex((c) => c.Id === id);
  if (index === -1) {
    return res.status(404).json({ error: "Commande non trouvée" });
  }

  db.commandes[index].EstArchive = true;
  db.commandes[index].ModifiePar = req.user.username;
  db.commandes[index].DateArchivage = new Date().toISOString();
  db.commandes[index].DateModification = new Date().toISOString();

  db.historiqueStatuts.push({
    Id: `h-${randomUUID()}`,
    CommandeId: id,
    AncienStatut: db.commandes[index].Statut,
    NouveauStatut: `${db.commandes[index].Statut} (Archivée)`,
    DateModification: new Date().toISOString(),
    ModifiePar: req.user.username
  });

  writeDb(db);

  createAndSendNotification({
    commandeId: id,
    noBonCommande: db.commandes[index].NoBonCommande,
    designat: db.commandes[index].Designation,
    ancienStatut: db.commandes[index].Statut,
    nouveauStatut: `${db.commandes[index].Statut} (Archivée)`,
    modifiePar: req.user.username,
    agence: db.commandes[index].Agence
  });

  logAction(
    req.user.username,
    "Archivage Manuel",
    `La commande ${db.commandes[index].NoBonCommande} a été déplacée dans le module d'archives.`
  );

  res.json({ success: true, message: "Commande archivée avec succès" });
});

// POST /api/orders/:id/restore
router.post("/:id/restore", authenticator, adminOnly, (req, res) => {
  const { id } = req.params;
  const db = readDb();

  const index = db.commandes.findIndex((c) => c.Id === id);
  if (index === -1) {
    return res.status(404).json({ error: "Commande non trouvée" });
  }

  const previousStatus = db.commandes[index].Statut;
  db.commandes[index].EstArchive = false;
  if (db.commandes[index].Statut === "Terminé") db.commandes[index].Statut = "En cours";
  db.commandes[index].ModifiePar = req.user.username;
  delete db.commandes[index].DateArchivage;
  db.commandes[index].DateModification = new Date().toISOString();

  db.historiqueStatuts.push({
    Id: `h-${randomUUID()}`,
    CommandeId: id,
    AncienStatut: `${previousStatus} (Archivée)`,
    NouveauStatut: db.commandes[index].Statut,
    DateModification: new Date().toISOString(),
    ModifiePar: req.user.username
  });

  writeDb(db);

  createAndSendNotification({
    commandeId: id,
    noBonCommande: db.commandes[index].NoBonCommande,
    designat: db.commandes[index].Designation,
    ancienStatut: `${previousStatus} (Archivée)`,
    nouveauStatut: db.commandes[index].Statut,
    modifiePar: req.user.username,
    agence: db.commandes[index].Agence
  });

  logAction(
    req.user.username,
    "Restauration Archive",
    `La commande ${db.commandes[index].NoBonCommande} a été restaurée dans la liste principale active.`
  );

  res.json({ success: true, message: "Commande restaurée avec succès" });
});

// GET /api/archive/config
router.get("/config", authenticator, (req, res) => {
  const db = readDb();
  res.json(db.archiveConfig);
});

// POST /api/archive/config
router.post("/config", authenticator, adminOnly, (req, res) => {
  validateArchiveConfig(req.body);
  const { autoArchiveDays, enableAutoArchive } = req.body;

  if (autoArchiveDays === undefined || typeof enableAutoArchive !== "boolean") {
    return res.status(400).json({ error: "Données de configuration d'archivage incomplètes" });
  }

  const db = readDb();
  db.archiveConfig.autoArchiveDays = Number(autoArchiveDays);
  db.archiveConfig.enableAutoArchive = enableAutoArchive;

  writeDb(db);

  logAction(
    req.user.username,
    "Configuration Archivage",
    `Mise à jour Archivage Automatique: Activé=${enableAutoArchive}, Délai=${autoArchiveDays} jours`
  );

  res.json({ success: true, config: db.archiveConfig });
});

router.post('/batch', authenticator, (req, res) => {
  const operations = req.body.operations;
  if (!Array.isArray(operations) || !operations.length || operations.length > 200) return res.status(400).json({ error: 'Lot invalide' });
  const results = [];
  const sourceNumbers = new Set(readDb().commandes.filter(order => operations.some(operation => operation?.id === order.Id)).map(order => order.NoBonCommande));
  if (sourceNumbers.size > 1) return res.status(400).json({ error: 'Une opération de groupe doit porter sur un seul bon' });
  for (const operation of operations) {
    if (!operation || typeof operation.id !== 'string') return res.status(400).json({ error: 'Identifiant invalide' });
    const definitions = { create: ['post', '/'], update: ['put', '/:id'], status: ['patch', '/:id/status'], delete: ['delete', '/:id'], archive: ['post', '/:id/archive'], restore: ['post', '/:id/restore'] };
    const definition = definitions[operation.action];
    if (!definition) return res.status(400).json({ error: 'Action invalide' });
    if (['delete', 'archive', 'restore'].includes(operation.action) && req.user.role !== 'Administrateur') return res.status(403).json({ error: 'Droits administrateur requis' });
    const route = router.stack.find(layer => layer.route?.path === definition[1] && layer.route.methods[definition[0]]).route;
    let status = 200, body;
    const response = { status(code) { status = code; return this; }, json(value) { body = value; return this; } };
    route.stack.at(-1).handle({ ...req, batchOperation: true, allowedOrderIds: operations.map(operation => operation.id), params: { id: operation.id }, body: operation.data || {} }, response);
    if (status >= 400) return res.status(status).json(body);
    results.push(body);
  }
  res.json(results);
});

export default router;
