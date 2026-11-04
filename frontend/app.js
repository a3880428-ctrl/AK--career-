/* AK CAREER portal: auth, server sync, daily planner UI and every tracker view. */
(function () {
"use strict";
const C = window.AscentCore, D = C.D;
const $ = s => document.querySelector(s), $$ = s => Array.from(document.querySelectorAll(s));
const esc = C.esc, r1 = C.r1, fmt = C.fmt;
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

// ================= icons =================
const IC = {
  today: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  progress: '<path d="M4 19h16"/><path d="M7 16V10M12 16V6M17 16v-4"/>',
  dsa: '<path d="M8.5 8 4.5 12l4 4M15.5 8l4 4-4 4M13.5 5.5l-3 13"/>',
  roadmap: '<path d="M4 18 9.5 7l4.5 7 2.5-4 3.5 8"/>',
  academics: '<path d="m3 9 9-4 9 4-9 4-9-4Z"/><path d="M7 11v5c3 2 7 2 10 0v-5"/>',
  career: '<rect x="3.5" y="7" width="17" height="12" rx="2.5"/><path d="M9 7V5.5h6V7M3.5 12h17"/>',
  fitness: '<path d="M6 8v8M18 8v8M3.5 10v4M20.5 10v4M6 12h12"/>',
  reflect: '<path d="M5 4.5h10l4 4V19.5H5z"/><path d="M8.5 11h7M8.5 15h5"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 3.5v2.5M12 18v2.5M3.5 12H6M18 12h2.5M6 6l1.8 1.8M16.2 16.2 18 18M6 18l1.8-1.8M16.2 7.8 18 6"/>',
  more: '<circle cx="6" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="18" cy="12" r="1.4"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>'
};
const svg = (k, sw) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw || 1.7}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[k]}</svg>`;
const VIEWS = [["today", "Today", "Daily"], ["progress", "Progress", "Daily"], ["dsa", "DSA · A2Z", "Build"], ["roadmap", "Roadmap", "Build"], ["academics", "Academics", "Build"], ["career", "Career", "Build"], ["fitness", "Fitness", "You"], ["reflect", "Reflect", "You"], ["settings", "Settings", "You"]];
const MOBILE = ["today", "dsa", "academics", "career"];

// ================= state + server sync =================
let user = null, S = null, version = 0, gen = 0, dirty = new Set(), dirtyDays = new Set(), pushT = null, inflight = false, again = false;
const cacheKey = () => "ascent:" + user.id;
function toast(m) { const t = $("#toast"); t.textContent = m; t.classList.add("show"); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("show"), 2400); }
function setSync(cls, txt) { const e = $("#sync"); e.className = "sync " + cls; e.querySelector("span").textContent = txt; }
async function api(path, method, body) { return window.HubAPI.call(path, method, body); }
function readCache() { try { return JSON.parse(localStorage.getItem(cacheKey()) || "null"); } catch (e) { return null; } }
function saveLocal() { try { localStorage.setItem(cacheKey(), JSON.stringify({ data: S, version, dirty: [...dirty], dirtyDays: [...dirtyDays] })); } catch (e) {} }
function mark(keys, dayKey, opts) {
  [].concat(keys).forEach(k => dirty.add(k)); if (dayKey) dirtyDays.add(dayKey);
  gen++; saveLocal(); setSync("busy", "Saving…"); clearTimeout(pushT); pushT = setTimeout(push, 650);
  if (!opts || !opts.quiet) render();
}
async function push() {
  if (!dirty.size) { setSync("ok", "Saved"); return; }
  if (inflight) { again = true; return; }
  inflight = true; const g = gen;
  try {
    const r = await api("/api/state", "PUT", { version, data: S });
    if (r.ok) { version = r.data.version; if (gen === g) { dirty.clear(); dirtyDays.clear(); } saveLocal(); setSync("ok", "Saved · " + new Date().toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })); }
    else if (r.status === 409) { merge(r.data.current); again = true; }
    else if (r.status === 401) { setSync("err", "Session ended"); showAuth("Your session ended. Log in again; nothing you did is lost."); }
    else { setSync("err", (r.data && r.data.error) || "Couldn't save · retrying"); setTimeout(push, 6000); }
  } catch (e) { setSync("err", "Offline · saved on this device"); setTimeout(push, 6000); }
  finally { inflight = false; if (again) { again = false; setTimeout(push, 150); } }
}
function merge(cur) {
  const base = C.normalize(cur && cur.data, user.name);
  dirty.forEach(k => { if (k === "days") dirtyDays.forEach(d => { if (S.days[d]) base.days[d] = S.days[d]; else delete base.days[d]; }); else if (k in S) base[k] = S[k]; });
  S = base; version = cur ? cur.version : 0; saveLocal();
}
addEventListener("online", () => push());
addEventListener("beforeunload", e => { if (dirty.size && !inflight) { push(); } });
document.addEventListener("visibilitychange", async () => {
  if (document.visibilityState !== "visible" || !user || dirty.size) return;
  const r = await api("/api/state"); if (r.ok && r.data && r.data.version > version && r.data.data) { S = C.normalize(r.data.data, user.name); version = r.data.version; saveLocal(); render(); }
});

// ================= boot / auth =================
let authMode = "login";
function showAuth(msg) {
  $("#loading").classList.add("hidden"); $("#portal").classList.add("hidden"); $("#mob").classList.add("hidden"); $("#auth").classList.remove("hidden");
  $("#authErr").textContent = msg || "";
}
function setAuthMode(m) {
  authMode = m; $$(".auth .seg button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.mode === m)));
  $("#aName").classList.toggle("hidden", m !== "register"); $("#aCode").classList.toggle("hidden", m !== "register");
  $("#authTitle").textContent = m === "login" ? "Welcome back." : "Start your ascent.";
  $("#authSub").textContent = m === "login" ? "Log in to pick up where you left off." : "One account keeps every day of progress safe on the server.";
  $("#aPass").autocomplete = m === "login" ? "current-password" : "new-password";
  $("#authBtn").innerHTML = (m === "login" ? "Log in" : "Create account") + ' <span class="arr">→</span>'; $("#authErr").textContent = "";
}
$$(".auth .seg button").forEach(b => b.addEventListener("click", () => setAuthMode(b.dataset.mode)));
$("#srvSave").addEventListener("click", async () => {
  let u = $("#srvUrl").value.trim(); if (u && !/^https?:\/\//.test(u)) u = "https://" + u;
  if (!u) { window.HubAPI.setServer(""); location.reload(); return; }
  $("#srvMsg").textContent = "Checking… (a sleeping free Render server takes up to a minute)"; $("#srvSave").disabled = true;
  const res = await window.HubAPI.test(u); $("#srvSave").disabled = false;
  if (res === "ok") { window.HubAPI.setServer(u); $("#srvMsg").textContent = "Connected. Reloading…"; setTimeout(() => location.reload(), 500); }
  else $("#srvMsg").textContent = res === "unconfigured" ? "Found the server, but JWT_SECRET isn't set on Render yet." : res === "bad" ? "Something answered, but it isn't the AK CAREER API. Check the address." : "Couldn't reach that address. Check it and try again.";
});
$("#authForm").addEventListener("submit", async e => {
  e.preventDefault();
  const email = $("#aEmail").value.trim(), password = $("#aPass").value, name = $("#aName").value.trim(), code = $("#aCode").value.trim();
  if (!email || !password) { $("#authErr").textContent = "Enter your email and password."; return; }
  if (authMode === "register" && password.length < 8) { $("#authErr").textContent = "Use a password of at least 8 characters."; return; }
  $("#authBtn").disabled = true; $("#authErr").textContent = "";
  try {
    const r = await api(authMode === "login" ? "/api/auth/login" : "/api/auth/register", "POST", authMode === "login" ? { email, password } : { email, password, name, code });
    if (!r.ok) { $("#authErr").textContent = (r.data && r.data.error) || (r.status === 404 ? "The server API isn't running. See the README." : "That didn't work. Try again."); return; }
    user = r.data.user; $("#aPass").value = "";
    if (S && version) { await push(); } // a session that ended mid-work: save first
    await loadState(); showPortal();
  } catch (err) { $("#authErr").textContent = "Can't reach the server. Check your connection."; }
  finally { $("#authBtn").disabled = false; }
});
async function loadState() {
  const r = await api("/api/state"); const cached = readCache();
  if (r.status === 401) { showAuth(); return; }
  if (!r.ok) {
    if (cached && cached.data) { S = C.normalize(cached.data, user.name); version = cached.version || 0; dirty = new Set(cached.dirty || []); dirtyDays = new Set(cached.dirtyDays || []); }
    else S = C.defaults(user.name);
    setSync("err", "Offline · saved on this device"); return;
  }
  const cur = r.data;
  if (cached && cached.data && (cached.dirty || []).length) { S = C.normalize(cached.data, user.name); dirty = new Set(cached.dirty); dirtyDays = new Set(cached.dirtyDays || []); merge(cur); setTimeout(push, 100); }
  else if (cur && cur.data) { S = C.normalize(cur.data, user.name); version = cur.version; dirty.clear(); dirtyDays.clear(); }
  else { S = C.defaults(user.name); version = cur ? cur.version : 0; Object.keys(S).forEach(k => dirty.add(k)); setTimeout(push, 100); }
  saveLocal(); setSync("ok", "Saved");
}
function showPortal() {
  $("#loading").classList.add("hidden"); $("#auth").classList.add("hidden"); $("#portal").classList.remove("hidden"); $("#mob").classList.remove("hidden");
  $("#uName").textContent = user.name; $("#uEmail").textContent = user.email; $("#avatar").textContent = (user.name || "?").trim()[0].toUpperCase();
  if (!location.hash) history.replaceState(null, "", "#today");
  render();
}
(async function boot() {
  const slow = setTimeout(() => { const m = $("#loadMsg"); if (m) m.textContent = "Waking the server up. On a free plan this can take up to a minute after it's been idle."; }, 3500);
  $("#srvUrl").value = window.HubAPI.configured ? window.HubAPI.base : "";
  try { const r = await api("/api/me"); if (!r.ok) { setAuthMode("login");
      if (r.status === 404 || (!r.data && r.status !== 401)) { $("#srvBox").open = true; showAuth(window.HubAPI.configured ? `The server at ${window.HubAPI.base} isn't answering like AK CAREER. Check the address below.` : "Connect to your server first: paste your Render address under Server settings."); return; }
      showAuth(r.status === 503 ? (r.data && r.data.error) : ""); return; }
    user = r.data.user; await loadState(); if (S) showPortal(); }
  catch (e) { setAuthMode("login"); $("#srvBox").open = true; showAuth(window.HubAPI.configured ? `Can't reach ${window.HubAPI.base}. It may be waking up (about a minute on Render's free plan) or the address is wrong.` : "Connect to your server first: paste your Render address under Server settings."); }
  finally { clearTimeout(slow); }
})();

