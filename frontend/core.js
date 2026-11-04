/* AK CAREER core: dates, state shape, derived numbers and the daily planner. Shared by the landing page and the portal. */
window.AscentCore = (function () {
"use strict";
const D = window.ASCENT_DATA;

// ---------- dates ----------
const pad = n => String(n).padStart(2, "0");
const ds = d => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
const pd = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const add = (s, n) => { const d = pd(s); d.setDate(d.getDate() + n); return ds(d); };
const diff = (a, b) => Math.round((pd(b) - pd(a)) / 864e5);
const today = () => ds(new Date());
const monday = s => { const d = pd(s); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return ds(d); };
const fmt = (s, o) => pd(s).toLocaleDateString("en-IN", o || { day: "numeric", month: "short" });
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const clone = o => JSON.parse(JSON.stringify(o));
const r1 = h => String(Math.round(h * 10) / 10);

// ---------- state ----------
function defaults(name) {
  return {
    v: 1, name: name || "", createdAt: Date.now(),
    days: {}, problems: [], totals: D.A2Z.map(s => s[1]), units: {}, phases: {}, reading: {},
    sems: [clone(D.SEM3)], activeSem: "sem3", prior: { cg: 7.67, cr: 40, wiS: 9.5, wiC: 21 },
    ms: {}, fitGoal: 4, weights: [], reviews: {}, habits: clone(D.HABITS),
    projects: D.PROJECTS.map(p => ({ id: p.id, name: p.name, tag: p.tag, due: p.due, link: "", tasks: p.tasks.map(t => ({ id: uid(), t, done: false })) })),
    apps: [], contacts: [], resume: {}, papers: [],
    hacks: D.HACKS.map(h => ({ id: uid(), name: h[0], date: "", res: h[1], note: h[2] })),
    timer: null, iaMax: 30
  };
}
function normalize(x, name) {
  const d = defaults(name);
  if (!x || typeof x !== "object") return d;
  const o = Object.assign(d, x);
  ["problems", "weights", "habits", "projects", "apps", "contacts", "papers", "hacks", "sems"].forEach(k => { if (!Array.isArray(o[k])) o[k] = d[k]; });
  ["days", "units", "phases", "reading", "ms", "reviews", "resume", "prior"].forEach(k => { if (!o[k] || typeof o[k] !== "object") o[k] = d[k]; });
  if (!o.sems.length) o.sems = [clone(D.SEM3)];
  o.sems.forEach(s => s.subjects.forEach(x => { if (!Array.isArray(x.topics)) x.topics = []; }));
  if (!o.sems.find(s => s.id === o.activeSem)) o.activeSem = o.sems[0].id;
  if (!Array.isArray(o.totals) || o.totals.length !== D.A2Z.length) o.totals = D.A2Z.map(s => s[1]);
  o.problems = o.problems.map(p => Object.assign({ r: [false, false, false], rd: [null, null, null], ind: true, df: "Easy", min: null }, p));
  return o;
}
const emptyDay = () => ({ acad: [], road: [], dsaMin: 0, fit: { type: "", min: 0 }, sleep: null, mood: null, note: "", done: {}, habits: {}, plan: null });
const day = (S, s) => Object.assign(emptyDay(), S.days[s] || {});
function ensureDay(S, s) { S.days[s] = Object.assign(emptyDay(), S.days[s] || {}); return S.days[s]; }
const sem = S => S.sems.find(x => x.id === S.activeSem) || S.sems[0];

// ---------- periods ----------
function weekRow(s) { let r = null; D.WEEKS.forEach(w => { if (w[0] <= s) r = w; }); return r && diff(r[0], s) <= 6 ? r : null; }
function period(s) {
  const w = weekRow(s);
  if (w) {
    const kind = /IA2|Exam/.test(w[1]) ? "exam" : /Break/.test(w[1]) ? "break" : "sem";
    return { mode: w[1], dsa: w[4], road: w[6], study: w[7], kind, week: w, classes: kind === "sem" || (kind === "exam" && s <= "2026-12-17") };
  }
  const p = D.PERIODS.find(x => s >= x[0] && s <= x[1]);
  if (p) return { mode: p[2], dsa: p[3], road: p[4], study: p[5], kind: p[6], week: null, classes: p[6] === "sem" };
  if (s < D.START) return { mode: "Before the start", dsa: 0, road: 0, study: 0, kind: "break", week: null, classes: false };
  return { mode: "Keep building", dsa: 14, road: 12, study: 10, kind: "sem", week: null, classes: true };
}

// ---------- problems ----------
function problemName(st, i) { const names = D.A2Z[st][2]; return names[i] || `Step ${st + 1} · problem ${i + 1}`; }
function solvedKeys(S) { const k = new Set(); S.problems.forEach(p => { if (p.key) k.add(p.key); }); return k; }
function nextProblems(S, n, skip) {
  const out = [], solved = solvedKeys(S), sk = new Set(skip || []);
  for (let st = 0; st < D.A2Z.length && out.length < n; st++) {
    const total = S.totals[st] || D.A2Z[st][1];
    for (let i = 0; i < total && out.length < n; i++) { const key = st + ":" + i; if (!solved.has(key) && !sk.has(key)) out.push(key); }
  }
  return out;
}
const keyInfo = key => { const [st, i] = key.split(":").map(Number); return { st, i, name: problemName(st, i) }; };
const counted = S => S.problems.filter(p => p.ind).length;
function stepDone(S) { const c = D.A2Z.map(() => 0); S.problems.forEach(p => { if (p.ind && c[p.st] != null) c[p.st]++; }); return c; }
function dueRevisions(S, s) {
  const t = s || today(), out = [];
  S.problems.forEach(p => [1, 7, 21].forEach((k, i) => {
    const due = add(p.d, k);
    if (due <= t && (!p.r[i] || p.rd[i] === t)) out.push({ p, i, due, done: !!p.r[i] });
  }));
  return out.sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : 0));
}

