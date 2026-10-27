import express from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { randomBytes } from 'node:crypto';
import { readDb, logAction } from "../models/db.js";

const router = express.Router();
const legacyHashes = new Map();
const usesLegacyPassword = user => {
  if (!user.MotDePasse) return false;
  if (!legacyHashes.has(user.MotDePasse)) legacyHashes.set(user.MotDePasse, bcrypt.compareSync('admin123', user.MotDePasse));
  return legacyHashes.get(user.MotDePasse);
};
if (process.env.NODE_ENV === 'production' && (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)) {
  throw new Error('JWT_SECRET doit contenir au moins 32 caractères en production');
}
export const JWT_SECRET = process.env.JWT_SECRET || randomBytes(48).toString('hex');

// Auth Middleware
export function authenticator(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Authentification requise" });
  }

  const token = authHeader.slice(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = readDb().utilisateurs.find(user => user.Id === decoded.userId);
    if (!user || user.Statut !== 'Actif' || (decoded.sessionVersion || 0) !== (user.SessionVersion || 0)) {
      return res.status(401).json({ error: 'Session révoquée ou compte désactivé' });
    }
    req.user = { userId: user.Id, username: user.NomUtilisateur, role: user.Role, service: user.Service || '', fullName: `${user.Prenom} ${user.Nom}`, tokenExpires: decoded.exp };
    if (usesLegacyPassword(user) && !['/me', '/change-password'].includes(req.path)) return res.status(403).json({ error: 'Changez le mot de passe initial dans les paramètres avant de continuer' });
    next();
  } catch (err) {
    if (err.status === 503) return res.status(503).json({ error: 'Base de données indisponible' });
    return res.status(401).json({ error: "Session expirée ou jeton invalide" });
  }
}

// Admin only middleware
export function adminOnly(req, res, next) {
  if (!req.user || req.user.role !== "Administrateur") {
    return res.status(403).json({ error: "Accès refusé. Rôle Administrateur requis" });
  }
  next();
}

// POST /api/auth/login
const attempts = new Map();
router.post("/login", (req, res) => {
  const key = req.ip;
  const now = Date.now();
  for (const [ip, attempt] of attempts) if (attempt.until < now) attempts.delete(ip);
  const attempt = attempts.get(key) || { count: 0, until: now + 15 * 60 * 1000 };
  if (attempt.count >= 30) return res.status(429).json({ error: 'Trop de tentatives. Réessayez plus tard.' });
  attempt.count++;
  attempts.set(key, attempt);
  const { username, password } = req.body;

  if (typeof username !== 'string' || typeof password !== 'string' || !username.trim() || !password || password.length > 256) {
    return res.status(400).json({ error: "Veuillez fournir un nom d'utilisateur et un mot de passe" });
  }

  const db = readDb();
  const user = db.utilisateurs.find(
    (u) => u.NomUtilisateur.toLowerCase() === username.trim().toLowerCase()
  );

  if (!user) {
    return res.status(401).json({ error: "Identifiants incorrects" });
  }

  if (user.Statut === "Desactive") {
    return res.status(403).json({ error: "Votre compte est désactivé. Veuillez contacter un administrateur." });
  }

  const isPasswordValid = bcrypt.compareSync(password, user.MotDePasse);
  if (!isPasswordValid) {
    return res.status(401).json({ error: "Identifiants incorrects" });
  }

  const token = jwt.sign(
    {
      userId: user.Id,
      username: user.NomUtilisateur,
      role: user.Role,
      fullName: `${user.Prenom} ${user.Nom}`,
      service: user.Service || "",
      mustChangePassword: usesLegacyPassword(user),
      sessionVersion: user.SessionVersion || 0,
    },
    JWT_SECRET,
    { expiresIn: "8h" }
  );
  attempts.delete(key);

  logAction(user.NomUtilisateur, "Connexion", `Utilisateur connecté avec succès (Rôle: ${user.Role}, Service: ${user.Service || "Aucun"})`);

  res.json({
    token,
    user: {
      id: user.Id,
      username: user.NomUtilisateur,
      role: user.Role,
      nom: user.Nom,
      prenom: user.Prenom,
      email: user.Email,
      service: user.Service || "",
      mustChangePassword: usesLegacyPassword(user),
    },
  });
});

// GET /api/auth/me
router.get("/me", authenticator, (req, res) => {
  const db = readDb();
  const userObj = db.utilisateurs.find((u) => u.Id === req.user?.userId);

  if (!userObj || userObj.Statut === "Desactive") {
    return res.status(404).json({ error: "Utilisateur introuvable ou désactivé" });
  }

  res.json({
    id: userObj.Id,
    username: userObj.NomUtilisateur,
    role: userObj.Role,
    nom: userObj.Nom,
    prenom: userObj.Prenom,
    email: userObj.Email,
    service: userObj.Service || "",
    mustChangePassword: usesLegacyPassword(userObj),
  });
});

export default router;
