import dotenv from 'dotenv';
import sql from 'mssql';
import jwt from 'jsonwebtoken';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
dotenv.config({ path: path.join(root, '.env'), quiet: true });
if (!process.env.JWT_SECRET) throw new Error('Secret de session non configuré');
const pool = new sql.ConnectionPool({
  server: process.env.DB_MSSQL_SERVER, user: process.env.DB_MSSQL_USER,
  password: process.env.DB_MSSQL_PASSWORD, database: process.env.DB_MSSQL_DATABASE,
  port: Number(process.env.DB_MSSQL_PORT || 1433),
  options: { encrypt: process.env.DB_MSSQL_ENCRYPT === 'true', trustServerCertificate: process.env.DB_MSSQL_TRUST_CERT === 'true' },
  connectionTimeout: 8000, requestTimeout: 30000,
});

try {
  await pool.connect();
  const accounts = (await pool.request().query("SELECT Id, NomUtilisateur, SessionVersion FROM dbo.Utilisateurs WHERE Role='Administrateur' AND Statut='Actif' ORDER BY CASE WHEN NomUtilisateur='admin' THEN 0 ELSE 1 END")).recordset;
  if (!accounts.length) throw new Error('Aucun administrateur actif');
  const account = accounts[0];
  const token = jwt.sign({ userId: account.Id, sessionVersion: account.SessionVersion || 0 }, process.env.JWT_SECRET, { expiresIn: '30m' });
  const base = `http://127.0.0.1:${Number(process.env.PORT || 3003)}/api/appro`;
  async function request(endpoint, method = 'GET', body) {
    const response = await fetch(base + endpoint, {
      method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(60000),
    });
    if (!response.ok) throw new Error(`API ${endpoint}: ${response.status} ${await response.text()}`);
    return response.json();
  }
  // Use the running application's transactions so its SQL cache stays coherent.
  const active = await request('/orders?archived=false');
  const archived = await request('/orders?archived=true');
  const configuration = await request('/archive/config');
  const sqlBefore = (await pool.request().query('SELECT * FROM dbo.Commandes')).recordset;
  const apiIds = new Set([...active, ...archived].map(order => order.Id));
  if (sqlBefore.length !== apiIds.size || sqlBefore.some(order => !apiIds.has(order.Id))) throw new Error('Le cache API et SQL diffèrent : restauration interrompue');
  const backupDir = path.join(root, 'data', 'recovery');
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(backupDir, `before-restore-${stamp}.json`);
  const history = (await pool.request().query('SELECT * FROM dbo.HistoriqueStatuts')).recordset;
  fs.writeFileSync(backupPath, JSON.stringify({ createdAt: new Date().toISOString(), active, archived, sqlBefore, history, configuration }, null, 2), { flag: 'wx' });
  console.log(JSON.stringify({ backup: path.relative(root, backupPath), archivedArticles: archived.length }));
  if (!archived.length) { console.log('Aucun article à restaurer.'); }
  else {
    await request('/archive/config', 'POST', { ...configuration, enableAutoArchive: false });
    const groups = new Map();
    for (const order of archived) {
      const key = order.NoBonCommande || order.Id;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(order);
    }
    const restored = [];
    const reportPath = path.join(backupDir, `restore-result-${stamp}.json`);
    for (const [number, orders] of groups) {
      await request('/orders/batch', 'POST', { operations: orders.map(order => ({ action: 'restore', id: order.Id })) });
      restored.push({ number, ids: orders.map(order => order.Id) });
      fs.writeFileSync(reportPath, JSON.stringify({ backup: path.basename(backupPath), restored, complete: false }, null, 2));
    }
    const after = (await pool.request().query('SELECT * FROM dbo.Commandes')).recordset;
    const previousById = new Map(sqlBefore.map(order => [order.Id, order]));
    const changed = new Set(archived.map(order => order.Id));
    if (after.length !== sqlBefore.length) throw new Error('Nombre de lignes SQL inattendu après restauration');
    const allowedChanges = new Set(['EstArchive', 'DateArchivage', 'DateModification', 'ModifiePar', 'Statut']);
    for (const order of after) {
      const previous = previousById.get(order.Id);
      if (!previous) throw new Error('Identifiant SQL inattendu');
      for (const key of Object.keys(previous)) {
        if (changed.has(order.Id) && allowedChanges.has(key)) continue;
        if (JSON.stringify(previous[key]) !== JSON.stringify(order[key])) throw new Error(`Champ métier modifié : ${key}, article ${order.Id}`);
      }
      if (changed.has(order.Id) && order.EstArchive) throw new Error('Article toujours archivé');
    }
    const apiAfter = await request('/orders?archived=false');
    const remainingArchives = await request('/orders?archived=true');
    const configAfter = await request('/archive/config');
    if (remainingArchives.length || configAfter.enableAutoArchive) throw new Error('Vérification API de restauration non satisfaite');
    const deletedLog = (await pool.request().query("SELECT DateAction, Details FROM dbo.Logs WHERE Action='Suppression commande'")).recordset;
    const result = { complete: true, backup: path.basename(backupPath), restoredArticles: archived.length, restoredGroups: groups.size, activeArticles: apiAfter.length, activePurchaseOrders: new Set(apiAfter.map(order => order.NoBonCommande)).size, remainingArchives: remainingArchives.length, configuration: configAfter, preservedBusinessFields: true, restored, deletedLog };
    fs.writeFileSync(reportPath, JSON.stringify(result, null, 2));
    console.log(JSON.stringify({ ...result, restored: undefined, deletedLog: undefined, report: path.relative(root, reportPath) }));
  }
} finally { await pool.close(); }
