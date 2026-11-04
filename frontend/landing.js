(function () {
"use strict";
const C = window.AscentCore, D = C.D, $ = s => document.querySelector(s);
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---------- aurora canvas ----------
(function aurora() {
  const cv = $("#aurora"), cx = cv.getContext("2d"); if (!cx) return;
  const blobs = [
    { x: .15, y: .2, r: .55, c: [214, 255, 79], a: .16, sx: .00007, sy: .00009 },
    { x: .85, y: .25, r: .6, c: [157, 139, 255], a: .2, sx: .00005, sy: .00008 },
    { x: .55, y: .85, r: .65, c: [92, 225, 255], a: .12, sx: .00009, sy: .00006 },
    { x: .3, y: .7, r: .35, c: [255, 111, 82], a: .07, sx: .00011, sy: .00007 }];
  let W, H, dpr = Math.min(2, devicePixelRatio || 1), mx = .5, my = .5, sy = 0;
  const size = () => { W = cv.width = innerWidth * dpr; H = cv.height = innerHeight * dpr; cv.style.width = innerWidth + "px"; cv.style.height = innerHeight + "px"; };
  size(); addEventListener("resize", size);
  addEventListener("pointermove", e => { mx = e.clientX / innerWidth; my = e.clientY / innerHeight; });
  addEventListener("scroll", () => { sy = scrollY / Math.max(1, document.body.scrollHeight - innerHeight); }, { passive: true });
  function frame(t) {
    cx.globalCompositeOperation = "source-over"; cx.fillStyle = "#050506"; cx.fillRect(0, 0, W, H);
    cx.globalCompositeOperation = "lighter";
    blobs.forEach((b, i) => {
      const tt = reduce ? 0 : t;
      const x = (b.x + Math.sin(tt * b.sx + i) * .08 + (mx - .5) * .04 * (i % 2 ? 1 : -1)) * W;
      const y = (b.y + Math.cos(tt * b.sy + i * 2) * .07 + (my - .5) * .03 - sy * .25 * (i === 2 ? -1 : 1)) * H;
      const r = b.r * Math.max(W, H);
      const g = cx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(${b.c},${b.a})`); g.addColorStop(.5, `rgba(${b.c},${b.a * .35})`); g.addColorStop(1, `rgba(${b.c},0)`);
      cx.fillStyle = g; cx.fillRect(0, 0, W, H);
    });
    // horizon line and fine grid fading into depth
    cx.globalCompositeOperation = "source-over";
    const step = 56 * dpr, off = reduce ? 0 : (t * .006 * dpr) % step;
    cx.strokeStyle = "rgba(255,255,255,0.035)"; cx.lineWidth = dpr;
    for (let x = -step + off; x < W; x += step) { cx.beginPath(); cx.moveTo(x, 0); cx.lineTo(x, H); cx.stroke(); }
    for (let y = off; y < H; y += step) { cx.beginPath(); cx.moveTo(0, y); cx.lineTo(W, y); cx.stroke(); }
    const v = cx.createRadialGradient(W / 2, H * .45, Math.min(W, H) * .2, W / 2, H / 2, Math.max(W, H) * .75);
    v.addColorStop(0, "rgba(5,5,6,0)"); v.addColorStop(1, "rgba(5,5,6,.92)"); cx.fillStyle = v; cx.fillRect(0, 0, W, H);
    if (!reduce) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();

// ---------- countdown ----------
const goal = new Date(2027, 5, 24, 0, 0, 0);
function tick() {
  let ms = Math.max(0, goal - new Date()); const d = Math.floor(ms / 864e5); ms -= d * 864e5;
  const h = Math.floor(ms / 36e5); ms -= h * 36e5; const m = Math.floor(ms / 6e4); const s = Math.floor((ms - m * 6e4) / 1000);
  $("#cd-d").textContent = String(d).padStart(3, "0"); $("#cd-h").textContent = C.pad(h); $("#cd-m").textContent = C.pad(m); $("#cd-s").textContent = C.pad(s);
}
tick(); setInterval(tick, 1000);
const t = C.today(), dayN = Math.max(1, C.diff(D.START, t) + 1), left = C.diff(t, D.GOAL_DATE);
$("#chipTxt").textContent = `Day ${dayN} · ${left} days to the checkpoint`;
$("#footDate").textContent = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
$("#finalBig").innerHTML = `Day ${dayN}<span class="muted">/${C.diff(D.START, D.GOAL_DATE) + 1}</span>.`;

// ---------- nav ----------
addEventListener("scroll", () => $("#nav").classList.toggle("scrolled", scrollY > 30), { passive: true });

// ---------- mission words light up with scroll ----------
const MISSION = "I'm an [IEM student] at MSRIT becoming a [software and AI engineer]. By June 2027 I'll have a [9.3+ semester], [250 problems] solved on my own, [GHOSTRAVEN live], and a [paid internship]. By 2028, a [PPO]. I don't restart plans. I [execute them].";
$("#missionText").innerHTML = MISSION.replace(/\[([^\]]+)\]|(\S+)/g, (m, hl, w) => hl ? hl.split(" ").map(x => `<span class="hl">${C.esc(x)}</span>`).join(" ") : `<span>${C.esc(w)}</span>`);
const words = Array.from(document.querySelectorAll("#missionText span"));
function lightWords() {
  const sec = $("#mission"), r = sec.getBoundingClientRect(), total = sec.offsetHeight - innerHeight;
  const p = Math.min(1, Math.max(0, -r.top / Math.max(1, total) * 1.15 + .05));
  const n = Math.round(p * words.length); words.forEach((w, i) => w.classList.toggle("on", i < n));
}
addEventListener("scroll", lightWords, { passive: true }); lightWords();

// ---------- path ----------
(function path() {
  const rail = $("#rail"), first = C.pd(D.PATH[0][0]), last = C.pd(D.PATH[D.PATH.length - 1][0]);
  // place nodes evenly but keep date order; fill to today by interpolating between neighbours
  const n = D.PATH.length, pos = i => 6 + i * (88 / (n - 1));
  let html = "";
  D.PATH.forEach((p, i) => { const st = p[0] < t ? "done" : (i > 0 && D.PATH[i - 1][0] <= t && p[0] >= t ? "now" : "");
    html += `<div class="node ${st}" style="left:${pos(i)}%"><i></i><small>${C.esc(C.fmt(p[0], { day: "numeric", month: "short", year: "numeric" }))}</small><b>${C.esc(p[1])}</b><span>${C.esc(p[2])}</span></div>`; });
  let fill = pos(0);
  for (let i = 0; i < n - 1; i++) { const a = D.PATH[i][0], b = D.PATH[i + 1][0]; if (t >= a && t < b) { fill = pos(i) + (pos(i + 1) - pos(i)) * (C.diff(a, t) / Math.max(1, C.diff(a, b))); break; } if (t >= b) fill = pos(i + 1); }
  html += `<div class="today" style="left:${fill}%">TODAY</div>`;
  rail.insertAdjacentHTML("beforeend", html);
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { $("#railFill").style.width = fill + "%"; io.disconnect(); } }), { threshold: .3 });
  io.observe(rail);
})();

// ---------- commitments ----------
const COLORS = { lime: "#d6ff4f", cyan: "#5ce1ff", violet: "#9d8bff", amber: "#ffb84d" };
function renderGoals(S, live) {
  const g = C.goals(S);
  $("#goals").innerHTML = g.map((x, i) => `<div class="glass gc spot reveal" style="transition-delay:${i * 60}ms"><span class="glow" style="background:${COLORS[x.c]}"></span>
    <div class="k"><span class="eyebrow">${C.esc(x.k)}</span><span class="pill">${live ? Math.round(Math.min(1, x.p) * 100) + "%" : "target"}</span></div>
    <div><div class="v">${C.esc(x.v)}<small>${C.esc(x.u)}</small></div></div>
    <div><div class="bar"><i data-w="${Math.min(100, Math.max(0, x.p * 100))}" style="background:${COLORS[x.c]}"></i></div><p style="margin-top:10px">${C.esc(x.note)}</p></div></div>`).join("");
  observeReveals();
}
function observeReveals() {
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add("in"); e.target.querySelectorAll("[data-w]").forEach(b => { b.style.width = b.dataset.w + "%"; }); io.unobserve(e.target); } }), { threshold: .15 });
  document.querySelectorAll(".reveal:not(.in)").forEach(el => io.observe(el));
}
document.addEventListener("pointermove", e => { const c = e.target.closest && e.target.closest(".spot"); if (!c) return; const r = c.getBoundingClientRect(); c.style.setProperty("--mx", e.clientX - r.left + "px"); c.style.setProperty("--my", e.clientY - r.top + "px"); });

renderGoals(C.defaults(""), false);

// live data if signed in
(async function live() {
  try {
    if (window.HubAPI.bearer && !window.HubAPI.getToken()) return;
    const me = await window.HubAPI.call("/api/me", "GET", undefined, { timeout: 15000 }); if (!me.ok) return;
    const user = me.data.user;
    const st = await window.HubAPI.call("/api/state", "GET", undefined, { timeout: 15000 }); if (!st.ok) return;
    const S = C.normalize(st.data.data, user.name);
    const first = (user.name || "").split(" ")[0];
    $("#navCta").textContent = "Open portal"; $("#heroCta").innerHTML = `Continue, ${C.esc(first)} <span class="arr">→</span>`;
    $("#commitNote").textContent = "Live from your portal. Every number moves only when you do the work.";
    const tk = C.tasks(S, t), done = tk.list.filter(x => x.done).length;
    $("#finalP").textContent = `${tk.period.mode}. ${done} of ${tk.list.length} of today's tasks done. Streak: ${C.streak(S)} days.`;
    renderGoals(S, true);
  } catch (e) { /* offline or not deployed with the API: landing still works */ }
})();
})();
