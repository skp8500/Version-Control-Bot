import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { users } from "@workspace/db/schema";
import { signToken, hashPassword, comparePassword } from "../lib/auth";

const router = Router();

// POST /api/auth/register
router.post("/auth/register", async (req, res) => {
  const { username, email, password } = req.body as {
    username?: string;
    email?: string;
    password?: string;
  };
  if (!username || !email || !password) {
    return res.status(400).json({ error: "username, email, and password required" });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters" });
  }

  try {
    const existing = await db
      .select()
      .from(users)
      .where(eq(users.username, username))
      .limit(1);
    if (existing.length > 0) {
      return res.status(409).json({ error: "Username already taken" });
    }

    const passwordHash = await hashPassword(password);
    const [user] = await db
      .insert(users)
      .values({ username, email, passwordHash })
      .returning();

    const token = signToken({ userId: user.id, username: user.username });
    return res.json({ token, user: { id: user.id, username: user.username, email: user.email } });
  } catch (err) {
    req.log.error({ err }, "Register failed");
    return res.status(500).json({ error: "Registration failed" });
  }
});

// POST /api/auth/login
router.post("/auth/login", async (req, res) => {
  const { username, password } = req.body as {
    username?: string;
    password?: string;
  };
  if (!username || !password) {
    return res.status(400).json({ error: "username and password required" });
  }

  try {
    const rows = await db
      .select()
      .from(users)
      .where(eq(users.username, username))
      .limit(1);
    if (rows.length === 0) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    const user = rows[0];
    const valid = await comparePassword(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = signToken({ userId: user.id, username: user.username });
    return res.json({ token, user: { id: user.id, username: user.username, email: user.email } });
  } catch (err) {
    req.log.error({ err }, "Login failed");
    return res.status(500).json({ error: "Login failed" });
  }
});

// GET /api/auth/me
router.get("/auth/me", async (req, res) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return res.status(401).json({ error: "Not authenticated" });
  const { verifyToken } = await import("../lib/auth");
  const payload = verifyToken(header.slice(7));
  if (!payload) return res.status(401).json({ error: "Invalid token" });

  const rows = await db.select().from(users).where(eq(users.id, payload.userId)).limit(1);
  if (!rows[0]) return res.status(404).json({ error: "User not found" });
  const u = rows[0];
  return res.json({ id: u.id, username: u.username, email: u.email });
});

export default router;