// ---------- roadmap ----------
function nextUnit(S) {
  for (const n of D.ROAD_ORDER) {
    const u = (D.UNITS[n] || {}).u || [];
    for (const name of u) { const key = name.split(" ")[0]; if (!S.units[key]) return { n, key, name }; }
    if (!(S.phases[n] || {}).proved && n !== 2) return { n, key: "prove-" + n, name: `Phase ${n} Prove-it`, prove: (D.UNITS[n] || {}).p };
  }
  return null;
}
function phaseHours(S) { const h = {}; Object.values(S.days).forEach(d => (d.road || []).forEach(x => { h[x.p] = (h[x.p] || 0) + (+x.h || 0); })); return h; }
function subsetPct(S) {
  const h = phaseHours(S); let tot = 0, done = 0;
  D.SUBSET.forEach(n => { const units = (D.UNITS[n] || {}).u || []; const w = D.PHASE_HRS[n]; tot += w;
    const unitFrac = units.length ? units.filter(u => S.units[u.split(" ")[0]]).length / units.length : 0;
    const hourFrac = Math.min(1, (h[n] || 0) / w); done += w * Math.max(unitFrac * 0.85 + ((S.phases[n] || {}).proved ? 0.15 : 0), hourFrac * 0.85); });
  return done / tot;
}

// ---------- academics ----------
const GP = { S: 10, A: 9, B: 8, C: 7, D: 6, E: 4, F: 0 };
function sgpa(sm) { let p = 0, c = 0; sm.subjects.forEach(x => { p += x.cr * (GP[x.tg] ?? 0); c += x.cr; }); return c ? p / c : 0; }
const credits = sm => sm.subjects.reduce((a, x) => a + (+x.cr || 0), 0);
function cgPath(S) { const p = S.prior; let pts = p.cg * p.cr, cr = p.cr; return S.sems.map(s => { const c = credits(s), g = s.actual != null ? s.actual : sgpa(s); pts += g * c; cr += c; return { s, c, g, cg: pts / cr }; }); }
function iaPct(S, x) { const v = x.ia2 != null ? (x.ia1 != null ? (x.ia1 + x.ia2) / 2 : x.ia2) : x.ia1; return v == null ? null : v / S.iaMax; }
const priority = (S, sm) => sm.subjects.filter(x => !x.lab && iaPct(S, x) != null && iaPct(S, x) < 0.6);

