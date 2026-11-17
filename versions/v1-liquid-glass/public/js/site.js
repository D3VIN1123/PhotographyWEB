/* ============================================================
   Photography site — front-end (no build step, no dependencies)
   Reads data/content.json and renders:
     #/            home  = pinned top page + one full-screen panel per project
     #/p/<slug>    project gallery, ending in the "keep scrolling" charge
   Sections: utils · data · templates · router · scroll loop (parallax, HUD,
             charge) · next-project hand-off · liquid glass refraction · boot
   ============================================================ */
(() => {
  'use strict';

  // ---------- utils ----------
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const text = s => esc(s).replace(/\n/g, '<br>');
  const pad2 = n => String(n).padStart(2, '0');
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const safeUrl = u => { u = String(u || '').trim(); return /^(https?:|mailto:|#|\/|\.)/i.test(u) ? u : (u ? 'https://' + u.replace(/^[a-z]+:/i, '') : ''); };
  const ARROW = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8h10M9 4l4 4-4 4"/></svg>';

  const view = $('#view'), hud = $('#hud'), hudCount = $('#hud-count'), hudCap = $('#hud-cap');
  const tabsScroll = $('#tabs-scroll'), lens = $('#tabs-lens');

  // ---------- data ----------
  let content = { site: {}, hero: {}, projects: [] };
  let projects = [];
  const coverOf = p => p && ((p.photos || []).find(x => x.id === p.cover) || (p.photos || [])[0]) || null;
  const isPortrait = ph => ph.w && ph.h && ph.h > ph.w * 1.05;
  const pos = ph => { const f = (ph && ph.focus) || [50, 50]; return `object-position:${+f[0] || 50}% ${+f[1] || 50}%`; };

  function img(ph, cls = '', eager = false) {
    if (!ph || !ph.src) return '';
    return `<img class="${cls}" src="${esc(ph.src)}" alt="${esc(ph.caption || '')}" style="${pos(ph)}" ` +
      `${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async" draggable="false" ` +
      `onload="this.classList.add('loaded')" onerror="this.classList.add('loaded')">`;
  }

  // ---------- templates ----------
  function heroData() {
    const h = content.hero || {}, site = content.site || {};
    const p = h.mode === 'project' ? (projects.find(x => x.id === h.projectId) || projects[0]) : null;
    if (p) {
      return { kicker: h.kicker || 'Latest', title: h.title || p.title, body: h.text || p.description || p.subtitle || '',
               image: coverOf(p), label: h.linkLabel || 'View project', url: '#/p/' + p.slug };
    }
    return { kicker: h.kicker || '', title: h.title || site.title || '', body: h.text || '',
             image: h.image ? { src: h.image, focus: h.focus } : coverOf(projects[0]),
             label: h.linkLabel || '', url: safeUrl(h.linkUrl) };
  }

  function homeHTML() {
    const h = heroData(), site = content.site || {};
    const ext = /^https?:/i.test(h.url) ? ' target="_blank" rel="noopener"' : '';
    let html = `
    <section class="panel hero" data-plx="8">
      <div class="bg">${img(h.image, '', true)}</div><div class="shade"></div>
      <div class="card glass" data-lg="46">
        ${h.kicker ? `<div class="kicker reveal"><i></i>${esc(h.kicker)}</div>` : ''}
        <h1 class="reveal" style="--d:1">${text(h.title)}</h1>
        ${h.body ? `<p class="lead reveal" style="--d:2">${text(h.body)}</p>` : ''}
        ${h.label && h.url ? `<a class="btn reveal" style="--d:3" href="${esc(h.url)}"${ext}>${esc(h.label)}${ARROW}</a>` : ''}
      </div>
      ${projects.length ? '<div class="scroll-hint"><span>Gallery</span><i></i></div>' : ''}
    </section>`;
    projects.forEach((p, i) => {
      const n = (p.photos || []).length;
      html += `
    <a class="panel proj" id="proj-${esc(p.slug)}" href="#/p/${esc(p.slug)}" data-plx="8">
      <div class="bg">${img(coverOf(p), '', i === 0)}</div><div class="shade"></div>
      <div class="card glass" data-lg="40">
        <div class="idx reveal">${pad2(i + 1)} / ${pad2(projects.length)}</div>
        <h2 class="reveal" style="--d:1">${esc(p.title)}</h2>
        ${p.subtitle ? `<p class="sub reveal" style="--d:2">${esc(p.subtitle)}</p>` : ''}
        <div class="row reveal" style="--d:3"><span>${n} photo${n === 1 ? '' : 's'}</span><span class="open">View project ${ARROW}</span></div>
      </div>
    </a>`;
    });
    const links = [];
    if (site.email) links.push(`<a href="mailto:${esc(site.email)}">${esc(site.email)}</a>`);
    if (site.instagram) {
      const ig = String(site.instagram).replace(/^@/, '');
      links.push(`<a href="${esc(/^https?:/.test(ig) ? ig : 'https://instagram.com/' + ig)}" target="_blank" rel="noopener">Instagram</a>`);
    }
    html += `
    <footer class="foot">
      <div><strong>${esc(site.title || '')}</strong>${text(site.footer || site.tagline || '')}</div>
      <nav>${links.join('')}</nav>
    </footer>`;
    return html;
  }

  // Decide how each photo fills the screen: landscape → full-bleed crop,
  // two portraits in a row → side by side, lone portrait → shown whole.
  function layoutShots(photos) {
    const out = [];
    for (let i = 0; i < photos.length; i++) {
      const p = photos[i], lay = p.layout || 'auto';
      if (lay === 'auto' && isPortrait(p)) {
        const n = photos[i + 1];
        if (n && (n.layout || 'auto') === 'auto' && isPortrait(n)) { out.push({ type: 'duo', items: [p, n], from: i }); i++; continue; }
        out.push({ type: 'fit', items: [p], from: i }); continue;
      }
      out.push({ type: lay === 'fit' ? 'fit' : 'full', items: [p], from: i });
    }
    return out;
  }

  function projectHTML(p) {
    const photos = p.photos || [], total = photos.length, idx = projects.indexOf(p);
    const next = projects.length > 1 ? projects[(idx + 1) % projects.length] : null;
    let html = `
    <section class="panel cover" data-plx="8">
      <div class="bg">${img(coverOf(p), '', true)}</div><div class="shade"></div>
      <div class="card glass" data-lg="46">
        <div class="kicker reveal">Project ${pad2(idx + 1)}</div>
        <h1 class="reveal" style="--d:1">${esc(p.title)}</h1>
        ${p.description ? `<p class="lead reveal" style="--d:2">${text(p.description)}</p>` : ''}
        <div class="meta reveal" style="--d:3">
          ${p.subtitle ? `<span class="chip">${esc(p.subtitle)}</span>` : ''}
          <span class="chip">${total} photo${total === 1 ? '' : 's'}</span>
        </div>
      </div>
      ${total ? '<div class="scroll-hint"><span>Scroll</span><i></i></div>' : ''}
    </section>`;
    for (const s of layoutShots(photos)) {
      const count = s.items.length > 1 ? `${pad2(s.from + 1)}–${pad2(s.from + 2)}` : pad2(s.from + 1);
      const cap = s.items.map(x => x.caption).filter(Boolean).join('  ·  ');
      const data = `data-count="${count}" data-total="${pad2(total)}" data-cap="${esc(cap)}"`;
      if (s.type === 'duo') {
        html += `<section class="panel shot duo" data-plx="5" ${data}>${s.items.map(x => `<div class="bg">${img(x)}</div>`).join('')}</section>`;
      } else if (s.type === 'fit') {
        html += `<section class="panel shot fit" ${data}>${img(s.items[0], 'back')}${img(s.items[0], 'whole')}</section>`;
      } else {
        html += `<section class="panel shot" data-plx="5" ${data}><div class="bg">${img(s.items[0])}</div></section>`;
      }
    }
    const target = next ? { href: '#/p/' + next.slug, title: next.title, sub: next.subtitle || '', image: coverOf(next), line: 'Keep scrolling for next project' }
                        : { href: '#/', title: content.site.title || 'Home', sub: '', image: heroData().image, line: 'Keep scrolling to return home' };
    html += `
    <section class="next" id="next" data-href="${esc(target.href)}">
      <div class="bg">${img(target.image)}</div>
      <div class="next-inner">
        <div class="next-line">${target.line}</div>
        <div class="ring">
          <svg class="arc" viewBox="0 0 72 72"><circle class="track" cx="36" cy="36" r="34"/><circle class="fill" cx="36" cy="36" r="34" pathLength="100"/></svg>
          <svg class="arrow" width="22" height="22" viewBox="0 0 16 16" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3v10M4 9l4 4 4-4"/></svg>
        </div>
        <div class="next-title">${esc(target.title)}</div>
        ${target.sub ? `<div class="next-sub">${esc(target.sub)}</div>` : ''}
      </div>
    </section>`;
    return html;
  }

  // ---------- nav tabs ----------
  function buildNav() {
    const site = content.site || {};
    $('#brand').innerHTML = `${esc(site.title || 'Photography')}${site.tagline ? `<small>${esc(site.tagline)}</small>` : ''}`;
    $$('.tab', tabsScroll).forEach(t => t.remove());
    const add = (href, label) => {
      const a = document.createElement('a');
      a.className = 'tab'; a.href = href; a.textContent = label;
      tabsScroll.appendChild(a);
    };
    add('#/', 'Home');
    projects.forEach(p => add('#/p/' + p.slug, p.title));
  }

  function markTab(hash) {
    let on = null;
    $$('.tab', tabsScroll).forEach(t => { const m = t.getAttribute('href') === hash; t.classList.toggle('on', m); if (m) on = t; });
    if (!on) { lens.classList.remove('ready'); return; }
    lens.style.width = on.offsetWidth + 'px';
    lens.style.transform = `translateX(${on.offsetLeft}px)`;
    lens.classList.add('ready');
    tabsScroll.scrollTo({ left: on.offsetLeft - (tabsScroll.clientWidth - on.offsetWidth) / 2, behavior: 'smooth' });
  }

  // ---------- router ----------
  let route = { type: 'home' }, prevRoute = null;
  let instant = false, homeTop = false, rendering = false;
  let panels = [], nextEl = null, revealIO = null;

  function parse() {
    const m = location.hash.match(/^#\/p\/(.+)$/);
    if (m) { const p = projects.find(x => x.slug === decodeURIComponent(m[1])); if (p) return { type: 'project', project: p, hash: '#/p/' + p.slug }; }
    return { type: 'home', hash: '#/' };
  }

  async function render() {
    if (rendering) return; rendering = true;
    const r = parse(), skip = instant; instant = false;
    document.documentElement.classList.remove('snap');
    hud.classList.remove('show'); hudKey = null;
    if (!skip && view.childElementCount) { view.classList.add('out'); await wait(300); }

    prevRoute = route; route = r;
    view.innerHTML = r.type === 'project' ? projectHTML(r.project) : (projects.length || content.hero ? homeHTML() : '<div class="empty">No content yet.</div>');
    document.title = r.type === 'project' ? `${r.project.title} — ${content.site.title || ''}` : (content.site.title || 'Photography');

    // returning home with the Back button lands on the project you just left
    let top = 0;
    if (r.type === 'home' && prevRoute && prevRoute.type === 'project' && !homeTop) {
      const el = document.getElementById('proj-' + prevRoute.project.slug);
      if (el) top = el.offsetTop;
    }
    homeTop = false;
    window.scrollTo(0, top);

    setupView();
    markTab(r.hash);
    if (!skip) { view.classList.add('pre'); view.classList.remove('out'); void view.offsetWidth; view.classList.remove('pre'); }
    setTimeout(() => document.documentElement.classList.add('snap'), 700);
    rendering = false; scrollRef = window.scrollY; poke();
    if (parse().hash !== r.hash) render();
  }

  function setupView() {
    if (revealIO) revealIO.disconnect();
    revealIO = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); revealIO.unobserve(e.target); } }), { threshold: 0.3 });
    panels = $$('.panel, .next', view).map(el => ({
      el, plx: reduceMotion ? 0 : (+el.dataset.plx || 0) / 100, imgs: $$('.bg img', el), all: $$('img', el), shot: el.classList.contains('shot'),
    }));
    panels.forEach(p => revealIO.observe(p.el));
    nextEl = $('#next', view);
    charge.v = 0; charge.done = false; charge.arrived = 0;
    Glass.scan();
    lastY = -1; rimT = 0;
  }

  // ---------- scroll loop: parallax, HUD, charge decay ----------
  let lastY = -1, lastT = 0, rimT = 0, hudKey = null, hudTimer = 0;
  const charge = { v: 0, last: 0, arrived: 0, done: false, shown: -1 };
  const atBottom = () => window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;

  function frame(t) {
    const dt = Math.min(64, t - lastT) / 1000; lastT = t;
    const y = window.scrollY, vh = window.innerHeight;
    const moved = y !== lastY;
    if (moved) {
      lastY = y;
      let current = null;
      for (const p of panels) {
        const r = p.el.getBoundingClientRect();
        if (r.bottom < -50 || r.top > vh + 50) continue;
        if (r.top <= vh / 2 && r.bottom > vh / 2) current = p;
        if (p.plx) {
          const shift = -(r.top / vh) * p.plx * r.height;
          for (const im of p.imgs) im.style.transform = `translate3d(0,${shift.toFixed(1)}px,0)`;
        }
      }
      updateHud(current);
    }
    if (t - rimT > (moved ? 90 : 450)) { rimT = t; Rim.update(); }
    // charge bookkeeping
    if (nextEl && !charge.done) {
      if (atBottom()) { if (!charge.arrived) charge.arrived = t; }
      else { charge.arrived = 0; charge.v = 0; }
      if (charge.v > 0 && t - charge.last > 140) charge.v = Math.max(0, charge.v - dt * 0.9);
      if (charge.v !== charge.shown) { charge.shown = charge.v; nextEl.style.setProperty('--charge', charge.v.toFixed(3)); }
    }
    requestAnimationFrame(frame);
  }

  function updateHud(p) {
    const key = p && p.shot ? p.el : null;
    if (key === hudKey) return;
    hudKey = key;
    clearTimeout(hudTimer);
    if (!key) { hud.classList.remove('show'); return; }
    const apply = () => {
      hudCount.innerHTML = `${key.dataset.count} <em>/ ${key.dataset.total}</em>`;
      hudCap.textContent = key.dataset.cap || '';
      hud.classList.remove('swap');
    };
    if (hud.classList.contains('show')) { hud.classList.add('swap'); hudTimer = setTimeout(apply, 200); }
    else { apply(); hud.classList.add('show'); }
  }

  // ---------- "keep scrolling" charge ----------
  // Once the reader has rested at the very bottom, further scrolling fills the ring.
  // Stop scrolling and it drains; fill it and we hand off to the next project.
  function feed(amount) {
    if (!nextEl || charge.done || rendering) return;
    const now = performance.now();
    if (!atBottom() || !charge.arrived || now - charge.arrived < 380) return;
    charge.v = Math.min(1, charge.v + amount); charge.last = now;
    if (charge.v >= 1) fire();
  }

  async function fire() {
    charge.done = true;
    const href = nextEl.dataset.href, src = $('.bg img', nextEl);
    nextEl.style.setProperty('--charge', '1');
    nextEl.classList.add('go');
    const warp = document.createElement('div');
    warp.className = 'warp';
    warp.style.setProperty('--t', Math.max(0, nextEl.getBoundingClientRect().top) + 'px');
    if (src) { const im = new Image(); im.src = src.currentSrc || src.src; im.style.objectPosition = src.style.objectPosition; warp.appendChild(im); }
    document.body.appendChild(warp);
    void warp.offsetWidth;
    warp.classList.add('grow');
    await wait(reduceMotion ? 50 : 800);
    instant = true; homeTop = true;
    if (location.hash === href) await render(); else { location.hash = href; await wait(60); }
    await wait(120);
    warp.classList.add('fade');
    setTimeout(() => warp.remove(), 560);
  }

  addEventListener('wheel', e => {
    if (e.deltaY <= 0) return;
    const d = e.deltaMode === 1 ? e.deltaY * 32 : e.deltaY;
    feed(Math.min(d, 90) / 900);
  }, { passive: true });
  let touchY = null;
  addEventListener('touchstart', e => { touchY = e.touches[0].clientY; }, { passive: true });
  addEventListener('touchmove', e => {
    const y = e.touches[0].clientY; if (touchY !== null && y < touchY) feed((touchY - y) / 420); touchY = y;
  }, { passive: true });
  addEventListener('keydown', e => {
    if (['ArrowDown', 'PageDown', ' ', 'Spacebar'].includes(e.key) && !e.target.closest('input,textarea')) feed(0.16);
  });

  // ---------- link handling ----------
  document.addEventListener('click', e => {
    const a = e.target.closest('a[href^="#/"]'); if (!a) return;
    const href = a.getAttribute('href');
    if (href === '#/') homeTop = true;
    if (href === (location.hash || '#/') || (href === '#/' && route.type === 'home')) {
      e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });
  addEventListener('hashchange', render);
  addEventListener('resize', () => { lastY = -1; markTab(route.hash); });

  // pointer-follow sheen on glass
  document.addEventListener('pointermove', e => {
    const g = e.target.closest && e.target.closest('.glass'); if (!g) return;
    const r = g.getBoundingClientRect();
    g.style.setProperty('--mx', (e.clientX - r.left) + 'px'); g.style.setProperty('--my', (e.clientY - r.top) + 'px');
  }, { passive: true });

  // ---------- auto-hiding chrome ----------
  // Scrolling down, or 5 s without input, hides the nav / caption HUD / project title card
  // (CSS: body.ui-off). Moving the pointer, tapping, or scrolling up half a screen brings them back.
  const IDLE_MS = 5000;
  const SHOW_UP = 0.5;   // fraction of the screen height to scroll up before the UI returns
  let uiOff = false, idleTimer = 0, onTimer = 0, scrollRef = 0, upFrom = 0, lastPX = -1, lastPY = -1;
  function setUI(off) {
    if (off === uiOff) return; uiOff = off;
    document.body.classList.toggle('ui-off', off);
    document.body.classList.toggle('ui-on', !off);
    clearTimeout(onTimer);
    if (!off) onTimer = setTimeout(() => document.body.classList.remove('ui-on'), 850);
  }
  function poke() {
    setUI(false);
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => { if (document.querySelector('.nav .glass:hover, .hud:hover')) poke(); else setUI(true); }, IDLE_MS);
  }
  addEventListener('scroll', () => {
    const y = window.scrollY, d = y - scrollRef;
    if (Math.abs(d) < 6) return;
    scrollRef = y;
    if (rendering) { upFrom = y; return; }
    if (d > 0) { upFrom = y; clearTimeout(idleTimer); setUI(true); return; }
    // Scrolling up: while hidden, only come back after SHOW_UP screens of upward travel
    // (measured from the lowest point reached), or on arriving at the very top.
    if (y > upFrom) upFrom = y;
    if (!uiOff || upFrom - y >= innerHeight * SHOW_UP || y <= 2) poke();
  }, { passive: true });
  addEventListener('pointermove', e => {   // ignore the synthetic moves browsers fire while scrolling
    if (Math.abs(e.clientX - lastPX) + Math.abs(e.clientY - lastPY) < 4) return;
    const first = lastPX < 0; lastPX = e.clientX; lastPY = e.clientY;
    if (!first) poke();
  }, { passive: true });
  addEventListener('pointerdown', poke, { passive: true });
  addEventListener('keydown', e => { if (e.key === 'Escape' || e.key === 'ArrowUp' || e.key === 'Tab') poke(); });

  // ---------- rim colour ----------
  // Tints each glass rim with the colours of the photo under it: 12 points around the
  // element's edge are looked up in a tiny cached copy of the image and become a conic gradient.
  const Rim = (() => {
    const cache = new WeakMap(), N = 12;
    function pixels(im) {
      let c = cache.get(im); if (c) return c;
      if (!im.complete || !im.naturalWidth) return null;
      const w = 48, h = Math.max(8, Math.round(48 * im.naturalHeight / im.naturalWidth));
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      try { const ctx = cv.getContext('2d', { willReadFrequently: true }); ctx.drawImage(im, 0, 0, w, h); c = { d: ctx.getImageData(0, 0, w, h).data, w, h }; }
      catch (e) { c = { d: null }; }
      cache.set(im, c); return c;
    }
    function lookup(x, y, layers) {
      for (const L of layers) {
        const r = L.r; if (x < r.left || x > r.right || y < r.top || y > r.bottom) continue;
        const u = Math.min(.999, Math.max(0, (x - r.left - L.ox) / L.dw)), v = Math.min(.999, Math.max(0, (y - r.top - L.oy) / L.dh));
        const i = ((v * L.c.h | 0) * L.c.w + (u * L.c.w | 0)) * 4, d = L.c.d;
        return [d[i], d[i + 1], d[i + 2]];
      }
      return null;
    }
    function vivid(c) {   // more saturated and lifted, so it reads as light caught in the edge
      const avg = (c[0] + c[1] + c[2]) / 3, o = c.map(v => avg + (v - avg) * 1.8);
      const k = Math.min(2.4, 215 / Math.max(40, ...o));
      return o.map(v => Math.round(Math.max(0, Math.min(255, v * k * .88 + 30))));
    }
    function update() {
      const vh = window.innerHeight, layers = [];
      for (const p of panels) {
        const pr = p.el.getBoundingClientRect(); if (pr.bottom < 0 || pr.top > vh) continue;
        for (let k = p.all.length - 1; k >= 0; k--) {   // later images sit on top
          const im = p.all[k], c = pixels(im); if (!c || !c.d) continue;
          const r = im.getBoundingClientRect(), s = Math.max(r.width / im.naturalWidth, r.height / im.naturalHeight);
          const dw = im.naturalWidth * s, dh = im.naturalHeight * s, f = (im.style.objectPosition || '50% 50%').split(' ').map(parseFloat);
          const fx = isNaN(f[0]) ? 50 : f[0], fy = isNaN(f[1]) ? 50 : f[1];
          layers.push({ r, c, dw, dh, ox: (r.width - dw) * fx / 100, oy: (r.height - dh) * fy / 100 });
        }
      }
      if (!layers.length) return;
      for (const el of $$('.glass')) {
        const r = el.getBoundingClientRect(); if (!r.width || r.bottom < 0 || r.top > vh) continue;
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2, stops = []; let sum = [0, 0, 0], last = null;
        for (let i = 0; i < N; i++) {
          const a = i / N * Math.PI * 2, dx = Math.sin(a), dy = -Math.cos(a);
          const t = Math.min(r.width / 2 / (Math.abs(dx) || 1e-6), r.height / 2 / (Math.abs(dy) || 1e-6));
          const raw = lookup(cx + dx * t, cy + dy * t, layers) || last; if (!raw) { stops.length = 0; break; }
          last = raw; const c = vivid(raw); sum = sum.map((v, j) => v + c[j]);
          stops.push(`rgba(${c[0]},${c[1]},${c[2]},.85) ${Math.round(i / N * 360)}deg`);
        }
        if (!stops.length) continue;
        const rim = `conic-gradient(from 0deg, ${stops.join(', ')}, ${stops[0].replace(/ \d+deg$/, ' 360deg')})`;
        if (el._rim === rim) continue; el._rim = rim;
        el.style.setProperty('--rim', rim);
        el.style.setProperty('--rim-glow', `rgba(${sum.map(v => Math.round(v / N)).join(',')},.30)`);
      }
    }
    return { update };
  })();

  // ---------- Liquid Glass refraction ----------
  // For each [data-lg] element we paint a displacement map (red = x shift, green = y shift)
  // shaped like a convex lens rim and feed it to backdrop-filter through an SVG filter.
  // Only Chromium renders SVG filters in backdrop-filter; other browsers keep the
  // frosted fallback from the stylesheet.
  const Glass = (() => {
    const ok = !!window.chrome && CSS.supports('backdrop-filter', 'blur(1px)') &&
               !matchMedia('(prefers-reduced-transparency: reduce)').matches;
    const defs = $('#lg-defs'), items = new Map();
    let seq = 0;
    const ro = ok ? new ResizeObserver(es => es.forEach(e => build(e.target))) : null;

    function map(w, h, r, bezel) {
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const ctx = c.getContext('2d'), im = ctx.createImageData(w, h), d = im.data;
      const hx = w / 2, hy = h / 2;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const px = x + .5 - hx, py = y + .5 - hy;
        const qx = Math.abs(px) - (hx - r), qy = Math.abs(py) - (hy - r);
        let dist, nx, ny; // distance inside the rounded rect + outward normal
        if (qx > 0 && qy > 0) { const l = Math.hypot(qx, qy) || 1; dist = r - l; nx = qx / l * Math.sign(px); ny = qy / l * Math.sign(py); }
        else if (qx > qy) { dist = -qx + r; nx = Math.sign(px); ny = 0; }
        else { dist = -qy + r; nx = 0; ny = Math.sign(py); }
        let m = 0;
        if (dist >= 0 && dist < bezel) { const k = 1 - dist / bezel; m = 1 - Math.sqrt(1 - k * k); }
        const i = (y * w + x) * 4;
        d[i] = 128 - nx * m * 127; d[i + 1] = 128 - ny * m * 127; d[i + 2] = 128; d[i + 3] = 255;
      }
      ctx.putImageData(im, 0, 0);
      return c.toDataURL();
    }

    function build(el) {
      const it = items.get(el); if (!it) return;
      const w = Math.round(el.offsetWidth), h = Math.round(el.offsetHeight);
      if (!w || !h || (it.w === w && it.h === h)) return;
      it.w = w; it.h = h;
      const r = Math.min(parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0, w / 2, h / 2);
      const bezel = Math.min(+el.dataset.bezel || 22, w / 2, h / 2);
      it.filter.innerHTML =
        `<feImage href="${map(w, h, r, bezel)}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="none" result="m"/>` +
        `<feDisplacementMap in="SourceGraphic" in2="m" scale="${+el.dataset.lg || 30}" xChannelSelector="R" yChannelSelector="G"/>`;
      const f = `url(#${it.id}) blur(${+el.dataset.blur || 1.5}px) saturate(1.7) brightness(1.06)`;
      el.style.backdropFilter = f;
    }

    function scan() {
      if (!ok) return;
      for (const [el, it] of items) if (!el.isConnected) { ro.unobserve(el); it.filter.remove(); items.delete(el); }
      $$('[data-lg]').forEach(el => {
        if (items.has(el)) return;
        const id = 'lg-' + (++seq);
        const filter = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
        filter.setAttribute('id', id);
        filter.setAttribute('x', '0'); filter.setAttribute('y', '0'); filter.setAttribute('width', '100%'); filter.setAttribute('height', '100%');
        filter.setAttribute('color-interpolation-filters', 'sRGB');
        defs.appendChild(filter);
        items.set(el, { id, filter, w: 0, h: 0 });
        ro.observe(el);
      });
    }
    return { scan, ok };
  })();

  // ---------- boot ----------
  async function boot() {
    document.body.classList.add('booting');
    try {
      const res = await fetch('data/content.json?t=' + Date.now(), { cache: 'no-store' });
      content = await res.json();
    } catch (err) {
      view.innerHTML = '<div class="empty">Could not load content.<br>Start the site with <b>python3 server.py</b> (or open the hosted URL).</div>';
      return;
    }
    content.site = content.site || {}; content.hero = content.hero || {};
    projects = (content.projects || []).filter(p => p.published !== false && p.slug);
    buildNav();
    await render();
    document.body.classList.remove('booting');
    requestAnimationFrame(frame);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => markTab(route.hash));
  }
  boot();
})();
