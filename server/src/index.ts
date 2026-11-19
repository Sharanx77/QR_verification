import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import multer from "multer";
import bcrypt from "bcryptjs";
import XLSX from "xlsx";
import { resolve } from "node:path";
import { z } from "zod";
import { env } from "./config.js";
import { supabase } from "./db.js";
import { requireAuth, setAuthCookie, signOrganizer, type AuthRequest } from "./auth.js";
import { createQrToken, decryptToken, encryptToken, hashQrToken, isUsnValid, normalizeUsn, tokenIdentifier } from "./crypto.js";

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(cors({ origin: env.clientOrigin, credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());
app.use(multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }).single("file"));

const publicLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false });

app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

app.post("/api/auth/login", publicLimiter, async (req, res) => {
  const parsed = z.object({ username: z.string().trim().min(3).max(100), password: z.string().min(8).max(200) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid login details" });
  const { data: organizer } = await supabase
    .from("organizers")
    .select("id,username,password_hash,role,is_active")
    .eq("username", parsed.data.username)
    .maybeSingle();
  if (!organizer || !organizer.is_active || !await bcrypt.compare(parsed.data.password, organizer.password_hash)) {
    return res.status(401).json({ error: "Invalid username or password" });
  }
  const publicOrganizer = { id: organizer.id, username: organizer.username, role: organizer.role, is_active: organizer.is_active };
  setAuthCookie(res, signOrganizer(publicOrganizer));
  res.json({ organizer: publicOrganizer });
});

app.post("/api/auth/logout", (req, res) => {
  res.clearCookie("organizer_auth");
  res.json({ ok: true });
});

app.get("/api/auth/me", requireAuth(), (req: AuthRequest, res) => res.json({ organizer: req.organizer }));

app.post("/api/participant/qr", publicLimiter, async (req, res) => {
  const usn = normalizeUsn(req.body?.usn);
  if (!isUsnValid(usn)) return res.status(400).json({ code: "INVALID_USN", error: "Invalid USN." });

  const { data: participant, error } = await supabase
    .from("participants")
    .select("id,usn,qr_token_hash,qr_token_ciphertext,is_eligible,is_revoked")
    .eq("usn", usn)
    .maybeSingle();
  if (error) return res.status(500).json({ code: "QR_GENERATION_FAILED", error: "QR generation failed." });
  if (!participant) return res.status(404).json({ code: "USN_NOT_REGISTERED", error: "USN not registered for inauguration." });
  if (!participant.is_eligible || participant.is_revoked) return res.status(403).json({ code: "USN_NOT_REGISTERED", error: "USN not registered for inauguration." });

  let tokenHash = participant.qr_token_hash;
  let rawToken: string;
  if (tokenHash) {
    try {
      if (!participant.qr_token_ciphertext) {
        return res.status(409).json({ code: "QR_ALREADY_GENERATED", error: "QR already generated." });
      }
      rawToken = decryptToken(participant.qr_token_ciphertext, env.qrEncryptionKey);
      return res.json({ usn: participant.usn, token: rawToken, qrStatus: "generated" });
    } catch {
      return res.status(500).json({ code: "QR_GENERATION_FAILED", error: "QR generation failed." });
    }
  }

  rawToken = createQrToken();
  tokenHash = hashQrToken(rawToken);
  const identifier = tokenIdentifier(rawToken);
  const ciphertext = encryptToken(rawToken, env.qrEncryptionKey);
  const { error: updateError } = await supabase
    .from("participants")
    .update({ qr_token_hash: tokenHash, qr_token_identifier: identifier, qr_token_ciphertext: ciphertext })
    .eq("id", participant.id)
    .is("qr_token_hash", null);
  if (updateError) return res.status(500).json({ code: "QR_GENERATION_FAILED", error: "QR generation failed." });

  res.json({ usn: participant.usn, token: rawToken, qrStatus: "generated" });
});

app.get("/api/organizer/overview", requireAuth(), async (_req, res) => {
  const [eligible, present, generated, duplicate] = await Promise.all([
    supabase.from("participants").select("id", { count: "exact", head: true }).eq("is_eligible", true),
    supabase.from("attendance").select("id", { count: "exact", head: true }),
    supabase.from("participants").select("id", { count: "exact", head: true }).not("qr_token_hash", "is", null),
    supabase.from("scan_logs").select("id", { count: "exact", head: true }).eq("result", "duplicate")
  ]);
  const total = eligible.count ?? 0;
  const checkedIn = present.count ?? 0;
  res.json({
    totalEligible: total,
    totalQrGenerated: generated.count ?? 0,
    checkedIn,
    remaining: Math.max(total - checkedIn, 0),
    duplicateAttempts: duplicate.count ?? 0,
    attendancePercentage: total ? Number(((checkedIn / total) * 100).toFixed(1)) : 0
  });
});

app.post("/api/organizer/participants/preview", requireAuth(), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "A CSV or Excel file is required." });
  const name = (req.file.originalname ?? "").toLowerCase();
  if (!name.endsWith(".csv") && !name.endsWith(".xlsx") && !name.endsWith(".xls")) {
    return res.status(400).json({ error: "Only CSV, XLS, and XLSX files are supported." });
  }
  let rows: unknown[][];
  if (name.endsWith(".csv")) {
    const text = req.file.buffer.toString("utf8");
    const workbook = XLSX.read(text, { type: "string" });
    rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1 }) as unknown[][];
  } else {
    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
    rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1 }) as unknown[][];
  }
  if (!rows.length) return res.status(400).json({ error: "The uploaded file is empty." });
  const header = normalizeUsn(rows[0]?.[0]);
  if (header !== "USN") return res.status(400).json({ error: "The first column must be named USN." });

  const normalized = rows.slice(1).map(row => normalizeUsn(row?.[0])).filter(Boolean);
  const counts = new Map<string, number>();
  normalized.forEach(usn => counts.set(usn, (counts.get(usn) ?? 0) + 1));
  const invalid = normalized.filter(usn => !isUsnValid(usn)).length;
  const duplicates = [...counts.values()].filter(count => count > 1).reduce((sum, count) => sum + count - 1, 0);
  const uniqueUsns = [...counts.keys()].filter(usn => isUsnValid(usn));
  const { data: existing } = await supabase.from("participants").select("usn").in("usn", uniqueUsns);
  const existingSet = new Set((existing ?? []).map(row => row.usn));

  res.json({
    totalRows: normalized.length,
    validUsns: uniqueUsns.filter(usn => !existingSet.has(usn)).length,
    duplicateUsns: duplicates,
    invalidEntries: invalid,
    alreadyExisting: existingSet.size,
    preview: uniqueUsns.filter(usn => !existingSet.has(usn)).slice(0, 20)
  });
});

