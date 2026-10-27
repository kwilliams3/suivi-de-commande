export async function migrateColumns(pool) {
  await pool.request().query(`
    IF OBJECT_ID('dbo.Prestations', 'U') IS NULL
    CREATE TABLE dbo.Prestations (
      Id NVARCHAR(50) NOT NULL PRIMARY KEY, NoBonCommande NVARCHAR(100) NOT NULL, NoDS NVARCHAR(100) NULL,
      Designation NVARCHAR(MAX) NOT NULL, Agence NVARCHAR(100) NOT NULL, Statut NVARCHAR(50) NOT NULL,
      Motif NVARCHAR(MAX) NULL, FournisseurType NVARCHAR(50) NOT NULL, FournisseurAgence NVARCHAR(100) NULL, Fournisseur NVARCHAR(150) NULL,
      CreeParId NVARCHAR(50) NULL, CreePar NVARCHAR(100) NULL, ServiceDemande NVARCHAR(100) NULL,
      DateEmission DATETIME NOT NULL, DateCreation DATETIME NOT NULL, DateModification DATETIME NULL, ModifiePar NVARCHAR(100) NULL,
      EstArchive BIT NOT NULL DEFAULT (0), DateArchivage DATETIME NULL
    );
    IF OBJECT_ID('dbo.HistoriquePrestations', 'U') IS NULL
    CREATE TABLE dbo.HistoriquePrestations (
      Id NVARCHAR(50) NOT NULL PRIMARY KEY, PrestationId NVARCHAR(50) NOT NULL,
      AncienStatut NVARCHAR(50) NULL, NouveauStatut NVARCHAR(100) NOT NULL, Motif NVARCHAR(MAX) NULL,
      DateModification DATETIME NOT NULL, ModifiePar NVARCHAR(100) NULL,
      CONSTRAINT FK_HistoriquePrestations FOREIGN KEY (PrestationId) REFERENCES dbo.Prestations(Id) ON DELETE CASCADE
    );
  `);
  const columns = {
    Commandes: { ReferenceSage: 'NVARCHAR(200) NULL', NumeroSysteme: 'NVARCHAR(20) NULL', CreeParId: 'NVARCHAR(50) NULL', CreePar: 'NVARCHAR(100) NULL' },
    Utilisateurs: { SessionVersion: 'INT NOT NULL DEFAULT (0)', DateModification: 'DATETIME NULL' },
    Notifications: { LuePar: 'NVARCHAR(MAX) NULL', MasqueePar: 'NVARCHAR(MAX) NULL', ServiceDemande: 'NVARCHAR(150) NULL', CreeParId: 'NVARCHAR(50) NULL', CreePar: 'NVARCHAR(100) NULL' },
  };
  for (const [table, fields] of Object.entries(columns)) for (const [column, definition] of Object.entries(fields)) {
    await pool.request().query(`IF COL_LENGTH('dbo.${table}', '${column}') IS NULL ALTER TABLE dbo.[${table}] ADD [${column}] ${definition};`);
  }
}