// ---------- daily metrics ----------
function hoursFor(d, code) { return d.acad.filter(x => x.s === code).reduce((a, x) => a + (+x.h || 0), 0); }
function metrics(S, s) {
  const d = day(S, s), ps = S.problems.filter(p => p.d === s), dsaN = ps.filter(p => p.ind).length;
  const acad = d.acad.reduce((a, x) => a + (+x.h || 0), 0), road = d.road.reduce((a, x) => a + (+x.h || 0), 0);
  const fit = d.fit && d.fit.type ? (+d.fit.min || 0) : 0, focus = acad + road + (d.dsaMin || 0) / 60;
  const doneN = Object.values(d.done || {}).filter(Boolean).length + Object.values(d.habits || {}).filter(Boolean).length;
  const pts = dsaN + (ps.length - dsaN) * 0.5 + acad * 0.5 + road * 0.5 + (fit >= 20 ? 1 : 0) + doneN * 0.2 + (d.note ? 0.3 : 0);
  return { dsa: ps.length, dsaN, acad, road, fit, focus, pts, sleep: d.sleep, mood: d.mood };
}
function sumRange(S, a, b) {
  const r = { dsa: 0, dsaN: 0, acad: 0, road: 0, focus: 0, fitN: 0, fitMin: 0, sleep: [], by: {}, active: 0 };
  for (let s = a; s <= b; s = add(s, 1)) { const m = metrics(S, s); r.dsa += m.dsa; r.dsaN += m.dsaN; r.acad += m.acad; r.road += m.road; r.focus += m.focus; if (m.pts > 0) r.active++; if (m.fit > 0) { r.fitN++; r.fitMin += m.fit; } if (m.sleep) r.sleep.push(+m.sleep); day(S, s).acad.forEach(x => { r.by[x.s] = (r.by[x.s] || 0) + (+x.h || 0); }); }
  return r;
}
function streak(S) { let s = today(); if (metrics(S, s).pts === 0) s = add(s, -1); let n = 0; while (n < 2000 && metrics(S, s).pts > 0) { n++; s = add(s, -1); } return n; }
function bestStreak(S, a, b) { let best = 0, c = 0; for (let s = a; s <= b; s = add(s, 1)) { if (metrics(S, s).pts > 0) { c++; best = Math.max(best, c); } else c = 0; } return best; }