// ================= helpers =================
const today = () => C.today();
function ring(p, size, stroke, colA, colB, id) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, o = c * (1 - Math.max(0, Math.min(1, p)));
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${colA}"/><stop offset="1" stop-color="${colB}"/></linearGradient></defs>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="rgba(255,255,255,.07)" stroke-width="${stroke}"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="url(#${id})" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${o}" transform="rotate(-90 ${size / 2} ${size / 2})" style="filter:drop-shadow(0 0 8px ${colA}55);transition:stroke-dashoffset 1s cubic-bezier(.2,.75,.15,1)"/></svg>`;
}
const bar = (v, t, cls) => `<div class="bar ${cls || ""}"><i style="width:${t ? Math.min(100, v / t * 100) : 0}%"></i></div>`;
function barChart(el, data, o) {
  o = o || {}; const W = Math.max(300, el.clientWidth || 600), H = el.clientHeight || 200, pl = 30, pb = 26, top = 18;
  const max = Math.max(o.goal || 0, o.min || 1, ...data.map(x => x[1])), bw = (W - pl) / data.length, y = v => H - pb - (v / max) * (H - pb - top);
  let s = `<defs><linearGradient id="bg1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${o.c1 || "#d6ff4f"}"/><stop offset="1" stop-color="${o.c1 || "#d6ff4f"}" stop-opacity=".25"/></linearGradient><linearGradient id="bg2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${o.c2 || "#ffb84d"}"/><stop offset="1" stop-color="${o.c2 || "#ffb84d"}" stop-opacity=".2"/></linearGradient></defs>`;
  [0, max / 2, max].forEach(v => { s += `<line x1="${pl}" x2="${W}" y1="${y(v)}" y2="${y(v)}" stroke="rgba(255,255,255,.06)" stroke-dasharray="2 5"/><text x="0" y="${y(v) + 4}" font-size="10" fill="#55575f" font-family="Geist Mono,monospace">${r1(v)}</text>`; });
  if (o.goal) s += `<line x1="${pl}" x2="${W}" y1="${y(o.goal)}" y2="${y(o.goal)}" stroke="#ffb84d" stroke-opacity=".6" stroke-dasharray="5 4"/>`;
  data.forEach((x, i) => { const h = H - pb - y(x[1]), ok = o.goal ? x[1] >= o.goal : true, w = Math.max(4, bw * .58);
    s += `<rect x="${pl + i * bw + (bw - w) / 2}" y="${y(x[1])}" width="${w}" height="${Math.max(h, 2)}" rx="${Math.min(7, w / 2.5)}" fill="url(#${ok ? "bg1" : "bg2"})"><title>${esc(x[2] || x[0])}: ${r1(x[1])}</title></rect>`;
    if (!o.every || i % o.every === 0 || i === data.length - 1) s += `<text x="${pl + i * bw + bw / 2}" y="${H - 7}" font-size="10.5" text-anchor="middle" fill="#83858e" font-family="Geist Mono,monospace">${esc(x[0])}</text>`;
    if (x[1] && data.length <= 16) s += `<text x="${pl + i * bw + bw / 2}" y="${y(x[1]) - 6}" font-size="10.5" text-anchor="middle" fill="#c2c3c8" font-family="Geist Mono,monospace">${r1(x[1])}</text>`; });
  el.setAttribute("viewBox", `0 0 ${W} ${H}`); el.innerHTML = s;
}
function heat(el, from, to, fn) {
  const t = today(); let h = `<span></span>` + ["Mon", "", "Wed", "", "Fri", "", "Sun"].map(l => `<span class="dl">${l}</span>`).join(""), lm = -1;
  for (let w = C.monday(from); w <= to; w = C.add(w, 7)) { const m = C.pd(C.add(w, 6)).getMonth(); let lab = ""; if (m !== lm) { lab = C.pd(C.add(w, 6)).toLocaleDateString("en-IN", { month: "short" }); lm = m; } h += `<span class="ml">${lab}</span>`;
    for (let i = 0; i < 7; i++) { const s = C.add(w, i); if (s < from || s > to) { h += `<span class="cell out"></span>`; continue; } const r = fn(s);
      h += `<button type="button" class="cell ${r.lv ? "l" + r.lv : ""} ${s === t ? "today" : ""} ${D.EXAMDAYS.includes(s) ? "exam" : ""} ${s > t ? "fut" : ""}" data-act="openDay" data-d="${s}" title="${esc(r.tip)}" aria-label="${esc(r.tip)}"></button>`; } }
  el.innerHTML = h; const sc = el.parentElement, tc = el.querySelector(".today");
  if (tc && !sc.dataset.sc && sc.clientWidth) { sc.scrollLeft = Math.max(0, tc.getBoundingClientRect().left - sc.getBoundingClientRect().left - sc.clientWidth * .5); sc.dataset.sc = 1; }
}
const COL = { Revise: "#ffb84d", Solve: "#d6ff4f", Study: "#9d8bff", Learn: "#5ce1ff", Ship: "#ff6f52", Move: "#5ee39a", Habits: "#c2c3c8" };

// ================= router =================
let sel = today(), heatF = "all", calM = today().slice(0, 7), revWeek = C.monday(today()), dsaFilter = "", dsaQ = "", topicSubj = null;
function cur() { const h = (location.hash || "").slice(1); return VIEWS.some(v => v[0] === h) ? h : "today"; }
function navs() {
  let g = "", h = ""; const due = C.dueRevisions(S).filter(x => !x.done).length;
  VIEWS.forEach(v => { if (v[2] !== g) { g = v[2]; h += `<small>${g}</small>`; } h += `<a href="#${v[0]}" data-v="${v[0]}">${svg(v[0])}<span>${v[1]}</span>${v[0] === "dsa" && due ? `<span class="badge">${due}</span>` : ""}</a>`; });
  $("#nav").innerHTML = h;
  $("#mob").innerHTML = MOBILE.map(k => `<a href="#${k}" data-v="${k}">${svg(k)}<span>${VIEWS.find(v => v[0] === k)[1].split(" ")[0]}</span></a>`).join("") + `<a href="#" data-act="more" data-v="more">${svg("more")}<span>More</span></a>`;
  $("#more").innerHTML = VIEWS.filter(v => !MOBILE.includes(v[0])).map(v => `<a href="#${v[0]}">${svg(v[0])}<span>${v[1]}</span></a>`).join("");
  const c = cur(); $$("[data-v]").forEach(a => a.dataset.v === c ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current"));
}
function render() {
  if (!S || !user) return;
  const c = cur(), t = today(), P = C.period(t);
  navs();
  const hr = new Date().getHours(), greet = hr < 5 ? "Still up" : hr < 12 ? "Good morning" : hr < 17 ? "Good afternoon" : "Good evening";
  const first = (user.name || "").split(" ")[0];
  $("#title").innerHTML = c === "today" ? `${greet}, <span class="serif grad">${esc(first)}</span>` : esc(VIEWS.find(v => v[0] === c)[1]);
  const dayN = Math.max(1, C.diff(D.START, t) + 1);
  $("#subtitle").textContent = c === "today" ? `${C.fmt(t, { weekday: "long", day: "numeric", month: "long" })} · day ${dayN} of ${C.diff(D.START, D.GOAL_DATE) + 1} · ${C.diff(t, D.GOAL_DATE)} days to the checkpoint` : "";
  $("#modePill span:last-child").textContent = P.mode;
  ({ today: vToday, progress: vProgress, dsa: vDSA, roadmap: vRoad, academics: vAcad, career: vCareer, fitness: vFit, reflect: vReflect, settings: vSettings })[c]();
}
addEventListener("hashchange", () => { $("#more").classList.add("hidden"); render(); scrollTo({ top: 0 }); });
let rz; addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(() => { if (S && ["progress", "fitness", "dsa"].includes(cur())) render(); }, 250); });

