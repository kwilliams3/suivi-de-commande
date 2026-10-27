import express from "express";
import { readDb, writeDb, logAction, DEFAULT_AGENCIES } from "../models/db.js";
import { authenticator, adminOnly } from "./auth.js";

const router = express.Router();

// GET /api/suppliers
router.get("/", authenticator, (req, res) => {
  const db = readDb();
  res.json(db.fournisseurs);
});

// POST /api/suppliers
router.post("/", authenticator, adminOnly, (req, res) => {
  const { NomFournisseur, TypeFournisseur } = req.body;

  if (typeof NomFournisseur !== 'string' || !NomFournisseur.trim() || !['Achat Local', 'Achat Import', 'Secretariat DG'].includes(TypeFournisseur)) {
    return res.status(400).json({ error: "Veuillez renseigner le nom et le type de fournisseur" });
  }

  const db = readDb();
  const exists = db.fournisseurs.some(
    (f) => f.NomFournisseur.toLowerCase() === NomFournisseur.trim().toLowerCase()
  );

  if (exists) {
    return res.status(400).json({ error: "Ce fournisseur existe déjà" });
  }

  const newSupplier = {
    Id: `f-${Date.now()}`,
    NomFournisseur: NomFournisseur.trim(),
    TypeFournisseur
  };

  db.fournisseurs.push(newSupplier);
  writeDb(db);

  logAction(
    req.user.username,
    "Création fournisseur",
    `Création du fournisseur ${newSupplier.NomFournisseur} (${newSupplier.TypeFournisseur})`
  );

  res.status(201).json(newSupplier);
});

// PUT /api/suppliers/:id
router.put("/:id", authenticator, adminOnly, (req, res) => {
  const { NomFournisseur, TypeFournisseur } = req.body;
  if ((NomFournisseur !== undefined && (typeof NomFournisseur !== 'string' || !NomFournisseur.trim())) || (TypeFournisseur !== undefined && !['Achat Local', 'Achat Import', 'Secretariat DG'].includes(TypeFournisseur))) return res.status(400).json({ error: 'Fournisseur invalide' });
  const { id } = req.params;

  const db = readDb();
  const index = db.fournisseurs.findIndex((f) => f.Id === id);

  if (index === -1) {
    return res.status(404).json({ error: "Fournisseur non trouvé" });
  }

  const oldName = db.fournisseurs[index].NomFournisseur;
  db.fournisseurs[index].NomFournisseur = NomFournisseur ? NomFournisseur.trim() : db.fournisseurs[index].NomFournisseur;
  db.fournisseurs[index].TypeFournisseur = TypeFournisseur || db.fournisseurs[index].TypeFournisseur;

  writeDb(db);

  logAction(
    req.user.username,
    "Modification fournisseur",
    `Modification du fournisseur ${oldName} en ${db.fournisseurs[index].NomFournisseur}`
  );

  res.json(db.fournisseurs[index]);
});

// DELETE /api/suppliers/:id
router.delete("/:id", authenticator, adminOnly, (req, res) => {
  const { id } = req.params;

  const db = readDb();
  const index = db.fournisseurs.findIndex((f) => f.Id === id);

  if (index === -1) {
    return res.status(404).json({ error: "Fournisseur non trouvé" });
  }

  const supplierName = db.fournisseurs[index].NomFournisseur;

  db.commandeFournisseurs = db.commandeFournisseurs.filter((cf) => cf.FournisseurId !== id);
  db.fournisseurs.splice(index, 1);

  writeDb(db);

  logAction(
    req.user.username,
    "Suppression fournisseur",
    `Désenregistrement définitif du fournisseur ${supplierName} (et ses liaisons commandes)`
  );

  res.json({ success: true, message: "Fournisseur supprimé avec succès" });
});

export default router;
export { DEFAULT_AGENCIES };
