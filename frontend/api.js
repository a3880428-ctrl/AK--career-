/* One place for every API call. Same-origin: HttpOnly session cookie. Separate frontend: Bearer token. */
window.HubAPI = (function () {
  "use strict";
  const saved = (() => { try { return localStorage.getItem("hub:api") || ""; } catch (e) { return ""; } })();
  const BASE = String(saved || (window.HUB_CONFIG || {}).API_BASE || "").trim().replace(/\/+$/, "");
  const BEARER = !!BASE || location.protocol === "file:";
  const KEY = "hub:token";
  const getToken = () => { try { return localStorage.getItem(KEY); } catch (e) { return null; } };
  const setToken = (t) => { try { if (t) localStorage.setItem(KEY, t); else localStorage.removeItem(KEY); } catch (e) {} };
  async function call(path, method, body, opts) {
    const headers = {};
    if (body !== undefined) headers["content-type"] = "application/json";
    const tk = getToken(); if (BEARER && tk) headers.authorization = "Bearer " + tk;
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), (opts && opts.timeout) || 90000); // Render free tier can take ~1 min to wake
    try {
      const r = await fetch(BASE + path, { method: method || "GET", headers, body: body !== undefined ? JSON.stringify(body) : undefined, credentials: BEARER ? "omit" : "same-origin", cache: "no-store", signal: ctl.signal });
      let data = null; try { data = await r.json(); } catch (e) {}
      if (r.status === 401 && BEARER) setToken(null);
      if (r.ok && data && data.token && BEARER) setToken(data.token);
      return { ok: r.ok, status: r.status, data };
    } finally { clearTimeout(timer); }
  }
  function setServer(url) { try { if (url) localStorage.setItem("hub:api", url.replace(/\/+$/, "")); else localStorage.removeItem("hub:api"); } catch (e) {} }
  async function test(url) {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 90000);
    try { const r = await fetch(url.replace(/\/+$/, "") + "/api/health", { signal: ctl.signal, cache: "no-store" }); const j = await r.json(); return r.ok && j.ok ? (j.configured ? "ok" : "unconfigured") : "bad"; }
    catch (e) { return "unreachable"; } finally { clearTimeout(t); }
  }
  return { call, setToken, getToken, setServer, test, base: BASE || location.origin, configured: !!BASE, bearer: BEARER };
})();
