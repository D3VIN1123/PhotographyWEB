/* ============================================================
   Loading screen — see css/loader.css. Runs before site.js (it is a plain script right after the markup).
   Progress is real: 25 % while site.js fetches content.json and draws the page, the rest as the first view's
   photographs arrive (on the home page: the photographs of 时空画廊). It never fills faster than ~1.4 s, and
   gives up waiting after 10 s. At 100 % the stars accelerate into streaks; part-way through, the gallery is
   told to start at speed (HomeLanding.warp), the screen clears, and the room slows down to its usual drift.
   ============================================================ */
(() => {
  'use strict';
  const L = document.getElementById('loader'); if (!L) return;
  const root = document.documentElement; root.classList.add('loading');
  // the same room colour the visitor chose in the gallery
  const BG = { ink: ['#0e0e0d', 0], indigo: ['#121827', 0], moss: ['#121713', 0], mist: ['#c9cbcc', 1], paper: ['#ebe8e1', 1] };
  let key = 'ink'; try { key = localStorage.getItem('sg-bg') || 'ink'; } catch (e) { /* private mode */ }
  const room = BG[key] || BG.ink; L.style.setProperty('--ld-bg', room[0]); L.classList.toggle('light', !!room[1]);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const cv = L.querySelector('.ld-cv'), ctx = cv.getContext('2d'), bar = L.querySelector('.ld-bar i'), pct = L.querySelector('.ld-pct'), name = L.querySelector('.ld-name');
  let W = 0, H = 0, dpr = 1, f = 1, stars = [];
  const ink = room[1] ? '31,30,27' : '236,232,223';

  function size() {
    dpr = Math.min(2, devicePixelRatio || 1); W = innerWidth; H = innerHeight;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); f = Math.min(W, H) * 0.5;
    const n = W <= 760 ? 240 : 460, sx = W / 2 / f * 1.15, sy = H / 2 / f * 1.15;
    stars = Array.from({ length: n }, () => ({ x: (Math.random() * 2 - 1) * sx, y: (Math.random() * 2 - 1) * sy, z: 0.05 + Math.random() * 0.95 }));
  }
  size(); addEventListener('resize', size);

  const t0 = performance.now();
  let shown = 0, phase = 'load', tw = 0, last = t0, handed = false;
  function measure(now) {
    if (now - t0 > 10000) return 1;
    const view = document.getElementById('view');
    if (!view || document.body.classList.contains('booting') || !view.children.length) return Math.min(0.24, (now - t0) / 2500 * 0.24);
    if (!name.textContent) { const b = document.getElementById('brand'); if (b && b.textContent) { name.textContent = b.textContent; name.classList.add('on'); } }
    const scope = document.getElementById('sg') || view;
    const imgs = [...scope.querySelectorAll('img')].filter(i => i.loading !== 'lazy' || scope.id === 'sg').slice(0, 40);
    if (!imgs.length) return 1;
    return 0.25 + 0.75 * imgs.filter(i => i.complete).length / imgs.length;
  }

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000), last0 = last; last = now;
    let speed = 0.05;
    if (phase === 'load') {
      const target = measure(now);
      shown = Math.min(target, shown + Math.min(0.5, (now - last0) / 1000) * 1.1, (now - t0) / 1400);   // real time, so a slow frame rate can't stall it
      bar.style.transform = `scaleX(${shown.toFixed(4)})`;
      pct.textContent = String(Math.floor(shown * 100)).padStart(3, '0');
      if (shown >= 1) {
        if (!document.getElementById('sg') || reduce) { finish(); return; }   // not the home page: just open
        phase = 'warp'; tw = now; L.classList.add('go');
      }
    } else {
      const t = (now - tw) / 1000, p = Math.min(1, t / 1.25);
      speed = 0.05 + 6.5 * Math.pow(p, 2.6);
      if (t > 0.55 && !handed) { handed = true; if (window.HomeLanding && window.HomeLanding.warp) window.HomeLanding.warp(); }
      if (t > 0.75 && !L.classList.contains('clear')) { L.classList.add('clear'); root.classList.remove('loading'); }
      cv.style.opacity = Math.max(0, 1 - Math.max(0, t - 1.05) / 0.6).toFixed(3);
      if (t > 1.8) { finish(); return; }
    }
    draw(speed, dt);
    requestAnimationFrame(frame);
  }

  // stars in depth: x/y fixed, z runs towards the viewer; each is drawn as a streak from where it was a moment ago
  function draw(speed, dt) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    const cx = W / 2, cy = H / 2, trail = Math.max(0.004, speed * 0.05);
    ctx.lineCap = 'round';
    for (const s of stars) {
      s.z -= speed * dt;
      if (s.z < 0.02) { s.z += 1; s.x = (Math.random() * 2 - 1) * W / 2 / f * 1.15; s.y = (Math.random() * 2 - 1) * H / 2 / f * 1.15; }
      const z0 = Math.min(1.2, s.z + trail);
      const x1 = cx + s.x / s.z * f * 0.35, y1 = cy + s.y / s.z * f * 0.35, x0 = cx + s.x / z0 * f * 0.35, y0 = cy + s.y / z0 * f * 0.35;
      if (x1 < -50 || x1 > W + 50 || y1 < -50 || y1 > H + 50) continue;
      const a = Math.min(1, (1 - s.z) * 1.3) * (speed > 0.2 ? 0.9 : 0.55);
      ctx.strokeStyle = `rgba(${ink},${a.toFixed(3)})`; ctx.lineWidth = 0.5 + (1 - s.z) * 1.6;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1 + 0.01, y1); ctx.stroke();
    }
  }

  function finish() {
    root.classList.remove('loading'); L.classList.add('clear', 'done');
    setTimeout(() => L.remove(), 1000);
  }
  requestAnimationFrame(frame);
})();
