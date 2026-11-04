// AK CAREER API — framework-free (Web Request/Response). Runs on the Node server (Render, local) and on Netlify Functions.
//   GET  /api/health
// Routes:
//   POST /api/auth/register  {name,email,password,code?}
//   POST /api/auth/login     {email,password}
//   POST /api/auth/logout
//   GET  /api/me
//   GET  /api/state                 -> {version, updatedAt, data}
//   PUT  /api/state  {version,data} -> 409 {current} if version is stale
//   GET  /api/snapshots             -> [{date, updatedAt}]
//   POST /api/snapshots/restore {date}
//   POST /api/auth/password {current,next}
import { createHmac, createHash, randomBytes, scryptSync, timingSafeEqual, randomUUID } from "node:crypto";

const TOKEN_DAYS = 30;
const MAX_STATE_BYTES = 5 * 1024 * 1024;
const COOKIE = "ascent_session";

const b64url = (buf) => Buffer.from(buf).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
const fromB64url = (s) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
const sha = (s) => createHash("sha256").update(s).digest("hex");

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...headers } });
}
const err = (status, message) => json({ error: message }, status);

// ---------- JWT (HS256) ----------
export function signJwt(payload, secret) {
  const header = { alg: "HS256", typ: "JWT" };
  const body = { ...payload, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + TOKEN_DAYS * 86400 };
  const data = b64url(JSON.stringify(header)) + "." + b64url(JSON.stringify(body));
  return data + "." + b64url(createHmac("sha256", secret).update(data).digest());
}
export function verifyJwt(token, secret) {
  if (typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  let header, body;
  try { header = JSON.parse(fromB64url(parts[0]).toString()); body = JSON.parse(fromB64url(parts[1]).toString()); } catch { return null; }
  if (!header || header.alg !== "HS256" || header.typ !== "JWT") return null;
  const expected = createHmac("sha256", secret).update(parts[0] + "." + parts[1]).digest();
  const given = fromB64url(parts[2]);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  if (!body.exp || body.exp < Math.floor(Date.now() / 1000)) return null;
  if (!body.sub || typeof body.sub !== "string") return null;
  return body;
}

// ---------- passwords (scrypt) ----------
function hashPassword(pw) {
  const salt = randomBytes(16);
  const hash = scryptSync(pw, salt, 64, { N: 16384, r: 8, p: 1 });
  return { salt: salt.toString("hex"), hash: hash.toString("hex") };
}
function checkPassword(pw, rec) {
  const hash = scryptSync(pw, Buffer.from(rec.salt, "hex"), 64, { N: 16384, r: 8, p: 1 });
  const stored = Buffer.from(rec.hash, "hex");
  return stored.length === hash.length && timingSafeEqual(stored, hash);
}

function readCookie(req, name) {
  const c = req.headers.get("cookie") || "";
  for (const part of c.split(/;\s*/)) { const i = part.indexOf("="); if (i > 0 && part.slice(0, i) === name) return decodeURIComponent(part.slice(i + 1)); }
  return null;
}
function sessionCookie(token, req) {
  const secure = new URL(req.url).protocol === "https:" ? "; Secure" : "";
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${TOKEN_DAYS * 86400}${secure}`;
}
const clearCookie = `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`;

async function readJson(req) {
  const text = await req.text();
  if (text.length > MAX_STATE_BYTES) throw Object.assign(new Error("too large"), { status: 413 });
  try { return JSON.parse(text || "{}"); } catch { throw Object.assign(new Error("invalid JSON"), { status: 400 }); }
}
const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, createdAt: u.createdAt });
const validEmail = (e) => typeof e === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 200;

// ---------- rate limiting for login ----------
async function tooManyAttempts(store, key) {
  const rec = await store.get(`ratelimit/${key}`, { type: "json" });
  if (!rec) return false;
  if (Date.now() - rec.first > 15 * 60 * 1000) return false;
  return rec.count >= 8;
}
async function noteFailure(store, key) {
  const rec = (await store.get(`ratelimit/${key}`, { type: "json" })) || { count: 0, first: Date.now() };
  if (Date.now() - rec.first > 15 * 60 * 1000) { rec.count = 0; rec.first = Date.now(); }
  rec.count++;
  await store.setJSON(`ratelimit/${key}`, rec);
}

export async function handle(req, { store, env }) {
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, "");
  const method = req.method.toUpperCase();
  if (path === "/api/health" && method === "GET") return json({ ok: true, configured: !!(env("JWT_SECRET") && env("JWT_SECRET").length >= 32), time: Date.now() });
  const secret = env("JWT_SECRET");
  if (!secret || secret.length < 32) return err(503, "Server isn't configured: set JWT_SECRET (32+ characters).");

  const bearerHeader = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  // CSRF defence. Cookie sessions only work same-origin; a cross-origin write must carry a Bearer token
  // (a malicious site can't read your token, so it can't forge one). Login/register are allowed from your separate frontend.
  if (method !== "GET") {
    const origin = req.headers.get("origin");
    const entry = path === "/api/auth/login" || path === "/api/auth/register" || path === "/api/auth/logout";
    if (origin && origin !== url.origin && !bearerHeader && !entry) return err(403, "Cross-origin request blocked.");
    const ct = req.headers.get("content-type") || "";
    if (!ct.includes("application/json")) return err(415, "Send JSON.");
  }

  try {
    // ----- auth -----
    if (path === "/api/auth/register" && method === "POST") {
      const { name, email, password, code } = await readJson(req);
      const need = env("SIGNUP_CODE");
      if (need && code !== need) return err(403, "That sign-up code isn't right.");
      if (!validEmail(email)) return err(400, "Enter a valid email.");
      if (typeof password !== "string" || password.length < 8 || password.length > 200) return err(400, "Use a password of at least 8 characters.");
      const em = email.trim().toLowerCase();
      const idx = `email/${sha(em)}`;
      if (await store.get(idx, { type: "json" })) return err(409, "An account with that email already exists. Log in instead.");
      const id = randomUUID();
      const user = { id, name: String(name || "").trim().slice(0, 60) || em.split("@")[0], email: em, createdAt: new Date().toISOString(), ...hashPassword(password) };
      await store.setJSON(`users/${id}/profile`, user);
      await store.setJSON(idx, { id });
      const token = signJwt({ sub: id, name: user.name }, secret);
      return json({ user: publicUser(user), token }, 201, { "set-cookie": sessionCookie(token, req) });
    }
    if (path === "/api/auth/login" && method === "POST") {
      const { email, password } = await readJson(req);
      if (!validEmail(email) || typeof password !== "string") return err(400, "Enter your email and password.");
      const em = email.trim().toLowerCase(), key = sha(em);
      if (await tooManyAttempts(store, key)) return err(429, "Too many attempts. Wait 15 minutes and try again.");
      const idx = await store.get(`email/${key}`, { type: "json" });
      const user = idx && (await store.get(`users/${idx.id}/profile`, { type: "json" }));
      if (!user || !checkPassword(password, user)) { await noteFailure(store, key); return err(401, "Email or password is wrong."); }
      await store.delete(`ratelimit/${key}`);
      const token = signJwt({ sub: user.id, name: user.name }, secret);
      return json({ user: publicUser(user), token }, 200, { "set-cookie": sessionCookie(token, req) });
    }
    if (path === "/api/auth/logout" && method === "POST") return json({ ok: true }, 200, { "set-cookie": clearCookie });

    // ----- everything below needs a valid token -----
    const claims = verifyJwt(bearerHeader || readCookie(req, COOKIE), secret);
    if (!claims) return err(401, "Your session has ended. Log in again.");
    const user = await store.get(`users/${claims.sub}/profile`, { type: "json" });
    if (!user) return err(401, "Account not found.");
    const base = `users/${user.id}`;

    if (path === "/api/me" && method === "GET") return json({ user: publicUser(user) });

    if (path === "/api/auth/password" && method === "POST") {
      const { current, next } = await readJson(req);
      if (typeof current !== "string" || !checkPassword(current, user)) return err(401, "Your current password is wrong.");
      if (typeof next !== "string" || next.length < 8) return err(400, "Use a new password of at least 8 characters.");
      await store.setJSON(`${base}/profile`, { ...user, ...hashPassword(next) });
      return json({ ok: true });
    }

    if (path === "/api/state" && method === "GET") {
      const st = await store.get(`${base}/state`, { type: "json" });
      return json(st || { version: 0, updatedAt: 0, data: null });
    }
    if (path === "/api/state" && method === "PUT") {
      const body = await readJson(req);
      if (!body || typeof body.version !== "number" || !body.data || typeof body.data !== "object" || Array.isArray(body.data)) return err(400, "Invalid state.");
      const cur = (await store.get(`${base}/state`, { type: "json" })) || { version: 0, updatedAt: 0, data: null };
      if (body.version !== cur.version) return json({ error: "conflict", current: cur }, 409);
      const next = { version: cur.version + 1, updatedAt: Date.now(), data: body.data };
      if (store.compareAndSet) {
        // atomic on Postgres: only writes if nobody saved in between
        if (!(await store.compareAndSet(`${base}/state`, next, cur.version))) return json({ error: "conflict", current: await store.get(`${base}/state`, { type: "json" }) }, 409);
      } else await store.setJSON(`${base}/state`, next);
      // one snapshot per day: your safety net against mistakes
      const day = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
      await store.setJSON(`${base}/snapshots/${day}`, next);
      return json({ version: next.version, updatedAt: next.updatedAt });
    }
    if (path === "/api/snapshots" && method === "GET") {
      const { blobs } = await store.list({ prefix: `${base}/snapshots/` });
      const days = blobs.map((b) => b.key.split("/").pop()).sort().reverse().slice(0, 60);
      return json({ snapshots: days });
    }
    if (path === "/api/snapshots/restore" && method === "POST") {
      const { date } = await readJson(req);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "")) return err(400, "Pick a snapshot date.");
      const snap = await store.get(`${base}/snapshots/${date}`, { type: "json" });
      if (!snap) return err(404, "No snapshot for that day.");
      const cur = (await store.get(`${base}/state`, { type: "json" })) || { version: 0 };
      const next = { version: cur.version + 1, updatedAt: Date.now(), data: snap.data };
      await store.setJSON(`${base}/state`, next);
      return json(next);
    }
    return err(404, "Not found.");
  } catch (e) {
    if (e && e.status) return err(e.status, e.message);
    console.error(e);
    return err(500, "Something went wrong on the server.");
  }
}