// ================= TODAY =================
function ensurePlan(t) {
  const d = S.days[t];
  if (!d || !d.plan) { const nd = C.ensureDay(S, t); nd.plan = C.makePlan(S, t); mark("days", t, { quiet: true }); }
}
function vToday() {
  const t = today(); ensurePlan(t);
  const T = C.tasks(S, t), list = T.list, done = list.filter(x => x.done).length, P = T.period, d = C.day(S, t);
  const groups = ["Revise", "Solve", "Study", "Learn", "Ship", "Move", "Habits"].map(g => [g, list.filter(x => x.group === g)]).filter(g => g[1].length);
  const wk = C.monday(t), w = C.sumRange(S, wk, C.add(wk, 6));
  const nx = D.DATES.find(x => x[1] >= t);
  const focusLine = P.week ? P.week[2] : P.kind === "exam" ? "Exam mode: papers, error logs, sleep." : P.kind === "break" ? "Build mode: roadmap, GHOSTRAVEN, DSA." : "Classes, then Math/MBM, then DSA.";
  $("#view").innerHTML = `<div class="view">
    <div class="glass mission spot"><span class="bgglow"></span>
      <div class="ringwrap">${ring(done / Math.max(1, list.length), 132, 9, "#d6ff4f", "#5ce1ff", "rgToday")}<div class="lbl"><div><b>${Math.round(done / Math.max(1, list.length) * 100)}%</b><span>${done}/${list.length} DONE</span></div></div></div>
      <div><span class="eyebrow">Today's mission · ${esc(P.mode)}</span><h2>${esc(focusLine)}</h2>
        <p>${P.week ? `DSA this week: ${esc(P.week[3])}. Roadmap: ${esc(P.week[5])}.` : `This period: ${P.dsa} DSA problems, ${P.study}h study and ${P.road}h roadmap a week.`}</p>
        <div class="chips"><span class="pill lime">${w.dsaN}/${P.dsa} DSA this week</span><span class="pill violet">${r1(w.acad)}/${P.study}h study</span><span class="pill cyan">${r1(w.road)}/${P.road}h roadmap</span>${nx ? `<span class="pill ${C.diff(t, nx[1]) <= 14 ? "coral" : "amber"}">${esc(nx[0])} in ${C.diff(t, nx[1])}d</span>` : ""}<span class="pill">🔥 ${C.streak(S)}-day streak</span></div></div>
    </div>
    <div class="g c2">
      <div class="groups">${groups.map(([g, items]) => `<div class="glass group spot"><div class="gh"><h3><i style="background:${COL[g]};box-shadow:0 0 10px ${COL[g]}"></i>${g}</h3><span class="mono muted" style="font-size:12px">${items.filter(x => x.done).length}/${items.length}</span></div>${items.map(taskHTML).join("")}${g === "Solve" ? `<button class="btn xs ghost" data-act="moreDsa" style="justify-self:start">+ one more problem</button>` : ""}</div>`).join("")}</div>
      <div class="g" style="align-content:start">
        <div class="glass card timer spot" id="timerCard">${timerHTML()}</div>
        <div class="glass card spot"><div class="hd"><h2>Schedule</h2><span class="muted" style="font-size:12.5px">${P.kind === "exam" ? "Exam day" : P.kind === "break" ? "Break day" : "Semester 3 timetable"}</span></div><div class="sched">${schedHTML(t, P)}</div></div>
        <div class="glass card spot"><h2>Check-in</h2>
          <div class="row"><label class="f">Sleep last night (h)<input type="number" min="0" max="14" step=".25" value="${d.sleep ?? ""}" data-ch="sleep"></label>
            <label class="f">Workout<select data-ch="fitType"><option value="">None</option>${["Strength A", "Strength B", "Run / walk", "Mobility", "Sport", "Walk", "Cycling"].map(x => `<option ${d.fit.type === x ? "selected" : ""}>${x}</option>`).join("")}</select></label>
            <label class="f">Minutes<input type="number" min="0" step="5" value="${d.fit.min || ""}" data-ch="fitMin"></label></div>
          <div style="display:grid;gap:6px;justify-items:start"><span class="muted" style="font-size:12px">Mood</span><div class="seg">${[1, 2, 3, 4, 5].map(n => `<button type="button" data-act="mood" data-n="${n}" aria-pressed="${d.mood === n}">${["Rough", "Low", "Okay", "Good", "Great"][n - 1]}</button>`).join("")}</div></div>
          <label class="f">Reflection<textarea data-in="note" placeholder="What worked today, what didn't, what changes tomorrow">${esc(d.note)}</textarea></label></div>
      </div>
    </div></div>`;
  syncTimerSelect();
}
function taskHTML(x) {
  let acts = "";
  if (x.kind === "dsa" && !x.done) acts = `<a class="btn xs ghost" href="https://www.google.com/search?q=${encodeURIComponent(x.title + " takeuforward")}" target="_blank" rel="noopener">Open</a><button class="btn xs" data-act="solve" data-key="${x.key}" data-ind="0">Needed help</button><button class="btn xs primary" data-act="solve" data-key="${x.key}" data-ind="1">Solved</button>`;
  if (x.kind === "dsa" && x.done) acts = `<span class="pill ${x.solvedInd ? "lime" : "amber"}">${x.solvedInd ? "counted" : "not counted"}</span>`;
  if (x.kind === "study" && !x.done) acts = `<button class="btn xs" data-act="logStudy" data-code="${esc(x.code)}" data-min="${x.mins}">Log ${x.mins} min</button>`;
  if (x.kind === "unit" && !x.done && !x.prove) acts = `<button class="btn xs" data-act="logUnit" data-n="${x.n}">Log 1h</button>`;
  if (x.kind === "move" && !x.done) acts = `<button class="btn xs" data-act="tick" data-id="${x.id}">Done</button>`;
  return `<div class="task ${x.done ? "done" : ""}"><button class="tick" data-act="tick" data-id="${esc(x.id)}" aria-label="${x.done ? "Mark not done" : "Mark done"}: ${esc(x.title)}">${svg("check", 3)}</button>
    <div style="min-width:0"><b>${esc(x.title)}</b>${x.detail ? `<small>${esc(x.detail)}</small>` : ""}</div><div class="acts">${acts}</div></div>`;
}
function schedHTML(t, P) {
  const wd = C.pd(t).getDay(); const blocks = P.kind === "exam" ? D.TL_EXAM : P.kind === "break" ? D.TL_BREAK : D.TL_SEM[wd];
  const now = new Date(), nm = now.getHours() * 60 + now.getMinutes(), m = s => { const [a, b] = s.split(":").map(Number); return a * 60 + b; };
  return blocks.map(b => { const st = nm >= m(b[1]) ? "past" : nm >= m(b[0]) ? "now" : ""; return `<div class="sb ${b[4]} ${st}"><div class="tm">${b[0]}</div><div class="bd"><b>${esc(b[2])}${st === "now" ? ' <span class="pill lime" style="margin-left:6px">now</span>' : ""}</b><span>${esc(b[3])}</span></div></div>`; }).join("");
}
// focus timer
function timerTargets() {
  const subs = C.sem(S).subjects;
  return `<optgroup label="Study">${subs.map(x => `<option value="a:${esc(x.c)}">${esc(x.c)} · ${esc(x.n)}</option>`).join("")}</optgroup><optgroup label="DSA"><option value="d">DSA practice</option></optgroup><optgroup label="Roadmap">${D.ROAD_ORDER.filter(n => n !== 2).map(n => `<option value="r:${n}">Phase ${n} · ${esc(D.PHASE_NAMES[n])}</option>`).join("")}</optgroup>`;
}
let timerPreset = 50, timerSel = null;
function timerHTML() {
  const tm = S.timer, el = tm ? (Date.now() - tm.start) / 1000 : 0, dur = tm ? tm.dur : timerPreset;
  const shown = tm ? (dur ? Math.max(0, dur * 60 - el) : el) : dur * 60, p = tm && dur ? Math.min(1, el / (dur * 60)) : tm ? (el % 3600) / 3600 : 0;
  const clock = (shown >= 3600 ? C.pad(Math.floor(shown / 3600)) + ":" : "") + C.pad(Math.floor(shown / 60) % 60) + ":" + C.pad(Math.floor(shown % 60));
  return `<div class="hd" style="width:100%"><h2>Focus</h2><div class="seg">${[25, 50, 90, 0].map(m => `<button type="button" data-act="preset" data-m="${m}" aria-pressed="${(tm ? tm.dur : timerPreset) === m}">${m || "Open"}</button>`).join("")}</div></div>
    <div class="ringwrap">${ring(p, 210, 10, "#ffb84d", "#ff6f52", "rgTimer")}<div class="lbl"><div><b id="clock">${clock}</b><span>${tm ? "IN FOCUS" : "READY"}</span></div></div></div>
    <select id="tTarget" aria-label="What you're focusing on" ${tm ? "disabled" : ""}>${timerTargets()}</select>
    <button class="btn ${tm ? "" : "primary"}" data-act="timer" style="width:100%">${tm ? "Stop and log" : "Start focus"} <span class="arr">→</span></button>
    <small class="muted">Time logs itself to today when you stop.</small>`;
}
function syncTimerSelect() { const s = $("#tTarget"); if (!s) return; if (S.timer) s.value = S.timer.target; else if (timerSel) s.value = timerSel; }
setInterval(() => {
  if (!S || !S.timer) { document.title = "AK CAREER · Portal"; return; }
  const tm = S.timer, el = (Date.now() - tm.start) / 1000;
  if (tm.dur && el >= tm.dur * 60) { stopTimer(true); return; }
  if (cur() === "today" && $("#timerCard")) { $("#timerCard").innerHTML = timerHTML(); syncTimerSelect(); }
  const c = $("#clock"); document.title = (c ? c.textContent : "") + " · Focus";
}, 1000);
function stopTimer(finished) {
  const tm = S.timer; if (!tm) return; let mins = (Date.now() - tm.start) / 60000; if (tm.dur) mins = Math.min(mins, tm.dur);
  S.timer = null; const ds = C.ds(new Date(tm.start)), d = C.ensureDay(S, ds), h = Math.round(mins / 60 * 100) / 100;
  if (mins >= 1) {
    if (tm.target === "d") d.dsaMin = (d.dsaMin || 0) + Math.round(mins); else if (tm.target.startsWith("a:")) d.acad.push({ s: tm.target.slice(2), h }); else if (tm.target.startsWith("r:")) d.road.push({ p: +tm.target.slice(2), h });
    toast(finished ? `Session complete · ${Math.round(mins)} min logged` : `${Math.round(mins)} min logged`);
    if (finished) chime();
  } else toast("Under a minute, not logged");
  mark(["timer", "days"], ds);
}
function chime() { try { const ac = new (window.AudioContext || window.webkitAudioContext)(); [0, .18, .36].forEach((o, i) => { const os = ac.createOscillator(), g = ac.createGain(); os.type = "sine"; os.frequency.value = [660, 880, 1320][i]; os.connect(g); g.connect(ac.destination); g.gain.setValueAtTime(.12, ac.currentTime + o); g.gain.exponentialRampToValueAtTime(.001, ac.currentTime + o + .5); os.start(ac.currentTime + o); os.stop(ac.currentTime + o + .55); }); } catch (e) {} }

// ================= PROGRESS =================
function insights() {
  const t = today(), wk = C.monday(t), w = C.sumRange(S, wk, C.add(wk, 6)), P = C.period(t), out = [], dn = (C.pd(t).getDay() + 6) % 7 + 1;
  C.priority(S, C.sem(S)).forEach(x => { const h = w.by[x.c] || 0; if (h < 3) out.push(["#ff6f52", `${x.c} needs hours`, `IA was ${x.ia1}/${S.iaMax}. ${r1(h)}h this week; get to 4+ before Sunday.`]); });
  const due = C.dueRevisions(S).filter(x => !x.done).length; if (due) out.push(["#ffb84d", `${due} revision${due > 1 ? "s" : ""} waiting`, "Clear them before new problems. Retention is the point."]);
  if (P.dsa) { const exp = Math.round(P.dsa * dn / 7); out.push(w.dsaN < exp ? ["#ffb84d", "DSA behind pace", `${w.dsaN} counted vs ~${exp} expected by today.`] : ["#5ee39a", "DSA on pace", `${w.dsaN} counted of ${P.dsa} this week.`]); }
  if (P.kind === "exam" && w.road > 0) out.push(["#ffb84d", "Exam window", `${r1(w.road)}h of roadmap logged this week. Move it to academics.`]);
  const l7 = C.sumRange(S, C.add(t, -6), t); if (l7.sleep.length >= 3) { const a = l7.sleep.reduce((x, y) => x + y, 0) / l7.sleep.length; if (a < 7) out.push(["#ffb84d", `Sleeping ${a.toFixed(1)}h`, "Below 7h hurts recall. Protect 11:30 pm."]); }
  const b4 = [0, 0, 0, 0, 0, 0, 0]; for (let i = 1; i <= 28; i++) { const s = C.add(t, -i); b4[(C.pd(s).getDay() + 6) % 7] += C.metrics(S, s).focus; }
  if (Math.max(...b4) > 0) out.push(["#5ce1ff", `Best day: ${["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][b4.indexOf(Math.max(...b4))]}`, "Your most focused weekday lately. Put the hardest work there."]);
  if (!out.length) out.push(["#5ee39a", "Start logging", "Insights appear after a few days of data."]);
  return out;
}
function vProgress() {
  const t = today(), all = C.sumRange(S, D.START, t < D.START ? D.START : t), wk = C.monday(t), w = C.sumRange(S, wk, C.add(wk, 6));
  $("#view").innerHTML = `<div class="view">
    <div class="g c4">
      <div class="glass card stat spot"><div class="k">Current streak</div><div class="v">${C.streak(S)}<small>days</small></div><div class="f">Best: ${C.bestStreak(S, D.START, t)} days</div></div>
      <div class="glass card stat spot"><div class="k">Active days</div><div class="v">${all.active}<small>/ ${Math.max(1, C.diff(D.START, t) + 1)}</small></div>${bar(all.active, C.diff(D.START, t) + 1)}</div>
      <div class="glass card stat spot"><div class="k">Focus this week</div><div class="v">${r1(w.focus)}<small>hours</small></div><div class="f">${r1(all.focus)}h since day one</div></div>
      <div class="glass card stat spot"><div class="k">DSA counted</div><div class="v">${C.counted(S)}<small>/ 250</small></div>${bar(C.counted(S), 250)}</div>
    </div>
    <div class="glass card spot"><div class="hd"><div><h2>Every day, Nov 2026 → Jun 2027</h2><span class="muted" style="font-size:13px">${all.dsaN} problems · ${r1(all.acad)}h study · ${r1(all.road)}h roadmap</span></div>
      <div class="seg">${[["all", "All"], ["dsa", "DSA"], ["acad", "Study"], ["road", "Roadmap"], ["fit", "Fitness"]].map(f => `<button type="button" data-act="heatF" data-f="${f[0]}" aria-pressed="${heatF === f[0]}">${f[1]}</button>`).join("")}</div></div>
      <div class="heat-wrap"><div class="heat" id="heat"></div></div>
      <div class="hd"><span class="muted" style="font-size:12.5px">Click a day to open it. Red outline = IA test or exam.</span><span class="legend">Less <i></i><i class="l1"></i><i class="l2"></i><i class="l3"></i><i class="l4"></i> More</span></div></div>
    <div class="g c2">
      <div class="glass card spot"><div class="hd"><h2>Focus hours · last 14 days</h2><span class="pill">goal ${r1((C.period(t).study + C.period(t).road) / 7 + C.period(t).dsa * .5 / 7)}h/day</span></div><svg class="chart" id="fchart"></svg></div>
      <div class="glass card spot"><h2>Insights</h2>${insights().slice(0, 5).map(i => `<div class="insight"><b><i style="background:${i[0]};box-shadow:0 0 10px ${i[0]}"></i>${esc(i[1])}</b><span>${esc(i[2])}</span></div>`).join("")}</div>
    </div>
    <div class="g c2">
      <div class="glass card spot"><div class="hd"><button class="btn xs" data-act="calM" data-dir="-1" aria-label="Previous month">←</button><h2 id="calT"></h2><button class="btn xs" data-act="calM" data-dir="1" aria-label="Next month">→</button></div><div class="cal" id="cal"></div></div>
      <div class="glass card spot" id="dayCard"></div>
    </div></div>`;
  const lvl = (m) => { const v = heatF === "all" ? m.pts : heatF === "dsa" ? m.dsa : heatF === "acad" ? m.acad : heatF === "road" ? m.road : m.fit; if (!v) return 0; if (heatF === "dsa") return Math.min(4, v); const th = { all: [2, 4, 6], acad: [1.5, 3, 4.5], road: [1, 2, 3], fit: [20, 40, 60] }[heatF]; return v < th[0] ? 1 : v < th[1] ? 2 : v < th[2] ? 3 : 4; };
  heat($("#heat"), D.START, "2027-06-27", s => { const m = C.metrics(S, s); return { lv: lvl(m), tip: `${fmt(s)}: ${m.dsa} DSA · ${r1(m.acad)}h study · ${r1(m.road)}h roadmap · ${m.fit} min workout` }; });
  const P = C.period(t), goal = (P.study + P.road) / 7 + P.dsa * .5 / 7, arr = [];
  for (let i = 13; i >= 0; i--) { const s = C.add(t, -i); arr.push([C.pd(s).getDate() + "", C.metrics(S, s).focus, fmt(s)]); }
  barChart($("#fchart"), arr, { goal: goal || null, min: 3 });
  renderCal(); renderDayCard();
}
function renderCal() {
  const [y, m] = calM.split("-").map(Number), f = new Date(y, m - 1, 1), n = new Date(y, m, 0).getDate(), t = today();
  $("#calT").textContent = f.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  let h = ["M", "T", "W", "T", "F", "S", "S"].map(x => `<div class="dow">${x}</div>`).join(""); for (let i = 0; i < (f.getDay() + 6) % 7; i++) h += "<div></div>";
  for (let i = 1; i <= n; i++) { const s = `${y}-${C.pad(m)}-${C.pad(i)}`, p = s > t ? 0 : Math.min(1, C.metrics(S, s).pts / 6);
    h += `<button type="button" class="rd ${s === t ? "today" : ""}" data-act="pickDay" data-d="${s}" style="background:conic-gradient(from 200deg,#d6ff4f,#5ce1ff ${p * 360}deg,rgba(255,255,255,.06) ${p * 360}deg)" aria-label="${fmt(s)}"><span>${C.pad(i)}</span></button>`; }
  $("#cal").innerHTML = h;
}
function renderDayCard() {
  const d = C.day(S, sel), m = C.metrics(S, sel), ps = S.problems.filter(p => p.d === sel);
  $("#dayCard").innerHTML = `<div class="hd"><h2>${C.fmt(sel, { weekday: "long", day: "numeric", month: "short" })}</h2><div class="row"><button class="btn xs" data-act="pickDay" data-d="${C.add(sel, -1)}" aria-label="Previous day">←</button><button class="btn xs" data-act="pickDay" data-d="${C.add(sel, 1)}" aria-label="Next day">→</button></div></div>
    <div class="g c2e" style="gap:8px"><div class="note">${m.dsa} DSA (${m.dsaN} counted)</div><div class="note">${r1(m.acad)}h study</div><div class="note">${r1(m.road)}h roadmap</div><div class="note">${m.fit} min workout · ${d.sleep ?? "–"}h sleep</div></div>
    ${ps.length ? `<ul class="list">${ps.map(p => `<li class="li"><span>${esc(p.n)} <span class="muted">· S${p.st + 1}</span></span><button class="x" data-act="delProb" data-id="${p.id}" aria-label="Delete">×</button></li>`).join("")}</ul>` : ""}
    ${d.acad.length || d.road.length ? `<ul class="list">${d.acad.map((x, i) => `<li class="li"><span>${esc(x.s)} · ${r1(x.h)}h</span><button class="x" data-act="delAcad" data-d="${sel}" data-i="${i}" aria-label="Delete">×</button></li>`).join("")}${d.road.map((x, i) => `<li class="li"><span>Phase ${x.p} · ${r1(x.h)}h</span><button class="x" data-act="delRoad" data-d="${sel}" data-i="${i}" aria-label="Delete">×</button></li>`).join("")}</ul>` : ""}
    <div class="row"><select id="qaSubj" aria-label="Subject">${C.sem(S).subjects.map(x => `<option>${esc(x.c)}</option>`).join("")}</select><input type="number" id="qaH" step=".25" min="0" placeholder="h" aria-label="Hours"><button class="btn xs" data-act="addAcad">Add study</button></div>
    ${d.note ? `<p class="note">${esc(d.note)}</p>` : ""}`;
}

