export function changedRows(previous = [], next = [], key = 'Id') {
  const old = new Map(previous.map(row => [row[key], row]));
  return next.filter(row => JSON.stringify(row) !== JSON.stringify(old.get(row[key])));
}

export function removedRows(previous = [], next = [], key = 'Id') {
  const ids = new Set(next.map(row => row[key]));
  return previous.filter(row => !ids.has(row[key]));
}

export async function saveSql(sql, pool, previous, next) {
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  const maps = {
    Utilisateurs: ['utilisateurs', ['Id','Nom','Prenom','Email','NomUtilisateur','MotDePasse','Role','Statut','Service','DateCreation','DateModification','SessionVersion']],
    Fournisseurs: ['fournisseurs', ['Id','NomFournisseur','TypeFournisseur','Contact','Telephone','DateCreation']],
    Commandes: ['commandes', ['Id','NoBonCommande','NoDS','Designation','Quantite','Prix','ReferenceSage','NumeroSysteme','CreeParId','CreePar','Fournisseur','Agence','DateLivraison','Statut','DateEmission','EstArchive','DateArchivage','Observation','DemandePar','ServiceDemande','DateCreation','DateModification','ModifiePar']],
    Prestations: ['prestations', ['Id','NoBonCommande','NoDS','Designation','Agence','Statut','Motif','FournisseurType','FournisseurAgence','Fournisseur','CreeParId','CreePar','ServiceDemande','DateEmission','DateCreation','DateModification','ModifiePar','EstArchive','DateArchivage']],
    HistoriquePrestations: ['historiquePrestations', ['Id','PrestationId','AncienStatut','NouveauStatut','Motif','DateModification','ModifiePar']],
    HistoriqueStatuts: ['historiqueStatuts', ['Id','CommandeId','AncienStatut','NouveauStatut','DateModification','ModifiePar']],
    Notifications: ['notifications', ['Id','CommandeId','NoBonCommande','Designation','AncienStatut','NouveauStatut','ModifiePar','Agence','Date','Lue','LuePar','MasqueePar','ServiceDemande','CreeParId','CreePar']],
    Logs: ['logs', ['Id','Action','Utilisateur','DateAction','Details']],
  };
  try {
    // Delete only rows explicitly removed by this operation, children first.
    for (const table of ['Notifications','HistoriqueStatuts','HistoriquePrestations','Prestations','Commandes','Fournisseurs','Utilisateurs','Logs']) {
      const [key] = maps[table];
      for (const row of removedRows(previous[key], next[key])) {
        await new sql.Request(transaction).input('id', sql.NVarChar, row.Id).query(`DELETE FROM dbo.[${table}] WHERE Id = @id`);
      }
    }
    for (const [table, [key, columns]] of Object.entries(maps)) {
      for (const row of changedRows(previous[key], next[key])) {
        const request = new sql.Request(transaction);
        columns.forEach((column, index) => {
          let value = row[column] ?? null;
          let type = sql.NVarChar(sql.MAX);
          if (column.startsWith('Date') || column === 'Date') { type = sql.DateTime; value = value ? new Date(value) : null; }
          if (column === 'Quantite' || column === 'SessionVersion') { type = sql.Int; value = value ?? (column === 'Quantite' ? 1 : 0); }
          if (column === 'Prix') type = sql.Decimal(18, 2);
          if (column === 'EstArchive' || column === 'Lue') { type = sql.Bit; value = !!value; }
          if (column === 'LuePar' || column === 'MasqueePar') value = JSON.stringify(row[column] || []);
          if (column === 'DemandePar') value = row.CreePar || row.DemandePar || null;
          if (table === 'Commandes' && column === 'CreePar') value = row.CreePar || row.DemandePar || '';
          if (column === 'DateCreation') value = value || new Date(row.DateEmission || Date.now());
          request.input(`p${index}`, type, value);
        });
        const assignments = columns.slice(1).map((column, index) => `[${column}] = @p${index + 1}`).join(', ');
        await request.query(`IF EXISTS (SELECT 1 FROM dbo.[${table}] WHERE Id = @p0)
          UPDATE dbo.[${table}] SET ${assignments} WHERE Id = @p0;
          ELSE INSERT INTO dbo.[${table}] (${columns.map(column => `[${column}]`).join(',')}) VALUES (${columns.map((_, index) => `@p${index}`).join(',')});`);
      }
    }
    for (const [key, table] of [['services','Services'], ['agences','Agences']]) {
      const old = new Set(previous[key] || []), current = new Set(next[key] || []);
      for (const name of old) if (!current.has(name)) await new sql.Request(transaction).input('name', sql.NVarChar, name).query(`DELETE FROM dbo.[${table}] WHERE Nom = @name`);
      for (const name of current) if (!old.has(name)) await new sql.Request(transaction).input('name', sql.NVarChar, name).query(`IF NOT EXISTS (SELECT 1 FROM dbo.[${table}] WHERE Nom = @name) INSERT INTO dbo.[${table}] (Nom) VALUES (@name)`);
    }
    if (JSON.stringify(previous.archiveConfig) !== JSON.stringify(next.archiveConfig)) {
      await new sql.Request(transaction).input('days', sql.Int, next.archiveConfig.autoArchiveDays).input('enabled', sql.Bit, next.archiveConfig.enableAutoArchive).query('IF EXISTS (SELECT 1 FROM dbo.ArchiveConfig) UPDATE dbo.ArchiveConfig SET AutoArchiveDays=@days, EnableAutoArchive=@enabled; ELSE INSERT INTO dbo.ArchiveConfig (AutoArchiveDays,EnableAutoArchive) VALUES (@days,@enabled);');
    }
    await transaction.commit();
  } catch (error) {
    await transaction.rollback().catch(() => {});
    throw error;
  }
}
