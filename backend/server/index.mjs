// AK CAREER server: the API (/api/*) and, by default, the website (public/) from one Node process.
// Works on Render (web service), any VPS, or your own computer.
//
// Environment
//   JWT_SECRET       required in production, 32+ random characters
//   DATABASE_URL     Postgres connection string (Supabase or Render Postgres). Without it, data goes to ./.data (local use only)
//   SIGNUP_CODE      optional: only people with this code can create an account
//   ALLOWED_ORIGINS  optional: comma-separated origins allowed to call the API from another site, or * (default)
//   SERVE_STATIC     serves ../public too if that folder exists (not the case when the frontend is on Netlify)
//   PORT             set by Render automatically
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, extname, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { handle } from "../lib/app.mjs";
import { createFileStore } from "./store-file.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PUB = join(ROOT, "public");
const PORT = +process.env.PORT || 8888;
const PROD = process.env.NODE_ENV === "production" || !!process.env.RENDER;
const SERVE_STATIC = process.env.SERVE_STATIC !== "false" && existsSync(join(ROOT, "public")); // the frontend lives on Netlify, so normally API-only
const MAX_BODY = 6 * 1024 * 1024;

if (!process.env.JWT_SECRET) {
  if (PROD) console.error("JWT_SECRET is not set. The API will answer 503 until you add it.");
  else { process.env.JWT_SECRET = randomBytes(32).toString("hex"); console.log("JWT_SECRET not set: using a random one for this run (you'll be logged out when the server restarts)."); }
}

let store;
if (process.env.DATABASE_URL) {
  const { createPgStore } = await import("./store-pg.mjs");
  store = await createPgStore(process.env.DATABASE_URL);
  console.log("Storage: Postgres");
} else {
  if (process.env.RENDER) console.warn("WARNING: DATABASE_URL is not set. Render's disk is wiped on restart, so data WILL be lost. Add a Supabase or Render Postgres URL.");
  store = createFileStore(join(ROOT, ".data"));
  console.log("Storage: files in .data/ (local use)");
}

// ---------- CORS (only matters when the frontend is hosted somewhere else) ----------
const allowed = (process.env.ALLOWED_ORIGINS || "*").split(",").map((s) => s.trim()).filter(Boolean);
function corsHeaders(origin) {
  if (!origin) return {};
  const base = { "access-control-allow-methods": "GET,POST,PUT,OPTIONS", "access-control-allow-headers": "authorization,content-type", "access-control-max-age": "600", vary: "Origin" };
  if (allowed.includes("*")) return { ...base, "access-control-allow-origin": "*" };
  if (allowed.includes(origin)) return { ...base, "access-control-allow-origin": origin };
  return {};
}

// ---------- static site ----------
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".json": "application/json", ".webmanifest": "application/manifest+json", ".txt": "text/plain" };
const SECURITY = {
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
  "content-security-policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self' https:; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
};
async function serveStatic(req, res, pathname) {
  let p = resolve(PUB, "." + decodeURIComponent(pathname));
  if (!p.startsWith(PUB)) { res.writeHead(403); return res.end(); }
  try { if ((await stat(p)).isDirectory()) p = join(p, "index.html"); } catch { p = join(PUB, "index.html"); }
  try {
    const body = await readFile(p);
    res.writeHead(200, { "content-type": TYPES[extname(p)] || "application/octet-stream", "cache-control": extname(p) === ".html" ? "no-cache" : "public, max-age=300", ...(PROD ? { "strict-transport-security": "max-age=31536000" } : {}), ...SECURITY });
    res.end(req.method === "HEAD" ? undefined : body);
  } catch { res.writeHead(404, { "content-type": "text/plain" }); res.end("Not found"); }
}

// ---------- server ----------
const server = createServer(async (req, res) => {
  try {
    const proto = String(req.headers["x-forwarded-proto"] || "http").split(",")[0].trim();
    const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost";
    const url = new URL(req.url, `${proto}://${host}`);
    const cors = corsHeaders(req.headers.origin);

    if (url.pathname === "/healthz") {
      try { await store.ping(); res.writeHead(200, { "content-type": "text/plain" }); res.end("ok"); }
      catch (e) { res.writeHead(503, { "content-type": "text/plain" }); res.end("database unreachable"); }
      return;
    }
    if (url.pathname.startsWith("/api/")) {
      if (req.method === "OPTIONS") { res.writeHead(204, cors); return res.end(); }
      const chunks = []; let size = 0;
      for await (const c of req) { size += c.length; if (size > MAX_BODY) { res.writeHead(413, { "content-type": "application/json", ...cors }); return res.end('{"error":"Request too large."}'); } chunks.push(c); }
      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers)) if (v != null) headers.set(k, Array.isArray(v) ? v.join(", ") : v);
      const r = await handle(new Request(url, { method: req.method, headers, body: ["GET", "HEAD"].includes(req.method) ? undefined : Buffer.concat(chunks) }), { store, env: (k) => process.env[k] });
      const out = { ...cors }; r.headers.forEach((v, k) => { out[k] = v; });
      res.writeHead(r.status, out); res.end(Buffer.from(await r.arrayBuffer()));
      return;
    }
    if (!SERVE_STATIC) {
      if (url.pathname === "/") { res.writeHead(200, { "content-type": "application/json", ...cors }); return res.end(JSON.stringify({ name: "AK CAREER API", ok: true, health: "/healthz", docs: "See README.md" })); }
      res.writeHead(404, { "content-type": "application/json", ...cors }); return res.end('{"error":"Not found."}');
    }
    await serveStatic(req, res, url.pathname === "/" ? "/index.html" : url.pathname);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) res.writeHead(500, { "content-type": "application/json" });
    res.end('{"error":"Something went wrong on the server."}');
  }
});
server.keepAliveTimeout = 65_000; // longer than Render's proxy idle timeout
server.listen(PORT, () => console.log(`AK CAREER on http://localhost:${PORT}  (API at /api, health at /healthz)`));

for (const sig of ["SIGTERM", "SIGINT"]) process.on(sig, () => { console.log(`${sig}: shutting down`); server.close(async () => { await store.close?.(); process.exit(0); }); setTimeout(() => process.exit(0), 8000).unref(); });
