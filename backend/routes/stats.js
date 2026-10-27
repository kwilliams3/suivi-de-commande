import express from "express";
import { countOrders, countOrdersBy, monthlyActivity } from "../models/dashboard.js";
import { readDb } from "../models/db.js";
import { authenticator } from "./auth.js";

import { canReadOrder } from '../models/access.js';
const router = express.Router();

// GET /api/stats
router.get("/", authenticator, (req, res) => {
  const db = readDb();

  const filteredCommandes = db.commandes.filter(order => canReadOrder(order, req.user));

  const totalActives = countOrders(filteredCommandes.filter((c) => !c.EstArchive));
  const totalArchived = countOrders(filteredCommandes.filter((c) => c.EstArchive));

  const stats = {
    totalGlobal: countOrders(filteredCommandes),
    totalActives,
    enCours: countOrders(filteredCommandes.filter((c) => !c.EstArchive && c.Statut === "En cours")),
    livres: countOrders(filteredCommandes.filter((c) => !c.EstArchive && c.Statut === "Livré")),
    nonLivres: countOrders(filteredCommandes.filter((c) => !c.EstArchive && c.Statut === "Non livré")),
    archives: totalArchived,
    enRetard: countOrders(filteredCommandes.filter((c) => {
      if (c.EstArchive || c.Statut === "Livré" || c.Statut === "Terminé" || !c.DateLivraison) return false;
      const deliveryDate = new Date(c.DateLivraison);
      const today = new Date();
      deliveryDate.setHours(0,0,0,0);
      today.setHours(0,0,0,0);
      return deliveryDate < today;
    })),
    procheLivraison: countOrders(filteredCommandes.filter((c) => {
      if (c.EstArchive || c.Statut === "Livré" || c.Statut === "Terminé" || !c.DateLivraison) return false;
      const deliveryDate = new Date(c.DateLivraison);
      const today = new Date();
      deliveryDate.setHours(0,0,0,0);
      today.setHours(0,0,0,0);
      const diffMs = deliveryDate.getTime() - today.getTime();
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      return diffDays >= 0 && diffDays <= 3;
    })),

    byAgency: {},
    bySupplier: {},
    byMonth: {}
  };
  stats.monthActivity = monthlyActivity(filteredCommandes, db.historiqueStatuts || []);

  stats.byAgency = countOrdersBy(filteredCommandes, cmd => cmd.Agence || "Non spécifié");
  stats.bySupplier = countOrdersBy(filteredCommandes, cmd => cmd.Fournisseur || "Achat Local");
  stats.byMonth = countOrdersBy(filteredCommandes, cmd => {
    const date = new Date(cmd.DateEmission);
    return !cmd.DateEmission || Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 7);
  });

  res.json(stats);
});

export default router;
