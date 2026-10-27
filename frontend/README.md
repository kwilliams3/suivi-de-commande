# Frontend

React, Vite et Tailwind. Consulter le [guide principal](../README.md) pour l'installation, la configuration SQL et les règles des commandes.

```powershell
npm install
npm run dev
npm run lint
npm test
npm run build
```

Le proxy de développement transmet `/api/appro` au backend sur `http://localhost:3003`. Le backend doit être démarré séparément, ou utiliser `npm run dev` depuis la racine pour lancer les deux services.

Les vues sont chargées à la demande. TypeScript est configuré en mode strict. Les exports couvrent tous les résultats filtrés, et les notifications authentifiées déclenchent l'actualisation des commandes et des statistiques.