// ================= DSA =================
function vDSA() {
  const t = today(), dn = C.stepDone(S), c = C.counted(S), wk = C.monday(t), w = C.sumRange(S, wk, C.add(wk, 6)), due = C.dueRevisions(S).filter(x => !x.done), next = C.nextProblems(S, 8);
  const timed = S.problems.filter(p => p.min), avg = timed.length ? Math.round(timed.reduce((a, p) => a + p.min, 0) / timed.length) : null;
  const L = S.problems.filter(p => (dsaFilter === "" || String(p.st) === dsaFilter) && (!dsaQ || p.n.toLowerCase().includes(dsaQ))).sort((a, b) => (a.d < b.d ? 1 : -1));
  $("#view").innerHTML = `<div class="view">
    <div class="g c4">
      <div class="glass card stat spot"><div class="k">Solved by you</div><div class="v grad">${c}<small>/ 250</small></div>${bar(c, 250)}</div>
      <div class="glass card stat spot"><div class="k">This week</div><div class="v">${w.dsaN}<small>/ ${C.period(t).dsa}</small></div>${bar(w.dsaN, C.period(t).dsa || 1)}</div>
      <div class="glass card stat spot"><div class="k">Revisions due</div><div class="v">${due.length}</div><div class="f">Day 1 · 7 · 21</div></div>
      <div class="glass card stat spot"><div class="k">Average time</div><div class="v">${avg ?? "–"}<small>min</small></div><div class="f">${S.problems.length} logged in total</div></div></div>
    <div class="g c2">
      <div class="glass card spot"><div class="hd"><h2>Up next on the sheet</h2><span class="muted" style="font-size:12.5px">Exactly where you left off</span></div>
        ${next.map(k => { const i = C.keyInfo(k); return `<div class="task"><span class="mono muted" style="font-size:12px">S${i.st + 1}</span><div><b>${esc(i.name)}</b><small>${esc(D.A2Z[i.st][0])}</small></div><div class="acts"><a class="btn xs ghost" href="https://www.google.com/search?q=${encodeURIComponent(i.name + " takeuforward")}" target="_blank" rel="noopener">Open</a><button class="btn xs" data-act="solve" data-key="${k}" data-ind="0">Needed help</button><button class="btn xs primary" data-act="solve" data-key="${k}" data-ind="1">Solved</button></div></div>`; }).join("")}</div>
      <div class="glass card spot"><h2>Revisions due</h2>${due.length ? `<ul class="list">${due.slice(0, 12).map(x => `<li class="li"><span>${esc(x.p.n)} <span class="muted">· day ${[1, 7, 21][x.i]}</span></span><button class="btn xs" data-act="revise" data-id="${x.p.id}" data-i="${x.i}">Re-solved</button></li>`).join("")}</ul>` : `<p class="empty">Nothing due. Revisions appear 1, 7 and 21 days after you solve a problem.</p>`}
        <h3 style="margin-top:6px">Log a problem by hand</h3>
        <div class="row"><input id="mName" class="grow" placeholder="Problem name" aria-label="Problem name"><select id="mStep" aria-label="Step">${D.A2Z.map((s, i) => `<option value="${i}">Step ${i + 1} · ${esc(s[0])}</option>`).join("")}</select></div>
        <div class="row"><select id="mDiff" aria-label="Difficulty"><option>Easy</option><option>Medium</option><option>Hard</option></select><input type="number" id="mMin" placeholder="min" aria-label="Minutes"><label class="row" style="font-size:13.5px"><input type="checkbox" id="mInd" checked> Solved on my own</label><button class="btn sm primary" data-act="manualProb">Log</button></div></div>
    </div>
    <div class="glass card spot"><h2>Striver A2Z · 18 steps</h2><div class="tbl"><table><thead><tr><th>Step</th><th class="n">Done</th><th class="n">Total</th><th style="width:40%">Progress</th></tr></thead><tbody>${D.A2Z.map((s, i) => `<tr><td>${i + 1}. ${esc(s[0])}</td><td class="n">${dn[i]}</td><td class="n">${S.totals[i]}</td><td>${bar(dn[i], S.totals[i])}</td></tr>`).join("")}</tbody></table></div></div>
    <div class="glass card spot"><div class="hd"><h2>Problem log</h2><div class="row"><input id="dsaQ" placeholder="Search" value="${esc(dsaQ)}" aria-label="Search problems"><select data-ch="dsaFilter" aria-label="Filter"><option value="">All steps</option>${D.A2Z.map((s, i) => `<option value="${i}" ${dsaFilter === String(i) ? "selected" : ""}>Step ${i + 1}</option>`).join("")}</select></div></div>
      <div class="tbl"><table><thead><tr><th>Date</th><th>Problem</th><th>Step</th><th>Level</th><th class="n">Min</th><th>Counts</th><th>D1</th><th>D7</th><th>D21</th><th></th></tr></thead><tbody>${L.map(p => `<tr><td class="mono">${fmt(p.d)}</td><td>${esc(p.n)}</td><td>${p.st + 1}</td><td>${esc(p.df)}</td><td class="n">${p.min || "–"}</td><td><input type="checkbox" data-ch="ind" data-id="${p.id}" ${p.ind ? "checked" : ""} aria-label="Counts"></td>${[0, 1, 2].map(i => `<td><input type="checkbox" data-ch="rev" data-id="${p.id}" data-i="${i}" ${p.r[i] ? "checked" : ""} aria-label="Revision"></td>`).join("")}<td><button class="x" data-act="delProb" data-id="${p.id}" aria-label="Delete">×</button></td></tr>`).join("") || `<tr><td colspan="10" class="muted">Solve your first problem from Up next.</td></tr>`}</tbody></table></div></div>
  </div>`;
}

// ================= ROADMAP =================
function vRoad() {
  const h = C.phaseHours(S), tot = Object.values(h).reduce((a, b) => a + b, 0), proved = Object.values(S.phases).filter(p => p.proved).length, nu = C.nextUnit(S);
  $("#view").innerHTML = `<div class="view">
    <div class="g c4">
      <div class="glass card stat spot"><div class="k">By-June subset</div><div class="v grad">${Math.round(C.subsetPct(S) * 100)}<small>%</small></div>${bar(C.subsetPct(S), 1, "c")}</div>
      <div class="glass card stat spot"><div class="k">Hours logged</div><div class="v">${r1(tot)}<small>/ 1,460</small></div>${bar(tot, 1460, "c")}</div>
      <div class="glass card stat spot"><div class="k">Phases proved</div><div class="v">${proved}<small>/ 40</small></div></div>
      <div class="glass card stat spot"><div class="k">Up next</div><div style="font:550 16px/1.3 var(--display);margin-top:6px">${nu ? esc(nu.name) : "All done"}</div><div class="f">${nu ? "Phase " + nu.n + " · " + esc(D.PHASE_NAMES[nu.n]) : ""}</div></div></div>
    <p class="note">Work through units in this order. A phase counts as done when its Prove-it passes. Open your roadmap PDF for each unit's "Start here" resource. Phase 2 is your A2Z log.</p>
    <div class="g" style="gap:10px">${D.ROAD_ORDER.map(n => { const U = (D.UNITS[n] || { u: [], p: "" }), ud = U.u.filter(u => S.units[u.split(" ")[0]]).length, pr = !!(S.phases[n] || {}).proved, sub = D.SUBSET.includes(n);
      return `<details class="phase" ${nu && nu.n === n ? "open" : ""}><summary><span class="mono muted">${C.pad(n)}</span><span><b style="font-weight:550">${esc(D.PHASE_NAMES[n])}</b> ${sub ? '<span class="pill lime" style="margin-left:6px">by June</span>' : `<span class="muted" style="font-size:12.5px;margin-left:6px">${esc(D.PHASE_WHEN[n])}</span>`}${pr ? ' <span class="pill cyan">proved</span>' : ""}</span><span class="hide-sm">${bar(U.u.length ? ud / U.u.length : 0, 1, "c")}</span><span class="mono muted n" style="text-align:right;font-size:12.5px">${r1(h[n] || 0)}/${D.PHASE_HRS[n]}h</span></summary>
        <div class="body"><div class="checks">${U.u.map(u => { const k = u.split(" ")[0]; return `<label class="${S.units[k] ? "done" : ""}"><input type="checkbox" data-ch="unit" data-k="${k}" ${S.units[k] ? "checked" : ""}><span>${esc(u)}</span>${S.units[k] ? `<small class="muted" style="margin-left:auto">${fmt(S.units[k])}</small>` : ""}</label>`; }).join("")}
          ${n !== 2 ? `<label class="${pr ? "done" : ""}"><input type="checkbox" data-ch="prove" data-n="${n}" ${pr ? "checked" : ""}><span><b>Prove-it:</b> ${esc(U.p)}</span></label>` : ""}</div>
          <div class="row"><input type="number" step=".25" min="0" placeholder="hours" data-hrs="${n}" aria-label="Hours"><button class="btn xs" data-act="roadHrs" data-n="${n}">Log hours today</button></div></div></details>`; }).join("")}</div></div>`;
}