app.post("/api/organizer/participants/import", requireAuth(), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "A CSV or Excel file is required." });
  const name = (req.file.originalname ?? "").toLowerCase();
  const workbook = name.endsWith(".csv")
    ? XLSX.read(req.file.buffer.toString("utf8"), { type: "string" })
    : XLSX.read(req.file.buffer, { type: "buffer" });
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1 }) as unknown[][];
  if (!rows.length || normalizeUsn(rows[0]?.[0]) !== "USN") {
    return res.status(400).json({ error: "The first column must be named USN." });
  }
  const usns = [...new Set(rows.slice(1).map(row => normalizeUsn(row?.[0])).filter(usn => isUsnValid(usn)))];
  const { data: existing } = await supabase.from("participants").select("usn").in("usn", usns);
  const existingSet = new Set((existing ?? []).map(row => row.usn));
  const newUsns = usns.filter(usn => !existingSet.has(usn));
  const records = newUsns.map(usn => {
    const token = createQrToken();
    return {
      usn,
      qr_token_hash: hashQrToken(token),
      qr_token_identifier: tokenIdentifier(token),
      qr_token_ciphertext: encryptToken(token, env.qrEncryptionKey),
      is_eligible: true
    };
  });

  let inserted = 0;
  for (let i = 0; i < records.length; i += 500) {
    const batch = records.slice(i, i + 500);
    const { error } = await supabase.from("participants").upsert(batch, { onConflict: "usn", ignoreDuplicates: true });
    if (error) return res.status(500).json({ error: "Participant import failed." });
    inserted += batch.length;
  }
  res.json({ success: true, imported: inserted, skippedExisting: existingSet.size, invalidOrDuplicate: rows.length - 1 - newUsns.length });
});

