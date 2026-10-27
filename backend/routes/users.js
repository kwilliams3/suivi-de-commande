import express from "express";
import bcrypt from "bcryptjs";
import { readDb, writeDb, logAction } from "../models/db.js";
import { authenticator, adminOnly } from "./auth.js";

const router = express.Router();

// GET /api/users
router.get("/", authenticator, adminOnly, (req, res) => {
  const db = readDb();
  const safeUsers = db.utilisateurs
    .map(({ MotDePasse, ...rest }) => rest)
    .sort((a, b) => {
      const bDate = new Date(b.DateModification || b.DateCreation).getTime();
      const aDate = new Date(a.DateModification || a.DateCreation).getTime();
      return bDate - aDate;
    });
  res.json(safeUsers);
});

// POST /api/users
router.post("/", authenticator, adminOnly, (req, res) => {
  const { Nom, Prenom, Email, NomUtilisateur, MotDePasse, Role, Service } = req.body;

  if ([Nom, Prenom, NomUtilisateur, MotDePasse, Role].some(value => typeof value !== 'string' || !value.trim())) {
    return res.status(400).json({ error: "Tous les champs obligatoires (Nom, Prénom, Identifiant, Mot de passe, Rôle) doivent être remplis" });
  }

  if ((Email !== undefined && typeof Email !== 'string') || (Service !== undefined && typeof Service !== 'string')) return res.status(400).json({ error: 'Champ invalide' });
  const db = readDb();
  if (!['Administrateur', 'Utilisateur'].includes(Role)) return res.status(400).json({ error: 'Rôle invalide' });
  if (Role === 'Utilisateur' && !(db.services || []).includes(Service)) return res.status(400).json({ error: 'Service requis' });
  const exists = db.utilisateurs.some(
    (u) => u.NomUtilisateur.toLowerCase() === NomUtilisateur.trim().toLowerCase()
  );

  if (exists) {
    return res.status(400).json({ error: "Ce nom d'utilisateur est déjà pris" });
  }

  if (typeof MotDePasse !== 'string' || MotDePasse.length < 1 || MotDePasse.length > 256) return res.status(400).json({ error: 'Mot de passe requis (256 caractères maximum)' });
  const hash = bcrypt.hashSync(MotDePasse, 10);
  const finalRole = Role === "Administrateur" ? "Administrateur" : "Utilisateur";
  const newUser = {
    Id: `u-${Date.now()}`,
    Nom: Nom.trim(),
    Prenom: Prenom.trim(),
    Email: Email ? Email.trim() : "",
    NomUtilisateur: NomUtilisateur.trim().toLowerCase(),
    MotDePasse: hash,
    Role: finalRole,
    Service: finalRole === "Administrateur" ? "" : (Service ? Service.trim() : ""),
    Statut: "Actif",
    DateCreation: new Date().toISOString()
  };

  db.utilisateurs.push(newUser);
  writeDb(db);

  logAction(req.user.username, "Création utilisateur", `Création du compte utilisateur ${newUser.NomUtilisateur} (${newUser.Role}) - Service: ${newUser.Service}`);

  const { MotDePasse: _, ...safeUser } = newUser;
  res.status(201).json(safeUser);
});

// PUT /api/users/:id
router.put("/:id", authenticator, adminOnly, (req, res) => {
  const { Nom, Prenom, Email, Role, Statut, Service } = req.body;
  const { id } = req.params;
  for (const value of [Nom, Prenom, Email, Service]) if (value !== undefined && typeof value !== 'string') return res.status(400).json({ error: 'Champ utilisateur invalide' });
  if (Role !== undefined && !['Administrateur', 'Utilisateur'].includes(Role)) return res.status(400).json({ error: 'Rôle invalide' });
  if (Statut !== undefined && !['Actif', 'Desactive'].includes(Statut)) return res.status(400).json({ error: 'Statut invalide' });
  if (id === req.user.userId && Role && Role !== 'Administrateur') return res.status(400).json({ error: 'Vous ne pouvez pas retirer vos propres droits administrateur' });
  const db = readDb();
  const index = db.utilisateurs.findIndex((u) => u.Id === id);

  if (index === -1) {
    return res.status(404).json({ error: "Utilisateur non trouvé" });
  }

  // Prevent disabling yourself
  if (id === req.user?.userId && Statut === "Desactive") {
    return res.status(400).json({ error: "Vous ne pouvez pas désactiver votre propre compte" });
  }

  const user = db.utilisateurs[index];
  if ((Role || user.Role) === 'Utilisateur' && !(db.services || []).includes(Service ?? user.Service)) return res.status(400).json({ error: 'Service requis' });
  const oldRole = user.Role;
  const oldStatut = user.Statut;

  user.Nom = Nom ? Nom.trim() : user.Nom;
  user.Prenom = Prenom ? Prenom.trim() : user.Prenom;
  user.Email = Email !== undefined ? Email.trim() : user.Email;
  user.Role = Role || user.Role;
  user.Statut = Statut || user.Statut;
  
  if (user.Role === "Administrateur") {
    user.Service = "";
  } else {
    user.Service = Service !== undefined ? Service.trim() : (user.Service || "");
  }

  user.SessionVersion = (user.SessionVersion || 0) + 1;
  user.DateModification = new Date().toISOString();
  db.utilisateurs[index] = user;
  writeDb(db);

  logAction(
    req.user.username,
    "Modification utilisateur",
    `Mise à jour de l'utilisateur ${user.NomUtilisateur}. Rôle: ${oldRole}->${user.Role}, Statut: ${oldStatut}->${user.Statut}`
  );

  const { MotDePasse, ...safeUser } = user;
  res.json(safeUser);
});

