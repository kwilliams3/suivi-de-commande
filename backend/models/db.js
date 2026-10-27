import dotenv from 'dotenv';
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import sql from 'mssql';
import bcrypt from "bcryptjs";
import { randomBytes } from 'node:crypto';
import { dbContext, serialized } from './unit-of-work.js';
import { saveSql } from './persistence.js';
import { migrateColumns } from './migrations.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '..', '.env'), quiet: true });

const DB_DIR = path.join(__dirname, "..", "..", "data");
const DB_FILE = path.join(DB_DIR, "database.json");

const DEFAULT_AGENCIES = [
  "RH",
  "Moyens Généraux",
  "Fiscalité",
  "Sécurité",
  "Achat Import",
  "Courriel",
  "Commercial",
  "Informatique",
  "Supply chaine",
  "Marketing",
  "Contrôle de Gestion",
  "Garage",
  "Comptabilité",
  "Gestion Stock",
  "Transit",
  "Technique",
  "Secrétariat DG",
  "Achat Local",
  "Exploitation",
  "Logistique",
  "Contrôle et Audit Interne",
  "Archive",
  "Juridique"
];

const DEFAULT_PHYSICAL_AGENCIES = [
  "AKWA",
  "DIRECTION",
  "MBOPPI",
  "DOUCHE",
  "BEACH",
  "NDOGPASSI",
  "SODIKO",
  "EMERAUDE",
  "GRAND HANGAR",
  "YASSA",
  "SHOW ROOM",
  "CORON",
  "KRIBI",
  "HM MOKOLO",
  "PDV MOKOLO",
  "NLONGAK",
  "MESSASSI",
  "NGAOUNDERE",
  "BERTOUA",
  "BAMENDA",
  "TAMDJA",
  "DJELENG",
  "M110",
  "PK5",
  "M100",
  "M20",
  "M120",
  "M50",
  "Garage 120",
  "LDI MBOPPI",
  "LDI BESSENGUE",
  "LDI NKOMONDO",
  "PK11",
  "Parc Automobile",
  "SOCOPRODE",
  "Nkoabang"
];

// --- MSSQL Connection Pool Manager ---
let mssqlPool = null;
let mssqlCheckDone = false;
let isMssqlActive = false;

// Global memory cache to prevent any file writes when SQL Server 2014 is active
let memoryDb = null;
let mssqlInitialized = false;

let generatedAdminPassword;
function initialAdminPassword() {
  if (process.env.INITIAL_ADMIN_PASSWORD) {
    if (process.env.INITIAL_ADMIN_PASSWORD.length < 12) throw new Error('INITIAL_ADMIN_PASSWORD doit contenir au moins 12 caractères');
    return process.env.INITIAL_ADMIN_PASSWORD;
  }
  if (!generatedAdminPassword) {
    generatedAdminPassword = randomBytes(18).toString('base64url');
    console.log('Initialisation : mot de passe temporaire du nouveau compte admin :', generatedAdminPassword);
  }
  return generatedAdminPassword;
}

function createDefaultStructure(includeAdmin = true) {
  const salt = bcrypt.genSaltSync(10);
  const adminPasswordHashed = includeAdmin ? bcrypt.hashSync(initialAdminPassword(), salt) : '';
  return {
    utilisateurs: includeAdmin ? [
      {
        Id: "u-admin",
        Nom: "Admin",
        Prenom: "Gestion",
        Email: "admin@example.com",
        NomUtilisateur: "admin",
        MotDePasse: adminPasswordHashed,
        Role: "Administrateur",
        Statut: "Actif",
        Service: "",
        DateCreation: new Date().toISOString(),
      }
    ] : [],
    commandes: [],
    prestations: [],
    historiquePrestations: [],
    fournisseurs: [],
    commandeFournisseurs: [],
    historiqueStatuts: [],
    logs: [
      {
        Id: "log-1",
        Action: "Initialisation Système",
        Utilisateur: "Système",
        DateAction: new Date().toISOString(),
        Details: "Initialisation de la base de données virtuelle en mémoire."
      }
    ],
    archiveConfig: {
      autoArchiveDays: 30,
      enableAutoArchive: true,
    },
    services: [...DEFAULT_AGENCIES],
    agences: [...DEFAULT_PHYSICAL_AGENCIES]
  };
}

