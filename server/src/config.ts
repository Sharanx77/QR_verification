import dotenv from "dotenv";
import { fileURLToPath } from "node:url";

dotenv.config({ path: fileURLToPath(new URL("../../.env", import.meta.url)) });

export const env = {
  port: Number(process.env.PORT ?? 4000),
  clientOrigin: process.env.CLIENT_ORIGIN ?? "http://localhost:5173",
  supabaseUrl: process.env.SUPABASE_URL ?? "",
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  jwtSecret: process.env.SESSION_SECRET ?? "",
  qrEncryptionKey: process.env.QR_ENCRYPTION_KEY ?? "",
  cookieSecure: process.env.COOKIE_SECURE === "true"
};

if (!env.supabaseUrl || !env.supabaseServiceRoleKey) {
  console.warn("Supabase credentials are missing. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
}
if (env.jwtSecret.length < 32) {
  console.warn("SESSION_SECRET should be at least 32 characters.");
}
