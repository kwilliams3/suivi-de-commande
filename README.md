# Gestion d'approvisionnement

## Installation et démarrage

Node.js 22.18 ou supérieur (Node 24 recommandé pour les tests TypeScript natifs).

```powershell
npm install
npm install --prefix backend
npm install --prefix frontend
npm run dev
```

L'API écoute sur le port 3003 par défaut. Le frontend Vite utilise le proxy `/api/appro`. En production :

```powershell
npm run build
npm start
```

Le backend charge toujours le fichier `.env` à la racine du projet et utilise le dossier `data` à la racine en mode JSON, quel que soit le répertoire de lancement.

## Configuration

- `JWT_SECRET` : secret aléatoire d'au moins 32 caractères, obligatoire en production. Le secret local a été sécurisé pendant les corrections; les anciennes sessions doivent se reconnecter.
- `INITIAL_ADMIN_PASSWORD` : mot de passe pour une première installation. S'il n'est pas fourni, un mot de passe temporaire aléatoire est généré et affiché uniquement lors de l'initialisation du compte.
- `DB_MSSQL_SERVER`, `DB_MSSQL_USER`, `DB_MSSQL_PASSWORD`, `DB_MSSQL_DATABASE`, `DB_MSSQL_PORT` : configuration SQL.
- `PORT` : port du backend; par défaut 3003.
- `SERVE_FRONTEND=false` : désactive le frontend intégré au backend en développement lorsque Vite est lancé séparément.

Un compte utilisant encore l'ancien mot de passe initial doit le changer dans les paramètres. Un changement de mot de passe révoque les anciennes sessions et impose une reconnexion. Les nouveaux mots de passe contiennent au moins 12 caractères.

## Persistance et migrations

SQL : les migrations de colonnes sont non destructives et s'appliquent avant le chargement des données. `npm run migrate` permet de les lancer séparément. Les opérations sont sérialisées dans ce processus et chaque modification utilise une transaction SQL confirmée avant la réponse de succès. Une panne SQL bloque le démarrage ou l'opération; elle ne crée pas une base JSON de remplacement.

Le cache SQL suppose **une seule instance de l'application et aucune modification SQL externe pendant son exécution**. Pour un déploiement avec plusieurs instances ou des écritures externes, remplacer le cache par des lectures SQL directes et un contrôle de concurrence en base.

JSON : écritures par fichier temporaire puis remplacement, avec conservation de la version précédente dans `database.json.bak`. Un fichier illisible est conservé et provoque une erreur, sans réinitialisation automatique. Prévoir des sauvegardes régulières indépendantes.

Le fichier `frontend/schema_sqlserver2014.sql` est réservé à une installation vierge et refuse désormais de s'exécuter sur des tables existantes. Ne pas l'utiliser comme migration.
Il ne crée plus de comptes de démonstration avec des mots de passe connus. Après une installation manuelle par ce script, fournir `INITIAL_ADMIN_PASSWORD` pour initialiser le premier compte au démarrage.

## Règles des commandes

- « Livré » nécessite une référence Sage et reste distinct de « Terminé ».
- « Terminé » nécessite les droits administrateur et une observation; il archive l'article.
- Les commandes livrées peuvent être archivées automatiquement après le délai configuré.
- Restaurer un article « Terminé » le remet « En cours ».
- Un numéro de bon identifie un bon unique. Une création avec un numéro existant est refusée; ajouter ses articles depuis la modification du bon.
- « Commandes Actives » compte les bons contenant au moins un article non archivé. Un bon entièrement archivé est exclu.
- Les catégories de statuts peuvent se chevaucher lorsqu'un bon contient plusieurs statuts. Les distributions globales incluent les archives.
- Le montant total est la somme des quantités multipliées par les prix unitaires.
- Les statistiques du mois utilisent les créations et les événements d'historique, attribués à leur auteur. Les anciennes dates de modification faussées par les anciennes synchronisations ne sont pas utilisées.
- Les opérations de groupe sont atomiques. Les exports portent sur tous les résultats filtrés, avec tous les fournisseurs, services, références et échéances du groupe.

## Commande Prestation

Le menu « Commande Prestation » gère séparément les prestations : N° Bon commande, N° DS, désignation, service, statut, motif et fournisseur. Les statuts sont « Effectué », « Non effectué » et « Terminé ». Les types de fournisseur sont Achat Local, Achat Import, Agence et Secretariat DG. Les bons regroupent plusieurs prestations et proposent recherche, filtre par statut, historique, archives et exports CSV/PDF.

La clôture « Terminé » est réservée à l'administrateur, exige un motif et archive la prestation. La restauration remet une prestation terminée au statut « Non effectué ». Les utilisateurs consultent les prestations de leur service ou celles qu'ils ont créées et modifient leurs propres prestations actives. Les statistiques des commandes de marchandises restent distinctes.

Les tables SQL `Prestations` et `HistoriquePrestations` sont créées par la migration non destructive au prochain démarrage du backend. Les bases JSON existantes prennent en charge les nouvelles collections sans réinitialisation.

## Vérification des changements

```powershell
npm test
npm run lint
npm run build
```

Les tests couvrent les accès entre services, les sessions révoquées, les lots annulés, les erreurs de commit, les mappings SQL, les statistiques, les filtres, les prix, les cellules CSV et la génération PDF. Les tests SQL utilisent un pilote simulé; valider aussi les migrations et les sauvegardes sur une copie de la base SQL avant déploiement.

L'audit npm du frontend ne signale plus de vulnérabilités au moment des corrections. Le backend conserve une alerte modérée dans `sprintf-js`, remontée aussi via `tedious` et `mssql`, sans correctif disponible proposé par npm. Les appels examinés dans le pilote utilisent des formats constants. Ne pas rétrograder automatiquement le pilote SQL pour faire disparaître cette alerte.