// ---------- daily planner ----------
function makePlan(S, s) {
  const P = period(s), wd = pd(s).getDay();
  const quota = P.dsa > 0 ? Math.max(1, Math.round(P.dsa / 7)) : 0;
  const plan = { v: 1, dsa: nextProblems(S, quota), read: null, unit: null, ship: null, apps: false };
  if (P.classes && wd !== 0) { const i = D.READING.findIndex((_, k) => !S.reading[k]); plan.read = i >= 0 ? i : null; }
  if (P.road > 0) { const u = nextUnit(S); plan.unit = u ? u.key : null; }
  if (s >= "2027-01-04" && s < "2027-02-16") { const g = S.projects.find(p => p.id === "ghostraven") || S.projects[0]; const t = g && g.tasks.find(x => !x.done); plan.ship = t ? g.id + "/" + t.id : null; }
  if (s >= "2027-02-15" && s <= "2027-04-30" && P.kind !== "exam") plan.apps = true;
  return plan;
}
function unitByKey(key) {
  if (!key) return null;
  if (key.startsWith("prove-")) { const n = +key.slice(6); return { n, key, name: `Phase ${n} Prove-it`, prove: (D.UNITS[n] || {}).p }; }
  for (const n in D.UNITS) { const f = (D.UNITS[n].u || []).find(u => u.split(" ")[0] === key); if (f) return { n: +n, key, name: f }; }
  return null;
}
// Build today's checklist. Each task: {id, group, title, detail, done, kind, ...}
function tasks(S, s) {
  const d = day(S, s), plan = d.plan || makePlan(S, s), P = period(s), wd = pd(s).getDay(), out = [], sm = sem(S);
  // Revise
  dueRevisions(S, s).slice(0, 8).forEach(x => out.push({ id: `rev:${x.p.id}:${x.i}`, group: "Revise", title: x.p.n, detail: `Day ${[1, 7, 21][x.i]} revision · solved ${fmt(x.p.d)}`, done: x.done, kind: "rev", pid: x.p.id, ri: x.i }));
  // Solve
  plan.dsa.forEach(key => { const k = keyInfo(key); const solved = S.problems.find(p => p.key === key); out.push({ id: "dsa:" + key, group: "Solve", title: k.name, detail: `A2Z step ${k.st + 1} · ${D.A2Z[k.st][0]}`, done: !!solved, kind: "dsa", key, solvedInd: solved ? solved.ind : null }); });
  // Study
  if (P.kind === "exam") {
    out.push({ id: "study:paper", group: "Study", title: "Timed previous-year paper", detail: "3 hours, exam conditions, next exam's subject", done: !!d.done["study:paper"], kind: "check" });
    out.push({ id: "study:errors", group: "Study", title: "Error-log review", detail: "Redo every question you got wrong", done: !!d.done["study:errors"], kind: "check" });
  } else if (P.study > 0) {
    const pr = priority(S, sm), seen = new Set();
    const addStudy = (x, mins, why) => { if (!x || seen.has(x.c)) return; seen.add(x.c); const topic = (x.topics || []).find(t => !t.done);
      const h = hoursFor(d, x.c); out.push({ id: "study:" + x.c, group: "Study", title: `${x.c} · ${mins} min`, detail: topic ? `Next topic: ${topic.t}` : why, done: h >= mins / 60 || !!d.done["study:" + x.c], kind: "study", code: x.c, mins, topicId: topic && topic.id }); };
    if (wd !== 0) pr.forEach(x => addStudy(x, 60, x.c === "IM31" ? "15 problems from the current chapter" : "Derivations and numericals from memory"));
    const rot = sm.subjects.find(x => x.c === D.ROTATION[wd]) || sm.subjects.filter(x => !x.lab && !seen.has(x.c))[wd % Math.max(1, sm.subjects.filter(x => !x.lab).length)];
    addStudy(rot, 45, "Revise this week's lectures and make one-page notes");
    if (wd === 0) out.push({ id: "study:mock", group: "Study", title: "Mock paper", detail: "Timed, one subject, then mark it", done: !!d.done["study:mock"], kind: "check" });
  }
  // Learn
  if (plan.unit) { const u = unitByKey(plan.unit); if (u) { const done = u.prove ? !!(S.phases[u.n] || {}).proved : !!S.units[u.key]; const hrs = d.road.filter(x => x.p === u.n).reduce((a, x) => a + (+x.h || 0), 0);
    out.push({ id: "unit:" + u.key, group: "Learn", title: u.prove ? `Phase ${u.n} Prove-it` : u.name, detail: u.prove ? u.prove : `Phase ${u.n} · ${D.PHASE_NAMES[u.n]} · ${Math.round(P.road * 60 / 6)} min today${hrs ? ` · ${r1(hrs)}h logged` : ""}`, done, kind: "unit", n: u.n, ukey: u.key, prove: !!u.prove }); } }
  if (plan.read != null && D.READING[plan.read]) { const r = D.READING[plan.read]; out.push({ id: "read:" + plan.read, group: "Learn", title: r[1], detail: `${r[0]} · free-period reading on your phone`, done: !!S.reading[plan.read], kind: "read", idx: plan.read }); }
  // Ship
  if (plan.ship) { const [pid, tid] = plan.ship.split("/"); const p = S.projects.find(x => x.id === pid); const t = p && p.tasks.find(x => x.id === tid); if (t) out.push({ id: "ship:" + tid, group: "Ship", title: t.t, detail: `${p.name} · must be live by 15 Feb`, done: !!t.done, kind: "ship", pid, tid }); }
  if (plan.apps) { const n = S.apps.filter(a => a.date === s).length; out.push({ id: "apps", group: "Ship", title: "2 applications + 1 cold email", detail: `${n} logged today · Career → pipeline`, done: n >= 3 || !!d.done.apps, kind: "apps" }); }
  // Move
  const w = P.kind === "exam" ? ["Walk", "Clear your head", 20] : D.WORKOUT[wd];
  out.push({ id: "move", group: "Move", title: `${w[0]} · ${w[2]} min`, detail: w[1], done: !!(d.fit && d.fit.type && (+d.fit.min || 0) >= Math.min(20, w[2])), kind: "move", wtype: w[0], wmin: w[2] });
  // Habits + reflect
  S.habits.forEach(h => out.push({ id: "hab:" + h.id, group: "Habits", title: h.t, detail: "", done: !!d.habits[h.id], kind: "habit", hid: h.id }));
  out.push({ id: "reflect", group: "Habits", title: "One-line reflection", detail: "What worked, what didn't", done: !!(d.note && d.note.trim()), kind: "reflect" });
  return { plan, list: out, period: P };
}