app.post("/api/organizer/participants/manual", requireAuth(), async (req, res) => {
  const usn = normalizeUsn(req.body?.usn);
  if (!isUsnValid(usn)) return res.status(400).json({ error: "Invalid USN." });
  const token = createQrToken();
  const { data, error } = await supabase
    .from("participants")
    .upsert({
      usn,
      qr_token_hash: hashQrToken(token),
      qr_token_identifier: tokenIdentifier(token),
      qr_token_ciphertext: encryptToken(token, env.qrEncryptionKey),
      is_eligible: true
    }, { onConflict: "usn", ignoreDuplicates: true })
    .select("id,usn")
    .maybeSingle();
  if (error) return res.status(500).json({ error: "Could not add participant." });
  res.status(data ? 201 : 409).json(data ? { participant: data } : { error: "USN already exists." });
});

app.get("/api/organizer/participants", requireAuth(), async (req, res) => {
  const page = Math.max(Number(req.query.page ?? 1), 1);
  const limit = Math.min(Math.max(Number(req.query.limit ?? 25), 1), 100);
  const search = String(req.query.search ?? "").trim().toUpperCase();
  const status = req.query.status;
  let query = supabase
    .from("participants")
    .select("id,usn,qr_token_hash,is_eligible,created_at,attendance(id,checked_in_at,verified_by,organizers:verified_by(username))", { count: "exact" })
    .order("usn", { ascending: true })
    .range((page - 1) * limit, page * limit - 1);
  if (search) query = query.ilike("usn", `%${search}%`);
  const { data, count, error } = await query;
  if (error) return res.status(500).json({ error: "Could not load participants." });
  const participants = (data ?? []).filter(row => {
    const present = Array.isArray(row.attendance) && row.attendance.length > 0;
    if (status === "present") return present;
    if (status === "absent") return !present;
    return true;
  }).map((row: any) => {
    const attendance = Array.isArray(row.attendance) ? row.attendance[0] : null;
    return {
      id: row.id,
      usn: row.usn,
      qrStatus: row.qr_token_hash ? "Generated" : "Pending",
      attendanceStatus: attendance ? "PRESENT" : "ABSENT",
      checkedInAt: attendance?.checked_in_at ?? null,
      verifiedBy: attendance?.organizers?.username ?? null
    };
  });
  res.json({ participants, total: count ?? 0, page, limit });
});

app.post("/api/organizer/verify", requireAuth(), async (req: AuthRequest, res) => {
  let token = String(req.body?.token ?? "").trim();
  if (!token || token.length > 256) return res.status(400).json({ status: "invalid", message: "INVALID QR CODE" });
  const normalizedCandidate = normalizeUsn(token);
  if (isUsnValid(normalizedCandidate) && normalizedCandidate === token.toUpperCase()) {
    const { data: byUsn } = await supabase
      .from("participants")
      .select("qr_token_ciphertext")
      .eq("usn", normalizedCandidate)
      .maybeSingle();
    if (byUsn?.qr_token_ciphertext) {
      try { token = decryptToken(byUsn.qr_token_ciphertext, env.qrEncryptionKey); } catch { token = ""; }
    } else {
      token = "";
    }
  }
  const hash = hashQrToken(token);
  const identifier = tokenIdentifier(token);
  const { data, error } = await supabase.rpc("verify_qr", {
    p_qr_token_hash: hash,
    p_qr_token_identifier: identifier,
    p_organizer_id: req.organizer!.id
  });
  if (error) return res.status(500).json({ status: "invalid", message: "INVALID QR CODE" });
  const result = Array.isArray(data) ? data[0] : data;
  if (!result) return res.status(200).json({ status: "invalid", message: "INVALID QR CODE" });
  res.json({
    status: result.status,
    message: result.status === "valid" ? "VERIFIED SUCCESSFULLY" : result.status === "duplicate" ? "ALREADY CHECKED IN" : "QR NOT RECOGNIZED / REVOKED",
    usn: result.participant_usn,
    checkedInAt: result.checked_in_at,
    verifiedBy: result.verified_by_username,
    previousSuccessfulCheckIns: Number(result.previous_success_count ?? 0)
  });
});

app.get("/api/organizer/scan-history", requireAuth(), async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit ?? 50), 1), 200);
  const { data, error } = await supabase
    .from("scan_logs")
    .select("id,participant_id,organizer_id,qr_token_identifier,scanned_at,result,successful,participants(usn),organizers(username)")
    .order("scanned_at", { ascending: false })
    .limit(limit);
  if (error) return res.status(500).json({ error: "Could not load scan history." });
  res.json({ logs: data ?? [] });
});