export async function getMssqlPool() {
  if (mssqlCheckDone) {
    return isMssqlActive ? mssqlPool : null;
  }

  // Check if configuration exists
  if (!process.env.DB_MSSQL_SERVER) {
    console.log("SQL Server : Aucun serveur SQL configuré. Utilisation exclusive de la base JSON.");
    mssqlCheckDone = true;
    isMssqlActive = false;
    return null;
  }

  try {
    const config = {
      server: process.env.DB_MSSQL_SERVER,
      user: process.env.DB_MSSQL_USER,
      password: process.env.DB_MSSQL_PASSWORD,
      database: process.env.DB_MSSQL_DATABASE,
      port: parseInt(process.env.DB_MSSQL_PORT || "1433", 10),
      options: {
        encrypt: process.env.DB_MSSQL_ENCRYPT === "true",
        trustServerCertificate: process.env.DB_MSSQL_TRUST_CERT === "true",
        enableArithAbort: true
      },
      connectionTimeout: 8000,
      requestTimeout: 15000
    };

    console.log(`Tentative de connexion à SQL Server (${config.server}:${config.port})...`);
    mssqlPool = await sql.connect(config);
    isMssqlActive = true;
    console.log("=================================================================");
    console.log("CONNEXION REUSSIE : Base de données active sur SQL Server 2014 !");
    console.log("=================================================================");
    
    // Auto-bootstrap schemas on first success if configured
    await bootstrapMssqlTables(mssqlPool);
    await migrateColumns(mssqlPool);

    // Initial load from SQL Server tables directly into memory cache
    await loadDataFromMssql(mssqlPool);

    // Create system log about successful initialization
    const connLog = {
      Id: `log-conn-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      Action: "Connexion Base de Données",
      Utilisateur: "Système",
      DateAction: new Date().toISOString(),
      Details: `Connexion établie avec succès à la base de données SQL Server 2014 (${config.server}:${config.port}).`
    };

    if (memoryDb) {
      if (!memoryDb.logs) memoryDb.logs = [];
      // To avoid duplicate system logs on every boot/hot-reload check:
      if (!memoryDb.logs.some(l => l.Action === "Connexion Base de Données" && new Date(l.DateAction).getTime() > Date.now() - 30000)) {
        memoryDb.logs.unshift(connLog);
        try {
          await mssqlPool.request()
            .input("id", sql.NVarChar, connLog.Id)
            .input("act", sql.NVarChar, connLog.Action)
            .input("usr", sql.NVarChar, connLog.Utilisateur)
            .input("dateAct", sql.DateTime, new Date())
            .input("det", sql.NVarChar, connLog.Details)
            .query("INSERT INTO dbo.Logs (Id, Action, Utilisateur, DateAction, Details) VALUES (@id, @act, @usr, @dateAct, @det)");
        } catch (dbErr) {
          console.error("SQL Server : Échec d'insertion du log de connexion :", dbErr.message);
        }
      }
    }

  } catch (err) {
    console.error("=================================================================");
    console.error("ERREUR DE CONNEXION SQL SERVER. Démarrage interrompu.");
    console.error("Détail:", err.message);
    console.error("=================================================================");
    isMssqlActive = false;
    mssqlPool = null;
  }

  mssqlCheckDone = true;
  return isMssqlActive ? mssqlPool : null;
}

/**
 * Checks and creates tables on SQL Server 2014 if they are missing.
 * Also handles applying incremental column modifications like "Service" to the "Utilisateurs" table.
 */
async function bootstrapMssqlTables(pool) {
  try {
    // Basic verification check
    const checkTableQuery = "SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'Utilisateurs'";
    const res = await pool.request().query(checkTableQuery);
    if (res.recordset.length > 0) {
      console.log("SQL Server : Tables existantes détectées.");
      
      // Dynamic migration verify: Ensure column 'Service' exists in the table Utilisateurs (added in v2.0)
      const checkServiceCol = "SELECT COL_LENGTH('dbo.Utilisateurs', 'Service') AS ColLength";
      const resCol = await pool.request().query(checkServiceCol);
      if (resCol.recordset.length > 0 && resCol.recordset[0].ColLength === null) {
        console.log("SQL Server : Ajout de la colonne 'Service' manquante dans dbo.Utilisateurs...");
        await pool.request().query("ALTER TABLE dbo.Utilisateurs ADD Service NVARCHAR(150) NULL");
      }
      return;
    }

    console.log("SQL Server : Tables manquantes. Création de la structure SQL Server 2014...");
    
    // Create base tables
    await pool.request().query(`
      CREATE TABLE dbo.Services (
          Id INT IDENTITY(1,1) NOT NULL,
          Nom NVARCHAR(150) NOT NULL UNIQUE,
          CONSTRAINT PK_Services PRIMARY KEY CLUSTERED (Id ASC)
      );
      
      CREATE TABLE dbo.Agences (
          Id INT IDENTITY(1,1) NOT NULL,
          Nom NVARCHAR(150) NOT NULL UNIQUE,
          CONSTRAINT PK_Agences PRIMARY KEY CLUSTERED (Id ASC)
      );
      
      CREATE TABLE dbo.ArchiveConfig (
          Id INT IDENTITY(1,1) NOT NULL,
          AutoArchiveDays INT NOT NULL DEFAULT (30),
          EnableAutoArchive BIT NOT NULL DEFAULT (1),
          CONSTRAINT PK_ArchiveConfig PRIMARY KEY CLUSTERED (Id ASC)
      );

      CREATE TABLE dbo.Utilisateurs (
          Id NVARCHAR(50) NOT NULL,
          Nom NVARCHAR(100) NOT NULL,
          Prenom NVARCHAR(100) NOT NULL,
          Email NVARCHAR(150) NULL,
          NomUtilisateur NVARCHAR(50) NOT NULL UNIQUE,
          MotDePasse NVARCHAR(255) NOT NULL,
          Role NVARCHAR(50) NOT NULL DEFAULT ('Utilisateur'),
          Statut NVARCHAR(50) NOT NULL DEFAULT ('Actif'),
          Service NVARCHAR(150) NULL,
          DateCreation DATETIME NOT NULL DEFAULT (GETDATE()),
          CONSTRAINT PK_Utilisateurs PRIMARY KEY CLUSTERED (Id ASC)
      );

      CREATE TABLE dbo.Fournisseurs (
          Id NVARCHAR(50) NOT NULL,
          NomFournisseur NVARCHAR(150) NOT NULL,
          Contact NVARCHAR(150) NULL,
          Telephone NVARCHAR(100) NULL,
          TypeFournisseur NVARCHAR(50) NOT NULL DEFAULT ('Achat Local'),
          DateCreation DATETIME NOT NULL DEFAULT (GETDATE()),
          CONSTRAINT PK_Fournisseurs PRIMARY KEY CLUSTERED (Id ASC)
      );

      CREATE TABLE dbo.Commandes (
          Id NVARCHAR(50) NOT NULL,
          NoBonCommande NVARCHAR(100) NOT NULL,
          NoDS NVARCHAR(100) NULL,
          Designation NVARCHAR(MAX) NULL,
          Quantite INT NOT NULL DEFAULT (1),
          Prix DECIMAL(18,2) NULL,
          Fournisseur NVARCHAR(150) NULL DEFAULT (N'Achat Local'),
          Agence NVARCHAR(150) NULL,
          DateLivraison DATETIME NULL,
          Statut NVARCHAR(50) NOT NULL DEFAULT ('Saisie'),
          DateEmission DATETIME NOT NULL DEFAULT (GETDATE()),
          EstArchive BIT NOT NULL DEFAULT (0),
          DateArchivage DATETIME NULL,
          Observation NVARCHAR(MAX) NULL,
          DemandePar NVARCHAR(100) NULL,
          ServiceDemande NVARCHAR(100) NULL,
          DateCreation DATETIME NOT NULL DEFAULT (GETDATE()),
          DateModification DATETIME NULL,
          ModifiePar NVARCHAR(100) NULL,
          CONSTRAINT PK_Commandes PRIMARY KEY CLUSTERED (Id ASC)
      );

      CREATE TABLE dbo.HistoriqueStatuts (
          Id NVARCHAR(50) NOT NULL,
          CommandeId NVARCHAR(50) NOT NULL,
          AncienStatut NVARCHAR(50) NOT NULL,
          NouveauStatut NVARCHAR(50) NOT NULL,
          DateModification DATETIME NOT NULL DEFAULT (GETDATE()),
          ModifiePar NVARCHAR(100) NOT NULL,
          CONSTRAINT PK_HistoriqueStatuts PRIMARY KEY CLUSTERED (Id ASC),
          CONSTRAINT FK_HistStatuts_Commande FOREIGN KEY (CommandeId) REFERENCES dbo.Commandes (Id) ON DELETE CASCADE
      );

      CREATE TABLE dbo.Logs (
          Id NVARCHAR(50) NOT NULL,
          Action NVARCHAR(150) NOT NULL,
          Utilisateur NVARCHAR(100) NOT NULL,
          DateAction DATETIME NOT NULL DEFAULT (GETDATE()),
          Details NVARCHAR(MAX) NULL,
          CONSTRAINT PK_Logs PRIMARY KEY CLUSTERED (Id ASC)
      );

      CREATE TABLE dbo.Notifications (
          Id NVARCHAR(50) NOT NULL,
          CommandeId NVARCHAR(50) NULL,
          NoBonCommande NVARCHAR(100) NULL,
          Designation NVARCHAR(MAX) NULL,
          AncienStatut NVARCHAR(50) NULL,
          NouveauStatut NVARCHAR(50) NULL,
          ModifiePar NVARCHAR(100) NULL,
          Agence NVARCHAR(150) NULL,
          Date DATETIME NOT NULL DEFAULT (GETDATE()),
          Lue BIT NOT NULL DEFAULT (0),
          CONSTRAINT PK_Notifications PRIMARY KEY CLUSTERED (Id ASC),
          CONSTRAINT FK_Notifications_Commande FOREIGN KEY (CommandeId) REFERENCES dbo.Commandes (Id) ON DELETE SET NULL
      );
    `);

    // Bootstrap Reference / Configuration values
    await pool.request().query("INSERT INTO dbo.ArchiveConfig (AutoArchiveDays, EnableAutoArchive) VALUES (30, 1)");

    for (const s of DEFAULT_AGENCIES) {
      await pool.request().input("nom", sql.NVarChar, s).query("INSERT INTO dbo.Services (Nom) VALUES (@nom)");
    }
    for (const a of DEFAULT_PHYSICAL_AGENCIES) {
      await pool.request().input("nom", sql.NVarChar, a).query("INSERT INTO dbo.Agences (Nom) VALUES (@nom)");
    }

    // Default admin
    const salt = bcrypt.genSaltSync(10);
    const adminPasswordHashed = bcrypt.hashSync(initialAdminPassword(), salt);
    await pool.request()
      .input("id", sql.NVarChar, "u-admin")
      .input("nom", sql.NVarChar, "Admin")
      .input("prenom", sql.NVarChar, "Gestion")
      .input("email", sql.NVarChar, "admin@example.com")
      .input("username", sql.NVarChar, "admin")
      .input("password", sql.NVarChar, adminPasswordHashed)
      .input("role", sql.NVarChar, "Administrateur")
      .input("statut", sql.NVarChar, "Actif")
      .query(`
        INSERT INTO dbo.Utilisateurs (Id, Nom, Prenom, Email, NomUtilisateur, MotDePasse, Role, Statut, DateCreation)
        VALUES (@id, @nom, @prenom, @email, @username, @password, @role, @statut, GETDATE())
      `);

    console.log("SQL Server : Base bootstrappée avec succès !");
  } catch (err) {
    console.error("Erreur de bootstrap SQL Server:", err);
    throw err;
  }
}

/**
 * Hydrates our memoryDb structure directly and asynchronously from MS SQL Server tables
 */
async function loadDataFromMssql(pool) {
  try {
    console.log("SQL Server : Hydratation de notre cache mémoire depuis SQL Server...");
    const db = createDefaultStructure(false);

    // 1. Archive Config
    const rConfig = await pool.request().query("SELECT TOP 1 AutoArchiveDays, EnableAutoArchive FROM dbo.ArchiveConfig");
    if (rConfig.recordset.length > 0) {
      db.archiveConfig = {
        autoArchiveDays: rConfig.recordset[0].AutoArchiveDays,
        enableAutoArchive: rConfig.recordset[0].EnableAutoArchive === true || rConfig.recordset[0].EnableAutoArchive === 1
      };
    }

    // 2. Services (ordre d'enregistrement, le plus récent en premier)
    const rServices = await pool.request().query("SELECT Nom FROM dbo.Services ORDER BY Id DESC");
    if (rServices.recordset.length > 0) {
      db.services = rServices.recordset.map(row => row.Nom);
    }

    // 3. Agences (ordre d'enregistrement, le plus récent en premier)
    const rAgences = await pool.request().query("SELECT Nom FROM dbo.Agences ORDER BY Id DESC");
    if (rAgences.recordset.length > 0) {
      db.agences = rAgences.recordset.map(row => row.Nom);
    }

    // 4. Utilisateurs
    const rUsers = await pool.request().query("SELECT * FROM dbo.Utilisateurs");
    if (!rUsers.recordset.length) {
      if (!process.env.INITIAL_ADMIN_PASSWORD || process.env.INITIAL_ADMIN_PASSWORD.length < 12) throw new Error('Aucun compte SQL. Configurez INITIAL_ADMIN_PASSWORD (12 caractères minimum) pour initialiser le premier compte.');
      const initial = createDefaultStructure().utilisateurs;
      await saveSql(sql, pool, { utilisateurs: [] }, { utilisateurs: initial });
      db.utilisateurs = initial;
    }
    if (rUsers.recordset.length > 0) {
      db.utilisateurs = rUsers.recordset.map(row => ({
        Id: row.Id,
        Nom: row.Nom,
        Prenom: row.Prenom,
        Email: row.Email || "",
        NomUtilisateur: row.NomUtilisateur,
        MotDePasse: row.MotDePasse,
        Role: row.Role,
        Statut: row.Statut,
        Service: row.Service || "",
        SessionVersion: row.SessionVersion || 0,
        DateModification: row.DateModification ? new Date(row.DateModification).toISOString() : null,
        DateCreation: row.DateCreation ? new Date(row.DateCreation).toISOString() : new Date().toISOString()
      }));
    }

    // 5. Fournisseurs
    const rFourn = await pool.request().query("SELECT * FROM dbo.Fournisseurs");
    db.fournisseurs = rFourn.recordset.map(row => ({
      Id: row.Id,
      NomFournisseur: row.NomFournisseur,
      Contact: row.Contact || "",
      Telephone: row.Telephone || "",
      TypeFournisseur: row.TypeFournisseur,
      DateCreation: row.DateCreation ? new Date(row.DateCreation).toISOString() : new Date().toISOString()
    }));

    // 6. Commandes
    const rCmd = await pool.request().query("SELECT * FROM dbo.Commandes");
    db.commandes = rCmd.recordset.map(row => ({
      Id: row.Id,
      NoBonCommande: row.NoBonCommande,
      NoDS: row.NoDS || "",
      ReferenceSage: row.ReferenceSage || "",
      NumeroSysteme: row.NumeroSysteme || "",
      CreeParId: row.CreeParId || "",
      Designation: row.Designation || "",
      Quantite: row.Quantite || 1,
      Prix: row.Prix !== null ? parseFloat(row.Prix) : null,
      Fournisseur: row.Fournisseur || "",
      Agence: row.Agence || "",
      DateLivraison: row.DateLivraison ? new Date(row.DateLivraison).toISOString() : null,
      Statut: row.Statut,
      DateEmission: row.DateEmission ? new Date(row.DateEmission).toISOString() : new Date().toISOString(),
      EstArchive: row.EstArchive === true || row.EstArchive === 1,
      DateArchivage: row.DateArchivage ? new Date(row.DateArchivage).toISOString() : null,
      Observation: row.Observation || "",
      DemandePar: row.DemandePar || "",
      CreePar: row.CreePar || row.DemandePar || "",
      ServiceDemande: row.ServiceDemande || "",
      DateCreation: row.DateCreation ? new Date(row.DateCreation).toISOString() : new Date().toISOString(),
      DateModification: row.DateModification ? new Date(row.DateModification).toISOString() : null,
      ModifiePar: row.ModifiePar || ""
    }));

    // 7. HistoriqueStatuts
    const rHist = await pool.request().query("SELECT * FROM dbo.HistoriqueStatuts");
    db.historiqueStatuts = rHist.recordset.map(row => ({
      Id: row.Id,
      CommandeId: row.CommandeId,
      AncienStatut: row.AncienStatut,
      NouveauStatut: row.NouveauStatut,
      DateModification: row.DateModification ? new Date(row.DateModification).toISOString() : new Date().toISOString(),
      ModifiePar: row.ModifiePar
    }));

    // 8. Logs
    const rLogs = await pool.request().query("SELECT TOP 1000 * FROM dbo.Logs ORDER BY DateAction DESC");
    db.logs = rLogs.recordset.map(row => ({
      Id: row.Id,
      Action: row.Action,
      Utilisateur: row.Utilisateur,
      DateAction: row.DateAction ? new Date(row.DateAction).toISOString() : new Date().toISOString(),
      Details: row.Details || ""
    }));

    // 9. Notifications
    const rNotifs = await pool.request().query("SELECT * FROM dbo.Notifications");
    db.notifications = rNotifs.recordset.map(row => ({
      Id: row.Id,
      CommandeId: row.CommandeId || null,
      NoBonCommande: row.NoBonCommande || "",
      Designation: row.Designation || "",
      AncienStatut: row.AncienStatut || "",
      NouveauStatut: row.NouveauStatut || "",
      ModifiePar: row.ModifiePar || "",
      Agence: row.Agence || "",
      Date: row.Date ? new Date(row.Date).toISOString() : new Date().toISOString(),
      Lue: row.Lue === true || row.Lue === 1,
      LuePar: row.LuePar ? JSON.parse(row.LuePar) : [],
      MasqueePar: row.MasqueePar ? JSON.parse(row.MasqueePar) : [],
      ServiceDemande: row.ServiceDemande || "",
      CreeParId: row.CreeParId || "",
      CreePar: row.CreePar || ""
    }));

    memoryDb = db;
    const prestations = await pool.request().query('SELECT * FROM dbo.Prestations');
    db.prestations = prestations.recordset.map(row => ({ ...row, EstArchive: !!row.EstArchive,
      DateEmission: new Date(row.DateEmission).toISOString(), DateCreation: new Date(row.DateCreation).toISOString(),
      DateModification: new Date(row.DateModification || row.DateEmission).toISOString(),
      DateArchivage: row.DateArchivage ? new Date(row.DateArchivage).toISOString() : null }));
    const prestationHistory = await pool.request().query('SELECT * FROM dbo.HistoriquePrestations');
    db.historiquePrestations = prestationHistory.recordset.map(row => ({ ...row, DateModification: new Date(row.DateModification).toISOString() }));
    mssqlInitialized = true;
    console.log("SQL Server : Cache chargé avec succès ! (Taille Utilisateurs: " + db.utilisateurs.length + ", Commandes: " + db.commandes.length + ")");
  } catch (err) {
    console.error("SQL Server : Erreur critique durant le chargement initial des données:", err.message);
    throw err;
  }
}

// --- Local File Database Logic (Used during direct fallback only) ---
function ensureDb() {
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }

  if (!fs.existsSync(DB_FILE)) {
    const initialDb = createDefaultStructure();
    fs.writeFileSync(DB_FILE, JSON.stringify(initialDb, null, 2), "utf-8");
  }
}

// --- Read Engine ---
export function readDb() {
  const context = dbContext.getStore();
  if (context) return context.data;
  // If SQL Server is configured, always read the virtual in-memory copy
  if (process.env.DB_MSSQL_SERVER) {
    if (!mssqlInitialized || !memoryDb) throw Object.assign(new Error('Base SQL indisponible'), { status: 503 });
    return memoryDb;
  }

  ensureDb();
  
  // Return cached or read local copy
  try {
    const raw = fs.readFileSync(DB_FILE, "utf-8");
    const db = JSON.parse(raw);
    if (!db || !['utilisateurs', 'commandes', 'historiqueStatuts', 'fournisseurs', 'logs'].every(key => Array.isArray(db[key]))) throw new Error('Structure JSON invalide');
    db.notifications ||= [];
    db.prestations ||= [];
    db.historiquePrestations ||= [];
    db.commandeFournisseurs ||= [];
    
    // Ensure db.services exists
    if (!db.services) {
      if (db.agences && db.agences.length > 0 && db.agences.includes("RH")) {
        db.services = [...db.agences];
      } else {
        db.services = [...DEFAULT_AGENCIES];
      }
    }
    
    // Ensure db.agences is a separate list of physical agencies
    if (!db.agences || (db.agences.includes("RH") && db.agences.includes("Comptabilité"))) {
      db.agences = [...DEFAULT_PHYSICAL_AGENCIES];
    }

    return db;
  } catch (err) {
    throw Object.assign(new Error('Base JSON illisible; fichier conservé'), { status: 503, cause: err });
  }
}

export function writeDb(data) {
  const context = dbContext.getStore();
  if (!context) throw new Error('Écriture hors transaction interdite');
  context.data = data;
  context.dirty = true;
  return true;
}

export async function commitDb(data, previous) {
  if (process.env.DB_MSSQL_SERVER) {
    if (!mssqlInitialized || !memoryDb) throw Object.assign(new Error('Base SQL indisponible'), { status: 503 });
    await saveSql(sql, await getMssqlPool(), previous, data);
    memoryDb = structuredClone(data);
  } else {
    ensureDb();
    const temporary = DB_FILE + '.tmp';
    fs.writeFileSync(temporary, JSON.stringify(data, null, 2), 'utf8');
    if (fs.existsSync(DB_FILE)) fs.copyFileSync(DB_FILE, DB_FILE + '.bak');
    fs.renameSync(temporary, DB_FILE);
  }
}

export function databaseWork(work) {
  return serialized(async () => {
    const previous = structuredClone(readDb());
    const context = { data: structuredClone(previous), dirty: false, callbacks: [] };
    const result = await dbContext.run(context, work);
    if (context.dirty) await commitDb(context.data, previous);
    for (const callback of context.callbacks) callback();
    return result;
  });
}

export function logAction(utilisateur, action, details) {
  const db = readDb();
  db.logs = [{ Id: `log-${randomBytes(16).toString('hex')}`, Action: action, Utilisateur: utilisateur, DateAction: new Date().toISOString(), Details: details }, ...(db.logs || [])].slice(0, 1000);
  writeDb(db);
}

export function runAutoArchive() {
  const db = readDb();
  if (!db.archiveConfig?.enableAutoArchive) return;
  const threshold = Date.now() - db.archiveConfig.autoArchiveDays * 86400000;
  let count = 0;
  for (const order of db.commandes) {
    if (order.EstArchive || order.Statut !== 'Livré') continue;
    const delivered = db.historiqueStatuts.filter(event => event.CommandeId === order.Id && event.NouveauStatut === 'Livré').sort((a, b) => b.DateModification.localeCompare(a.DateModification))[0];
    const deliveredAt = new Date(delivered?.DateModification || order.DateEmission).getTime();
    if (!Number.isFinite(deliveredAt) || deliveredAt >= threshold) continue;
    const now = new Date().toISOString();
    order.EstArchive = true; order.DateArchivage = now; order.DateModification = now; order.ModifiePar = 'Système';
    db.historiqueStatuts.push({ Id: `h-${randomBytes(16).toString('hex')}`, CommandeId: order.Id, AncienStatut: order.Statut, NouveauStatut: 'Livré (Archivé)', DateModification: now, ModifiePar: 'Système' });
    count++;
  }
  if (count) { writeDb(db); logAction('Système', 'Archivage Automatique', `${count} articles archivés`); }
}

export { DEFAULT_AGENCIES };
