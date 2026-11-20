/* ============================================================
   Home landing — "Matrix" (Nov 2026, trial)
   A full-screen slideshow of the albums' covers. Every few seconds the picture breaks into characters: a band of
   glyphs sweeps from right to left, the old photograph turns into type (each glyph's brightness taken from the
   photo underneath) and the next photograph resolves out of it. One hue per transition; lightness follows the
   image, saturation is scattered. Under the mouse the photograph breaks open into a window edged with glyph
   fragments, in which the album's title and caption are "decoded" in a quick code-refresh. Click to enter.
   Everything is drawn on one <canvas>; the window's text is HTML on top. Plugs into site.js as window.HomeLanding.
   ============================================================ */
window.HomeLanding = (() => {
  'use strict';
  const HOLD = 4200, TRANS = 1700;          // ms a photograph rests · ms the character transition takes
  const RAMP = ' .,:;-~=+*!?/|()[]{}<>#%&$@';
  const CODE = '0123456789ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜ<>/{}[]=+*#$%&;:';   // half-width, so every glyph fits its cell
  const HAN = '山水云月光影城门路街夜雪河风石桥灯塔湖林村楼巷雾';
  const HUES = [8, 28, 46, 92, 150, 178, 198, 218, 262, 300, 334];
  let api, el, cv, ctx, win, label, slides = [], raf = 0, io = null, visible = true;
  let W = 0, H = 0, dpr = 1, cs = 12, cols = 0, rows = 0, font = '', mono = 'monospace';
  let cur = 0, nxt = -1, t0 = 0, phase = 'wait', hue = 198, hueLast = 198, jag = null, noise = null, glyph = null, gTick = 0;
  let mx = -1, my = -1, wx = -1, wy = -1, open = 0, want = 0, dirty = true, scr = [], touchT = 0;
  const fine = () => matchMedia('(hover: hover) and (pointer: fine)').matches;
  const rand = s => s[(Math.random() * s.length) | 0];

  function html(a) {
    api = a;
    const { projects, coverOf, content, esc } = api, h = content.hero || {};
    slides = projects.filter(p => coverOf(p)).map(p => ({ p, ph: coverOf(p) }));
    const f = slides.findIndex(s => s.p.id === h.projectId); if (f > 0) slides.unshift(slides.splice(f, 1)[0]);
    if (!slides.length) return '';
    return `
    <section class="mx" id="mx">
      <canvas class="mx-cv" aria-hidden="true"></canvas>
      <a class="mx-hit" href="#/p/${esc(slides[0].p.slug)}" aria-label="Open album"></a>
      <div class="mx-win" aria-hidden="true"><div class="mx-w-in"></div></div>
      <div class="mx-label"></div>
      <div class="mx-ticks">${slides.map((s, i) => `<i${i ? '' : ' class="on"'}></i>`).join('')}</div>
      <div class="mx-hint"><span>Scroll</span><i></i></div>
    </section>`;
  }

  function setup(view, a) {
    api = a; cancelAnimationFrame(raf); raf = 0;
    el = view.querySelector('#mx'); if (!el) return;
    cv = el.querySelector('.mx-cv'); ctx = cv.getContext('2d'); win = el.querySelector('.mx-win'); label = el.querySelector('.mx-label');
    mono = getComputedStyle(document.documentElement).getPropertyValue('--mono').trim() || 'monospace';
    cur = 0; nxt = -1; phase = 'wait'; open = 0; want = 0; mx = my = -1;
    slides.forEach(s => { s.img = null; s.full = null; s.lum = null; });
    size();
    load(0).then(() => { phase = 'hold'; t0 = performance.now(); dirty = true; setLabel(); el.classList.add('ready'); });
    slides.forEach((s, i) => i && load(i));
    el.addEventListener('pointermove', e => {
      if (e.pointerType !== 'mouse') return;
      const r = el.getBoundingClientRect(); mx = e.clientX - r.left; my = e.clientY - r.top;
      if (want === 0) { wx = mx; wy = my; decode(); }
      want = 1;
    });
    el.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') want = 0; });
    el.addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse') return;
      // a phone: the first tap opens the window where you touched, a tap inside it enters the album
      const r = el.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
      if (open > 0.6 && Math.abs(x - wx) < winW() / 2 && Math.abs(y - wy) < winH() / 2) return;
      e.preventDefault(); mx = wx = x; my = wy = y; want = 1; touchT = performance.now(); decode();
    });
    el.querySelector('.mx-hit').addEventListener('click', e => {
      if (!fine() && (open < 0.6 || performance.now() - touchT < 350)) { e.preventDefault(); return; }
      e.preventDefault(); api.go('#/p/' + shown().p.slug);
    });
    if (io) io.disconnect();
    io = new IntersectionObserver(es => { visible = es[0].isIntersecting; }, { threshold: 0 }); io.observe(el);
    raf = requestAnimationFrame(tick);
  }

  const shown = () => slides[phase === 'trans' && nxt >= 0 && prog() > 0.5 ? nxt : cur];
  const prog = () => window.__mxK != null ? window.__mxK : Math.min(1, (performance.now() - t0) / TRANS);   // __mxK: freeze a transition while testing
  const winW = () => Math.min(W * 0.8, W <= 760 ? W - 36 : 440);
  const winH = () => (W <= 760 ? 230 : 260);

  function load(i) {
    const s = slides[i]; if (s.loading) return s.loading;
    return (s.loading = new Promise(res => {
      const im = new Image(); im.decoding = 'async';
      im.onload = () => { s.img = im; bake(s); res(); };
      im.onerror = () => { if (s.ph.mid && im.src.indexOf(s.ph.src) < 0) im.src = s.ph.src; else res(); };
      im.src = s.ph.mid || s.ph.src;
    }));
  }

  function size() {
    if (!el) return;
    const r = el.getBoundingClientRect();
    dpr = Math.min(2, devicePixelRatio || 1); W = r.width; H = r.height;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    cs = W <= 760 ? 9 : 12; cols = Math.ceil(W / cs); rows = Math.ceil(H / cs);
    font = `500 ${Math.round(cs * 1.02)}px ${mono}`;
    noise = new Float32Array(cols * rows).map(() => Math.random());
    glyph = new Array(cols * rows).fill('').map(() => rand(CODE));
    slides.forEach(s => s.img && bake(s));
    dirty = true;
  }

  // the photograph cover-fitted to the screen once (cheap to draw every frame) and as a grid of brightness values
  function bake(s) {
    const im = s.img, iw = im.naturalWidth, ih = im.naturalHeight, f = s.ph.focus || [50, 50];
    const fit = (w, h) => { const k = Math.max(w / iw, h / ih), dw = iw * k, dh = ih * k; return [(w - dw) * (+f[0] || 50) / 100, (h - dh) * (+f[1] || 50) / 100, dw, dh]; };
    const full = document.createElement('canvas'); full.width = cv.width; full.height = cv.height;
    full.getContext('2d').drawImage(im, ...fit(full.width, full.height));
    const g = document.createElement('canvas'); g.width = cols; g.height = rows;
    const gx = g.getContext('2d', { willReadFrequently: true }); gx.drawImage(im, ...fit(cols, rows));
    const d = gx.getImageData(0, 0, cols, rows).data, lum = new Float32Array(cols * rows);
    for (let i = 0; i < lum.length; i++) lum[i] = (0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2]) / 255;
    s.full = full; s.lum = lum; dirty = true;
  }

  function start() {
    const n = (cur + 1) % slides.length; if (!slides[n].full) { t0 = performance.now() - HOLD + 400; return; }
    nxt = n; phase = 'trans'; t0 = performance.now();
    hueLast = hue; do { hue = rand(HUES); } while (hue === hueLast);
    // the front is ragged: each row leads or lags a little, smoothly from row to row
    jag = new Float32Array(rows); let v = 0;
    for (let r = 0; r < rows; r++) { v += (Math.random() - 0.5) * 3; v *= 0.9; jag[r] = v + Math.sin(r * 0.21) * 3; }
    noise = noise.map(() => Math.random());
  }

  // buckets of glyphs by colour so the canvas changes fillStyle a few dozen times a frame, not thousands
  const buckets = new Map();
  function put(h, s, l, x, y, ch) {
    const k = `${h}|${s}|${l}`; let b = buckets.get(k); if (!b) buckets.set(k, b = []); b.push(x, y, ch);
  }
  function flush() {
    ctx.font = font; ctx.textBaseline = 'top';
    buckets.forEach((b, k) => {
      const [h, s, l] = k.split('|'); ctx.fillStyle = `hsl(${h} ${s}% ${l}%)`;
      for (let i = 0; i < b.length; i += 3) ctx.fillText(b[i + 2], b[i], b[i + 1]);
    });
    buckets.clear();
  }
  const ramp = v => RAMP[Math.min(RAMP.length - 1, Math.max(0, Math.round(v * (RAMP.length - 1))))];

  function tick(t) {
    if (!el || !el.isConnected) { raf = 0; if (io) io.disconnect(); return; }
    raf = requestAnimationFrame(tick);
    if (!visible || document.hidden || phase === 'wait') return;
    if (phase === 'hold' && t - t0 > (api.reduceMotion ? HOLD * 1.6 : HOLD) && slides.length > 1) {
      if (api.reduceMotion) { cur = (cur + 1) % slides.length; t0 = t; dirty = true; setLabel(); } else start();
    }
    // window: follows the mouse with a little lag, opens and closes
    const o0 = open; open += (want - open) * 0.16; if (Math.abs(want - open) < 0.002) open = want;
    if (!fine() && want && t - touchT > 4200) want = 0;
    const ox = wx, oy = wy; wx += (mx - wx) * 0.22; wy += (my - wy) * 0.22;
    const moving = open > 0 && (Math.abs(ox - wx) > 0.1 || Math.abs(oy - wy) > 0.1 || o0 !== open);
    if (phase !== 'trans' && !dirty && !moving && !(open > 0 && scr.length)) return;
    if (++gTick % 3 === 0) for (let k = 0; k < 160; k++) glyph[(Math.random() * glyph.length) | 0] = rand(CODE);
    draw(t);
    dirty = false;
    win.style.opacity = open > 0.02 ? 1 : 0;
    if (open > 0.02) {
      const ww = winW(), wh = winH(), e = open * open * (3 - 2 * open);
      win.style.width = ww + 'px'; win.style.height = wh + 'px';
      win.style.transform = `translate3d(${(wx - ww / 2).toFixed(1)}px,${(wy - wh / 2).toFixed(1)}px,0)`;
      win.style.clipPath = `inset(${((1 - e) * 50).toFixed(2)}% ${((1 - e) * 50).toFixed(2)}%)`;
      runScramble(t);
    }
  }

  function draw(t) {
    const c = ctx, A = slides[cur], k = phase === 'trans' ? prog() : 0;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = '#050505'; c.fillRect(0, 0, cv.width, cv.height);
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const ek = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    if (phase !== 'trans') {
      c.drawImage(A.full, 0, 0, W, H);
    } else {
      const B = slides[nxt], band = cols * 0.34, f = cols * (1.2 - 1.55 * ek);   // the front, in cells
      // old photograph slides left a little, the new one arrives from the right
      c.drawImage(A.full, -ek * W * 0.06, 0, W, H);
      c.save(); c.beginPath();
      for (let r = 0; r < rows; r++) { const x = Math.max(0, (f + jag[r] + band * 0.5) * cs); c.rect(x, r * cs, W - x + 1, cs + 0.5); }
      c.clip(); c.drawImage(B.full, (1 - ek) * W * 0.06, 0, W, H); c.restore();
      // the band of characters
      c.fillStyle = '#050505'; c.beginPath();
      const cells = [];
      for (let r = 0; r < rows; r++) {
        const fr = f + jag[r];
        const c0 = Math.max(0, Math.floor(fr - band * 0.9)), c1 = Math.min(cols - 1, Math.ceil(fr + band * 0.9));
        for (let q = c0; q <= c1; q++) {
          const i = r * cols + q, d = (q - fr) / band + (noise[i] - 0.5) * 0.7;
          if (d < -0.5 || d > 0.5) continue;
          c.rect(q * cs, r * cs, cs, cs); cells.push(i, d);
        }
      }
      c.fill();
      for (let n = 0; n < cells.length; n += 2) {
        const i = cells[n], d = cells[n + 1], q = i % cols, r = (i / cols) | 0;
        const L = (d < 0 ? A.lum : B.lum)[i], edge = 1 - Math.abs(d) * 2;   // 1 in the middle of the band, 0 at its edges
        const ch = noise[i] < 0.55 ? ramp(L) : glyph[i];
        if (ch === ' ') continue;
        const light = Math.round((30 + L * 62 + edge * 8) / 6) * 6, sat = Math.round((40 + noise[(i * 7) % noise.length] * 55) / 15) * 15;
        put(hue, sat, Math.min(96, light), q * cs, r * cs, ch);
      }
      flush();
      if (k >= 1) { cur = nxt; nxt = -1; phase = 'hold'; t0 = performance.now(); dirty = true; setLabel(); if (open > 0.1) decode(); }
      else if (nxt >= 0 && k > 0.5 && !el.dataset.half) { el.dataset.half = 1; setLabel(nxt); if (open > 0.1) decode(); }
    }
    if (phase !== 'trans') delete el.dataset.half;
    if (open > 0.01) drawWindow(t);
  }

  // the window under the mouse: dark inside, its edge made of character fragments
  function drawWindow(t) {
    const c = ctx, e = open * open * (3 - 2 * open), hw = winW() / 2 * e, hh = winH() / 2 * e, S = shown();
    const q0 = Math.max(0, Math.floor((wx - hw) / cs) - 4), q1 = Math.min(cols - 1, Math.ceil((wx + hw) / cs) + 4);
    const r0 = Math.max(0, Math.floor((wy - hh) / cs) - 4), r1 = Math.min(rows - 1, Math.ceil((wy + hh) / cs) + 4);
    const h = phase === 'trans' ? hue : hueLast === hue ? hue : hue;
    c.fillStyle = 'rgba(5,5,5,.94)'; c.beginPath();
    const frag = [];
    for (let r = r0; r <= r1; r++) for (let q = q0; q <= q1; q++) {
      const x = q * cs + cs / 2, y = r * cs + cs / 2, i = r * cols + q;
      // distance outside the rectangle, in cells (negative = inside), roughened per cell
      const dx = Math.abs(x - wx) - hw, dy = Math.abs(y - wy) - hh, out = Math.max(dx, dy) / cs + (noise[i] - 0.5) * 3.2;
      if (out < -1) c.rect(q * cs, r * cs, cs, cs);
      else if (out < 2.6) frag.push(i, out);
    }
    c.fill();
    c.fillStyle = '#050505'; c.beginPath();
    for (let n = 0; n < frag.length; n += 2) { const i = frag[n], q = i % cols, r = (i / cols) | 0; if (frag[n + 1] < 1.4) c.rect(q * cs, r * cs, cs, cs); }
    c.fill();
    for (let n = 0; n < frag.length; n += 2) {
      const i = frag[n], out = frag[n + 1], q = i % cols, r = (i / cols) | 0;
      if (noise[(i * 13) % noise.length] < out / 3.2) continue;   // thinner further out: the photograph shows through
      const L = S.lum ? S.lum[i] : 0.5, ch = noise[i] < 0.5 ? ramp(0.35 + L * 0.65) : glyph[i];
      put(h, Math.round((35 + noise[(i * 3) % noise.length] * 55) / 15) * 15, Math.round((48 + L * 40) / 6) * 6, q * cs, r * cs, ch);
    }
    flush();
  }

  // ---------- the decoded text ----------
  function setLabel(i) {
    const S = slides[i == null ? cur : i], { esc, pad2, placeOf, projects } = api, pl = placeOf(S.p);
    label.innerHTML = `<b>${pad2(projects.indexOf(S.p) + 1)}</b><span>${esc(pl.big)}</span><em>${esc(pl.en)}</em>`;
    [...el.querySelectorAll('.mx-ticks i')].forEach((x, j) => x.classList.toggle('on', slides[j] === S));
    el.querySelector('.mx-hit').href = '#/p/' + S.p.slug;
  }
  function decode() {
    const S = shown(), { pad2, placeOf, capLines, isCJK, projects, countOf } = api, pl = placeOf(S.p);
    const cap = capLines(S.ph.caption), zh = cap.filter(isCJK).join(' '), en = cap.filter(x => !isCJK(x)).join(' ');
    const lines = [
      ['top', `ALBUM ${pad2(projects.indexOf(S.p) + 1)}/${pad2(projects.length)}  ·  ${pad2(countOf(S.p))} FR${pl.coords ? '  ·  ' + pl.coords : ''}`],
      ['big' + (isCJK(pl.big) ? ' cjk' : ''), pl.big],
      ['en', pl.en || (pl.big !== S.p.title ? S.p.title : '')],
      ['cap', en], ['zh', zh],
      ['go', '> CLICK TO ENTER_'],
    ].filter(x => x[1]);
    const box = win.querySelector('.mx-w-in');
    box.innerHTML = lines.map(([c]) => `<div class="mx-${c}"></div>`).join('');
    const now = performance.now();
    scr = lines.map(([, s], n) => ({ el: box.children[n], s, t: now + n * 70, dur: 360 + s.length * 14 }));
  }
  function runScramble(t) {
    if (!scr.length) return;
    let busy = false;
    for (const L of scr) {
      const k = (t - L.t) / L.dur;
      if (k >= 1) { if (L.el.textContent !== L.s) L.el.textContent = L.s; continue; }
      busy = true;
      if (k < 0) { L.el.textContent = ''; continue; }
      let out = '';
      for (let j = 0; j < L.s.length; j++) {
        const ch = L.s[j];
        if (ch === ' ' || j / L.s.length < k * 1.25 - 0.25) out += ch;
        else if (j / L.s.length < k * 1.25 + 0.15) out += /[⺀-鿿]/.test(ch) ? rand(HAN) : rand(CODE);
      }
      L.el.textContent = out;
    }
    if (!busy) scr = [];
  }

  addEventListener('resize', () => { if (el && el.isConnected) size(); });
  return { html, setup, _start: () => { if (phase === 'hold') start(); } };
})();
