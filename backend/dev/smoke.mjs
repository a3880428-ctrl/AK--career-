// API smoke test with an in-memory store: register, login, save, conflict, snapshots, auth failures.
import { handle, signJwt } from "../lib/app.mjs";
const mem = new Map();
const store = { async get(k) { return mem.has(k) ? JSON.parse(mem.get(k)) : null; }, async setJSON(k, v) { mem.set(k, JSON.stringify(v)); }, async delete(k) { mem.delete(k); }, async list({ prefix }) { return { blobs: [...mem.keys()].filter(k => k.startsWith(prefix)).map(key => ({ key })) }; } };
const env = k => ({ JWT_SECRET: "x".repeat(40) })[k];
let cookie = "";
async function call(method, path, body, extra = {}) {
  const h = { "content-type": "application/json", ...(cookie ? { cookie } : {}), ...extra };
  const r = await handle(new Request("http://localhost" + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined }), { store, env });
  const sc = r.headers.get("set-cookie"); if (sc) cookie = sc.split(";")[0];
  return { status: r.status, body: await r.json() };
}
const ok = (c, m) => { if (!c) { console.error("FAIL:", m); process.exit(1); } console.log("ok  ", m); };
ok((await call("GET", "/api/me")).status === 401, "no session → 401");
ok((await call("POST", "/api/auth/register", { name: "Abhinav", email: "a@b.co", password: "short" })).status === 400, "short password rejected");
let r = await call("POST", "/api/auth/register", { name: "Abhinav", email: "A@b.co", password: "correct horse" });
ok(r.status === 201 && r.body.user.email === "a@b.co", "register");
ok((await call("POST", "/api/auth/register", { email: "a@b.co", password: "correct horse" })).status === 409, "duplicate email blocked");
ok((await call("GET", "/api/me")).body.user.name === "Abhinav", "cookie session works");
r = await call("PUT", "/api/state", { version: 0, data: { problems: [1], days: {} } }); ok(r.status === 200 && r.body.version === 1, "first save");
r = await call("PUT", "/api/state", { version: 0, data: { problems: [] } }); ok(r.status === 409 && r.body.current.version === 1, "stale version → 409 with current");
r = await call("GET", "/api/state"); ok(r.body.data.problems.length === 1, "state persisted");
r = await call("GET", "/api/snapshots"); ok(r.body.snapshots.length === 1, "daily snapshot written");
const saved = cookie; cookie = "";
ok((await call("POST", "/api/auth/login", { email: "a@b.co", password: "wrong pass" })).status === 401, "wrong password → 401");
r = await call("POST", "/api/auth/login", { email: "a@b.co", password: "correct horse" }); ok(r.status === 200 && r.body.token, "login");
cookie = "";
ok((await call("GET", "/api/state", null, { authorization: "Bearer " + r.body.token })).body.data.problems.length === 1, "bearer token works");
ok((await call("GET", "/api/me", null, { authorization: "Bearer " + signJwt({ sub: "x" }, "y".repeat(40)) })).status === 401, "token signed with another secret rejected");
const parts = r.body.token.split("."); const forged = parts[0] + "." + Buffer.from(JSON.stringify({ sub: "other", exp: 9999999999 })).toString("base64url") + "." + parts[2];
ok((await call("GET", "/api/me", null, { authorization: "Bearer " + forged })).status === 401, "tampered payload rejected");
cookie = saved;
ok((await call("POST", "/api/state", {}, { origin: "https://evil.example" })).status === 403, "cross-origin write blocked");
for (let i = 0; i < 8; i++) await call("POST", "/api/auth/login", { email: "a@b.co", password: "nope nope" });
ok((await call("POST", "/api/auth/login", { email: "a@b.co", password: "correct horse" })).status === 429, "login rate limit after 8 failures");
console.log("\nAll API checks passed.");
