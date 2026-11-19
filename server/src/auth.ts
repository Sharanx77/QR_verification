import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "./config.js";
import { supabase } from "./db.js";

export type Organizer = {
  id: string;
  username: string;
  role: "administrator" | "organizer";
  is_active: boolean;
};

export type AuthRequest = Request & { organizer?: Organizer };

export function signOrganizer(organizer: Organizer) {
  return jwt.sign(
    { sub: organizer.id, username: organizer.username, role: organizer.role },
    env.jwtSecret,
    { expiresIn: "8h", issuer: "inauguration-attendance" }
  );
}

export function setAuthCookie(res: Response, token: string) {
  res.cookie("organizer_auth", token, {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: "lax",
    maxAge: 8 * 60 * 60 * 1000
  });
}

export function requireAuth(requiredRole?: "administrator") {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    const token = req.cookies?.organizer_auth;
    if (!token) return res.status(401).json({ error: "Unauthorized" });

    try {
      const decoded = jwt.verify(token, env.jwtSecret, { issuer: "inauguration-attendance" }) as jwt.JwtPayload;
      const { data: organizer, error } = await supabase
        .from("organizers")
        .select("id,username,role,is_active")
        .eq("id", decoded.sub)
        .single();
      if (error || !organizer || !organizer.is_active) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      if (requiredRole && organizer.role !== requiredRole) {
        return res.status(403).json({ error: "Administrator access required" });
      }
      req.organizer = organizer as Organizer;
      next();
    } catch {
      res.status(401).json({ error: "Unauthorized" });
    }
  };
}
