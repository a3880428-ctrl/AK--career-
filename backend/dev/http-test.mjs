// End-to-end check against a running server, local or deployed.
//   node dev/http-test.mjs                      → http://localhost:8888
//   node dev/http-test.mjs https://your-app.onrender.com   (set SIGNUP_CODE=... if you use one)
// Creates a throwaway account test-<random>@example.com.
const FRONT = process.env.ORIGIN || "https://some-frontend.example"; // your Netlify address if ALLOWED_ORIGINS is restricted
const BASE = (process.argv[2] || "http://localhost:8888").replace(/\/+$/, "");
const email = `test-${Math.random().toString(36).slice(2, 8)}@example.com`, password = "test-password-123";
const ok = (c, m) => { if (!c) { console.error("FAIL:", m); process.exit(1); } console.log("ok  ", m); };
async function call(path, { method = "GET", body, token, origin, cookie } = {}) {
  const h = {}; if (body) h["content-type"] = "application/json"; if (token) h.authorization = "Bearer " + token; if (origin) h.origin = origin; if (cookie) h.cookie = cookie;
  const r = await fetch(BASE + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  let data = null; try { data = await r.json(); } catch {}
  return { status: r.status, data, headers: r.headers };
}
console.log("Testing", BASE);
let r = await fetch(BASE + "/healthz"); ok(r.status === 200, "health check (database reachable)");
r = await call("/api/health"); ok(r.status === 200 && r.data.configured, "API configured (JWT_SECRET set)");
r = await call("/api/auth/register", { method: "POST", body: { name: "Test", email, password, code: process.env.SIGNUP_CODE }, origin: FRONT });
ok(r.status === 201 && r.data.token, "register from a separate frontend returns a token");
const token = r.data.token, cookie = (r.headers.get("set-cookie") || "").split(";")[0];
ok(r.headers.get("access-control-allow-origin"), "CORS header present");
r = await fetch(BASE + "/api/state", { method: "OPTIONS", headers: { origin: FRONT, "access-control-request-method": "PUT", "access-control-request-headers": "authorization,content-type" } });
ok(r.status === 204 && /authorization/i.test(r.headers.get("access-control-allow-headers") || ""), "CORS preflight allows Authorization");
r = await call("/api/me", { token }); ok(r.status === 200 && r.data.user.email === email, "bearer token works");
r = await call("/api/me", { cookie }); ok(r.status === 200, "cookie session works (same-origin mode)");
r = await call("/api/state", { token }); ok(r.status === 200 && r.data.version === 0, "new account starts empty");
r = await call("/api/state", { method: "PUT", token, origin: FRONT, body: { version: 0, data: { hello: "world", days: {} } } }); ok(r.status === 200 && r.data.version === 1, "save with bearer from another origin");
r = await call("/api/state", { method: "PUT", token, body: { version: 0, data: { hello: "stale" } } }); ok(r.status === 409 && r.data.current.data.hello === "world", "stale save is rejected, nothing overwritten");
r = await call("/api/state", { method: "PUT", cookie, origin: "https://evil.example", body: { version: 1, data: { hacked: true } } }); ok(r.status === 403, "cross-site cookie write blocked (CSRF)");
r = await call("/api/state", { token }); ok(r.data.data.hello === "world" && r.data.version === 1, "data persisted");
r = await call("/api/snapshots", { token }); ok(r.status === 200 && r.data.snapshots.length >= 1, "daily snapshot exists");
r = await call("/api/auth/login", { method: "POST", body: { email, password: "wrong-password" } }); ok(r.status === 401, "wrong password rejected");
r = await call("/api/auth/login", { method: "POST", body: { email, password } }); ok(r.status === 200 && r.data.token, "login works");
r = await call("/api/me", { token: token.slice(0, -3) + "abc" }); ok(r.status === 401, "tampered token rejected");
console.log("\nAll checks passed against " + BASE);
