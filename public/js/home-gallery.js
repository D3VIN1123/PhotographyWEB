/* ============================================================
   Home landing — 时空画廊 "Gallery in time" (Nov 2026)
   A dark (or paper, indigo, …) room in which photographs from every album hang in depth. The viewer drifts
   slowly forward through them; scrolling the page flies further in before the index arrives. Each photograph
   carries film-edge type (frame number ▸ letter, album name, coordinates). Hovering one makes it glow, dims the
   rest and opens its album's title and the photo's caption beside it; clicking enters the album.
   Plugs into site.js through window.HomeLanding (html / setup); site.js passes helpers in `api`.
   ============================================================ */
window.HomeLanding = (() => {
  'use strict';
  const BGS = [
    { k: 'ink', zh: '墨', c: '#0e0e0d', light: false },
    { k: 'indigo', zh: '黛', c: '#121827', light: false },
    { k: 'moss', zh: '苔', c: '#121713', light: false },
    { k: 'mist', zh: '雾', c: '#c9cbcc', light: true },
    { k: 'paper', zh: '宣', c: '#ebe8e1', light: true },
  ];
  const DEPTH = 10000, NEAR = 120, PERSP = 900;
  let api, el, stick, world, info, items = [], raf = 0, lastT = 0, travel = 0, v = 0, scrollP = 0;
  let mx = 0, my = 0, cx = 0, cy = 0, hov = null, hovT = 0, visible = true, io = null;
  const fine = () => matchMedia('(hover: hover) and (pointer: fine)').matches;
  const stored = () => { try { return localStorage.getItem('sg-bg'); } catch (e) { return null; } };

  function seeded(n) { return () => { n = (n * 16807) % 2147483647; return (n - 1) / 2147483646; }; }

  // photographs from every album, interleaved so neighbours come from different places
  function pick() {
    const { projects, coverOf, kindOf } = api;
    const want = innerWidth <= 760 ? 24 : 40, per = Math.max(3, Math.ceil(want / Math.max(1, projects.length)));
    const lists = projects.map((p, pi) => {
      const vis = (p.photos || []).filter(x => kindOf(x) === 'image' && x.src);
      const num = new Map(vis.map((x, i) => [x, i + 1]));
      const cov = coverOf(p), rest = vis.filter(x => x !== cov), out = cov && kindOf(cov) === 'image' ? [cov] : [];
      const step = Math.max(1, rest.length / (per - out.length));
      for (let i = 0; out.length < per && Math.floor(i) < rest.length; i += step) out.push(rest[Math.floor(i)]);
      return out.map(ph => ({ p, pi, ph, n: num.get(ph) || 1 }));
    });
    const all = [];
    for (let r = 0; all.length < want && lists.some(l => l[r]); r++) lists.forEach(l => { if (l[r] && all.length < want) all.push(l[r]); });
    return all;
  }

  function feHTML(it, side) {
    const { esc, pad2, placeOf } = api, pl = placeOf(it.p), n = it.n;
    const name = (pl.en || it.p.title || '').toUpperCase();
    return `<div class="sg-fe sg-row"><span><b>${n}</b> ▸ ${n}A</span><span>${esc(name)}</span><span>${n + 1} ▸</span></div>` +
      `<div class="sg-fe sg-col ${side < 0 ? 'r' : 'l'}"><span>${pad2(n)}</span><i></i><span>${esc(pl.big)}</span>${pl.coords ? `<i></i><span>${esc(pl.coords)}</span>` : ''}</div>`;
  }

  function html(a) {
    api = a;
    const { esc, content } = api, site = content.site || {};
    const list = pick(); if (!list.length) return '';
    const bg = BGS.find(b => b.k === stored()) || BGS[0];
    return `
    <section class="sg" id="sg" data-bg="${bg.k}">
      <div class="sg-stick">
        <div class="sg-veil"></div>
        <canvas class="sg-dust back" aria-hidden="true"></canvas>
        <div class="sg-stage"><div class="sg-world">
          ${list.map((it, i) => `<figure class="sg-it" data-i="${i}"><div class="sg-ph"><img src="${esc(it.ph.thumb || it.ph.mid || it.ph.src)}" alt="${esc(it.ph.caption || '')}" draggable="false" decoding="async" style="object-position:${(it.ph.focus || [50, 50]).join('% ')}%"></div></figure>`).join('')}
        </div></div>
        <canvas class="sg-dust front" aria-hidden="true"></canvas>
        <div class="sg-top"><span>A photographic record</span><i></i><span>${esc(site.title || '')}</span></div>
        <div class="sg-info" aria-live="polite"></div>
        <div class="sg-foot">
          <span class="sg-hint">Hover a photograph · scroll to go deeper</span>
          <div class="sg-bgs" role="group" aria-label="Room colour">${BGS.map(b => `<button type="button" data-bg="${b.k}" style="--c:${b.c}" aria-label="${b.k}"${b === bg ? ' class="on"' : ''}><i></i><span>${b.zh}</span></button>`).join('')}</div>
        </div>
      </div>
    </section>`;
  }

  // place every photograph in the room: two loose walls either side of a corridor, at even steps in depth
  function layout() {
    const vw = innerWidth, vh = innerHeight, narrow = vw <= 760, rnd = seeded(41);
    const list = pick(), N = items.length, base = narrow ? vw * 0.66 : Math.min(390, vw * 0.28);
    items.forEach((it, i) => {
      it.data = list[i] || it.data;
      const side = i % 2 ? 1 : -1, ph = it.data.ph, ar = ph.w && ph.h ? ph.w / ph.h : 1.5;
      const w = base * (0.75 + rnd() * 0.5) * (ar < 1 ? 0.78 : 1), h = w / ar;
      it.w = w; it.h = h; it.side = side;
      // lanes: high, middle and low on each wall, so photographs rarely cover one another
      const lane = Math.floor(i / 2) % 3;
      it.x = side * (narrow ? vw * (0.18 + rnd() * 0.22) : vw * (0.24 + rnd() * 0.3));
      it.y = ((lane - 1) * 0.36 + (rnd() - 0.5) * 0.16) * vh * (narrow ? 1.1 : 1);
      it.z0 = (i / N) * DEPTH + rnd() * (DEPTH / N) * 0.6;
      it.ry = -side * (6 + rnd() * 16);
      it.el.style.width = w.toFixed(0) + 'px'; it.el.style.height = h.toFixed(0) + 'px';
      it.el.insertAdjacentHTML('beforeend', it.fe ? '' : feHTML(it.data, side)); it.fe = true;
    });
  }

  // ---------- dust in the room ----------
  // Motes of light that share the photographs' space: same depth, same forward drift, same camera turn, so they
  // make the depth readable between the pictures. Far ones are fine points; near ones grow into soft out-of-focus
  // discs. Motes far away are drawn behind the photographs, the nearest few in front of them. When the room
  // moves fast (the fly-in from the loading screen) they stretch into streaks.
  const Dust = (() => {
    const P = 1100;
    let back, front, bx, fx, W = 0, H = 0, dpr = 1, motes = [], ink = '236,232,223', lastT = -1, sprite = null;
    function setup(root) {
      back = root.querySelector('.sg-dust.back'); front = root.querySelector('.sg-dust.front');
      bx = back.getContext('2d'); fx = front.getContext('2d');
      size(); colour();
    }
    function size() {
      if (!back) return;
      dpr = Math.min(2, devicePixelRatio || 1); W = innerWidth; H = innerHeight;
      for (const c of [back, front]) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
      const n = W <= 760 ? 200 : 420;
      motes = Array.from({ length: n }, () => ({
        x: (Math.random() * 2 - 1) * W * 0.9, y: (Math.random() * 2 - 1) * H * 0.75, z0: Math.random() * DEPTH,
        r: 0.8 + Math.random() * Math.random() * 2.4, ph: Math.random() * 6.28, sp: 0.2 + Math.random() * 0.5, a: 0.5 + Math.random() * 0.5,
        // each mote has its own pace: some drift slower than the photographs, some overtake them
        k: Math.random() < 0.5 ? 0.35 + Math.random() * 0.6 : 1.1 + Math.random() * 0.9,
        px: NaN, py: NaN,
      }));
    }
    function colour() {
      if (!el) return;
      const c = getComputedStyle(el).getPropertyValue('--sg-ink').trim(), m = c.match(/^#([0-9a-f]{6})$/i);
      ink = m ? [0, 2, 4].map(i => parseInt(m[1].substr(i, 2), 16)).join(',') : '236,232,223';
      // a soft disc, drawn once, for motes close to the eye
      sprite = document.createElement('canvas'); sprite.width = sprite.height = 64;
      const g = sprite.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, `rgba(${ink},.7)`); gr.addColorStop(0.4, `rgba(${ink},.3)`); gr.addColorStop(1, `rgba(${ink},0)`);
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    }
    function draw(T, dt, t) {
      if (!back || !W) return;
      const ry = cx * 7 * Math.PI / 180, rx = -cy * 5 * Math.PI / 180, sy = Math.sin(ry), cyy = Math.cos(ry), sx = Math.sin(rx), cxx = Math.cos(rx);
      const fast = Math.min(1, Math.max(0, (v - 220) / 1600)), dim = hov ? 0.45 : 1;
      for (const c of [bx, fx]) { c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, W, H); }
      bx.fillStyle = fx.fillStyle = `rgb(${ink})`; bx.lineCap = fx.lineCap = 'round';
      for (const m of motes) {
        let z = ((m.z0 + T * m.k) % DEPTH + DEPTH) % DEPTH - DEPTH + NEAR;
        const far = Math.min(1, (z + DEPTH * 0.55) / (DEPTH * 0.2)), near = Math.min(1, Math.max(0, (NEAR + 200 - z) / 300));
        const o = Math.min(far, near) * m.a * dim;
        // a little float of their own
        const x0 = m.x + Math.sin(t / 1000 * m.sp + m.ph) * 14, y0 = m.y + Math.cos(t / 1300 * m.sp + m.ph) * 10;
        // the same camera turn as the photographs (rotateY after rotateX, about the room's centre)
        const y1 = y0 * cxx - z * sx, z1 = y0 * sx + z * cxx;
        const x2 = x0 * cyy + z1 * sy, z2 = -x0 * sy + z1 * cyy;
        if (o <= 0.01 || z2 > P - 40) { m.px = NaN; continue; }
        const k = P / (P - z2), X = W / 2 + x2 * k, Y = H / 2 + y1 * k;
        if (X < -60 || X > W + 60 || Y < -60 || Y > H + 60) { m.px = NaN; continue; }
        const c = z2 > -520 ? fx : bx, rad = m.r * k;
        if (fast > 0 && m.px === m.px) {
          // a streak back towards where it was, never longer than 110 px whatever the frame rate
          let dx = m.px - X, dy = m.py - Y; const len = Math.hypot(dx, dy), cap = 110 * fast;
          if (len > cap) { dx *= cap / len; dy *= cap / len; }
          c.globalAlpha = o * 0.42; c.strokeStyle = `rgb(${ink})`; c.lineWidth = Math.max(0.5, Math.min(1.6, rad * 0.6));
          c.beginPath(); c.moveTo(X + dx, Y + dy); c.lineTo(X, Y); c.stroke();
        } else if (rad > 2.4) {
          const d = rad * 5; c.globalAlpha = o * Math.min(1, 6 / rad); c.drawImage(sprite, X - d / 2, Y - d / 2, d, d);
        } else {
          c.globalAlpha = o * (0.6 + Math.min(0.4, rad * 0.3)); c.beginPath(); c.arc(X, Y, Math.max(0.5, rad), 0, 6.283); c.fill();
        }
        m.px = X; m.py = Y;
      }
      bx.globalAlpha = fx.globalAlpha = 1;
    }
    return { setup, size, colour, draw };
  })();

  function setup(view, a) {
    api = a; cancelAnimationFrame(raf); raf = 0; hov = null;
    el = view.querySelector('#sg'); if (!el) return;
    stick = el.querySelector('.sg-stick'); world = el.querySelector('.sg-world'); info = el.querySelector('.sg-info');
    items = [...el.querySelectorAll('.sg-it')].map(e => ({ el: e, data: null, o: -1 }));
    layout();
    Dust.setup(el);
    items.forEach(it => {
      it.el.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') setHov(it); });
      it.el.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse' && hov === it) setHov(null); });
      it.el.addEventListener('click', e => {
        e.stopPropagation();
        if (!fine() && hov !== it) { setHov(it); return; }   // a phone: the first tap shows the album, the second enters
        api.go('#/p/' + it.data.p.slug);
      });
    });
    el.addEventListener('click', () => setHov(null));
    el.querySelectorAll('.sg-bgs button').forEach(b => b.addEventListener('click', e => {
      e.stopPropagation(); const bg = BGS.find(x => x.k === b.dataset.bg);
      el.dataset.bg = bg.k; room(bg); Dust.colour();
      el.querySelectorAll('.sg-bgs button').forEach(x => x.classList.toggle('on', x === b));
      try { localStorage.setItem('sg-bg', bg.k); } catch (err) { /* private mode */ }
    }));
    room(BGS.find(b => b.k === el.dataset.bg) || BGS[0]);
    setupRest(view);
    if (io) io.disconnect();
    io = new IntersectionObserver(es => { visible = es[0].isIntersecting; }, { threshold: 0 });
    io.observe(el);
    lastT = 0; raf = requestAnimationFrame(tick);
    requestAnimationFrame(() => el && el.classList.add('ready'));
  }

  function setHov(it) {
    if (it === hov) return;
    if (hov) hov.el.classList.remove('on');
    hov = it; el.classList.toggle('hov', !!it);
    if (!it) { info.classList.remove('show'); return; }
    it.el.classList.add('on');
    // the display copy, sharper than the thumbnail, once you look at it closely
    const im = it.el.querySelector('img'), ph = it.data.ph;
    if (ph.mid && !im.dataset.up) { im.dataset.up = 1; const pre = new Image(); pre.onload = () => { im.src = ph.mid; }; pre.src = ph.mid; }
    const { esc, pad2, placeOf, capRich, isCJK, countOf, projects } = api, p = it.data.p, pl = placeOf(p);
    info.classList.remove('show'); void info.offsetWidth;
    info.innerHTML = `
      <div class="sg-i-top"><span>Album ${pad2(it.data.pi + 1)} / ${pad2(projects.length)}</span><i></i><span>${pad2(countOf(p))} frames</span></div>
      <div class="sg-i-big${isCJK(pl.big) ? ' cjk' : ''}">${esc(pl.big)}</div>
      ${pl.en ? `<div class="sg-i-en">${esc(pl.en)}</div>` : ''}
      ${ph.caption ? `<div class="sg-i-cap"><b>${pad2(it.data.n)}</b>${capRich(ph.caption)}</div>` : ''}
      <div class="sg-i-go">${pl.big !== p.title ? esc(p.title) + ' · ' : ''}Enter album ↗</div>`;
    info.classList.add('show');
    hovT = performance.now();
  }

  addEventListener('pointermove', e => { mx = e.clientX / innerWidth - 0.5; my = e.clientY / innerHeight - 0.5; }, { passive: true });
  addEventListener('resize', () => { if (el && el.isConnected) { layout(); Dust.size(); } });

  function tick(t) {
    if (!el || !el.isConnected) { raf = 0; if (io) io.disconnect(); return; }
    raf = requestAnimationFrame(tick);
    const dt = lastT ? Math.min(0.05, (t - lastT) / 1000) : 0; lastT = t;
    if (document.hidden) return;
    const vw = innerWidth, vh = innerHeight, r = el.getBoundingClientRect();
    scrollP = Math.min(1, Math.max(0, -r.top / Math.max(1, r.height - vh)));
    const target = api.reduceMotion ? 0 : (hov ? 5 : 64);   // a chosen photograph still drifts towards you, very slowly
    v += (target - v) * Math.min(1, dt * (hov ? 4 : 1.2));
    travel += v * dt;
    cx += (mx - cx) * Math.min(1, dt * 2.4); cy += (my - cy) * Math.min(1, dt * 2.4);
    const T = travel + scrollP * DEPTH * 0.55;
    rest(vh);
    // the dust keeps drifting forward as you read on below the gallery
    Dust.draw(T + Math.max(0, vh - r.bottom) * 1.1, dt, t);
    if (!visible) return;
    // at the end of the gallery the photographs dissolve into the distance and the room is left empty
    const q = Math.min(1, Math.max(0, (scrollP - 0.68) / 0.3)), keep = 1 - q * q * (3 - 2 * q);
    if (keep !== el._keep) { el._keep = keep; chrome.forEach(c => { c.style.opacity = keep; }); }
    // the camera: a slight turn towards the mouse; scrolling flies further in
    world.style.transform = `translateZ(0) rotateY(${(cx * 7).toFixed(2)}deg) rotateX(${(-cy * 5).toFixed(2)}deg)`;
    for (const it of items) {
      let z = ((it.z0 + T) % DEPTH + DEPTH) % DEPTH - DEPTH + NEAR;
      const far = Math.min(1, (z + DEPTH * 0.4) / (DEPTH * 0.15)), near = Math.min(1, Math.max(0, (NEAR - 140 - z) / 420));
      let o = Math.max(0, Math.min(far, near));   // only the nearer half of the room is lit
      if (it === hov) { o = Math.max(o, 0.98); }
      o = Math.round(o * keep * 100) / 100;
      it.el.style.transform = `translate3d(${(it.x - it.w / 2).toFixed(1)}px,${(it.y - it.h / 2).toFixed(1)}px,${z.toFixed(1)}px) rotateY(${it.ry.toFixed(1)}deg)`;
      if (o !== it.o) { it.o = o; it.el.style.opacity = o; it.el.style.pointerEvents = o > 0.35 ? '' : 'none'; it.el.style.visibility = o ? '' : 'hidden'; }
    }
    if (hov && info.classList.contains('show')) placeInfo(vw, vh);
  }

  function placeInfo(vw, vh) {
    if (vw <= 760) { info.style.transform = ''; return; }
    const r = hov.el.querySelector('.sg-ph').getBoundingClientRect(), W = info.offsetWidth, H = info.offsetHeight;
    const right = r.left + r.width / 2 < vw / 2;
    let x = right ? r.right + 56 : r.left - 56 - W;
    x = Math.max(24, Math.min(vw - W - 24, x));
    const y = Math.max(96, Math.min(vh - H - 80, r.top + r.height * 0.1));
    info.style.transform = `translate3d(${x.toFixed(0)}px,${y.toFixed(0)}px,0)`;
  }

  // ---------- the rest of the home page, in the same room ----------
  // No paper after the gallery: the room carries on. The dust keeps drifting, the introduction lights up word by
  // word, the index lists the albums (hovering one shows its cover floating beside the cursor), and then each album
  // hangs in the room as one large framed photograph with film-edge type, turned a little until it reaches the
  // middle of the screen, with a few of its other photographs floating at other depths around it.
  let chrome = [], albums = [], peek = null, revealIO = null;
  function room(bg) {
    document.body.dataset.room = bg.k;
    [el, ...document.querySelectorAll('#view .rm')].forEach(x => x.toggleAttribute('data-onlight', bg.light));
  }
  function feFor(p, n, side) {
    const { esc, pad2, placeOf } = api, pl = placeOf(p), name = (pl.en || p.title || '').toUpperCase();
    return `<div class="sg-fe sg-row"><span><b>${n}</b> ▸ ${n}A</span><span>${esc(name)}</span><span>${n + 1} ▸</span></div>` +
      `<div class="sg-fe sg-col ${side}"><span>${pad2(n)}</span><i></i><span>${esc(pl.big)}</span>${pl.coords ? `<i></i><span>${esc(pl.coords)}</span>` : ''}</div>`;
  }
  function after(a) {
    api = a;
    const { esc, pad2, placeOf, capRich, isCJK, countOf, coverOf, kindOf, words, text, projects, content } = api, site = content.site || {};
    const intro = site.intro || site.tagline || '';
    const im = (ph, cls, big) => `<img class="${cls || ''}" src="${esc(big ? (ph.mid || ph.src) : (ph.thumb || ph.mid || ph.src))}" alt="${esc(ph.caption || '')}" loading="lazy" decoding="async" draggable="false" style="object-position:${(ph.focus || [50, 50]).join('% ')}%"${big && ph.mid ? ` onerror="if(this.getAttribute('src')!=='${esc(ph.src)}')this.src='${esc(ph.src)}'"` : ''}>`;
    let h = `
    <section class="rm rm-intro">
      <div class="rm-label rv"><span>Index</span><i></i><b>${pad2(projects.length)} albums</b></div>
      ${intro ? `<p class="statement words rm-statement">${words(intro)}</p>` : ''}
      <nav class="rm-list" aria-label="Albums">
        ${projects.map((p, i) => { const pl = placeOf(p), c = coverOf(p); return `<a class="rv" style="--d:${i}" href="#/p/${esc(p.slug)}" data-peek="${c ? esc(c.thumb || c.mid || c.src) : ''}"><b>${pad2(i + 1)}</b><span class="t${isCJK(pl.big) ? ' cjk' : ''}">${esc(pl.big)}</span><em>${esc(pl.en)}</em><span class="c">${esc(pl.coords)}</span><span class="n">${pad2(countOf(p))} fr <i>↗</i></span></a>`; }).join('')}
      </nav>
      <div class="rm-peek" aria-hidden="true"><img alt=""></div>
    </section>
    <section class="rm rm-albums">`;
    projects.forEach((p, i) => {
      const c = coverOf(p); if (!c) return;
      const pl = placeOf(p), flip = i % 2 === 1, ar = c.w && c.h ? c.w / c.h : 1.5;
      const vis = (p.photos || []).filter(x => kindOf(x) === 'image' && x.src && x !== c);
      const sats = [0.2, 0.55, 0.85].map(f => vis[Math.floor(f * vis.length)]).filter((x, j, arr) => x && arr.indexOf(x) === j);
      const n = (p.photos || []).filter(x => kindOf(x) === 'image' && x.src).indexOf(c) + 1 || 1;
      h += `
      <a class="rm-al${flip ? ' flip' : ''}${ar < 1 ? ' tall' : ''}" id="proj-${esc(p.slug)}" href="#/p/${esc(p.slug)}" style="--ar:${ar.toFixed(3)}">
        <div class="rm-sats" aria-hidden="true">${sats.map((x, j) => `<span class="s${j}" style="--ar:${x.w && x.h ? (x.w / x.h).toFixed(3) : 1.5}">${im(x)}</span>`).join('')}</div>
        <figure class="rm-ph"><div class="rm-img">${im(c, '', true)}</div>${feFor(p, n, flip ? 'l' : 'r')}</figure>
        <div class="rm-tx">
          <div class="rm-top"><span>Album ${pad2(i + 1)} / ${pad2(projects.length)}</span><i></i><span>${esc(pl.coords)}</span></div>
          <h2 class="plate-big rm-big${isCJK(pl.big) ? ' cjk' : ''} t-${/^[a-z]+$/.test(p.theme || '') ? p.theme : 'plain'}">${esc(pl.big)}</h2>
          ${pl.en ? `<div class="rm-en">${esc(pl.en)}</div>` : ''}
          ${c.caption ? `<div class="rm-cap">${capRich(c.caption)}</div>` : ''}
          <div class="rm-meta"><span>${pad2(countOf(p))} frames</span>${pl.big !== p.title ? `<span>${esc(p.title)}</span>` : ''}</div>
          <span class="rm-go">Enter album <b>↗</b></span>
        </div>
      </a>`;
    });
    const links = [];
    if (site.email) links.push(`<a href="mailto:${esc(site.email)}">${esc(site.email)}</a>`);
    if (site.instagram) {
      const ig = String(site.instagram).replace(/^@/, '');
      links.push(`<a href="${esc(/^https?:/.test(ig) ? ig : 'https://instagram.com/' + ig)}" target="_blank" rel="noopener">Instagram</a>`);
    }
    h += `
    </section>
    <footer class="rm rm-foot">
      <div class="rm-label rv"><span>Afterword</span><i></i><b>${esc(site.title || '')}</b></div>
      <p class="rm-foot-text rv">${text(site.footer || site.tagline || '')}</p>
      <div class="rm-foot-row rv"><nav>${links.join('')}</nav><a class="rm-up" href="#/" data-up>Back into the room ↑</a></div>
    </footer>`;
    return h;
  }
  function setupRest(view) {
    chrome = [...el.querySelectorAll('.sg-top, .sg-foot, .sg-dust.front')];
    albums = [...view.querySelectorAll('.rm-al')].map(e => ({ el: e, p: 9 }));
    peek = view.querySelector('.rm-peek');
    if (revealIO) revealIO.disconnect();
    revealIO = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); revealIO.unobserve(e.target); } }), { threshold: 0.2 });
    view.querySelectorAll('.rm .rv').forEach(x => revealIO.observe(x));
    const up = view.querySelector('[data-up]');
    if (up) up.addEventListener('click', e => { e.preventDefault(); scrollTo({ top: 0, behavior: 'smooth' }); });
    // the index: the hovered album's cover floats beside the cursor
    if (peek && fine()) {
      const img = peek.querySelector('img'); let px = 0, py = 0;
      view.querySelectorAll('.rm-list a').forEach(a => {
        a.addEventListener('pointerenter', () => { if (a.dataset.peek) { img.src = a.dataset.peek; peek.classList.add('on'); } });
        a.addEventListener('pointerleave', () => peek.classList.remove('on'));
        a.addEventListener('pointermove', e => {
          const r = peek.parentElement.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
          const tilt = Math.max(-8, Math.min(8, (x - px) * 0.6)); px = x; py = y;
          peek.style.transform = `translate3d(${x + 36}px,${y - 90}px,0) rotate(${tilt.toFixed(1)}deg)`;
        });
      });
    }
  }
  // each album frame: --p is where it sits on the screen (-1 below … 0 centred … 1 above), --a = |p|
  function rest(vh) {
    if (api.reduceMotion) return;
    for (const a of albums) {
      const r = a.el.getBoundingClientRect();
      if (r.bottom < -vh * 0.5 || r.top > vh * 1.5) continue;
      const p = Math.max(-1, Math.min(1, ((r.top + r.height / 2) - vh / 2) / (vh * 0.9) * -1));
      const k = Math.round(p * 1000) / 1000;
      if (k !== a.p) { a.p = k; a.el.style.setProperty('--p', k); a.el.style.setProperty('--a', Math.abs(k)); }
    }
  }

  // called by the loading screen as the viewer flies in: start at speed, then the usual easing slows it to a drift
  function warp() { if (el && el.isConnected && !api.reduceMotion) { v = 5600; lastT = 0; } }

  return { html, after, setup, warp };
})();
