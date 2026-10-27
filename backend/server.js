import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from 'vite';
import { runAutoArchive, DEFAULT_AGENCIES, readDb, writeDb, logAction, commitDb, databaseWork } from "./models/db.js";
import { transactionalMiddleware } from './models/unit-of-work.js';
import { validateArchiveConfig } from './models/validation.js';
import authRouter, { authenticator, adminOnly } from "./routes/auth.js";
import usersRouter from "./routes/users.js";
import suppliersRouter from "./routes/suppliers.js";
import ordersRouter from "./routes/orders.js";
import prestationsRouter from './routes/prestations.js';
import statsRouter from "./routes/stats.js";
import logsRouter from "./routes/logs.js";
import notificationsRouter from "./routes/notifications.js";
import { getMssqlPool } from "./models/db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const apiRouter = express.Router();
const PORT = Number(process.env.PORT || 3003);

app.use(express.json());

// Run auto-archiving once on startup after SQL cache is fully initialized
try {
  await getMssqlPool();
  await databaseWork(runAutoArchive);
} catch (e) {
  throw e;
}

// Set up periodic auto-archive execution (every 5 minutes)
setInterval(() => {
  try {
    if (process.env.DB_MSSQL_SERVER) {
      const db = readDb();
      if (!db || !Array.isArray(db.commandes)) return;
    }
    databaseWork(runAutoArchive).catch(error => console.error('Archivage automatique:', error.message));
  } catch (e) {
    console.error("Interval auto-archive task failed:", e);
  }
}, 5 * 60 * 1000);

// --- Mount Routes ---
apiRouter.use(transactionalMiddleware(readDb, commitDb));
apiRouter.use("/auth", authRouter);
apiRouter.use("/users", usersRouter);
apiRouter.use("/suppliers", suppliersRouter);
apiRouter.use("/orders", ordersRouter);
apiRouter.use('/prestations', prestationsRouter);
apiRouter.use("/stats", statsRouter);
apiRouter.use("/logs", logsRouter);
apiRouter.use("/notifications", notificationsRouter);

// --- Custom Inline Mappings (Agencies, Services & Archive Config) ---
apiRouter.get("/agencies", authenticator, (req, res) => {
  const db = readDb();
  res.json(db.agences || []);
});

apiRouter.post("/agencies", authenticator, adminOnly, (req, res) => {
  const { name } = req.body;
  if (typeof name !== 'string' || !name.trim() || name.length > 100) {
    return res.status(400).json({ error: "Le nom de l'agence est requis." });
  }

  const db = readDb();
  const normalized = name.trim();
  if (!db.agences) {
    db.agences = [];
  }
  if (db.agences.some((ag) => ag.toLowerCase() === normalized.toLowerCase())) {
    return res.status(400).json({ error: "Cette agence existe déjà." });
  }

  db.agences.unshift(normalized);
  writeDb(db);
  logAction(req.user?.NomUtilisateur || "admin", "Création d'agence", `Ajout de l'agence : ${normalized}`);
  res.json(db.agences);
});

apiRouter.delete("/agencies/:name", authenticator, adminOnly, (req, res) => {
  const { name } = req.params;
  const db = readDb();
  
  if (!db.agences) db.agences = [];
  const initialLength = db.agences.length;
  if ([...db.commandes, ...(db.prestations || [])].some(order => order.Fournisseur === `Agence - ${name}`)) return res.status(409).json({ error: 'Cette agence est utilisée par des commandes' });
  db.agences = db.agences.filter((ag) => ag !== name);

  if (db.agences.length === initialLength) {
    return res.status(404).json({ error: "Agence non trouvée." });
  }

  writeDb(db);
  logAction(req.user?.NomUtilisateur || "admin", "Suppression d'agence", `Suppression de l'agence : ${name}`);
  res.json(db.agences);
});

// --- Services API ---
apiRouter.get("/services", authenticator, (req, res) => {
  const db = readDb();
  res.json(db.services || []);
});

apiRouter.post("/services", authenticator, adminOnly, (req, res) => {
  const { name } = req.body;
  if (typeof name !== 'string' || !name.trim() || name.length > 100) {
    return res.status(400).json({ error: "Le nom du service est requis." });
  }

  const db = readDb();
  const normalized = name.trim();
  if (!db.services) {
    db.services = [];
  }
  if (db.services.some((ser) => ser.toLowerCase() === normalized.toLowerCase())) {
    return res.status(400).json({ error: "Ce service existe déjà." });
  }

  db.services.unshift(normalized);
  writeDb(db);
  logAction(req.user?.NomUtilisateur || "admin", "Création de service", `Ajout du service : ${normalized}`);
  res.json(db.services);
});

apiRouter.delete("/services/:name", authenticator, adminOnly, (req, res) => {
  const { name } = req.params;
  const db = readDb();
  
  if (!db.services) db.services = [];
  const initialLength = db.services.length;
  if (db.utilisateurs.some(user => user.Service === name) || [...db.commandes, ...(db.prestations || [])].some(order => order.Agence === name || order.ServiceDemande === name)) return res.status(409).json({ error: 'Ce service est utilisé par des utilisateurs ou des commandes' });
  db.services = db.services.filter((ser) => ser !== name);

  if (db.services.length === initialLength) {
    return res.status(404).json({ error: "Service non trouvé." });
  }

  writeDb(db);
  logAction(req.user?.NomUtilisateur || "admin", "Suppression de service", `Suppression du service : ${name}`);
  res.json(db.services);
});

// GET /api/archive/config
apiRouter.get("/archive/config", authenticator, (req, res) => {
  const db = readDb();
  res.json(db.archiveConfig);
});

// POST /api/archive/config
apiRouter.post("/archive/config", authenticator, adminOnly, (req, res) => {
  const { autoArchiveDays, enableAutoArchive } = req.body;
  validateArchiveConfig(req.body);

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

app.use("/api/appro", apiRouter);
app.use("/api", apiRouter);
app.use('/api', (req, res) => res.status(404).json({ error: 'Route API introuvable' }));
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  res.status(error.status || 500).json({ error: error.status ? error.message : 'Erreur interne du serveur' });
});

// --- Vite Static Delivery or Development Middleware ---
async function startServer() {
  const serveFrontendInDev = process.env.NODE_ENV !== "production" && process.env.SERVE_FRONTEND !== "false";

  if (serveFrontendInDev) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
      configFile: path.join(__dirname, "..", "frontend", "vite.config.ts"),
    });
    app.use(vite.middlewares);
  } else if (process.env.NODE_ENV === "production") {
    const distPath = path.join(__dirname, "..", "frontend", "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  await getMssqlPool();

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[BACKEND] Suivi des Approvisionnements démarre sur http://localhost:${PORT}`);
  });
}

startServer();
export default app;
