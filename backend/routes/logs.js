import express from "express";
import { readDb } from "../models/db.js";
import { authenticator, adminOnly } from "./auth.js";

const router = express.Router();

// GET /api/logs
router.get("/", authenticator, adminOnly, (req, res) => {
  const db = readDb();
  res.json(db.logs);
});

export default router;