// ================= ACADEMICS =================
function vAcad() {
  const t = today(), sm = C.sem(S), wk = C.monday(t), w = C.sumRange(S, wk, C.add(wk, 6)), all = C.sumRange(S, D.START, t < D.START ? D.START : t);
  if (!topicSubj || !sm.subjects.find(x => x.c === topicSubj)) topicSubj = (sm.subjects.find(x => !x.lab) || {}).c;
  const ts = sm.subjects.find(x => x.c === topicSubj), path = C.cgPath(S), p = S.prior;
  const wi = (() => { const last = path.slice(-1)[0]; let pts = p.cg * p.cr, cr = p.cr; path.forEach(x => { pts += x.g * x.c; cr += x.c; }); return (pts + p.wiS * p.wiC) / (cr + p.wiC); })();
  $("#view").innerHTML = `<div class="view">
    <div class="g c4">${D.DATES.filter(x => x[1] >= t).slice(0, 4).map((x, i) => `<div class="glass card stat spot"><div class="k">${esc(x[0])}</div><div class="v ${i === 0 ? "grad" : ""}">${C.diff(t, x[1])}<small>days</small></div><div class="f">${fmt(x[1], { weekday: "short", day: "numeric", month: "short" })}</div></div>`).join("")}</div>
    <div class="glass card spot"><div class="hd"><div class="row"><h2>Semester</h2><select data-ch="sem" aria-label="Semester">${S.sems.map(s => `<option value="${esc(s.id)}" ${s.id === S.activeSem ? "selected" : ""}>${esc(s.name)} · ${C.credits(s)} credits</option>`).join("")}</select></div><div class="row"><span class="muted">Target SGPA</span><span class="grad" style="font:500 30px var(--display);letter-spacing:-.03em">${C.sgpa(sm).toFixed(2)}</span><button class="btn xs" data-act="addSem">Add semester</button></div></div>
      <div class="tbl"><table><thead><tr><th>Code</th><th>Course</th><th class="n">Cr</th><th class="n">IA1</th><th class="n">IA2</th><th>Status</th><th>Target</th><th class="n">Week</th><th class="n">Total</th><th></th></tr></thead><tbody>${sm.subjects.map((x, i) => { const pc = C.iaPct(S, x);
        const st = x.lab ? '<span class="pill">lab</span>' : pc == null ? '<span class="pill">no IA yet</span>' : pc < .6 ? '<span class="pill coral">priority</span>' : pc < .8 ? '<span class="pill amber">watch</span>' : '<span class="pill lime">on track</span>';
        const ia = k => x.lab ? "–" : `<input type="number" min="0" max="${S.iaMax}" value="${x[k] ?? ""}" data-ch="ia" data-k="${k}" data-i="${i}" style="width:64px" aria-label="${k} ${esc(x.c)}">`;
        return `<tr><td class="mono">${esc(x.c)}</td><td>${esc(x.n)}</td><td class="n">${x.cr}</td><td class="n">${ia("ia1")}</td><td class="n">${ia("ia2")}</td><td>${st}</td><td><select data-ch="tg" data-i="${i}" aria-label="Target grade">${Object.keys(C.GP).map(g => `<option ${x.tg === g ? "selected" : ""}>${g}</option>`).join("")}</select></td><td class="n">${r1(w.by[x.c] || 0)}h</td><td class="n">${r1(all.by[x.c] || 0)}h</td><td><button class="x" data-act="delSubj" data-i="${i}" aria-label="Remove">×</button></td></tr>`; }).join("")}</tbody></table></div>
      <div class="row"><input id="sC" placeholder="Code" style="width:100px" aria-label="Code"><input id="sN" class="grow" placeholder="Course name" aria-label="Course"><input type="number" id="sCr" placeholder="Credits" aria-label="Credits"><label class="row" style="font-size:13.5px"><input type="checkbox" id="sL"> Lab</label><button class="btn sm" data-act="addSubj">Add subject</button></div>
      <div class="row"><label class="f">Actual SGPA (after results)<input type="number" step=".01" min="0" max="10" value="${sm.actual ?? ""}" data-ch="actual"></label><label class="f">IA out of<input type="number" min="1" value="${S.iaMax}" data-ch="iaMax"></label></div>
      <p class="note">Grade points S 10 · A 9 · B 8 · C 7 · D 6 · E 4 · F 0 are placeholders; check MSRIT's cut-offs. Status uses IA marks (averaged once IA2 is in).</p></div>
    <div class="g c2">
      <div class="glass card spot"><div class="hd"><h2>Syllabus</h2><select data-ch="topicSubj" aria-label="Subject">${sm.subjects.filter(x => !x.lab).map(x => `<option ${x.c === topicSubj ? "selected" : ""}>${esc(x.c)}</option>`).join("")}</select></div>
        <p class="muted" style="margin:0;font-size:13px">Add each subject's chapters and topics in order. Today's plan then tells you exactly which topic to study next.</p>
        ${ts ? `<div class="checks">${ts.topics.map((tp, j) => `<label class="${tp.done ? "done" : ""}"><input type="checkbox" data-ch="topic" data-j="${j}" ${tp.done ? "checked" : ""}><span>${esc(tp.t)}</span><button class="x" data-act="delTopic" data-j="${j}" style="margin-left:auto" aria-label="Remove">×</button></label>`).join("") || '<p class="empty">No topics yet.</p>'}</div>
        <div class="row"><input id="tpNew" class="grow" placeholder="Topic, e.g. Inverse Laplace by partial fractions" aria-label="New topic"><button class="btn sm" data-act="addTopic">Add</button></div>
        <details><summary class="muted" style="cursor:pointer;font-size:13px">Paste several topics at once</summary><textarea id="tpBulk" placeholder="One topic per line"></textarea><button class="btn xs" data-act="bulkTopics">Add all</button></details>` : ""}</div>
      <div class="glass card spot"><h2>CGPA path</h2>
        <div class="row"><label class="f">First-year CGPA<input type="number" step=".01" value="${p.cg}" data-ch="prior" data-k="cg"></label><label class="f">First-year credits<input type="number" value="${p.cr}" data-ch="prior" data-k="cr"></label></div>
        <div class="tbl"><table><thead><tr><th>Period</th><th class="n">Credits</th><th class="n">SGPA</th><th class="n">CGPA after</th></tr></thead><tbody><tr><td>First year</td><td class="n">${p.cr}</td><td class="n">${(+p.cg).toFixed(2)}</td><td class="n">${(+p.cg).toFixed(2)}</td></tr>${path.map(x => `<tr><td>${esc(x.s.name)} ${x.s.actual != null ? '<span class="pill lime">actual</span>' : '<span class="pill violet">target</span>'}</td><td class="n">${x.c}</td><td class="n">${x.g.toFixed(2)}</td><td class="n">${x.cg.toFixed(2)}</td></tr>`).join("")}</tbody></table></div>
        <div class="row"><label class="f">What-if next SGPA<input type="number" step=".05" value="${p.wiS}" data-ch="prior" data-k="wiS"></label><label class="f">Credits<input type="number" value="${p.wiC}" data-ch="prior" data-k="wiC"></label><div><div class="muted" style="font-size:12px">CGPA after</div><div class="grad" style="font:500 30px var(--display)">${isFinite(wi) ? wi.toFixed(2) : "–"}</div></div></div></div>
    </div></div>`;
}

