import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { resolve } from "node:path";

dotenv.config({ path: resolve(process.cwd(), "../.env") });
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const username = process.env.ADMIN_USERNAME;
const password = process.env.ADMIN_PASSWORD;

if (!url || !key || !username || !password) {
  throw new Error("Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_USERNAME, and ADMIN_PASSWORD.");
}
if (password.length < 8) throw new Error("ADMIN_PASSWORD must contain at least 8 characters.");

const supabase = createClient(url, key);
const passwordHash = await bcrypt.hash(password, 12);
const { error } = await supabase
  .from("organizers")
  .upsert(
    { username: username.trim(), password_hash: passwordHash, role: "administrator", is_active: true },
    { onConflict: "username" }
  );
if (error) throw error;
console.log(`Created or reset administrator account: ${username}`);
