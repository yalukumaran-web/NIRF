import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import {
  createInstitution,
  findUserByEmail,
  getInstitution,
} from "../services/authService";
import { signToken } from "../middlewares/auth";
import { categorySchema } from "../services/validation";

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  institutionName: z.string().min(2),
  category: categorySchema,
});

export async function register(req: Request, res: Response) {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten().fieldErrors });
  }
  const { email, password, institutionName, category } = parsed.data;

  const existing = await findUserByEmail(email);
  if (existing) return res.status(409).json({ error: "Email already registered" });

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await createInstitution(email, passwordHash, institutionName, category);
  const token = signToken({ userId: user.id, email: user.email, role: user.role });
  return res.status(201).json({
    token,
    user: { id: user.id, email: user.email, name: user.institution_name },
  });
}

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export async function login(req: Request, res: Response) {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });
  const { email, password } = parsed.data;

  const user = await findUserByEmail(email);
  if (!user) return res.status(401).json({ error: "Invalid credentials" });

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: "Invalid credentials" });

  const token = signToken({ userId: user.id, email: user.email, role: user.role });
  return res.json({
    token,
    user: { id: user.id, email: user.email, name: user.institution_name },
  });
}

export async function me(req: Request, res: Response) {
  if (!req.user) return res.status(401).json({ error: "Not authenticated" });
  const inst = await getInstitution(req.user.userId);
  return res.json({
    user: { id: req.user.userId, email: req.user.email, role: req.user.role },
    institution: inst,
  });
}