// ---------- goals ----------
function goals(S) {
  const sm = S.sems[0], tg = sgpa(sm), c = counted(S), sp = subsetPct(S);
  const pj = S.projects.slice(0, 2), pjp = pj.length ? pj.reduce((a, p) => a + (p.tasks.length ? p.tasks.filter(t => t.done).length / p.tasks.length : 0), 0) / pj.length : 0;
  const sent = S.apps.filter(a => a.stage !== "Wishlist").length, offer = S.apps.some(a => a.stage === "Offer");
  const papers = S.papers.filter(p => p.status === "Understood").length, won = S.hacks.some(h => h.res === "Won" && h.date && h.date >= D.START);
  const t = today(), fit = sumRange(S, add(t, -27), t).fitN / (S.fitGoal * 4);
  const cg = cgPath(S).slice(-1)[0];
  return [
    { k: "Semester 3", v: tg.toFixed(2), u: "target SGPA", p: tg / 9.3, note: "Aim 9.3+ · Math and MBM first", c: "violet" },
    { k: "DSA", v: c, u: "/ 250 solved", p: c / 250, note: "Striver A2Z, solved by you", c: "lime" },
    { k: "Fundamentals", v: Math.round(sp * 100) + "%", u: "of the June roadmap", p: sp, note: "Python, Linux, APIs, SQL, Docker, security", c: "cyan" },
    { k: "Projects", v: Math.round(pjp * 100) + "%", u: "2 projects", p: pjp, note: "Two systems you can defend", c: "amber" },
    { k: "Internship", v: offer ? "Offer" : sent, u: offer ? "secured" : "/ 100 applications", p: offer ? 1 : sent / 100, note: "Paid, by summer 2027", c: "lime" },
    { k: "CGPA", v: cg ? cg.cg.toFixed(2) : S.prior.cg, u: "projected", p: Math.min(1, ((cg ? cg.cg : 7.67) - 7.67) / (8.5 - 7.67)), note: "8.5+ keeps both doors open", c: "violet" },
    { k: "Research", v: papers + "/3", u: "papers understood", p: papers / 3, note: "PQC migration and crypto-agility", c: "cyan" },
    { k: "Fitness", v: Math.round(Math.min(1, fit) * 100) + "%", u: "of 4-week goal", p: Math.min(1, fit), note: won ? "Hackathon won this year" : "And one hackathon win", c: "amber" }];
}

return { D, pad, ds, pd, add, diff, today, monday, fmt, esc, uid, clone, r1, defaults, normalize, emptyDay, day, ensureDay, sem, period, weekRow, problemName, keyInfo, nextProblems, counted, stepDone, dueRevisions, nextUnit, unitByKey, phaseHours, subsetPct, GP, sgpa, credits, cgPath, iaPct, priority, metrics, sumRange, streak, bestStreak, makePlan, tasks, goals, hoursFor };
})();