// ================= CAREER =================
const STAGES = ["Wishlist", "Applied", "Interview", "Offer", "Rejected"];
function vCareer() {
  const sent = S.apps.filter(a => a.stage !== "Wishlist").length, iv = S.apps.filter(a => a.stage === "Interview").length, of = S.apps.filter(a => a.stage === "Offer").length, g = S.projects[0];
  const pct = p => p.tasks.length ? p.tasks.filter(x => x.done).length / p.tasks.length : 0;
  $("#view").innerHTML = `<div class="view">
    <div class="g c4">
      <div class="glass card stat spot"><div class="k">Applications sent</div><div class="v grad">${sent}<small>/ 100</small></div>${bar(sent, 100)}</div>
      <div class="glass card stat spot"><div class="k">Interviews</div><div class="v">${iv}</div></div>
      <div class="glass card stat spot"><div class="k">Offers</div><div class="v">${of}</div></div>
      <div class="glass card stat spot"><div class="k">${g ? esc(g.name) : "Flagship"}</div><div class="v">${g ? Math.round(pct(g) * 100) : 0}<small>%</small></div>${g && g.due ? `<div class="f">Live by ${fmt(g.due)} · ${C.diff(today(), g.due)} days</div>` : ""}</div></div>
    <div class="g c2e">${S.projects.map((p, pi) => `<div class="glass card spot"><div class="hd"><div><h2>${esc(p.name)}</h2><span class="muted" style="font-size:12.5px">${esc(p.tag || "")}${p.due ? ` · due ${fmt(p.due)}` : ""}</span></div><div class="ringwrap" style="width:58px;height:58px">${ring(pct(p), 58, 5, pi ? "#ffb84d" : "#d6ff4f", pi ? "#ff6f52" : "#5ce1ff", "rgp" + pi)}<div class="lbl"><b style="font-size:14px">${Math.round(pct(p) * 100)}%</b></div></div></div>
      <div class="row"><input class="grow" placeholder="Live link or repo" value="${esc(p.link || "")}" data-ch="plink" data-i="${pi}" aria-label="Link">${p.link ? `<a class="btn xs" href="${esc(p.link)}" target="_blank" rel="noopener">Open</a>` : ""}</div>
      <div class="checks">${p.tasks.map((tk, ti) => `<label class="${tk.done ? "done" : ""}"><input type="checkbox" data-ch="ptask" data-i="${pi}" data-j="${ti}" ${tk.done ? "checked" : ""}><span>${esc(tk.t)}</span><button class="x" data-act="delPTask" data-i="${pi}" data-j="${ti}" style="margin-left:auto" aria-label="Remove">×</button></label>`).join("")}</div>
      <div class="row"><input class="grow" placeholder="Add a task" data-pnew="${pi}" aria-label="New task"><button class="btn xs" data-act="addPTask" data-i="${pi}">Add</button></div></div>`).join("")}</div>
    <div class="row"><input id="prjN" placeholder="New project name" aria-label="Project name"><button class="btn sm" data-act="addProject">Add project</button></div>
    <div class="glass card spot"><div class="hd"><div><h2>Internship pipeline</h2><span class="muted" style="font-size:12.5px">~10 applications and 5 cold emails a week, Feb–Apr 2027</span></div></div>
      <div class="row"><input id="apCo" placeholder="Company" aria-label="Company"><input id="apRole" placeholder="Role" aria-label="Role"><select id="apCh" aria-label="Channel"><option>Cold email</option><option>Referral</option><option>Job board</option><option>LinkedIn DM</option><option>Company programme</option><option>GSoC</option></select><input id="apPay" placeholder="Stipend" style="width:120px" aria-label="Stipend"><button class="btn sm primary" data-act="addApp">Add</button></div>
      <div class="kan">${STAGES.map(st => { const L = S.apps.filter(a => a.stage === st); return `<div class="col"><h4><span>${st}</span><span>${L.length}</span></h4>${L.map(a => `<div class="kc"><b>${esc(a.co)}</b><span class="muted">${esc(a.role || "")}${a.pay ? " · " + esc(a.pay) : ""}</span><span class="muted" style="font-size:12px">${esc(a.ch)}${a.date ? " · " + fmt(a.date) : ""}${a.follow && !["Offer", "Rejected"].includes(st) ? ` · follow up ${fmt(a.follow)}` : ""}</span><div class="row"><select data-ch="stage" data-id="${a.id}" aria-label="Stage">${STAGES.map(s => `<option ${s === st ? "selected" : ""}>${s}</option>`).join("")}</select><button class="x" data-act="delApp" data-id="${a.id}" aria-label="Delete">×</button></div></div>`).join("")}</div>`; }).join("")}</div></div>
    <div class="g c2e">
      <div class="glass card spot"><h2>Resume checklist</h2><div class="checks">${D.RESUME.map((r, i) => `<label class="${S.resume[i] ? "done" : ""}"><input type="checkbox" data-ch="resume" data-i="${i}" ${S.resume[i] ? "checked" : ""}><span>${esc(r)}</span></label>`).join("")}</div></div>
      <div class="glass card spot"><h2>People and referrals</h2><div class="row"><input id="ctN" placeholder="Name" aria-label="Name"><input id="ctC" placeholder="Company" aria-label="Company"><input id="ctX" class="grow" placeholder="Next step" aria-label="Next step"><button class="btn sm" data-act="addContact">Add</button></div>
        <ul class="list">${S.contacts.map(c => `<li class="li"><span><b>${esc(c.name)}</b> <span class="muted">${esc(c.co)}</span><br><small class="muted">${esc(c.next || "")}${c.last ? " · last contact " + fmt(c.last) : ""}</small></span><span class="row"><button class="btn xs" data-act="pingContact" data-id="${c.id}">Contacted</button><button class="x" data-act="delContact" data-id="${c.id}" aria-label="Delete">×</button></span></li>`).join("") || '<p class="empty">Alumni, hackathon contacts and founders you reach out to.</p>'}</ul></div></div>
    <div class="g c2e">
      <div class="glass card spot"><div class="hd"><h2>Research papers</h2><span class="pill violet">${S.papers.filter(p => p.status === "Understood").length}/3 understood</span></div><div class="row"><input id="ppT" class="grow" placeholder="Paper title" aria-label="Paper"><button class="btn sm" data-act="addPaper">Add</button></div>
        <ul class="list">${S.papers.map(p => `<li class="li"><span>${esc(p.title)}</span><span class="row"><select data-ch="paper" data-id="${p.id}" aria-label="Status">${["To read", "Reading", "Understood"].map(s => `<option ${p.status === s ? "selected" : ""}>${s}</option>`).join("")}</select><button class="x" data-act="delPaper" data-id="${p.id}" aria-label="Delete">×</button></span></li>`).join("") || '<p class="empty">Pick from GHOSTRAVEN\'s area: post-quantum migration and crypto-agility.</p>'}</ul></div>
      <div class="glass card spot"><div class="hd"><h2>Hackathons</h2><span class="pill amber">${S.hacks.filter(h => h.res === "Won").length} won</span></div><div class="row"><input id="hkN" class="grow" placeholder="Hackathon" aria-label="Hackathon"><input type="date" id="hkD" aria-label="Date"><select id="hkR" aria-label="Result"><option>Upcoming</option><option>Participated</option><option>Finalist</option><option>Top 10</option><option>Podium</option><option>Won</option><option>Not selected</option></select><button class="btn sm" data-act="addHack">Add</button></div>
        <ul class="list">${S.hacks.map(h => `<li class="li"><span><b>${esc(h.name)}</b><br><small class="muted">${h.date ? fmt(h.date) + " · " : ""}${esc(h.note || "")}</small></span><span class="row"><span class="pill ${h.res === "Won" ? "lime" : /Podium|Top|Final/.test(h.res) ? "amber" : ""}">${esc(h.res)}</span><button class="x" data-act="delHack" data-id="${h.id}" aria-label="Delete">×</button></span></li>`).join("")}</ul></div></div>
  </div>`;
}

// ================= FITNESS =================
function vFit() {
  const t = today(), wk = C.monday(t), w = C.sumRange(S, wk, C.add(wk, 6)), l7 = C.sumRange(S, C.add(t, -6), t), avg = l7.sleep.length ? l7.sleep.reduce((a, b) => a + b, 0) / l7.sleep.length : null, l28 = C.sumRange(S, C.add(t, -27), t);
  $("#view").innerHTML = `<div class="view">
    <div class="g c4"><div class="glass card stat spot"><div class="k">Workouts this week</div><div class="v grad">${w.fitN}<small>/ ${S.fitGoal}</small></div>${bar(w.fitN, S.fitGoal)}</div><div class="glass card stat spot"><div class="k">Minutes this week</div><div class="v">${w.fitMin}</div></div><div class="glass card stat spot"><div class="k">Average sleep</div><div class="v">${avg == null ? "–" : avg.toFixed(1)}<small>h · 7 days</small></div></div><div class="glass card stat spot"><div class="k">Last 28 days</div><div class="v">${l28.fitN}<small>workouts</small></div></div></div>
    <div class="g c2e"><div class="glass card spot"><div class="hd"><h2>Workouts per week</h2><label class="f">Weekly goal<input type="number" min="1" max="7" value="${S.fitGoal}" data-ch="fitGoal"></label></div><svg class="chart" id="wkF"></svg></div>
      <div class="glass card spot"><h2>Sleep · last 14 days</h2><svg class="chart" id="slp"></svg></div></div>
    <div class="glass card spot"><div class="hd"><h2>Body weight</h2><div class="row"><input type="date" id="wD" value="${t}" aria-label="Date"><input type="number" id="wK" step=".1" placeholder="kg" aria-label="kg"><button class="btn sm" data-act="addWeight">Add</button></div></div><svg class="chart" id="wt" style="height:160px"></svg></div>
    <div class="glass card spot"><h2>This week's plan</h2><div class="g c4" style="gap:8px">${[1, 2, 3, 4, 5, 6, 0].map(i => { const x = D.WORKOUT[i]; return `<div class="note"><b style="color:var(--ink)">${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][i]}</b> · ${esc(x[0])} · ${x[2]} min<br>${esc(x[1])}</div>`; }).join("")}</div></div></div>`;
  const ws = []; for (let i = 9; i >= 0; i--) { const s = C.add(wk, -7 * i); ws.push([fmt(s), C.sumRange(S, s, C.add(s, 6)).fitN]); }
  barChart($("#wkF"), ws, { goal: S.fitGoal, min: 7, every: 2, c1: "#5ee39a" });
  const sl = []; for (let i = 13; i >= 0; i--) { const s = C.add(t, -i); sl.push([C.pd(s).getDate() + "", +(C.day(S, s).sleep || 0), fmt(s)]); }
  barChart($("#slp"), sl, { goal: 7, min: 9, c1: "#9d8bff", c2: "#ff6f52" });
  const el = $("#wt"), W = Math.max(300, el.clientWidth || 600), H = 160, pts = S.weights.slice().sort((a, b) => (a.d < b.d ? -1 : 1)); el.setAttribute("viewBox", `0 0 ${W} ${H}`);
  if (pts.length < 2) { el.innerHTML = `<text x="${W / 2}" y="${H / 2}" text-anchor="middle" fill="#83858e" font-size="13">Add two weigh-ins to see a trend</text>`; return; }
  const lo = Math.floor(Math.min(...pts.map(x => x.kg))) - 1, hi = Math.ceil(Math.max(...pts.map(x => x.kg))) + 1, t0 = C.pd(pts[0].d), sp = Math.max(1, C.pd(pts[pts.length - 1].d) - t0);
  const X = d => 36 + (C.pd(d) - t0) / sp * (W - 50), Y = v => 14 + (hi - v) / (hi - lo) * (H - 34), path = pts.map((x, i) => `${i ? "L" : "M"}${X(x.d)},${Y(x.kg)}`).join(""), l = pts[pts.length - 1];
  el.innerHTML = `<defs><linearGradient id="wg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5ce1ff" stop-opacity=".35"/><stop offset="1" stop-color="#5ce1ff" stop-opacity="0"/></linearGradient></defs><text x="0" y="${Y(hi) + 4}" fill="#55575f" font-size="10">${hi}</text><text x="0" y="${Y(lo) + 4}" fill="#55575f" font-size="10">${lo}</text><path d="${path}L${X(l.d)},${Y(lo)}L36,${Y(lo)}Z" fill="url(#wg)"/><path d="${path}" fill="none" stroke="#5ce1ff" stroke-width="2.5"/><circle cx="${X(l.d)}" cy="${Y(l.kg)}" r="5" fill="#5ce1ff"/><text x="${X(l.d) - 10}" y="${Y(l.kg) - 10}" text-anchor="end" fill="#f4f4f1" font-size="12">${l.kg} kg</text>`;
}

// ================= REFLECT =================
function vReflect() {
  const a = revWeek, b = C.add(a, 6), r = S.reviews[a] || {}, w = C.sumRange(S, a, b), P = C.period(a);
  const Q = [["done", "What did you complete?"], ["missed", "What did you miss, and why?"], ["unclear", "Which concepts are still unclear?"], ["revise", "Which problems need revision?"], ["deadlines", "Deadlines in the next 14 days"], ["next", "Next week's top 3 priorities"]];
  const keys = Object.keys(S.reviews).filter(k => Object.values(S.reviews[k]).some(v => v !== "" && v != null)).sort().reverse();
  const J = Object.keys(S.days).filter(k => S.days[k].note).sort().reverse().slice(0, 40);
  $("#view").innerHTML = `<div class="view">
    <div class="glass card spot"><div class="hd"><h2>Weekly review</h2><div class="row"><button class="btn xs" data-act="revW" data-dir="-1" aria-label="Previous week">←</button><span class="mono">${fmt(a)} – ${fmt(b)}</span><button class="btn xs" data-act="revW" data-dir="1" aria-label="Next week">→</button></div></div>
      <div class="g c4"><div class="note">DSA ${w.dsaN}${P.dsa ? "/" + P.dsa : ""}</div><div class="note">Study ${r1(w.acad)}h</div><div class="note">Roadmap ${r1(w.road)}h</div><div class="note">Active ${w.active}/7 days</div></div>
      <div class="g c2e">${Q.map(q => `<label class="f">${q[1]}<textarea data-rv="${q[0]}">${esc(r[q[0]] || "")}</textarea></label>`).join("")}</div>
      <div class="row"><span class="muted" style="font-size:13px">Week score</span><div class="seg">${[...Array(10)].map((_, i) => `<button type="button" data-act="score" data-n="${i + 1}" aria-pressed="${r.score === i + 1}">${i + 1}</button>`).join("")}</div></div></div>
    <div class="g c2e"><div class="glass card spot"><h2>Daily reflections</h2><ul class="list">${J.map(k => `<li class="li" style="display:grid"><small class="muted mono">${fmt(k, { weekday: "short", day: "numeric", month: "short" })}${S.days[k].mood ? " · " + ["Rough", "Low", "Okay", "Good", "Great"][S.days[k].mood - 1] : ""}</small><span>${esc(S.days[k].note)}</span></li>`).join("") || '<p class="empty">Write one line in Check-in on the Today page each evening.</p>'}</ul></div>
      <div class="glass card spot"><h2>Past reviews</h2><ul class="list">${keys.map(k => `<li class="li"><span><b>${fmt(k)}</b> <span class="muted">${S.reviews[k].score ? "· " + S.reviews[k].score + "/10" : ""}</span><br><small class="muted">${esc((S.reviews[k].next || "").slice(0, 110))}</small></span><button class="btn xs" data-act="openRev" data-w="${k}">Open</button></li>`).join("") || '<p class="empty">Your first review is due Sunday evening.</p>'}</ul></div></div></div>`;
}

