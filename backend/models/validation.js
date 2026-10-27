export function validateOrder(data, partial = false) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw Object.assign(new Error('Commande invalide'), { status: 400 });
  const fail = message => { throw Object.assign(new Error(message), { status: 400 }); };
  for (const key of ['NoBonCommande', 'Designation', 'Agence', 'Fournisseur', 'Statut', 'DateLivraison']) {
    if ((!partial || data[key] !== undefined) && (typeof data[key] !== 'string' || !data[key].trim())) fail(`Champ invalide : ${key}`);
  }
  for (const key of ['NoDS', 'ReferenceSage', 'Observation']) if (data[key] !== undefined && typeof data[key] !== 'string') fail(`Champ invalide : ${key}`);
  for (const [key, maximum] of Object.entries({ NoBonCommande: 100, NoDS: 100, ReferenceSage: 200, Agence: 100, Fournisseur: 150 })) {
    if (typeof data[key] === 'string' && data[key].length > maximum) fail(`Champ trop long : ${key} (${maximum} caractères maximum)`);
  }
  if (data.Statut !== undefined && !['En cours', 'Livré', 'Non livré', 'Terminé'].includes(data.Statut)) fail('Statut invalide');
  if ((!partial || data.Quantite !== undefined) && (!Number.isSafeInteger(Number(data.Quantite)) || Number(data.Quantite) <= 0)) fail('Quantité entière positive requise');
  if (data.Prix !== undefined && data.Prix !== null && (!Number.isFinite(Number(data.Prix)) || Number(data.Prix) < 0)) fail('Prix positif ou nul requis');
  if (data.DateLivraison !== undefined && Number.isNaN(Date.parse(data.DateLivraison))) fail('Date de livraison invalide');
}

export function validateArchiveConfig(data) {
  if (!Number.isSafeInteger(Number(data.autoArchiveDays)) || Number(data.autoArchiveDays) < 1 || Number(data.autoArchiveDays) > 3650 || typeof data.enableAutoArchive !== 'boolean') {
    throw Object.assign(new Error("Délai d'archivage invalide (1 à 3650 jours)"), { status: 400 });
  }
}