// POST /api/users/change-password (self-service : l'utilisateur change son propre mot de passe)
router.post("/change-password", authenticator, (req, res) => {
  const { oldPassword, newPassword } = req.body;

  if (typeof oldPassword !== 'string' || typeof newPassword !== 'string' || !oldPassword || !newPassword) {
    return res.status(400).json({ error: "Veuillez renseigner votre mot de passe actuel et le nouveau mot de passe" });
  }

  if (newPassword.length < 1 || newPassword.length > 256) {
    return res.status(400).json({ error: "Le nouveau mot de passe est requis (256 caractères maximum)" });
  }

  const db = readDb();
  const index = db.utilisateurs.findIndex((u) => u.Id === req.user?.userId);

  if (index === -1) {
    return res.status(404).json({ error: "Utilisateur introuvable" });
  }

  const user = db.utilisateurs[index];
  const isOldPasswordValid = bcrypt.compareSync(oldPassword, user.MotDePasse);

  if (!isOldPasswordValid) {
    return res.status(401).json({ error: "Le mot de passe actuel est incorrect" });
  }

  user.MotDePasse = bcrypt.hashSync(newPassword, 10);
  user.SessionVersion = (user.SessionVersion || 0) + 1;
  user.DateModification = new Date().toISOString();
  writeDb(db);

  logAction(req.user.username, "Changement mot de passe", `L'utilisateur ${user.NomUtilisateur} a changé son propre mot de passe`);

  res.json({ success: true, message: "Mot de passe mis à jour avec succès" });
});

// POST /api/users/:id/reset-password
router.post("/:id/reset-password", authenticator, adminOnly, (req, res) => {
  const { id } = req.params;
  const { NouveauMotDePasse } = req.body;

  if (typeof NouveauMotDePasse !== 'string' || NouveauMotDePasse.length < 1 || NouveauMotDePasse.length > 256) {
    return res.status(400).json({ error: "Veuillez insérer un mot de passe valide" });
  }

  const db = readDb();
  const index = db.utilisateurs.findIndex((u) => u.Id === id);

  if (index === -1) {
    return res.status(404).json({ error: "Utilisateur non trouvé" });
  }

  const hash = bcrypt.hashSync(NouveauMotDePasse, 10);
  db.utilisateurs[index].SessionVersion = (db.utilisateurs[index].SessionVersion || 0) + 1;
  db.utilisateurs[index].MotDePasse = hash;
  db.utilisateurs[index].DateModification = new Date().toISOString();
  writeDb(db);

  logAction(
    req.user.username,
    "Réinitialisation mot de passe",
    `Réinitialisation du mot de passe de l'utilisateur ${db.utilisateurs[index].NomUtilisateur}`
  );

  res.json({ success: true, message: "Mot de passe réinitialisé avec succès" });
});

// DELETE /api/users/:id
router.delete("/:id", authenticator, adminOnly, (req, res) => {
  const { id } = req.params;

  if (id === req.user?.userId) {
    return res.status(400).json({ error: "Vous ne pouvez pas supprimer votre propre compte utilisateur." });
  }

  if (id === "u-admin") {
    return res.status(400).json({ error: "Le compte administrateur racine (u-admin) ne peut pas être supprimé." });
  }

  const db = readDb();
  const userToDelete = db.utilisateurs.find((u) => u.Id === id);

  if (!userToDelete) {
    return res.status(404).json({ error: "Utilisateur non trouvé." });
  }

  db.utilisateurs = db.utilisateurs.filter((u) => u.Id !== id);
  writeDb(db);

  logAction(
    req.user?.NomUtilisateur || req.user?.username || "admin",
    "Suppression utilisateur",
    `Suppression définitive du compte utilisateur '${userToDelete.NomUtilisateur}' (${userToDelete.Role})`
  );

  res.json({ success: true, message: "Utilisateur supprimé avec succès." });
});

export default router;