// ================= SETTINGS =================
function vSettings() {
  $("#view").innerHTML = `<div class="view"><div class="g c2e">
    <div class="glass card spot"><h2>Account</h2><div class="row"><label class="f grow">Name<input data-ch="name" value="${esc(user.name)}" disabled title="Name comes from your account"></label><label class="f grow">Email<input value="${esc(user.email)}" disabled></label></div>
      <h3>Change password</h3><div class="row"><input type="password" id="pwC" placeholder="Current password" autocomplete="current-password" aria-label="Current password"><input type="password" id="pwN" placeholder="New password" autocomplete="new-password" aria-label="New password"><button class="btn sm" data-act="changePw">Update</button></div><p class="muted" id="pwMsg" style="margin:0;font-size:13px"></p>
      <button class="btn sm danger" data-act="logout" style="justify-self:start">Log out</button></div>
    <div class="glass card spot"><h2>Your data is safe</h2><p class="muted" style="margin:0;font-size:13.5px">Every change saves to the server within a second. If you're offline it's kept on this device and sent when you're back. The server also keeps one snapshot per day.</p>
      <div class="row"><select id="snapSel" aria-label="Snapshot"><option>Loading snapshots…</option></select><button class="btn sm" data-act="restore">Restore this day</button></div>
      <div class="row"><button class="btn sm" data-act="export">Download backup</button><label class="btn sm" for="impFile">Import backup or Career OS file</label><input type="file" id="impFile" accept=".json,application/json" class="sr"></div><p class="muted" id="impMsg" style="margin:0;font-size:13px"></p></div></div>
    <div class="g c2e"><div class="glass card spot"><h2>Daily habits</h2><ul class="list">${S.habits.map((h, i) => `<li class="li"><span>${esc(h.t)}</span><button class="x" data-act="delHabit" data-i="${i}" aria-label="Remove">×</button></li>`).join("")}</ul><div class="row"><input id="habN" class="grow" placeholder="New daily habit" aria-label="New habit"><button class="btn sm" data-act="addHabit">Add</button></div></div>
      <div class="glass card spot"><h2>How the daily plan works</h2><p class="muted" style="margin:0;font-size:13.5px;line-height:1.7">Each morning the portal builds today's list from your plan: due revisions, the next unsolved A2Z problems, your priority subjects plus the day's rotation subject (using your syllabus topics), the next roadmap unit, a free-period reading topic, project and application tasks in their windows, and the day's workout. The list stays fixed for the day so it doesn't move while you work. Plan dates live in <code>public/data.js</code>.</p></div></div></div>`;
  api("/api/snapshots").then(r => { const s = $("#snapSel"); if (!s) return; s.innerHTML = r.ok && r.data.snapshots.length ? r.data.snapshots.map(d => `<option value="${d}">${fmt(d, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</option>`).join("") : "<option value=''>No snapshots yet</option>"; });
}