app.get("/api/organizer/attendance", requireAuth(), async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit ?? 100), 1), 500);
  const { data, error } = await supabase
    .from("attendance")
    .select("id,checked_in_at,verified_by,participants(usn),organizers(username)")
    .order("checked_in_at", { ascending: false })
    .limit(limit);
  if (error) return res.status(500).json({ error: "Could not load attendance." });
  res.json({ attendance: data ?? [] });
});

app.get("/api/organizer/export/participants", requireAuth(), async (_req, res) => {
  const { data, error } = await supabase
    .from("participants")
    .select("usn,qr_token_hash,is_eligible,attendance(checked_in_at,organizers:verified_by(username))")
    .order("usn", { ascending: true });
  if (error) return res.status(500).json({ error: "Could not export participants." });
  const escape = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const lines = ["USN,QR Status,Attendance Status,Check-in Time,Verified By"];
  for (const row of data ?? []) {
    const attendance = Array.isArray(row.attendance) ? row.attendance[0] : null;
    lines.push([
      row.usn,
      row.qr_token_hash ? "Generated" : "Pending",
      attendance ? "PRESENT" : "ABSENT",
      attendance?.checked_in_at ?? "",
      (attendance as any)?.organizers?.username ?? ""
    ].map(escape).join(","));
  }
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", 'attachment; filename="participants.csv"');
  res.send(lines.join("\n"));
});

app.get("/api/organizer/export/attendance", requireAuth(), async (_req, res) => {
  const { data, error } = await supabase
    .from("attendance")
    .select("checked_in_at,participants(usn),organizers(username)")
    .order("checked_in_at", { ascending: false });
  if (error) return res.status(500).json({ error: "Could not export attendance." });
  const escape = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const lines = ["USN,Check-in Time,Verified By"];
  for (const row of data ?? []) {
    lines.push([
      (row as any).participants?.usn ?? "",
      row.checked_in_at,
      (row as any).organizers?.username ?? ""
    ].map(escape).join(","));
  }
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", 'attachment; filename="attendance.csv"');
  res.send(lines.join("\n"));
});

app.get("/api/organizer/organizers", requireAuth("administrator"), async (_req, res) => {
  const { data, error } = await supabase
    .from("organizers")
    .select("id,username,role,is_active,created_at")
    .order("created_at", { ascending: true });
  if (error) return res.status(500).json({ error: "Could not load organizers." });
  res.json({ organizers: data ?? [] });
});

app.post("/api/organizer/organizers", requireAuth("administrator"), async (req, res) => {
  const parsed = z.object({
    username: z.string().trim().min(3).max(100),
    password: z.string().min(8).max(200),
    role: z.enum(["administrator", "organizer"])
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Username and a password of at least 8 characters are required." });
  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  const { data, error } = await supabase
    .from("organizers")
    .insert({ username: parsed.data.username, password_hash: passwordHash, role: parsed.data.role, is_active: true })
    .select("id,username,role,is_active,created_at")
    .single();
  if (error) return res.status(409).json({ error: "Username already exists or account could not be created." });
  res.status(201).json({ organizer: data });
});

app.patch("/api/organizer/organizers/:id", requireAuth("administrator"), async (req, res) => {
  const updates: Record<string, unknown> = {};
  if (typeof req.body?.is_active === "boolean") updates.is_active = req.body.is_active;
  if (req.body?.role === "administrator" || req.body?.role === "organizer") updates.role = req.body.role;
  if (!Object.keys(updates).length) return res.status(400).json({ error: "No valid changes supplied." });
  const { data, error } = await supabase.from("organizers").update(updates).eq("id", req.params.id).select("id,username,role,is_active").single();
  if (error) return res.status(500).json({ error: "Could not update organizer." });
  res.json({ organizer: data });
});

const clientDist = resolve(process.cwd(), "../client/dist");
app.use(express.static(clientDist));
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  res.sendFile("index.html", { root: clientDist }, error => {
    if (error) next(error);
  });
});
app.use("/api", (_req, res) => res.status(404).json({ error: "API route not found" }));

app.listen(env.port, () => console.log(`Server listening on http://localhost:${env.port}`));