// ================= actions =================
function solveKey(key, ind) {
  const k = C.keyInfo(key), t = today();
  if (S.problems.find(p => p.key === key)) return;
  S.problems.push({ id: C.uid(), key, d: t, n: k.name, st: k.st, df: k.st >= 3 ? "Medium" : "Easy", ind, min: null, r: [false, false, false], rd: [null, null, null] });
  toast(ind ? "Solved. Revision scheduled for tomorrow." : "Logged, not counted. It'll come back for revision.");
  mark("problems");
}
function tick(id) {
  const t = today(), d = C.ensureDay(S, t), T = C.tasks(S, t).list.find(x => x.id === id); if (!T) return;
  switch (T.kind) {
    case "rev": { const p = S.problems.find(x => x.id === T.pid); p.r[T.ri] = !p.r[T.ri]; p.rd[T.ri] = p.r[T.ri] ? t : null; return mark("problems"); }
    case "dsa": { const ex = S.problems.find(p => p.key === T.key); if (ex) { S.problems = S.problems.filter(p => p !== ex); return mark("problems"); } return solveKey(T.key, true); }
    case "unit": { if (T.prove) { S.phases[T.n] = Object.assign({}, S.phases[T.n], { proved: !(S.phases[T.n] || {}).proved }); return mark("phases"); } if (S.units[T.ukey]) delete S.units[T.ukey]; else S.units[T.ukey] = t; return mark("units"); }
    case "read": { if (S.reading[T.idx]) delete S.reading[T.idx]; else S.reading[T.idx] = t; return mark("reading"); }
    case "ship": { const p = S.projects.find(x => x.id === T.pid), tk = p.tasks.find(x => x.id === T.tid); tk.done = !tk.done; return mark("projects"); }
    case "move": { d.fit = T.done ? { type: "", min: 0 } : { type: T.wtype, min: T.wmin }; return mark("days", t); }
    case "habit": { d.habits = Object.assign({}, d.habits, { [T.hid]: !d.habits[T.hid] }); return mark("days", t); }
    case "reflect": { const ta = document.querySelector('[data-in="note"]'); if (ta) { ta.focus(); ta.scrollIntoView({ behavior: "smooth", block: "center" }); } return; }
    case "study": if (T.done && !d.done[id]) { toast("Done by logged hours. Remove hours on Progress to undo."); return; }
    default: d.done = Object.assign({}, d.done, { [id]: !d.done[id] }); if (T.kind === "study" && T.topicId && d.done[id]) { const sb = C.sem(S).subjects.find(x => x.c === T.code), tp = sb && sb.topics.find(x => x.id === T.topicId); if (tp) { tp.done = true; mark("sems", null, { quiet: true }); } } return mark("days", t);
  }
}
document.addEventListener("click", e => {
  const b = e.target.closest("[data-act]"); if (!b) return; const A = b.dataset.act, t = today();
  if (b.tagName === "A" && A !== "more") return;
  e.preventDefault();
  const v = s => (document.querySelector(s) || {}).value || "";
  switch (A) {
    case "more": $("#more").classList.toggle("hidden"); return;
    case "logout": (async () => { if (dirty.size) await push(); await api("/api/auth/logout", "POST", {}); window.HubAPI.setToken(null); try { localStorage.removeItem(cacheKey()); } catch (er) {} S = null; user = null; version = 0; setAuthMode("login"); showAuth("You're logged out."); })(); return;
    case "tick": return tick(b.dataset.id);
    case "solve": return solveKey(b.dataset.key, b.dataset.ind === "1");
    case "moreDsa": { const d = C.ensureDay(S, t); d.plan = d.plan || C.makePlan(S, t); const nx = C.nextProblems(S, 1, d.plan.dsa); if (nx.length) { d.plan.dsa = d.plan.dsa.concat(nx); mark("days", t); } return; }
    case "logStudy": { C.ensureDay(S, t).acad.push({ s: b.dataset.code, h: Math.round(+b.dataset.min / 60 * 100) / 100 }); toast(`${b.dataset.min} min of ${b.dataset.code} logged`); return mark("days", t); }
    case "logUnit": { C.ensureDay(S, t).road.push({ p: +b.dataset.n, h: 1 }); toast("1 hour logged"); return mark("days", t); }
    case "mood": { C.ensureDay(S, t).mood = +b.dataset.n; return mark("days", t); }
    case "preset": if (S.timer) { toast("Stop the running session first"); return; } timerSel = v("#tTarget") || timerSel; timerPreset = +b.dataset.m; $("#timerCard").innerHTML = timerHTML(); syncTimerSelect(); return;
    case "timer": if (S.timer) stopTimer(false); else { timerSel = v("#tTarget"); S.timer = { start: Date.now(), target: timerSel, dur: timerPreset }; mark("timer"); } return;
    case "heatF": heatF = b.dataset.f; return render();
    case "openDay": case "pickDay": sel = b.dataset.d; if (cur() !== "progress") { location.hash = "#progress"; } else { renderCal(); renderDayCard(); } return;
    case "calM": { const [y, m] = calM.split("-").map(Number), d = new Date(y, m - 1 + +b.dataset.dir, 1); calM = `${d.getFullYear()}-${C.pad(d.getMonth() + 1)}`; return renderCal(); }
    case "addAcad": { const h = +v("#qaH"); if (!(h > 0)) return toast("Enter hours"); C.ensureDay(S, sel).acad.push({ s: v("#qaSubj"), h }); return mark("days", sel); }
    case "delAcad": { C.ensureDay(S, b.dataset.d).acad.splice(+b.dataset.i, 1); return mark("days", b.dataset.d); }
    case "delRoad": { C.ensureDay(S, b.dataset.d).road.splice(+b.dataset.i, 1); return mark("days", b.dataset.d); }
    case "delProb": S.problems = S.problems.filter(p => p.id !== b.dataset.id); return mark("problems");
    case "revise": { const p = S.problems.find(x => x.id === b.dataset.id); p.r[+b.dataset.i] = true; p.rd[+b.dataset.i] = t; toast("Revision done"); return mark("problems"); }
    case "manualProb": { const n = v("#mName").trim(); if (!n) return toast("Enter the problem name"); const st = +v("#mStep"); const names = D.A2Z[st][2]; const idx = names.findIndex(x => x.toLowerCase() === n.toLowerCase()); const key = idx >= 0 ? st + ":" + idx : null; if (key && S.problems.find(p => p.key === key)) return toast("Already logged");
      S.problems.push({ id: C.uid(), key, d: t, n, st, df: v("#mDiff"), ind: $("#mInd").checked, min: +v("#mMin") || null, r: [false, false, false], rd: [null, null, null] }); toast("Logged"); return mark("problems"); }
    case "roadHrs": { const inp = document.querySelector(`[data-hrs="${b.dataset.n}"]`), h = +inp.value; if (!(h > 0)) return toast("Enter hours"); C.ensureDay(S, t).road.push({ p: +b.dataset.n, h }); toast(`${h}h logged`); return mark("days", t); }
    case "addSem": { const n = S.sems.length + 3, id = "sem" + n + "-" + C.uid().slice(0, 4); S.sems.push({ id, name: "Semester " + n, actual: null, subjects: [] }); S.activeSem = id; toast("Semester added. Add its subjects."); return mark(["sems", "activeSem"]); }
    case "addSubj": { const c = v("#sC").trim(), n = v("#sN").trim(), cr = parseFloat(v("#sCr")); if (!c || !n || !(cr >= 0)) return toast("Enter code, name and credits"); C.sem(S).subjects.push({ c, n, cr, ia1: null, ia2: null, tg: "S", lab: $("#sL").checked, topics: [] }); return mark("sems"); }
    case "delSubj": if (!b.dataset.armed) { b.dataset.armed = 1; b.textContent = "?"; toast("Click again to remove"); setTimeout(() => { delete b.dataset.armed; b.textContent = "×"; }, 3000); return; } C.sem(S).subjects.splice(+b.dataset.i, 1); return mark("sems");
    case "addTopic": { const x = C.sem(S).subjects.find(s => s.c === topicSubj), tt = v("#tpNew").trim(); if (!x || !tt) return; x.topics.push({ id: C.uid(), t: tt, done: false }); return mark("sems"); }
    case "bulkTopics": { const x = C.sem(S).subjects.find(s => s.c === topicSubj); v("#tpBulk").split("\n").map(s => s.trim()).filter(Boolean).forEach(tt => x.topics.push({ id: C.uid(), t: tt, done: false })); return mark("sems"); }
    case "delTopic": { C.sem(S).subjects.find(s => s.c === topicSubj).topics.splice(+b.dataset.j, 1); return mark("sems"); }
    case "addProject": { const n = v("#prjN").trim(); if (!n) return; S.projects.push({ id: C.uid(), name: n, tag: "", due: "", link: "", tasks: [] }); return mark("projects"); }
    case "addPTask": { const i = +b.dataset.i, inp = document.querySelector(`[data-pnew="${i}"]`), tt = inp.value.trim(); if (!tt) return; S.projects[i].tasks.push({ id: C.uid(), t: tt, done: false }); return mark("projects"); }
    case "delPTask": S.projects[+b.dataset.i].tasks.splice(+b.dataset.j, 1); return mark("projects");
    case "addApp": { const co = v("#apCo").trim(); if (!co) return toast("Enter a company"); S.apps.push({ id: C.uid(), co, role: v("#apRole").trim(), ch: v("#apCh"), pay: v("#apPay").trim(), stage: "Applied", date: t, follow: C.add(t, 7) }); return mark("apps"); }
    case "delApp": S.apps = S.apps.filter(a => a.id !== b.dataset.id); return mark("apps");
    case "addContact": { const n = v("#ctN").trim(); if (!n) return; S.contacts.push({ id: C.uid(), name: n, co: v("#ctC").trim(), next: v("#ctX").trim(), last: "" }); return mark("contacts"); }
    case "pingContact": { const c = S.contacts.find(x => x.id === b.dataset.id); c.last = t; return mark("contacts"); }
    case "delContact": S.contacts = S.contacts.filter(x => x.id !== b.dataset.id); return mark("contacts");
    case "addPaper": { const n = v("#ppT").trim(); if (!n) return; S.papers.push({ id: C.uid(), title: n, status: "To read" }); return mark("papers"); }
    case "delPaper": S.papers = S.papers.filter(x => x.id !== b.dataset.id); return mark("papers");
    case "addHack": { const n = v("#hkN").trim(); if (!n) return; S.hacks.unshift({ id: C.uid(), name: n, date: v("#hkD"), res: v("#hkR"), note: "" }); return mark("hacks"); }
    case "delHack": S.hacks = S.hacks.filter(x => x.id !== b.dataset.id); return mark("hacks");
    case "addWeight": { const kg = +v("#wK"), d = v("#wD"); if (!(kg > 0) || !d) return toast("Enter a weight"); S.weights = S.weights.filter(x => x.d !== d).concat([{ d, kg }]); return mark("weights"); }
    case "revW": revWeek = C.add(revWeek, 7 * +b.dataset.dir); return vReflect();
    case "openRev": revWeek = b.dataset.w; vReflect(); return scrollTo({ top: 0, behavior: "smooth" });
    case "score": S.reviews[revWeek] = Object.assign({}, S.reviews[revWeek], { score: +b.dataset.n }); mark("reviews", null, { quiet: true }); return vReflect();
    case "addHabit": { const n = v("#habN").trim(); if (!n) return; S.habits.push({ id: "h-" + C.uid(), t: n }); return mark("habits"); }
    case "delHabit": S.habits.splice(+b.dataset.i, 1); return mark("habits");
    case "changePw": (async () => { const r = await api("/api/auth/password", "POST", { current: v("#pwC"), next: v("#pwN") }); $("#pwMsg").textContent = r.ok ? "Password updated." : (r.data && r.data.error) || "Couldn't update."; })(); return;
    case "restore": (async () => { const d = v("#snapSel"); if (!d) return; if (!b.dataset.armed) { b.dataset.armed = 1; b.textContent = "Click again to restore"; setTimeout(() => { delete b.dataset.armed; b.textContent = "Restore this day"; }, 4000); return; }
      if (dirty.size) await push(); const r = await api("/api/snapshots/restore", "POST", { date: d }); if (r.ok) { S = C.normalize(r.data.data, user.name); version = r.data.version; saveLocal(); toast("Restored " + fmt(d)); render(); } else toast((r.data && r.data.error) || "Couldn't restore"); })(); return;
    case "export": { const blob = new Blob([JSON.stringify(S, null, 1)], { type: "application/json" }), a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `ak-career-backup-${t}.json`; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); return; }
  }
});
let noteT = null, rvT = null;
document.addEventListener("input", e => {
  const el = e.target, t = today();
  if (el.dataset.in === "note") { C.ensureDay(S, t).note = el.value; clearTimeout(noteT); noteT = setTimeout(() => mark("days", t, { quiet: true }), 500); return; }
  if (el.dataset.rv) { S.reviews[revWeek] = Object.assign({}, S.reviews[revWeek], { [el.dataset.rv]: el.value }); clearTimeout(rvT); rvT = setTimeout(() => mark("reviews", null, { quiet: true }), 500); return; }
  if (el.id === "dsaQ") { dsaQ = el.value.toLowerCase(); const pos = el.selectionStart; vDSA(); const n = $("#dsaQ"); n.focus(); n.setSelectionRange(pos, pos); }
});
document.addEventListener("change", e => {
  const el = e.target, k = el.dataset.ch, t = today(); if (!S) return;
  if (el.id === "tTarget") { timerSel = el.value; return; }
  if (el.id === "impFile" && el.files && el.files[0]) { const f = el.files[0], rd = new FileReader(); rd.onload = () => { try { const x = JSON.parse(rd.result); const n = C.normalize(importShape(x), user.name); S = n; Object.keys(S).forEach(kk => dirty.add(kk)); Object.keys(S.days).forEach(dd => dirtyDays.add(dd)); mark([]); $("#impMsg").textContent = "Imported " + f.name + "."; } catch (er) { $("#impMsg").textContent = "That file isn't a backup this portal understands."; } el.value = ""; }; rd.readAsText(f); return; }
  if (!k) return; const sm = C.sem(S);
  switch (k) {
    case "sleep": C.ensureDay(S, t).sleep = el.value === "" ? null : +el.value; return mark("days", t, { quiet: true });
    case "fitType": case "fitMin": { const d = C.ensureDay(S, t); const card = el.closest(".card"); d.fit = { type: card.querySelector('[data-ch="fitType"]').value, min: +card.querySelector('[data-ch="fitMin"]').value || 0 }; return mark("days", t); }
    case "dsaFilter": dsaFilter = el.value; return vDSA();
    case "ind": { const p = S.problems.find(x => x.id === el.dataset.id); p.ind = el.checked; return mark("problems"); }
    case "rev": { const p = S.problems.find(x => x.id === el.dataset.id), i = +el.dataset.i; p.r[i] = el.checked; p.rd[i] = el.checked ? t : null; return mark("problems"); }
    case "unit": if (el.checked) S.units[el.dataset.k] = t; else delete S.units[el.dataset.k]; return mark("units");
    case "prove": S.phases[el.dataset.n] = Object.assign({}, S.phases[el.dataset.n], { proved: el.checked }); return mark("phases");
    case "sem": S.activeSem = el.value; return mark("activeSem");
    case "ia": sm.subjects[+el.dataset.i][el.dataset.k] = el.value === "" ? null : Math.min(S.iaMax, Math.max(0, +el.value)); return mark("sems");
    case "tg": sm.subjects[+el.dataset.i].tg = el.value; return mark("sems");
    case "actual": sm.actual = el.value === "" ? null : Math.min(10, Math.max(0, +el.value)); return mark("sems");
    case "iaMax": S.iaMax = Math.max(1, +el.value || 30); return mark("iaMax");
    case "topicSubj": topicSubj = el.value; return vAcad();
    case "topic": { const x = sm.subjects.find(s => s.c === topicSubj); x.topics[+el.dataset.j].done = el.checked; return mark("sems"); }
    case "prior": S.prior = Object.assign({}, S.prior, { [el.dataset.k]: +el.value }); return mark("prior");
    case "plink": S.projects[+el.dataset.i].link = el.value.trim(); return mark("projects");
    case "ptask": S.projects[+el.dataset.i].tasks[+el.dataset.j].done = el.checked; return mark("projects");
    case "stage": { const a = S.apps.find(x => x.id === el.dataset.id); a.stage = el.value; return mark("apps"); }
    case "resume": S.resume = Object.assign({}, S.resume, { [el.dataset.i]: el.checked }); return mark("resume");
    case "paper": { const p = S.papers.find(x => x.id === el.dataset.id); p.status = el.value; return mark("papers"); }
    case "fitGoal": S.fitGoal = Math.min(7, Math.max(1, Math.round(+el.value || 4))); return mark("fitGoal");
  }
});
document.addEventListener("keydown", e => {
  if (e.key !== "Enter" || e.target.tagName !== "INPUT") return;
  const map = { mName: "manualProb", tpNew: "addTopic", apCo: "addApp", apRole: "addApp", ctN: "addContact", ctX: "addContact", ppT: "addPaper", hkN: "addHack", habN: "addHabit", prjN: "addProject", qaH: "addAcad", wK: "addWeight" };
  const act = map[e.target.id] || (e.target.dataset.pnew != null ? "addPTask" : e.target.dataset.hrs != null ? "roadHrs" : null);
  if (!act) return; e.preventDefault();
  const btn = e.target.dataset.pnew != null ? document.querySelector(`[data-act="addPTask"][data-i="${e.target.dataset.pnew}"]`) : e.target.dataset.hrs != null ? document.querySelector(`[data-act="roadHrs"][data-n="${e.target.dataset.hrs}"]`) : document.querySelector(`[data-act="${act}"]`);
  if (btn) btn.click();
});
// accept a backup from this portal, or the earlier Career OS / tracker files
function importShape(x) {
  if (x && x.data && x.version != null) x = x.data;
  if (x && x.dsa && x.settings && x.days && x.days.d) x = { days: x.days.d, problems: x.dsa.problems, totals: x.dsa.totals };
  if (x && x.days) Object.values(x.days).forEach(d => { if (d && d.checks && !d.habits) d.habits = d.checks; if (d) d.plan = d.plan || null; });
  if (x && Array.isArray(x.problems)) x.problems.forEach(p => { if (!p.key && p.st != null) { const i = (D.A2Z[p.st] || [, , []])[2].findIndex(n => n.toLowerCase() === String(p.n).toLowerCase()); if (i >= 0) p.key = p.st + ":" + i; } });
  if (x && Array.isArray(x.habits) && x.habits.some(h => h.auto || h.days)) x.habits = x.habits.filter(h => !h.auto).map(h => ({ id: h.id, t: h.t }));
  return x;
}
// spotlight on glass cards
document.addEventListener("pointermove", e => { const c = e.target.closest && e.target.closest(".spot"); if (!c) return; const r = c.getBoundingClientRect(); c.style.setProperty("--mx", e.clientX - r.left + "px"); c.style.setProperty("--my", e.clientY - r.top + "px"); });
// new day while open
let lastDay = today(); setInterval(() => { if (!S) return; if (today() !== lastDay) { lastDay = today(); sel = lastDay; render(); } else if (cur() === "today" && !S.timer) { const sc = document.querySelector(".sched"); if (sc) sc.innerHTML = schedHTML(today(), C.period(today())); } }, 60000);
})();
