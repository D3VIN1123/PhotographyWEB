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
  // wrap each word (or each CJK character) in a span so it can light up as the reader scrolls
  const CJK = '\\u2e80-\\u9fff\\uff00-\\uffef';
  const WORD = new RegExp(`\\s+|[${CJK}]|[^\\s${CJK}]+`, 'g');
  const words = s => (esc(s).match(WORD) || []).map(w => /^\s+$/.test(w) ? (w.includes('\n') ? '<br>' : ' ') : `<span class="w">${w}</span>`).join('');
  const plural = n => `${n} photograph${n === 1 ? '' : 's'}`;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const safeUrl = u => { u = String(u || '').trim(); return /^(https?:|mailto:|#|\/|\.)/i.test(u) ? u : (u ? 'https://' + u.replace(/^[a-z]+:/i, '') : ''); };
  const ARROW = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8h10M9 4l4 4-4 4"/></svg>';

  const view = $('#view'), hud = $('#hud'), hudCount = $('#hud-count'), hudCap = $('#hud-cap');
  const where = $('#where'), menu = $('#menu'), menuBtn = $('#menu-btn');

  // ---------- data ----------
  let content = { site: {}, hero: {}, projects: [] };
  let projects = [];
  // a project's "photos" are modules: image (default), stack (time layers), video (uploaded file), youtube
  const kindOf = ph => (ph && ph.type) || 'image';
  const visual = ph => ph && (kindOf(ph) === 'image' || kindOf(ph) === 'stack') && ph.src;
  // photos / videos / stacks count as pictures; subtitle blocks ("text") do not
  const countOf = p => (p.photos || []).reduce((n, x) => n + (kindOf(x) === 'text' ? 0 : kindOf(x) === 'stack' ? Math.max(1, (x.layers || []).length) : 1), 0);
  const coverOf = p => p && ((p.photos || []).find(x => x.id === p.cover && visual(x)) || (p.photos || []).find(visual)) || null;
  const isPortrait = ph => ph.w && ph.h && ph.h > ph.w * 1.05;
  const pos = ph => { const f = (ph && ph.focus) || [50, 50]; return `object-position:${+f[0] || 50}% ${+f[1] || 50}%`; };
  const isCJK = s => /[\u2e80-\u9fff]/.test(s || '');
  const capLines = c => String(c || '').split(/\n+/).map(x => x.trim()).filter(Boolean);
  // Captions are written "中文\nEnglish". They are set like the title plate: the English in italic serif,
  // the Chinese after it, small and letter-spaced.
  function capRich(c) {
    const L = capLines(c); if (!L.length) return '';
    const zh = L.filter(isCJK).join(' '), en = L.filter(x => !isCJK(x)).join(' ');
    return `<span class="cr">${en ? `<em class="cr-en">${esc(en)}</em>` : ''}${zh ? `<span class="cr-zh">${esc(zh)}</span>` : ''}</span>`;
  }
  // an album's name for plates, the menu and the nav: big word (place, else title), English line, coordinates
  const placeOf = p => ({ big: String(p.place || p.title || '').trim(), en: String(p.placeEn || p.subtitle || '').trim(), coords: String(p.coords || '').trim() });

  function img(ph, cls = '', eager = false) {
    if (!ph || !ph.src) return '';
    // the page shows the 2400px display copy (mid); the full-size original is only loaded in zoom mode
    return `<img class="${cls}" src="${esc(ph.mid || ph.src)}"${ph.mid ? ` data-full="${esc(ph.src)}"` : ''} alt="${esc(ph.caption || '')}" style="${pos(ph)}" ` +
      `${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async" draggable="false" ` +
      // a browser that can't show AVIF (Safari before 16.4) falls back to the original file
      `onload="this.classList.add('loaded')" onerror="if(this.dataset.full&&this.getAttribute('src')!==this.dataset.full){this.src=this.dataset.full}else{this.classList.add('loaded')}">`;
  }

  // ---------- templates ----------
  // The title plate laid over a full-bleed photo (album covers, home panels, the opened threshold):
  // a mono line along the top (album number, coordinates); bottom-left a big title — Chinese in heavy Song
  // with a gold fade, Latin in italic serif; beside it the English name, the cover photo's caption and a
  // mono line with the frame count; an outlined button bottom-right.
  function plate(p, o) {
    const pl = placeOf(p), cov = coverOf(p), i = projects.indexOf(p), H = o.h || 'h2';
    return `
      <div class="plate-top reveal"><span>Album ${pad2(i + 1)} / ${pad2(projects.length)}</span>${pl.coords ? `<span>${esc(pl.coords)}</span>` : ''}</div>
      <div class="plate">
        <${H} class="plate-big${isCJK(pl.big) ? ' cjk' : ''} t-${/^[a-z]+$/.test(p.theme || '') ? p.theme : 'plain'} reveal" style="--d:1">${esc(pl.big)}</${H}>
        <div class="plate-side">
          ${pl.en ? `<div class="plate-en reveal" style="--d:2">${esc(pl.en)}</div>` : ''}
          ${cov && cov.caption ? `<div class="plate-cap reveal" style="--d:3">${capRich(cov.caption)}</div>` : ''}
          <div class="plate-meta reveal" style="--d:4"><span>${pad2(countOf(p))} frames</span>${pl.big !== p.title ? `<span>${esc(p.title)}</span>` : ''}</div>
        </div>
      </div>
      ${o.btn ? `<span class="plate-btn reveal" style="--d:5"${o.zoom ? ' role="button" tabindex="0" data-zoom' : ''}>${esc(o.btn)} <b>↗</b></span>` : ''}`;
  }

  // ---------- home: the threshold (入口) ----------
  // The first screen is a sheet of paper with a round opening in it, ringed by a brush-drawn ensō. Through the
  // opening the albums' covers come and go, slowly; the opening breathes, drifts a little with the mouse, and
  // closes and reopens on every change. Hovering an album name on the left holds its photograph. Scrolling
  // down opens the circle until the photograph fills the screen and its title plate appears.
  function thSlides() {
    const h = content.hero || {};
    const list = projects.filter(p => coverOf(p)).map(p => ({ p, url: '#/p/' + p.slug }));
    const first = list.findIndex(s => s.p.id === h.projectId);
    if (first > 0) list.unshift(list.splice(first, 1)[0]);
    return list;
  }
  let slides = [];
  let ensoCache = '';
  // A dry-brush ensō: dozens of thin bristle lines follow the circle, each with its own offset, start and end,
  // so the stroke is heavy where the brush lands and breaks into streaks as the ink runs out. Baked to an image.
  function ensoURL() {
    if (ensoCache) return ensoCache;
    const rnd = seeded(23), C = 500, R = 440, a0 = -2.2, sweep = Math.PI * 2 * 0.93;
    let out = '';
    for (let b = 0; b < 64; b++) {
      const off = rnd() * 2 - 1, t0 = rnd() * rnd() * 0.06, t1 = 0.62 + rnd() * 0.38 - Math.abs(off) * 0.18;
      const ph = rnd() * 6, sw = 1.4 + rnd() * 3.6, op = 0.35 + rnd() * 0.6;
      let d = '';
      for (let k = 0; k <= 140; k++) {
        const t = t0 + (t1 - t0) * k / 140;
        const w = 46 * (1 - 0.62 * t) * (t < 0.04 ? 0.7 + t * 7.5 : 1);   // the press at the start, then thinner
        const r = R + off * w / 2 + 5 * Math.sin(t * 9 + ph) * (0.3 + t) + 4 * Math.sin(t * 2.3);
        const a = a0 + sweep * t;
        d += (k ? 'L' : 'M') + (C + Math.cos(a) * r).toFixed(1) + ' ' + (C + Math.sin(a) * r).toFixed(1);
      }
      out += `<path d="${d}" stroke-width="${sw.toFixed(2)}" opacity="${op.toFixed(2)}"/>`;
    }
    const doc = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="1400" height="1400"><g fill="none" stroke="#1d1c19" stroke-linecap="round" stroke-linejoin="round">${out}</g></svg>`;
    return (ensoCache = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(doc));
  }
  function thresholdHTML() {
    slides = thSlides(); if (!slides.length) return '';
    const site = content.site || {};
    return `
    <section class="threshold" id="threshold">
      <div class="th-stick">
        <a class="th-ap" href="${esc(slides[0].url)}" aria-label="Open album">
          ${slides.map((s, i) => `<div class="th-img${i ? '' : ' on'}">${img(coverOf(s.p), '', i === 0)}</div>`).join('')}
          <div class="th-shade"></div>
          <div class="th-plate"></div>
        </a>
        <img class="th-enso" src="${ensoURL()}" alt="" aria-hidden="true" draggable="false">
        <div class="th-paper">
          <div class="th-top"><span>A photographic record</span><span>${esc(site.title || '')}</span></div>
          <nav class="th-list" aria-label="Albums">${slides.map((s, i) => { const pl = placeOf(s.p); return `<a href="${esc(s.url)}" data-th="${i}"${i ? '' : ' class="on"'}><b>${pad2(projects.indexOf(s.p) + 1)}</b><span class="${isCJK(pl.big) ? 'cjk' : ''}">${esc(pl.big)}</span><em>${esc(pl.en)}</em></a>`; }).join('')}</nav>
          <div class="th-word"></div>
          <div class="th-edge"><span class="th-count"></span><i></i><span class="th-coords"></span></div>
          <div class="th-hint"><span>Scroll to enter</span><i></i><span>入</span></div>
        </div>
      </div>
    </section>`;
  }
  const Threshold = (() => {
    const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
    let el = null, ap, imgs, enso, paper, links, word, count, coords, plateEl, shade, cur = -1, timer = 0, swapT = 0;
    let p = 0, px = 0, py = 0, tx = 0, ty = 0, breath = 1, key = '', hold = false, base = 0;
    function setup() {
      clearInterval(timer); clearTimeout(swapT); cur = -1; key = ''; p = 0;
      el = $('#threshold', view); if (!el) return;
      ap = $('.th-ap', el); imgs = $$('.th-img', el); enso = $('.th-enso', el); paper = $('.th-paper', el); shade = $('.th-shade', el);
      links = $$('[data-th]', el); word = $('.th-word', el); count = $('.th-count', el); coords = $('.th-coords', el); plateEl = $('.th-plate', el);
      show(0, true);
      if (!reduceMotion) timer = setInterval(() => { if (!hold && p < 0.02 && !document.hidden && !zoomed) show((cur + 1) % imgs.length); }, 5600);
      links.forEach(a => {
        a.addEventListener('pointerenter', () => { hold = true; show(+a.dataset.th); });
        a.addEventListener('pointerleave', () => { hold = false; });
        a.addEventListener('focus', () => show(+a.dataset.th));
      });
      requestAnimationFrame(() => el && el.classList.add('ready'));
    }
    function show(i, first) {
      if (i === cur || !slides[i]) return; cur = i;
      const s = slides[i], pl = placeOf(s.p), cov = coverOf(s.p);
      imgs.forEach((d, j) => d.classList.toggle('on', j === i));
      links.forEach((a, j) => a.classList.toggle('on', j === i));
      ap.href = s.url;
      if (!first && !reduceMotion) breath = 0.82;   // closes a little and opens again: a breath
      const fill = () => {
        word.innerHTML = `<div class="th-big${isCJK(pl.big) ? ' cjk' : ''}">${esc(pl.big)}</div>${pl.en ? `<div class="th-en">${esc(pl.en)}</div>` : ''}${cov && cov.caption ? `<div class="th-cap">${capRich(cov.caption)}</div>` : ''}`;
        word.classList.remove('swap');
      };
      clearTimeout(swapT);
      if (first) fill(); else { word.classList.add('swap'); swapT = setTimeout(fill, 380); }
      count.textContent = `${pad2(projects.indexOf(s.p) + 1)} / ${pad2(projects.length)}`;
      coords.textContent = pl.coords;
      plateEl.innerHTML = plate(s.p, { btn: 'Open album' });
    }
    // scroll position → how far the circle has opened (0 … 1); the nav reads dark ink while it is paper
    function scroll(vh) {
      if (!el) return false;
      const r = rect(el);
      p = Math.min(1, Math.max(0, -r.top / Math.max(1, r.height - vh * 1.35)));
      return r.bottom > 42 && p < 0.5;
    }
    function tick(t) {
      if (!el || !el.isConnected) return;
      const vw = window.innerWidth, vh = window.innerHeight, narrow = vw <= 760;
      px += (tx - px) * 0.05; py += (ty - py) * 0.05; breath += (1 - breath) * 0.035;
      const k = Math.min(1, p / 0.62), e = k * k * (3 - 2 * k);
      base = narrow ? Math.min(vh * 0.27, vw * 0.38) : Math.min(vh * 0.31, vw * 0.23);
      const r0 = base * breath * (reduceMotion ? 1 : 1 + 0.018 * Math.sin(t / 1900));
      const R = Math.hypot(vw, vh) / 2 + 4, r = r0 + (R - r0) * e;
      const ox = px * (1 - e), oy = py * (1 - e);
      const cx = vw / 2 + ox, cy = (narrow ? vh * 0.4 : vh / 2) * (1 - e) + (vh / 2) * e + oy;
      const nk = [r, cx, cy].map(v => v.toFixed(1)).join() + (p >= 1 ? 'end' : '');
      if (nk === key) return; key = nk;
      ap.style.clipPath = `circle(${r.toFixed(1)}px at ${cx.toFixed(1)}px ${cy.toFixed(1)}px)`;
      const sc = (1.1 - 0.1 * e).toFixed(4);
      for (const d of imgs) d.style.transform = `translate3d(${(-ox * 0.7).toFixed(1)}px,${(-oy * 0.7).toFixed(1)}px,0) scale(${sc})`;
      const ew = base * 2.5;
      enso.style.width = enso.style.height = ew.toFixed(0) + 'px';
      enso.style.transform = `translate3d(${(cx - ew / 2).toFixed(1)}px,${(cy - ew / 2).toFixed(1)}px,0) scale(${(r / base).toFixed(4)})`;
      enso.style.opacity = Math.max(0, 1 - e * 1.7).toFixed(3);
      paper.style.opacity = Math.max(0, 1 - p / 0.28).toFixed(3);
      paper.style.visibility = p > 0.3 ? 'hidden' : '';
      const q = Math.min(1, Math.max(0, (p - 0.6) / 0.28)).toFixed(3);
      plateEl.style.opacity = q; shade.style.opacity = q;
      plateEl.style.visibility = +q ? 'visible' : 'hidden';
    }
    addEventListener('pointermove', e => {
      if (!fine || !el) return;
      tx = (e.clientX / window.innerWidth - 0.5) * 70; ty = (e.clientY / window.innerHeight - 0.5) * 50;
    }, { passive: true });
    return { setup, scroll, tick };
  })();

  function homeHTML() {
    const site = content.site || {};
    let html = thresholdHTML();
    const intro = site.intro || site.tagline || '';
    if (projects.length) {
      html += `
    <section class="paper intro">
      <div class="label reveal"><span>Index</span><b>${pad2(projects.length)} albums</b></div>
      ${intro ? `<p class="statement words">${words(intro)}</p>` : ''}
      <div class="index">
        ${projects.map((p, i) => { const pl = placeOf(p); return `<a class="reveal" style="--d:${i}" href="#/p/${esc(p.slug)}"><b>${pad2(i + 1)}</b><span class="t${isCJK(pl.big) ? ' cjk' : ''}">${esc(pl.big)}</span><em class="s">${esc(pl.en)}</em><span class="c">${esc(pl.coords)}</span><span class="n">${pad2(countOf(p))} fr <i>↗</i></span></a>`; }).join('')}
      </div>
    </section>`;
    }
    projects.forEach(p => {
      html += `
    <a class="panel proj grow" id="proj-${esc(p.slug)}" href="#/p/${esc(p.slug)}" data-plx="8">
      <div class="bg">${img(coverOf(p))}</div><div class="shade"></div>
      ${plate(p, { btn: 'Open album' })}
    </a>`;
    });
    const links = [];
    if (site.email) links.push(`<a href="mailto:${esc(site.email)}">${esc(site.email)}</a>`);
    if (site.instagram) {
      const ig = String(site.instagram).replace(/^@/, '');
      links.push(`<a href="${esc(/^https?:/.test(ig) ? ig : 'https://instagram.com/' + ig)}" target="_blank" rel="noopener">Instagram</a>`);
    }
    html += `
    <footer class="paper foot">
      <div class="label reveal"><span>Afterword</span></div>
      <div class="foot-title reveal" style="--d:1">${esc(site.title || '')}</div>
      <p class="foot-text reveal" style="--d:2">${text(site.footer || site.tagline || '')}</p>
      <div class="foot-row reveal" style="--d:3"><nav>${links.join('')}</nav><a class="up" href="#/">Back to the beginning ↑</a></div>
    </footer>`;
    return html;
  }

  // Rhythm of a project page: full-bleed photos alternate with "spreads" — one or two
  // framed photos on paper with white space around them.
  //   layout "fill" → always full-bleed · "fit" → always framed on paper
  //   "auto" → landscapes alternate full-bleed / framed pair; portraits are always framed
  function layoutShots(photos) {
    const out = []; let alt = 0;
    const auto = p => p && kindOf(p) === 'image' && (p.layout || 'auto') === 'auto';
    // "from" is the picture's number on the page (subtitle blocks are not numbered)
    const num = []; photos.reduce((c, p, k) => { num[k] = c; return kindOf(p) === 'text' ? c : c + 1; }, 0);
    for (let i = 0; i < photos.length; i++) {
      const p = photos[i], lay = p.layout || 'auto';
      if (kindOf(p) !== 'image') { out.push({ type: kindOf(p), items: [p], from: num[i] }); alt = 0; continue; }
      if (p.fx === 'dawn') { out.push({ type: 'dawn', items: [p], from: num[i] }); alt = 0; continue; }
      if (lay === 'wide') { out.push({ type: 'wide', items: [p], from: num[i] }); alt = 1; continue; }
      if (lay === 'pair' && photos[i + 1] && kindOf(photos[i + 1]) === 'image' && photos[i + 1].src) {   // "pair with the next photo"
        out.push({ type: 'pair', items: [p, photos[i + 1]], from: num[i] }); i++; alt = 0; continue;
      }
      if (lay === 'fill' || (lay === 'auto' && !isPortrait(p) && alt === 0)) {
        out.push({ type: 'full', items: [p], from: num[i] }); if (lay === 'auto') alt = 1; continue;
      }
      if (lay === 'auto' && auto(photos[i + 1])) { out.push({ type: 'pair', items: [p, photos[i + 1]], from: num[i] }); i++; }
      else out.push({ type: 'single', items: [p], from: num[i] });
      alt = 0;
    }
    return out;
  }

  // Captions may have two lines ("中文\nEnglish"): the first is set as the main line, the second smaller.
  function capHTML(c) {
    const L = String(c || '').split(/\n+/).map(x => x.trim()).filter(Boolean);
    return L.length > 1 ? `<span class="cap two"><span class="c1">${esc(L[0])}</span><span class="c2">${esc(L.slice(1).join(' '))}</span></span>` : esc(L[0] || '');
  }
  const capLine = c => String(c || '').split(/\n+/).map(x => x.trim()).filter(Boolean).join('  ·  ');
  // per-photo effects: "mist" = slow drifting cloud over the photo
  const fxIn = ph => ph && ph.fx === 'mist' ? '<div class="mist" aria-hidden="true"></div>' : ph && ph.fx === 'sparkle' ? sparkleHTML(ph) :
    ph && ph.fx === 'embers' ? emberHTML(ph) : ph && ph.fx === 'fireworks' ? '<canvas class="fw" aria-hidden="true"></canvas>' + emberHTML(ph) : '';

  // Framed photo with film-edge text: the way numbers and words run along the rebate of a negative — frame
  // number with a small triangle, the half-frame "A" mark, the album's name spaced out, the next number, and a
  // vertical line of text up one side. Three arrangements take turns (fe-a / fe-b / fe-c); see "Film-edge text"
  // in site.css. No sprocket holes or film is drawn: only the type.
  let edge = { code: '', coords: '' };
  const frame1 = (ph, i) => {
    const n = i + 1, v = 'fe-' + 'abc'[i % 3];
    return `<figure class="frame ${v}${isPortrait(ph) ? ' tall' : ''}" style="--ar:${((+ph.w || 3) / (+ph.h || 2)).toFixed(3)}">` +
      `<div class="fe-wrap"><div class="clip" style="aspect-ratio:${+ph.w || 3}/${+ph.h || 2}">${img(ph)}${fxIn(ph)}</div>` +
      `<div class="fe-col" aria-hidden="true"><span>${pad2(n)}</span><i></i><span>${esc(edge.code)}</span><i></i><span>${esc(edge.coords || 'Dewen Tao')}</span></div></div>` +
      `<div class="fe-row" aria-hidden="true"><span>${n}</span><span class="tri">▸</span><span>${n}A</span><span class="fe-mid">${esc(edge.code)}</span><span>${n + 1}</span><span class="tri">▸</span></div>` +
      `<figcaption><b>${pad2(n)}</b>${capRich(ph.caption)}</figcaption></figure>`;
  };

  // Handscroll (长卷): a stack whose layout is "scroll". The photos sit side by side on one long
  // strip that slides sideways as you scroll down, like unrolling a Chinese handscroll.
  function rollHTML(x, i) {
    const L = (x.layers || []).filter(l => l && l.src); if (!L.length) return '';
    const C = String(x.caption || '').split(/\n+/).map(t => t.trim()).filter(Boolean);
    return `
    <section class="paper roll">
      <div class="stick">
        ${C.length ? `<div class="roll-head"><b>№${pad2(i + 1)}</b><span class="c1">${esc(C[0])}</span>${C[1] ? `<span class="c2">${esc(C.slice(1).join(' '))}</span>` : ''}</div>` : ''}
        <div class="roll-track">${L.map((l, j) => `
          <figure class="frame roll-item" style="--ar:${((+l.w || 3) / (+l.h || 2)).toFixed(3)}">
            <div class="clip">${img({ src: l.src, mid: l.mid, caption: l.label, focus: x.focus })}</div>
            <figcaption><b>${pad2(j + 1)}</b>${esc(l.label || '')}</figcaption></figure>`).join('')}
        </div>
        <div class="roll-line"><i></i></div>
      </div>
    </section>`;
  }

  // "Dawn" effect (日照金山): the frame is pinned and scrolling brings the sun up — the photo goes
  // from cold pre-dawn blue to its full colour, with a warm glow where the light lands (focus point).
  function dawnHTML(x, i, total) {
    const f = x.focus || [50, 40], C = String(x.caption || '').split(/\n+/).map(t => t.trim()).filter(Boolean);
    return `
    <section class="dawn" data-count="${pad2(i + 1)}" data-total="${pad2(total)}">
      <div class="stick">
        <div class="bg">${img(x)}</div>
        <div class="dawn-cold"></div><div class="dawn-glow" style="--gx:${+f[0] || 50}%;--gy:${+f[1] || 40}%"></div>
        <div class="dawn-hint">向下滚动，等太阳出来<span>Keep scrolling for the sun</span></div>
        ${C.length ? `<div class="dawn-title"><span class="c1">${esc(C[0])}</span>${C[1] ? `<span class="c2">${esc(C.slice(1).join(' '))}</span>` : ''}</div>` : ''}
      </div>
    </section>`;
  }

  // Time stack: the frame stays pinned while scrolling cross-fades layer to layer.
  // Halfway through a fade both photos show at 50 % — an average, like a slow double exposure.
  function stackHTML(x, i) {
    if (x.layout === 'scroll') return rollHTML(x, i);
    const L = (x.layers || []).filter(l => l && l.src); if (!L.length) return '';
    const full = x.layout === 'fill', w = +L[0].w || 3, h = +L[0].h || 2;
    const layers = L.map((l, j) => `<img class="layer" src="${esc(l.mid || l.src)}"${l.mid ? ` data-full="${esc(l.src)}" onerror="if(this.getAttribute('src')!==this.dataset.full)this.src=this.dataset.full"` : ''} alt="${esc(l.label || x.caption || '')}" data-label="${esc(l.label || '')}" style="opacity:${j ? 0 : 1};${pos(x)}" loading="lazy" decoding="async" draggable="false">`).join('');
    return `
    <section class="stack${full ? ' full' : ' paper'}" style="--n:${L.length};--ar:${(w / h).toFixed(3)}">
      <div class="stick">
        <figure class="frame stackframe">
          <div class="clip layers"${full ? '' : ` style="aspect-ratio:${w}/${h}"`}>${layers}</div>
          <figcaption><b>№${pad2(i + 1)}</b><span class="cap">${esc(x.caption || '')}</span>
            <span class="when">${esc(L[0].label || '')}</span><span class="ticks">${L.map((l, j) => `<i${j ? '' : ' class="on"'}></i>`).join('')}</span></figcaption>
        </figure>
      </div>
    </section>`;
  }

  // Subtitle block: a heading and a paragraph on paper, between the pictures.
  // Alignment, block height (px), sizes (px), font and colour are all set in the backstage.
  const FONTS = {
    serif: 'var(--serif)', sans: 'var(--font)', mono: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
    song: '"Songti SC", "STSong", "Noto Serif SC", "SimSun", serif', kai: '"Kaiti SC", "STKaiti", "KaiTi", "Kaiti TC", serif',
  };
  // Page colours for dark (indigo) albums. A text block with a "tone" dyes the whole page into that colour
  // as it scrolls in (blended in the scroll loop, so it rewinds on the way back up).
  // bg = cloth colour, hi / lo = the uneven dye (light and dark patches), ink = text, ac = accent, pat = tie-dye
  // dot pattern strength in the cloth.
  const TONES = {
    indigo: { bg: [17, 26, 44], hi: [40, 62, 110, .55], lo: [22, 36, 70, .7], ink: [236, 227, 210], ac: [212, 162, 76], pat: 0 },
    dye:    { bg: [21, 39, 80], hi: [54, 88, 156, .5], lo: [9, 20, 50, .75], ink: [238, 240, 243], ac: [232, 170, 96], pat: 1 },
    jade:   { bg: [11, 35, 37], hi: [32, 96, 90, .45], lo: [5, 20, 24, .72], ink: [228, 236, 226], ac: [203, 166, 92], pat: 0 },
    maroon: { bg: [45, 16, 21], hi: [116, 38, 42, .45], lo: [22, 6, 10, .72], ink: [243, 229, 213], ac: [228, 180, 82], pat: 0 },
    dusk:   { bg: [31, 27, 50], hi: [88, 74, 138, .42], lo: [13, 11, 30, .72], ink: [237, 231, 226], ac: [236, 182, 96], pat: 0 },
    night:  { bg: [8, 11, 22], hi: [28, 38, 80, .4], lo: [0, 0, 6, .6], ink: [228, 226, 220], ac: [204, 198, 180], pat: 0 },
    // Paris: limestone by day, zinc roofs, a lilac dusk, the dark inside a cathedral (night = indigo / night)
    stone:   { bg: [240, 234, 223], hi: [255, 252, 245, .7], lo: [221, 209, 189, .55], ink: [33, 37, 51], ac: [150, 110, 58], pat: 0 },
    zinc:    { bg: [225, 228, 229], hi: [246, 248, 249, .7], lo: [186, 195, 202, .5], ink: [32, 40, 54], ac: [88, 104, 122], pat: 0 },
    lilac:   { bg: [222, 213, 227], hi: [244, 228, 232, .65], lo: [186, 176, 210, .5], ink: [42, 36, 64], ac: [146, 92, 116], pat: 0 },
    gilt:    { bg: [30, 22, 14], hi: [140, 96, 40, .35], lo: [12, 8, 4, .7], ink: [244, 232, 206], ac: [226, 184, 98], pat: 0 },
    seine:   { bg: [216, 212, 203], hi: [238, 234, 226, .6], lo: [178, 171, 156, .45], ink: [36, 38, 44], ac: [166, 108, 54], pat: 0 },
    vitrail: { bg: [17, 15, 27], hi: [38, 50, 118, .45], lo: [78, 16, 34, .38], ink: [236, 230, 220], ac: [216, 172, 86], pat: 0 },
  };
  Object.assign(TONES, {
    // 徽州: white walls, a misty green day, lantern night — 北京: grey hutong brick, palace red, winter apricot
    // (zen remaster, Nov 2026: quieter, greyer versions of the same journey)
    whitewall:    { bg: [239, 238, 234], hi: [250, 250, 248, .6], lo: [218, 217, 211, .4], ink: [34, 35, 36], ac: [160, 58, 44], pat: 0 },
    misty:        { bg: [226, 229, 226], hi: [242, 244, 241, .6], lo: [198, 204, 199, .4], ink: [33, 38, 36], ac: [140, 70, 56], pat: 0 },
    lanternnight: { bg: [17, 16, 16], hi: [96, 30, 22, .22], lo: [0, 0, 0, .5], ink: [232, 224, 212], ac: [214, 104, 72], pat: 0 },
    palace:       { bg: [74, 33, 29], hi: [112, 50, 42, .3], lo: [36, 14, 12, .55], ink: [238, 228, 210], ac: [214, 178, 112], pat: 0 },
    hutong:       { bg: [232, 230, 225], hi: [244, 243, 240, .6], lo: [208, 205, 198, .4], ink: [34, 33, 32], ac: [166, 58, 40], pat: 0 },
    // 彩云之南 (zen): the clouds change colour through the day — silver cloud, an indigo night in the old town,
    // jade river, plateau ochre, snow at first light, the starry night (night)
    cloud:        { bg: [236, 238, 240], hi: [248, 249, 250, .6], lo: [214, 218, 226, .4], ink: [30, 34, 44], ac: [112, 122, 168], pat: 0 },
    indigodusk:   { bg: [24, 30, 48], hi: [44, 58, 96, .3], lo: [10, 14, 26, .55], ink: [232, 230, 224], ac: [214, 170, 110], pat: 0 },
    jadewater:    { bg: [226, 233, 230], hi: [242, 246, 244, .6], lo: [196, 210, 205, .4], ink: [28, 40, 38], ac: [62, 124, 114], pat: 0 },
    ochre:        { bg: [236, 228, 214], hi: [248, 242, 232, .6], lo: [214, 198, 176, .4], ink: [44, 34, 28], ac: [160, 70, 48], pat: 0 },
    snowlight:    { bg: [238, 236, 234], hi: [252, 250, 248, .6], lo: [220, 214, 210, .4], ink: [36, 32, 34], ac: [196, 128, 80], pat: 0 },
    snow:         { bg: [240, 241, 242], hi: [252, 252, 253, .6], lo: [222, 224, 228, .4], ink: [32, 34, 38], ac: [160, 52, 40], pat: 0 },
    apricot:      { bg: [236, 228, 216], hi: [248, 240, 228, .6], lo: [220, 204, 184, .4], ink: [48, 36, 28], ac: [178, 96, 52], pat: 0 },
  });
  const BASE_TONE = { indigo: 'indigo', paris: 'stone', huizhou: 'whitewall', beijing: 'hutong', caiyun: 'cloud' };   // the page colour before the first toned block
  const NUMERALS = ['壹','贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖', '拾', '拾壹', '拾贰'];
  // Five-colour prayer flags strung across a chapter opening (blue, white, red, green, yellow)
  function flagsHTML() {
    // flags hang on one sagging string (a quadratic curve); the svg draws the string, the flags sit on it.
    // viewBox units: 100 wide, 20 high = 12vw → one unit is 0.6vw vertically
    const n = 28, cols = ['#3d5f9b', '#e8e2d4', '#b0473c', '#3e7a58', '#d5a640'];
    const P0 = [2, 1.2], P1 = [50, 15], P2 = [98, 4.2];
    const at = t => [0, 1].map(k => (1 - t) * (1 - t) * P0[k] + 2 * (1 - t) * t * P1[k] + t * t * P2[k]);
    return `<div class="flags" aria-hidden="true"><svg viewBox="0 0 100 20" preserveAspectRatio="none"><path d="M${P0} Q${P1} ${P2}"/></svg>${
      Array.from({ length: n }, (v, i) => {
        const [x, y] = at((i + 0.5) / n);
        return `<i style="--i:${i};left:${x.toFixed(2)}%;top:${(y * 0.6).toFixed(2)}vw;background:${cols[i % 5]}"></i>`;
      }).join('')}</div>`;
  }
  // Chapter opening: a numeral, a large vertical Chinese title, a small English line and a passage
  // that lights up word by word. Ornament: "contour" (drawn mountain contour lines) or "flags".
  const toneAttr = x => TONES[x.tone] ? ` data-tone="${x.tone}"` : '';
  let pageTheme = '', chTotal = 0;   // theme and chapter count of the project being built (set in projectHTML)

  // Paris chapter opening: a blue enamel street sign (top line = kicker, e.g. "18e Arrt"; name = title),
  // a Didot passage that lights up word by word, and an optional ornament: "roofs" (zinc rooftops and
  // chimney pots drawn in, the tower behind) or "rose" (a rose window whose glass lights up and throws
  // coloured light onto the page).
  // ---- Paris line drawings (简笔画), drawn in stroke by stroke when they scroll in ----
  // Doodles (200×200) sit above a verse: text block "ornament" on a Paris page.
  const DOODLES = {
    lamp: ['M70 194H130', 'M84 194V180H116V194', 'M88 180C90 166 94 158 96 150M112 180C110 166 106 158 104 150', 'M96 150V64M104 150V64',
      'M93 132H107M93 100H107M93 66H107', 'M100 64V56', 'M86 56H114L109 22H91Z', 'M100 56V22M95 56L93 22M105 56L107 22', 'M89 22Q100 8 111 22', 'M100 8V2',
      'M78 36l-9-2M122 36l9-2M80 50l-8 4M120 50l8 4'],
    chandelier: ['M100 4V30', 'M92 30H108M94 30Q90 44 100 50Q110 44 106 30', 'M100 50V84', 'M96 84Q100 98 104 84', 'M97 104a3 3 0 1 0 6 0a3 3 0 1 0-6 0M100 98V101',
      'M100 58C80 58 66 62 58 76M100 58C120 58 134 62 142 76', 'M100 70C76 72 46 80 36 98M100 70C124 72 154 80 164 98',
      'M53 76H63M137 76H147M31 98H41M159 98H169', 'M58 76V64M142 76V64M36 98V86M164 98V86',
      'M58 60q-3-4 0-9q3 5 0 9M142 60q-3-4 0-9q3 5 0 9M36 82q-3-4 0-9q3 5 0 9M164 82q-3-4 0-9q3 5 0 9',
      'M58 76V84M142 76V84M36 98V108M164 98V108', 'M56 86a2 2 0 1 0 4 0a2 2 0 1 0-4 0M140 86a2 2 0 1 0 4 0a2 2 0 1 0-4 0M34 110a2 2 0 1 0 4 0a2 2 0 1 0-4 0M162 110a2 2 0 1 0 4 0a2 2 0 1 0-4 0'],
    metro: ['M46 196C46 150 40 110 52 72C58 52 60 40 56 30', 'M154 196C154 150 160 110 148 72C142 52 140 40 144 30',
      'M56 30C48 28 46 16 56 8C66 16 64 28 56 30Z', 'M144 30C136 28 134 16 144 8C154 16 152 28 144 30Z',
      'M52 72C80 62 120 62 148 72', 'M62 46H138V60H62Z', 'M28 196V150H46M172 196V150H154',
      'M34 150C36 165 31 180 34 196M40 150C42 165 37 180 40 196M166 150C164 165 169 180 166 196M160 150C158 165 163 180 160 196',
      'M62 196H138M68 186H132M74 176H126'],
    cafe: ['M70 110a40 9 0 1 0 80 0a40 9 0 1 0-80 0', 'M110 119V184', 'M92 191Q110 180 128 191', 'M101 90H113L111 101H103Z', 'M113 93q6 0 4 4q-1 3-5 2', 'M97 103H117',
      'M105 86q-3-5 0-9q3-4 0-8M110 86q-3-5 0-9q3-4 0-8',
      'M40 70C30 70 28 90 32 108C34 120 36 128 38 132', 'M40 70C52 72 55 92 50 112', 'M30 132a14 4 0 1 0 28 0a14 4 0 1 0-28 0',
      'M33 134L28 190M55 134L60 190M40 137L38 190M50 137L52 190', 'M30 162Q44 168 58 162'],
    eiffel: ['M100 4V20', 'M100 6l7 2-7 2', 'M95 20H105', 'M98 20C96 60 84 110 56 194', 'M102 20C104 60 116 110 144 194', 'M88 92H112', 'M76 136H124',
      'M68 194Q100 148 132 194', 'M92 64L108 90M108 64L92 90', 'M86 98L114 134M114 98L86 134', 'M76 142L94 190M124 142L106 190',
      'M60 58h8M64 54v8M134 46h8M138 42v8'],
  };
  const doodleSVG = name => `<svg class="pa-doodle" viewBox="0 0 200 200" aria-hidden="true">${DOODLES[name].map((d, k) => `<path d="${d}" pathLength="1" style="--k:${k}"/>`).join('')}${name === 'metro' ? '<text x="100" y="56">MÉTROPOLITAIN</text>' : ''}</svg>`;
  // Scenes (1000×300) run along the bottom of a chapter opening: chapter "ornament" opera / seine / versailles.
  const SCENES = {
    opera() {   // Palais Garnier: arcade, paired columns, attic with garlands, gilded groups, the dome and Apollo's lyre
      const P = [['M60 296H940'], ['M180 296H820M190 288H810M200 280H800'], ['M200 280V200H800V280']];
      let a = ''; for (let i = 0; i < 7; i++) { const x = 230 + i * 80; a += `M${x} 280V236A26 26 0 0 1 ${x + 52} 236V280`; } P.push([a]);
      P.push(['M190 200H810']);
      let c = ''; for (let i = 0; i < 8; i++) { const x = 216 + i * 80; c += `M${x} 200V130M${x + 10} 200V130`; } P.push([c]);
      let w = ''; for (let i = 0; i < 7; i++) { const x = 240 + i * 80; w += `M${x} 192V152Q${x + 21} 138 ${x + 42} 152V192`; } P.push([w]);
      P.push(['M190 130H810M196 122H804'], ['M200 122V96H800V122']);
      let g = ''; for (let i = 0; i < 7; i++) { const x = 230 + i * 80; g += `M${x} 108Q${x + 26} 120 ${x + 52} 108`; } P.push([g]);
      P.push(['M380 96Q500 18 620 96', 'tower'], ['M440 96Q468 54 500 42M560 96Q532 54 500 42', 'tower'], ['M494 42V30H506V42', 'tower']);
      P.push(['M190 96H262M738 96H810'], ['M208 96L226 66L244 96M756 96L774 66L792 96', 'gold'], ['M226 66l-7-14M226 66l7-14M222 50a4 4 0 1 0 8 0a4 4 0 1 0-8 0M774 66l-7-14M774 66l7-14M770 50a4 4 0 1 0 8 0a4 4 0 1 0-8 0', 'gold']);
      P.push(['M640 96L700 52L760 96', 'tower'], ['M700 52v-12M692 32q8-16 16 0M692 32q-1 10 8 12M708 32q1 10-8 12', 'gold']);
      return P;
    },
    seine() {   // a stone bridge with its arches and lamps, the quay skyline and a spire behind, a tour boat
      const P = [['M0 168V120H80L92 104H168L180 120V168M200 168V112L212 98H300L312 112V168M640 168V116H720L732 102H820L832 116V168M850 168V122H1000', 'tower'],
        ['M470 168V100L476 58L482 100V168', 'tower'], ['M60 182H940M60 168H940M60 160H940']];
      let a = ''; for (let i = 0; i < 5; i++) { const x = 80 + i * 168; a += `M${x + 10} 272V236A74 54 0 0 1 ${x + 158} 236V272`; } P.push([a]);
      let b = ''; for (let i = 1; i < 5; i++) { const x = 80 + i * 168; b += `M${x - 16} 182Q${x} 196 ${x + 16} 182`; } P.push([b]);
      let l = ''; for (let i = 1; i < 5; i++) { const x = 80 + i * 168; l += `M${x} 160V128M${x - 7} 128H${x + 7}L${x + 4} 110H${x - 4}ZM${x} 110v-6`; } P.push([l, 'gold']);
      P.push(['M0 272H1000'], ['M40 286h60M160 294h90M330 284h70M600 292h110M760 284h60M860 294h100'], ['M380 262H530L514 276H394ZM398 262V252H508V262M412 252V246H480V252M410 258h10M430 258h10M450 258h10M470 258h10M490 258h10']);
      return P;
    },
    versailles() {   // the gilded gate: stone piers with urns, railings rising to a crown, fleur-de-lis and the Sun King's rays
      const P = [['M80 296H920'], ['M110 296V156H150V296M850 296V156H890V296'], ['M104 156H156M844 156H896'], ['M118 156Q130 128 142 156M858 156Q870 128 882 156M126 132h8M866 132h8']];
      let bars = '', tips = '';
      for (let x = 170; x <= 830; x += 20) {
        const top = 196 - 66 * Math.sin(Math.PI * (x - 170) / 660);
        bars += `M${x} 290V${top.toFixed(1)}`; tips += `M${x - 4} ${(top + 2).toFixed(1)}L${x} ${(top - 9).toFixed(1)}L${x + 4} ${(top + 2).toFixed(1)}`;
      }
      P.push([bars], [tips, 'gold'], ['M150 282H850M150 214H850M150 204H850']);
      let sc = ''; for (let x = 180; x < 820; x += 40) sc += `M${x} 262q10-12 20 0q10 12 20 0`; P.push([sc, 'gold']);
      P.push(['M470 168a30 34 0 1 0 60 0a30 34 0 1 0-60 0', 'gold'], ['M500 192C492 180 493 164 500 154C507 164 508 180 500 192M500 186C488 186 482 178 486 168C490 174 495 176 498 182M500 186C512 186 518 178 514 168C510 174 505 176 502 182M490 190H510', 'gold'],
        ['M466 122L476 102L488 116L500 96L512 116L524 102L534 122Z', 'gold'], ['M500 86V70M478 92L468 78M522 92L532 78M462 108L446 102M538 108L554 102', 'gold']);
      return P;
    },
  };
  const sceneSVG = name => `<svg class="pa-scene" viewBox="0 0 1000 300" preserveAspectRatio="xMidYMax meet" aria-hidden="true">${SCENES[name]().map(([d, cls], k) => `<path d="${d}"${cls ? ` class="${cls}"` : ''} pathLength="1" style="--k:${k}"/>`).join('')}</svg>`;

  const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
  const signLine = t => esc(t).replace(/\b(\d+)(er|e)\b/g, '$1<sup>$2</sup>').replace(/\bArrt\b/g, 'Arr<sup>t</sup>');
  function parisChapterHTML(x, n, st) {
    const orn = ['roofs', 'rose'].includes(x.ornament) || SCENES[x.ornament] ? x.ornament : '';
    return `
    <section class="paper chapter pa-ch${orn ? ' orn-' + orn : ''}"${st.length ? ` style='${st.join(';')}'` : ''} data-seed="${n}"${toneAttr(x)}>
      ${orn === 'rose' ? '<div class="pa-pools" aria-hidden="true"><i></i><i></i><i></i></div><div class="pa-rose-wrap" aria-hidden="true"><svg class="pa-rose" viewBox="-100 -100 200 200"></svg></div>' : ''}
      ${orn === 'roofs' ? '<svg class="pa-roofs" aria-hidden="true"></svg>' : ''}
      ${SCENES[orn] ? sceneSVG(orn) : ''}
      <div class="pa-in">
        <div class="pa-no reveal">Chapitre ${ROMAN[n - 1] || n}</div>
        <div class="pa-sign reveal" style="--d:1">${x.kicker ? `<small>${signLine(x.kicker)}</small>` : ''}<b>${esc(x.title || '')}</b></div>
        ${x.caption ? `<p class="pa-text words">${words(x.caption)}</p>` : ''}
      </div>
    </section>`;
  }
  const seeded = n => { let v = n * 9301 + 49297; return () => (v = (v * 9301 + 49297) % 233280) / 233280; };
  // Haussmann rooftops: mansards with dormers, cornices, balconies, chimney stacks and pots; the tower behind.
  function drawRoofs(svg) {
    const rnd = seeded(+svg.closest('.chapter').dataset.seed || 1), b = svg.getBoundingClientRect(), W = 1000;
    const H = Math.round(W * Math.min(0.9, Math.max(0.2, (b.height || 300) / (b.width || 1000))));
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const f = v => v.toFixed(1);
    // the tower, far off on the right
    const cx = W * 0.74, top = H * 0.04, base = H;
    let tw = `M${f(cx - H * 0.2)},${base} Q${f(cx - H * 0.05)},${f(H * 0.55)} ${f(cx - 4)},${f(H * 0.16)} L${f(cx)},${f(top)} L${f(cx + 4)},${f(H * 0.16)} Q${f(cx + H * 0.05)},${f(H * 0.55)} ${f(cx + H * 0.2)},${base}`;
    tw += ` M${f(cx - H * 0.13)},${base} Q${f(cx)},${f(base - H * 0.2)} ${f(cx + H * 0.13)},${base}`;
    for (const [y, half] of [[0.66, 0.1], [0.42, 0.045], [0.2, 0.012]]) tw += ` M${f(cx - H * half - 6)},${f(H * y)} L${f(cx + H * half + 6)},${f(H * y)}`;
    for (let k = 0; k < 6; k++) { const y1 = H * (0.66 + k * 0.055), y2 = y1 + H * 0.055, hw = H * (0.1 + k * 0.016); tw += ` M${f(cx - hw)},${f(y1)} L${f(cx + hw)},${f(y2)} M${f(cx + hw)},${f(y1)} L${f(cx - hw)},${f(y2)}`; }
    let out = `<path class="tower" d="${tw}" pathLength="1" style="--k:0"/>`, x = -30, k = 1;
    while (x < W + 30) {
      const w = 80 + rnd() * 120, wallH = H * (0.26 + rnd() * 0.2), mans = H * (0.1 + rnd() * 0.06), inset = 10 + rnd() * 8;
      const yW = H - wallH, yR = yW - mans;
      let d = `M${f(x)},${H} L${f(x)},${f(yW)} L${f(x + inset)},${f(yR)} L${f(x + w - inset)},${f(yR)} L${f(x + w)},${f(yW)} L${f(x + w)},${H}`;
      d += ` M${f(x - 4)},${f(yW)} L${f(x + w + 4)},${f(yW)}`;                                   // cornice
      for (const fy of [0.3, 0.72]) d += ` M${f(x + 5)},${f(yW + wallH * fy)} L${f(x + w - 5)},${f(yW + wallH * fy)}`;   // balconies
      const nd = Math.max(1, Math.floor((w - 2 * inset) / 30));
      for (let j = 0; j < nd; j++) {                                                              // dormers
        const dx = x + inset + (w - 2 * inset) * (j + 0.5) / nd - 5, h = mans * 0.62;
        d += ` M${f(dx)},${f(yW - 2)} L${f(dx)},${f(yW - h)} Q${f(dx + 5)},${f(yW - h - 7)} ${f(dx + 10)},${f(yW - h)} L${f(dx + 10)},${f(yW - 2)}`;
      }
      for (let c = 0, nc = rnd() < 0.4 ? 2 : 1; c < nc; c++) {                                     // chimney stacks + pots
        const cw = 16 + rnd() * 16, cxs = x + inset + rnd() * (w - 2 * inset - cw), ch = 14 + rnd() * 16;
        d += ` M${f(cxs)},${f(yR)} L${f(cxs)},${f(yR - ch)} L${f(cxs + cw)},${f(yR - ch)} L${f(cxs + cw)},${f(yR)}`;
        for (let q = 0, nq = Math.max(2, Math.round(cw / 6)); q < nq; q++) { const px = cxs + 2 + q * (cw - 4) / nq; d += ` M${f(px)},${f(yR - ch)} L${f(px)},${f(yR - ch - 6)} L${f(px + 3)},${f(yR - ch - 6)} L${f(px + 3)},${f(yR - ch)}`; }
      }
      // a filled silhouette first, so the tower behind doesn't show through the houses
      out += `<path class="occ" d="M${f(x)},${H} L${f(x)},${f(yW)} L${f(x + inset)},${f(yR)} L${f(x + w - inset)},${f(yR)} L${f(x + w)},${f(yW)} L${f(x + w)},${H}Z"/><path d="${d}" pathLength="1" style="--k:${k++}"/>`;
      x += w;
    }
    svg.innerHTML = out;
  }
  // Rose window: stone tracery holding leaded glass — each lancet is cut into small panes, mostly blue and
  // ruby with a few gold / green / violet ones, dark lead between them. The glass lights up lancet by
  // lancet, sweeping round, when the chapter scrolls in.
  function drawRose(svg) {
    const rnd = seeded(+svg.closest('.chapter').dataset.seed || 4), TAU = Math.PI * 2;
    const P = (r, a) => `${(Math.cos(a) * r).toFixed(2)},${(Math.sin(a) * r).toFixed(2)}`;
    const BLUE = ['#1d3a96', '#2549b0', '#2f5cc8', '#18307c'], RUBY = ['#9e1b36', '#b8263f', '#86152d'];
    const ACC = ['#d9a238', '#2b7d57', '#5b3594', '#c98a2e'];
    const pick = base => rnd() < 0.16 ? ACC[(rnd() * ACC.length) | 0] : base[(rnd() * base.length) | 0];
    const sector = (r1, r2, a1, a2) => `M${P(r1, a1)} L${P(r2, a1)} A${r2} ${r2} 0 0 1 ${P(r2, a2)} L${P(r1, a2)} A${r1} ${r1} 0 0 0 ${P(r1, a1)}Z`;
    let out = '';
    const cell = (d, fill, k) => { out += `<path class="g" d="${d}" fill="${fill}" style="--k:${k}"/>`; };
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * TAU - TAU / 4, da = TAU / 12 * 0.38, base = i % 2 ? RUBY : BLUE;
      const rs = [30, 38, 46, 54, 61, 67], as = [a - da, a - da / 3, a + da / 3, a + da];
      for (let u = 0; u < rs.length - 1; u++) for (let v = 0; v < 3; v++) cell(sector(rs[u], rs[u + 1], as[v], as[v + 1]), pick(base), i);
      const c = P(75, a);                                                   // outer roundel: four quarters
      for (let q = 0; q < 4; q++) { const [cx, cy] = c.split(',').map(Number), q1 = q / 4 * TAU, q2 = (q + 1) / 4 * TAU;
        cell(`M${cx},${cy} L${(cx + Math.cos(q1) * 7).toFixed(2)},${(cy + Math.sin(q1) * 7).toFixed(2)} A7 7 0 0 1 ${(cx + Math.cos(q2) * 7).toFixed(2)},${(cy + Math.sin(q2) * 7).toFixed(2)}Z`, pick(i % 2 ? BLUE : RUBY), i); }
      const a3 = (i + 0.5) / 12 * TAU - TAU / 4, c3 = P(84, a3).split(',').map(Number);   // small roundels between
      cell(`M${c3[0] - 4.5},${c3[1]} a4.5,4.5 0 1,0 9,0 a4.5,4.5 0 1,0 -9,0`, pick(BLUE), i);
    }
    for (let i = 0; i < 16; i++) cell(sector(9, 22, i / 16 * TAU, (i + 1) / 16 * TAU), pick(i % 2 ? BLUE : RUBY), 12);   // centre
    let tr = 'M96,0 A96 96 0 1,0 -96,0 A96 96 0 1,0 96,0 M90,0 A90 90 0 1,0 -90,0 A90 90 0 1,0 90,0 M30,0 A30 30 0 1,0 -30,0 A30 30 0 1,0 30,0 M22,0 A22 22 0 1,0 -22,0 A22 22 0 1,0 22,0 M9,0 A9 9 0 1,0 -9,0 A9 9 0 1,0 9,0';
    for (let i = 0; i < 12; i++) { const a = (i + 0.5) / 12 * TAU - TAU / 4; tr += ` M${P(30, a)} L${P(90, a)}`; }
    svg.innerHTML = `<defs><radialGradient id="rose-glow-${svg.closest('.chapter').dataset.seed}"><stop offset="0" stop-color="#fff" stop-opacity=".32"/><stop offset=".55" stop-color="#fff" stop-opacity=".06"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>` +
      `<g class="glass-in">${out}</g><circle class="shine" r="90" fill="url(#rose-glow-${svg.closest('.chapter').dataset.seed})"/><path class="tracery" d="${tr}"/>`;
  }
  // Sparkling lights (the Eiffel Tower's hourly glitter): small flashes scattered over the photo; once the
  // photo has loaded, flashes that landed on dark sky are dropped so they sit on the lit structure.
  function sparkleHTML(ph) {
    const rnd = seeded([...String(ph.id || 'x')].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 233280, 7));
    let s = '';
    for (let i = 0; i < 140; i++) s += `<i style="left:${(rnd() * 100).toFixed(2)}%;top:${(rnd() * 100).toFixed(2)}%;--s:${(0.45 + rnd() * 0.9).toFixed(2)};animation-duration:${(1.6 + rnd() * 2.6).toFixed(2)}s;animation-delay:${(-rnd() * 5).toFixed(2)}s"></i>`;
    return `<div class="sparkle" aria-hidden="true" data-thumb="${esc(ph.thumb || '')}">${s}</div>`;
  }
  function placeSparkles(el) {
    const src = el.dataset.thumb, im = $('img', el.parentNode); if (!src || !im) return;
    const t = new Image(); t.src = src;
    t.onload = () => {
      const cv = document.createElement('canvas'), w = 96, h = Math.max(8, Math.round(96 * t.naturalHeight / t.naturalWidth));
      cv.width = w; cv.height = h; const ctx = cv.getContext('2d'); ctx.drawImage(t, 0, 0, w, h);
      let d; try { d = ctx.getImageData(0, 0, w, h).data; } catch (e) { return; }
      const r = el.getBoundingClientRect(), s = Math.max(r.width / w, r.height / h), fp = (im.style.objectPosition || '50% 50%').split(' ').map(parseFloat);
      const ox = (r.width - w * s) * (fp[0] || 50) / 100, oy = (r.height - h * s) * (fp[1] || 50) / 100;
      // keep the brighter ~60 % of the spots (relative to this photo), never ones on near-black
      const lum = $$('i', el).map(i => {
        const u = Math.floor((parseFloat(i.style.left) / 100 * r.width - ox) / s), v = Math.floor((parseFloat(i.style.top) / 100 * r.height - oy) / s);
        const k = (Math.min(h - 1, Math.max(0, v)) * w + Math.min(w - 1, Math.max(0, u))) * 4;
        return [i, d[k] * 0.3 + d[k + 1] * 0.55 + d[k + 2] * 0.15];
      });
      const sorted = lum.map(x => x[1]).sort((a, b) => a - b), cut = Math.max(45, sorted[Math.floor(sorted.length * 0.4)] || 0);
      lum.forEach(([i, l]) => { if (l < cut) i.remove(); });
    };
  }
  // ---- Chinese page styles: 徽州 (huizhou) and 北京 (beijing) ----
  // Same building blocks as Paris (tones, line-drawn scenes, doodles); each has its own chapter opening.
  const DRAW_THEMES = new Set(['paris', 'huizhou', 'beijing']);   // pages where doodles / scenes are drawn
  Object.assign(DOODLES, {
    // a fish lantern on its pole
    fish: ['M100 196V128', 'M40 96C64 64 128 60 158 92C128 122 64 124 40 96Z', 'M40 96L18 74M40 96L16 120M18 74Q30 96 16 120',
      'M150 86a5 5 0 1 0 0.1 0', 'M70 78q8 8 0 16q8 8 0 16M88 74q8 10 0 20q8 10 0 20M106 74q8 10 0 20q8 10 0 20M124 78q8 8 0 16q8 8 0 16',
      'M96 68Q104 50 118 52Q110 62 112 70', 'M100 124L100 128M92 128H108', 'M60 150q4-6 0-12M140 146q4-6 0-12M76 160q4-6 0-12'],
    // a round red lantern with tassel
    lantern: ['M100 6V26', 'M86 26H114V34H86Z', 'M100 34C60 34 50 70 52 92C54 116 70 140 100 140C130 140 146 116 148 92C150 70 140 34 100 34Z',
      'M100 34C82 50 78 116 100 140M100 34C118 50 122 116 100 140M100 34C70 44 62 120 100 140M100 34C130 44 138 120 100 140',
      'M86 140H114V148H86Z', 'M92 148V186M100 148V192M108 148V186'],
    // auspicious cloud scroll (祥云)
    cloud: ['M30 120C30 96 56 88 70 102C72 74 112 70 120 96C134 80 164 90 160 112C176 114 178 136 160 140H44C32 140 26 130 30 120Z',
      'M70 102C76 112 72 122 62 122C54 122 52 112 60 110', 'M120 96C118 110 128 118 138 112', 'M60 140q20 18 40 0q20 18 40 0'],
  });
  Object.assign(SCENES, {
    huiwalls() {   // 马头墙: white walls stepping down in tiers, each tier capped with dark tiles; a door and small windows; hills behind
      const P = [['M0 120Q120 60 240 100T480 84T720 96T1000 70', 'tower'], ['M0 150Q160 110 320 136T640 124T1000 112', 'tower'], ['M40 296H960']];
      const house = (x, w, h, steps) => {
        let d = `M${x} 296V${296 - h}`, tile = '';
        const sw = w / (steps * 2 + 1);
        let cx = x, cy = 296 - h;
        for (let i = 0; i < steps; i++) { tile += `M${cx - 6} ${cy}H${cx + sw + 6}M${cx - 4} ${cy - 6}H${cx + sw + 4}M${cx + sw / 2} ${cy - 6}l0 -8`; d += `H${cx + sw}V${cy - 26}`; cx += sw; cy -= 26; }
        tile += `M${cx - 6} ${cy}H${cx + sw + 6}M${cx - 4} ${cy - 6}H${cx + sw + 4}`; d += `H${cx + sw}`; cx += sw;
        for (let i = 0; i < steps; i++) { d += `V${cy + 26}`; cy += 26; tile += `M${cx - 6} ${cy}H${cx + sw + 6}M${cx - 4} ${cy - 6}H${cx + sw + 4}M${cx + sw / 2} ${cy - 6}l0 -8`; d += `H${cx + sw}`; cx += sw; }
        d += `V296`;
        return [d, tile];
      };
      const hs = [[90, 230, 120, 2], [300, 300, 150, 3], [620, 260, 130, 2]];
      for (const [x, w, h, s] of hs) { const [d, t] = house(x, w, h, s); P.push([d + 'Z', 'occ'], [d], [t]); }
      P.push(['M410 296V236A40 40 0 0 1 490 236V296M402 236H498M398 228H502', 'gold'], ['M330 220h18v22h-18zM560 214h18v22h-18zM690 230h16v20h-16zM160 236h16v20h-16z']);
      return P;
    },
    fishdance() {   // a fish lantern (鱼灯) carried at night, drawn from the photographs: a plump red carp with rows of
                    // round scales, spiky scalloped dorsal fins, a big ringed eye, curled tail lobes, held up on poles by
                    // bearers in loose robes; horse-head walls and hills behind, fireworks overhead
      const P = [['M0 112Q140 50 280 94T560 74T820 94T1000 64', 'tower'], ['M0 146Q180 108 360 132T720 120T1000 108', 'tower']];
      // horse-head walls (stepped gables), left and right
      const gable = (x0, w) => { const s = w / 6; return `M${x0} 252V206H${x0 + s}V194H${x0 + 2 * s}V182H${x0 + 4 * s}V194H${x0 + 5 * s}V206H${x0 + w}V252` +
        `M${x0 - 4} 206h${s + 8}M${x0 + s - 4} 194h${s + 8}M${x0 + 2 * s - 4} 182h${2 * s + 8}M${x0 + 4 * s - 4} 194h${s + 8}M${x0 + 5 * s - 4} 206h${s + 8}`; };
      P.push([gable(30, 150) + gable(200, 96) + gable(800, 120) + gable(930, 64), 'tower']);
      P.push(['M64 252V228h18v24M236 252V230h14v22M846 252V226h20v26', 'tower']);
      // fireworks: two bursts of short rays
      let fw = '';
      for (const [cx, cy, r] of [[190, 58, 30], [860, 46, 24], [700, 30, 14]]) {
        for (let k = 0; k < 14; k++) { const t = k / 14 * Math.PI * 2, c = Math.cos(t), si = Math.sin(t); fw += `M${(cx + c * r * 0.4).toFixed(1)} ${(cy + si * r * 0.4).toFixed(1)}L${(cx + c * r).toFixed(1)} ${(cy + si * r).toFixed(1)}`; }
      }
      P.push([fw, 'gold']);
      // the fish body (filled with the page colour first, so the hills don't show through it)
      const body = 'M330 142C390 100 450 80 520 82C600 84 670 98 706 122Q726 132 732 141Q724 153 706 164C650 192 580 202 510 198C440 194 380 180 330 160Z';
      P.push(['M262 94Q300 120 330 142L330 160Q296 180 258 210Q280 150 262 94Z', 'occ'], [body, 'occ'], [body, 'gold']);
      // scales: rows of round scales overlapping toward the tail
      const top = [[330, 142], [380, 112], [440, 92], [520, 82], [600, 86], [660, 98]], bot = [[330, 160], [400, 182], [470, 195], [520, 198], [600, 192], [660, 180]];
      const at = (pts, x) => { for (let i = 1; i < pts.length; i++) if (x <= pts[i][0]) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i]; return y0 + (y1 - y0) * (x - x0) / (x1 - x0); } return pts[pts.length - 1][1]; };
      let sc = '';
      for (let x = 366, col = 0; x <= 640; x += 17, col++) {
        const t = at(top, x) + 9, bt = at(bot, x) - 7, r = 9;
        for (let y = t + (col % 2 ? 7.5 : 0); y <= bt - r; y += 15) sc += `M${x} ${(y - r).toFixed(1)}a${r} ${r} 0 0 0 0 ${2 * r}`;
      }
      P.push([sc, 'gold']);
      // head: gill line, ringed eye, open mouth with curled lips, a barbel
      P.push(['M654 102Q638 140 656 184', 'gold'], ['M690 122a12 12 0 1 0 0.1 0M690 128a6 6 0 1 0 0.1 0', 'gold'],
        ['M732 141q-12 4-22 1M731 139q9-5 5-13q-5-3-8 2M714 152q12 12 26 8q7-3 4-10', 'gold']);
      // dorsal fins: two crests of spikes, the tips swept back, joined by a scalloped edge
      const fin = (x0, x1, h) => { let d = `M${x0} ${at(top, x0).toFixed(1)}`; const n = 5, w = (x1 - x0) / n;
        for (let i = 0; i < n; i++) { const xa = x0 + i * w, xb = xa + w; d += `L${(xa + w * 0.15).toFixed(1)} ${(at(top, xa) - h).toFixed(1)}Q${(xa + w * 0.7).toFixed(1)} ${(at(top, xa) - h * 0.35).toFixed(1)} ${xb.toFixed(1)} ${at(top, xb).toFixed(1)}`; }
        return d; };
      P.push([fin(410, 500, 40) + fin(530, 620, 34), 'gold']);
      // tail: upper and lower lobes ending in curls, with rays; small belly fins
      P.push(['M330 142C314 126 292 106 264 94Q252 90 256 102Q264 108 268 100M264 94Q280 124 292 150Q276 180 258 210Q252 222 264 220Q270 212 262 208M258 210C284 196 308 178 330 160', 'gold'],
        ['M330 150L276 108M330 150L290 150M330 150L274 194', 'gold'], ['M600 182q-12 22-34 28q8-14 6-30M430 190q-8 18-26 24q6-10 4-22', 'gold']);
      // bearers walking right, each holding a pole up to the belly
      let men = '';
      for (const x of [396, 512, 618]) {
        const px = x + 10, py = at(bot, px);
        men += `M${px} ${py.toFixed(1)}V236`;                                   // pole
        men += `M${x - 7} 244a7 7 0 1 0 14 0a7 7 0 1 0-14 0`;                   // head
        men += `M${x - 4} 252L${x - 15} 288H${x + 13}L${x + 5} 252Z`;            // robe
        men += `M${x + 2} 256L${px} 238M${x - 2} 258L${x - 12} 272`;             // arms: one up to the pole
        men += `M${x - 7} 288l-7 9M${x + 6} 288l9 8`;                            // feet mid-stride
      }
      P.push([men]);
      P.push(['M20 297H980'], ['M300 293h40M420 293h60M560 293h30M680 293h50', 'tower']);
      return P;
    },
    eaves() {   // a palace hall, front view: hip roof with upturned eaves, ridge ornaments, roof beasts on the corners,
                // bracket sets, columns, lattice doors and a stone terrace with steps
      const P = [];
      P.push(['M330 70H670', 'gold'], ['M330 70q-6-26-22-30q10 14 2 30M670 70q6-26 22-30q-10 14-2 30', 'gold']);
      P.push(['M330 70Q262 118 172 146Q152 150 140 136M670 70Q738 118 828 146Q848 150 860 136']);
      P.push(['M148 146Q500 176 852 146M166 156Q500 184 834 156']);
      let t = ''; for (let x = 346; x <= 654; x += 14) { const xb = 500 + (x - 500) * 2.05, yb = 166 + 8 * (1 - Math.abs(x - 500) / 160); t += `M${x} 74L${xb.toFixed(1)} ${yb.toFixed(1)}`; }
      P.push([t, 'tower']);
      let bs = '';
      for (let i = 0; i < 5; i++) {
        const u = 0.55 + i * 0.075;
        const lx = 330 - (330 - 172) * u, ly = 70 + (146 - 70) * Math.pow(u, 0.8) - 6, rx = 670 + (828 - 670) * u;
        bs += `M${lx.toFixed(1)} ${ly.toFixed(1)}q-4-9 2-12q4 0 4 5M${rx.toFixed(1)} ${ly.toFixed(1)}q4-9-2-12q-4 0-4 5`;
      }
      P.push([bs, 'gold']);
      let br = 'M196 186H804M196 194H804'; for (let x = 206; x <= 794; x += 28) br += `M${x} 186v8M${x - 6} 186h12`; P.push([br]);
      P.push(['M214 204H786M214 212H786', 'gold']);
      let c = ''; const cols = [230, 310, 400, 455, 545, 600, 690, 770]; for (const x of cols) c += `M${x} 212V276M${x + 8} 212V276`; P.push([c]);
      let dr = ''; for (const [x0, x1] of [[408, 455], [463, 545], [553, 600]]) { dr += `M${x0} 220H${x1}V270H${x0}Z`; for (let y = 226; y < 266; y += 8) dr += `M${x0 + 4} ${y}H${x1 - 4}`; for (let x = x0 + 8; x < x1; x += 10) dr += `M${x} 222V244`; }
      P.push([dr, 'tower']);
      P.push(['M184 276H816M172 284H828M160 292H840'], ['M444 292L456 276M556 292L544 276M462 292V278M538 292V278', 'tower']);
      return P;
    },
  });
  // ink-wash mountains: three soft ridges, darker in front, fading into mist
  function inkHills(seed) {
    const rnd = seeded(seed * 3 + 11);
    const ridge = (base, amp, k) => {
      let d = `M0 300L0 ${base}`;
      for (let x = 0; x <= 1000; x += 25) {
        const y = base - amp * (0.5 + 0.5 * Math.sin(x / (90 + k * 30) + rnd() * 0.6 + k)) - amp * 0.35 * Math.sin(x / 37 + k * 2);
        d += ` L${x} ${y.toFixed(1)}`;
      }
      return d + ' L1000 300Z';
    };
    return `<svg class="hz-hills" viewBox="0 0 1000 300" preserveAspectRatio="none" aria-hidden="true"><defs>${[0, 1, 2].map(k => `<linearGradient id="hzg${seed}-${k}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="currentColor" stop-opacity="${[0.16, 0.24, 0.36][k]}"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></linearGradient>`).join('')}</defs>${
      [[150, 70], [190, 60], [230, 50]].map(([b, a], k) => `<path class="l${k}" d="${ridge(b, a, k)}" fill="url(#hzg${seed}-${k})"/>`).join('')}</svg>`;
  }
  // 徽州 (zen): a nearly empty wall. The chapter's characters stand huge and almost invisible on the right,
  // like a name worn into whitewash; one ink line is drawn across (a roof ridge, a horizon); a drop of ink
  // blooms slowly behind the title; a tiny red seal carries the number. A film-edge line runs along the top.
  function brushLine(n) {
    const rnd = seeded(n * 5 + 3); let d = 'M0 30';
    for (let x = 50; x <= 1000; x += 50) d += ` L${x} ${(30 + (rnd() - 0.5) * 5 + Math.sin(x / 160 + n) * 3).toFixed(1)}`;
    return d;
  }
  function huizhouChapterHTML(x, n, st) {
    const orn = SCENES[x.ornament] ? x.ornament : '', t = String(x.title || '');
    return `
    <section class="paper chapter hz-ch${orn ? ' orn-' + orn : ''}"${st.length ? ` style='${st.join(';')}'` : ''} data-seed="${n}"${toneAttr(x)}>
      <div class="hz-ghost" aria-hidden="true">${esc(t)}</div>
      <i class="hz-drop" aria-hidden="true"></i>
      <svg class="hz-ridge" viewBox="0 0 1000 60" preserveAspectRatio="none" aria-hidden="true"><path d="${brushLine(n)}" pathLength="1"/></svg>
      ${orn ? sceneSVG(orn) : ''}
      <div class="hz-meta reveal"><span>Ch. ${pad2(n)} / ${pad2(chTotal)}</span><i></i><span>${esc(t)}</span><i></i><span>${esc(x.kicker || '')}</span></div>
      <div class="hz-in">
        <div class="hz-seal reveal"><span>${NUMERALS[n - 1] || n}</span></div>
        ${t ? `<h2 class="hz-title reveal" style="--d:1">${esc(t)}</h2>` : ''}
        <div class="hz-side">
          ${x.kicker ? `<div class="hz-kicker reveal" style="--d:2">${esc(x.kicker)}</div>` : ''}
          ${x.caption ? `<p class="hz-text words">${words(x.caption)}</p>` : ''}
        </div>
      </div>
    </section>`;
  }
  // 北京 (zen): everything hangs on the central axis — a hairline down the middle of the page. A chapter
  // title is split across it (紫 | 禁), the halves sliding in from either side to meet; a small vermilion seal
  // sits on the line; the passage is centred beneath. Ornaments: "studs" (the gate's 9 × 9, as fine dots) or a scene.
  function beijingChapterHTML(x, n, st) {
    const orn = x.ornament === 'studs' || SCENES[x.ornament] ? x.ornament : '';
    const ch = [...String(x.title || '')], h = ch.length > 1 ? Math.floor(ch.length / 2) : 0;
    return `
    <section class="paper chapter bj-ch${orn ? ' orn-' + orn : ''}${h ? '' : ' one'}"${st.length ? ` style='${st.join(';')}'` : ''} data-seed="${n}"${toneAttr(x)}>
      ${SCENES[orn] ? sceneSVG(orn) : ''}
      <div class="bj-meta reveal"><span>第${NUMERALS[n - 1] || n}</span><span>Ch. ${pad2(n)} / ${pad2(chTotal)}</span></div>
      <i class="bj-ax grow"></i>
      ${orn === 'studs' ? `<div class="bj-studs" aria-hidden="true">${Array.from({ length: 81 }, (v, i) => `<i style="--i:${(i % 9) + Math.floor(i / 9)}"></i>`).join('')}</div><i class="bj-ax"></i>` : ''}
      <h2 class="bj-gate">${h ? `<span class="l">${esc(ch.slice(0, h).join(''))}</span><span class="r">${esc(ch.slice(h).join(''))}</span>` : `<span class="c">${esc(ch.join(''))}</span>`}</h2>
      <i class="bj-ax"></i>
      <div class="bj-seal reveal"><span>${NUMERALS[n - 1] || n}</span></div>
      <div class="bj-side">
        ${x.kicker ? `<div class="bj-kicker reveal">${esc(x.kicker)}</div>` : ''}
        ${x.caption ? `<p class="bj-text words">${words(x.caption)}</p>` : ''}
      </div>
      <i class="bj-ax grow"></i>
    </section>`;
  }
  // Photo effects for night festivals: "embers" (warm sparks drifting up, CSS only) and "fireworks"
  // (bursts drawn on a canvas, only while the photo is on screen)
  function emberHTML(ph) {
    const rnd = seeded([...String(ph.id || 'e')].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 233280, 3));
    let s = '';
    for (let i = 0; i < 26; i++) s += `<i style="left:${(rnd() * 100).toFixed(1)}%;--s:${(0.5 + rnd()).toFixed(2)};--x:${((rnd() - 0.5) * 60).toFixed(0)}px;animation-duration:${(7 + rnd() * 8).toFixed(1)}s;animation-delay:${(-rnd() * 14).toFixed(1)}s"></i>`;
    return `<div class="embers" aria-hidden="true">${s}</div>`;
  }
  const fireIO = 'IntersectionObserver' in window ? new IntersectionObserver(es => es.forEach(e => {
    const fw = e.target._fw; if (!fw) return; fw.on = e.isIntersecting; if (fw.on && !fw.raf) fw.raf = requestAnimationFrame(fw.step);
  }), { threshold: 0.2 }) : null;
  function startFireworks(cv) {
    if (reduceMotion || !fireIO) return;
    const ctx = cv.getContext('2d'), dpr = Math.min(1.5, window.devicePixelRatio || 1);
    const parts = [], cols = [[255, 214, 140], [255, 160, 96], [255, 244, 220], [255, 110, 80]];
    let last = 0, next = 0;
    const fw = { on: false, raf: 0 };
    fw.step = t => {
      fw.raf = 0; if (!fw.on || !cv.isConnected) { ctx.clearRect(0, 0, cv.width, cv.height); parts.length = 0; return; }
      const w = cv.clientWidth, h = cv.clientHeight;
      if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
      const dt = Math.min(50, t - last || 16) / 1000; last = t;
      if (t > next) {   // a new burst somewhere in the sky
        const cx = w * (0.15 + Math.random() * 0.7), cy = h * (0.1 + Math.random() * 0.35), c = cols[(Math.random() * cols.length) | 0], n = 70;
        for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2, v = 60 + Math.random() * 110; parts.push({ x: cx, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, c }); }
        next = t + 900 + Math.random() * 1600;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalCompositeOperation = 'source-over'; ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.vy += 60 * dt; p.vx *= 0.985; p.vy *= 0.985; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt * 0.55;
        if (p.life <= 0) { parts.splice(i, 1); continue; }
        ctx.fillStyle = `rgba(${p.c[0]},${p.c[1]},${p.c[2]},${(p.life * 0.9).toFixed(3)})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, 1.1 + p.life * 1.4, 0, Math.PI * 2); ctx.fill();
      }
      fw.raf = requestAnimationFrame(fw.step);
    };
    cv._fw = fw; fireIO.observe(cv);
  }
  // 彩云之南 (zen): one soft cloud of colour drifts behind each chapter — the cloud of that hour, in the chapter's
  // accent colour — and a single 祥云 wisp is drawn across in one stroke. A small coloured dot carries the
  // number; the title stands vertically; the ornaments (contour lines, prayer flags, tie-dye rings) are kept faint.
  function cyRings(n) {
    const rnd = seeded(n * 7 + 5); let d = '';
    for (let k = 1; k <= 8; k++) {
      const r = k * 34; let p = '';
      for (let a = 0; a <= 64; a++) { const t = a / 64 * Math.PI * 2, rr = r * (1 + 0.015 * Math.sin(t * 5 + k + rnd())); p += (a ? 'L' : 'M') + (300 + Math.cos(t) * rr).toFixed(1) + ' ' + (300 + Math.sin(t) * rr).toFixed(1); }
      d += `<path d="${p}Z" stroke-dasharray="${k % 3 ? '3 6' : '0 7'}" stroke-width="${k % 3 ? 1.4 : 2.6}"/>`;
    }
    return `<svg class="cy-rings" viewBox="0 0 600 600" aria-hidden="true"><circle cx="300" cy="300" r="5"/>${d}</svg>`;
  }
  function caiyunChapterHTML(x, n, st) {
    const orn = ['flags', 'shibori'].includes(x.ornament) ? x.ornament : x.ornament === 'none' ? '' : 'contour', t = String(x.title || '');
    return `
    <section class="paper chapter cy-ch${orn ? ' orn-' + orn : ''}"${st.length ? ` style='${st.join(';')}'` : ''} data-seed="${n}"${toneAttr(x)}>
      <i class="cy-cloud" aria-hidden="true"></i><i class="cy-cloud b" aria-hidden="true"></i>
      ${orn === 'contour' ? '<svg class="contour" viewBox="0 0 1000 1000" preserveAspectRatio="xMidYMid slice" aria-hidden="true"></svg>' : ''}
      ${orn === 'flags' ? flagsHTML() : ''}${orn === 'shibori' ? cyRings(n) : ''}
      <svg class="cy-wisp" viewBox="0 0 1000 160" aria-hidden="true"><path pathLength="1" d="M40 112C180 112 260 72 400 84S640 122 760 94C840 76 884 42 852 24C828 10 798 28 810 50C820 66 844 60 842 46"/><path pathLength="1" d="M140 132C300 128 420 108 560 116S760 134 870 116"/></svg>
      <div class="cy-meta reveal"><span>Ch. ${pad2(n)} / ${pad2(chTotal)}</span><i></i><span>${esc(x.kicker || '')}</span></div>
      <div class="cy-in">
        <div class="cy-dot reveal"><span>${NUMERALS[n - 1] || n}</span></div>
        ${t ? `<h2 class="cy-title reveal" style="--d:1">${esc(t)}</h2>` : ''}
        <div class="cy-side">
          ${x.kicker ? `<div class="cy-kicker reveal" style="--d:2">${esc(x.kicker)}</div>` : ''}
          ${x.caption ? `<p class="cy-text words">${words(x.caption)}</p>` : ''}
        </div>
      </div>
    </section>`;
  }
  function chapterHTML(x, n, st) {
    if (pageTheme === 'caiyun') return caiyunChapterHTML(x, n, st);
    if (pageTheme === 'paris') return parisChapterHTML(x, n, st);
    if (pageTheme === 'huizhou') return huizhouChapterHTML(x, n, st);
    if (pageTheme === 'beijing') return beijingChapterHTML(x, n, st);
    const orn = ['flags', 'shibori'].includes(x.ornament) ? x.ornament : x.ornament === 'none' ? '' : 'contour';
    return `
    <section class="paper chapter${orn ? ' orn-' + orn : ''}"${st.length ? ` style='${st.join(';')}'` : ''} data-seed="${n}"${toneAttr(x)}>
      <i class="cloud a"></i><i class="cloud b"></i><i class="cloud c"></i>
      ${orn === 'contour' ? '<svg class="contour" viewBox="0 0 1000 1000" preserveAspectRatio="xMidYMid slice" aria-hidden="true"></svg>' : ''}
      ${orn === 'shibori' ? '<svg class="shibori" preserveAspectRatio="xMidYMid slice" aria-hidden="true"></svg>' : ''}
      ${orn === 'flags' ? flagsHTML() : ''}
      <div class="ch-in">
        <div class="ch-num reveal">${NUMERALS[n - 1] || n}</div>
        ${x.title ? `<h2 class="ch-title reveal" style="--d:1">${esc(x.title)}</h2>` : ''}
        <div class="ch-side">
          ${x.kicker ? `<div class="ch-kicker reveal" style="--d:2">${esc(x.kicker)}</div>` : ''}
          ${x.caption ? `<p class="ch-text words">${words(x.caption)}</p>` : ''}
        </div>
      </div>
    </section>`;
  }
  function textHTML(x, chapterNo) {
    if (!x.title && !x.caption) return '';
    const align = ['left', 'center', 'right'].includes(x.align) ? x.align : 'left';
    const st = [];
    const h = Math.round(+x.height); if (h > 0) st.push(`min-height:${Math.min(h, 4000)}px`, 'padding-top:0', 'padding-bottom:0');
    const ts = +x.size, cs = +x.csize;
    if (ts > 0) st.push(`--ts:${Math.min(ts, 400)}px`);
    if (cs > 0) st.push(`--cs:${Math.min(cs, 200)}px`);
    if (FONTS[x.font]) st.push(`--tf:${FONTS[x.font]}`);
    if (/^#[0-9a-f]{6}$/i.test(x.color || '')) st.push(`--tc:${x.color}`);
    if (chapterNo) return chapterHTML(x, chapterNo, st);
    return `
    <section class="paper textblock ${align}${DRAW_THEMES.has(pageTheme) && DOODLES[x.ornament] ? ' has-doodle' : ''}"${st.length ? ` style='${st.join(';')}'` : ''}${toneAttr(x)}>
      <div class="tb-in">
        ${DRAW_THEMES.has(pageTheme) && DOODLES[x.ornament] ? doodleSVG(x.ornament) : ''}
        ${x.kicker ? `<div class="tb-kicker reveal">${esc(x.kicker)}</div>` : ''}
        ${x.title ? `<h2 class="tb-title reveal">${text(x.title)}</h2>` : ''}
        ${x.caption ? `<p class="tb-cap reveal" style="--d:1">${text(x.caption)}</p>` : ''}
      </div>
    </section>`;
  }

  const SOUND = '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 6h2.2L8 3.2v9.6L4.7 10H2.5z"/><path class="on" d="M10.6 5.6a3.4 3.4 0 0 1 0 4.8M12.4 3.8a6 6 0 0 1 0 8.4"/><path class="off" d="M10.5 6l4 4M14.5 6l-4 4"/></svg>';
  // Uploaded video or YouTube link. Both start muted when they come on screen and pause when they leave.
  function mediaHTML(x, i, total, side) {
    const w = +x.w || 16, h = +x.h || 9, cap = esc(x.caption || '');
    if (kindOf(x) === 'youtube') {
      const id = String(x.yt || '').match(/^[\w-]{11}$/) ? x.yt : ''; if (!id) return '';
      // full width: plays silently with no YouTube controls; a click opens it full screen with sound
      if (x.layout === 'fill') return `
    <section class="ytfull" style="--ar:${(w / h).toFixed(4)}" role="button" tabindex="0" data-yt-open="${id}" aria-label="Play the film full screen">
      <div class="clip yt bleed" data-yt="${id}" style="background-image:url('https://i.ytimg.com/vi/${id}/maxresdefault.jpg')"></div>
      <div class="yt-over"><span class="yt-play">Play film <b>▸</b></span>${x.caption ? `<span class="yt-cap">${capRich(x.caption)}</span>` : ''}</div>
    </section>`;
      return `
    <section class="paper spread single media ${side}"><figure class="frame media" style="--ar:${(w / h).toFixed(3)}">
      <div class="clip yt" style="aspect-ratio:${w}/${h}" data-yt="${id}"></div>
      <figcaption><b>№${pad2(i + 1)}</b>${cap}</figcaption></figure></section>`;
    }
    if (!x.src) return '';
    const vid = cls => `<video class="${cls}" src="${esc(x.src)}"${x.thumb ? ` poster="${esc(x.thumb)}"` : ''} muted loop playsinline preload="metadata" style="${pos(x)}"></video>` +
      `<button class="snd" type="button" aria-label="Sound">${SOUND}<span>Sound</span></button>`;
    if (x.layout === 'fill') {
      return `<section class="panel shot grow media" data-count="${pad2(i + 1)}" data-total="${pad2(total)}" data-cap="${esc(x.caption || '')}"><div class="bg">${vid('cover')}</div></section>`;
    }
    return `
    <section class="paper spread single media ${side}"><figure class="frame media" style="--ar:${(w / h).toFixed(3)}">
      <div class="clip" style="aspect-ratio:${w}/${h}">${vid('')}</div>
      <figcaption><b>№${pad2(i + 1)}</b>${cap}</figcaption></figure></section>`;
  }

  // Yunnan is an editorial journal, built entirely from the same backstage modules.
  // Chapter text, photo order, captions, crops and handscroll layers remain editable there.
  const ynID = x => 'yn-' + String(x.id || '').replace(/[^a-z0-9_-]/gi, '');
  function ynTextStyle(x) {
    const st = [];
    if (+x.size > 0) st.push(`--yn-ts:${Math.min(+x.size, 400)}px`);
    if (+x.csize > 0) st.push(`--yn-cs:${Math.min(+x.csize, 200)}px`);
    if (FONTS[x.font]) st.push(`--yn-tf:${FONTS[x.font]}`);
    if (/^#[0-9a-f]{6}$/i.test(x.color || '')) st.push(`--yn-tc:${x.color}`);
    if (+x.height > 0) st.push(`min-height:${Math.min(Math.round(+x.height), 4000)}px`);
    if (['center', 'right'].includes(x.align)) st.push(`text-align:${x.align}`);
    return st.length ? ` style='${st.join(';')}'` : '';
  }
  function ynMark(n) {
    const paths = [
      '<path d="M10 80 Q70 20 140 80 T280 80 T420 80 M10 100 Q70 40 140 100 T280 100 T420 100 M10 120 Q70 60 140 120 T280 120 T420 120"/>',
      '<path d="M90 10v160 M10 90h160 M34 34l112 112 M34 146L146 34 M270 10v160 M190 90h160 M214 34l112 112 M214 146L326 34"/><circle cx="90" cy="90" r="48"/><circle cx="270" cy="90" r="48"/>',
      '<path d="M10 145h400 M40 118h340 M75 118V85h270v33 M100 85V55h220v30 M155 55V30h110v25 M15 110q80 20 100-35 M405 110q-80 20-100-35 M60 47q80 25 110-20 M360 47q-80 25-110-20"/>',
      '<path d="M0 160l62-36 38 18 71-94 20 21 34-55 72 117 22-25 101 54 M171 48l5 38 15-17 18 18 16-73 16 92 15-20 M35 175l71-19 60 13 88-27 134 33"/>',
      '<path d="M30 140l60-74 75 33 70-66 88 44 62-40"/><circle cx="30" cy="140" r="3"/><circle cx="90" cy="66" r="3"/><circle cx="165" cy="99" r="3"/><circle cx="235" cy="33" r="3"/><circle cx="323" cy="77" r="3"/><circle cx="385" cy="37" r="3"/>'
    ];
    return `<svg class="yn-mark" viewBox="0 0 420 180" fill="none" stroke="currentColor" stroke-width=".8" aria-hidden="true">${paths[(n - 1) % paths.length]}</svg>`;
  }
  // Resist-dye marks: slightly uneven stitched rings, petal knots and four-dot flowers.
  // Two ink weights soften the edges like dye spreading through cloth. No bitmap asset is needed.
  function ynDyeHTML() {
    let out = '';
    const ring = (cx, cy, r, phase) => {
      let d = '';
      for (let i = 0; i <= 100; i++) {
        const a = i / 100 * Math.PI * 2;
        const rr = r * (1 + .018 * Math.sin(a * 5 + phase) + .011 * Math.sin(a * 9 - phase));
        d += `${i ? 'L' : 'M'}${(cx + Math.cos(a) * rr).toFixed(1)},${(cy + Math.sin(a) * rr).toFixed(1)}`;
      }
      return d + 'Z';
    };
    for (const [cx, cy, radius] of [[-8, 655, 245], [1005, 8, 245], [590, 56, 64]]) {
      const scale = radius / 245;
      out += `<circle cx="${cx}" cy="${cy}" r="${5 * scale}" fill="currentColor" stroke="none"/>`;
      [22, 36, 51, 69, 88, 115, 139, 160, 186, 208, 231].forEach((r, k) => {
        out += `<path d="${ring(cx, cy, r * scale, k * .7)}" stroke-width="${(k % 3 === 0 ? 3 : 1.9) * scale}" stroke-dasharray="${k % 3 === 0 ? `0 ${7 * scale}` : `${3.5 * scale} ${4.5 * scale}`}"/>`;
      });
      for (let i = 0; i < 16; i++) {
        const a = i / 16 * Math.PI * 2;
        out += `<path d="${ring(cx + Math.cos(a) * 102 * scale, cy + Math.sin(a) * 102 * scale, 8 * scale, a)}" stroke-width="${2 * scale}" stroke-dasharray="0 ${5 * scale}"/>`;
      }
    }
    for (const [x, y] of [[34, 90], [314, 486], [487, 570], [780, 557], [966, 328], [701, 58]]) {
      out += `<g fill="currentColor" stroke="none"><circle cx="${x - 5}" cy="${y}" r="1.7"/><circle cx="${x + 5}" cy="${y}" r="1.7"/><circle cx="${x}" cy="${y - 5}" r="1.7"/><circle cx="${x}" cy="${y + 5}" r="1.7"/></g>`;
    }
    return `<svg class="yn-dye" viewBox="0 0 1000 620" preserveAspectRatio="xMidYMid slice" fill="none" stroke="currentColor" stroke-linecap="round" aria-hidden="true"><g class="yn-dye-bleed">${out}</g><g>${out}</g></svg>`;
  }
  function ynFigure(ph, n) {
    return `<figure class="frame yn-frame${isPortrait(ph) ? ' tall' : ''}" style="--ar:${(+ph.w || 3) / (+ph.h || 2)}">
      <button class="clip" type="button" aria-label="View photograph: ${esc(capLine(ph.caption))}" style="aspect-ratio:${+ph.w || 3}/${+ph.h || 2}">${img(ph)}</button>
      <figcaption><b>${pad2(n)}</b><span>${capHTML(ph.caption)}</span><i aria-hidden="true">↗</i></figcaption></figure>`;
  }
  function yunnanHTML(p) {
    const photos = p.photos || [], total = countOf(p), chapters = photos.filter(x => kindOf(x) === 'text' && x.style === 'chapter');
    const labels = chapters.map(x => x.kicker || x.title || 'Chapter');
    const index = chapters.map((x, i) => `<button type="button" data-yn-jump="${ynID(x)}"><b>${pad2(i + 1)}</b><span>${esc(String(x.title).replace(/\n/g, ' '))}</span>${ARROW}</button>`).join('');
    let html = `<article class="yn-journal">
      <section class="panel cover yn-cover" data-plx="5" aria-label="Yunnan, a photographic journal">
        <button type="button" class="bg" aria-label="View cover photograph">${img(coverOf(p), '', true)}</button><div class="shade"></div>
        <div class="yn-cover-top"><span>A photographic journal</span><span>${esc(p.subtitle || 'Yunnan, China')}</span></div>
        <div class="yn-cover-type"><div class="yn-eyebrow reveal">Dewen Tao · Selected photographs</div>
          <h1 class="reveal" style="--d:1">${esc(p.title)}</h1>
          <div class="yn-cover-foot reveal" style="--d:2"><p>A little closer<br><em>to the clouds.</em></p>
            <button type="button" data-yn-jump="yn-contents">Enter the journal <span>↓</span></button></div>
        </div><div class="yn-cover-side" aria-hidden="true">Water · Earth · Light</div>
      </section>
      <section class="paper yn-intro" id="yn-contents">
        <div class="yn-intro-heading"><div class="yn-eyebrow reveal">Field notes / Yunnan</div>
          <h2 class="reveal">Follow the water.<br>Stay for <em>the light.</em></h2>
          <div class="yn-edition reveal"><span>${pad2(chapters.length)} chapters</span><span>${pad2(total)} photographs</span><span>By Dewen Tao</span></div>
          <p class="yn-intro-note reveal">A passage through the southwest of China,<br>told in water, weather and the hours between.</p></div>
        <div class="yn-intro-right"><p class="yn-intro-copy reveal">${text(p.description)}</p><nav class="yn-contents" aria-label="Journal contents">${index}</nav></div>
      </section>`;
    let ch = 0, single = 0, pair = 0, num = 1;
    const numbers = new Map();
    photos.forEach(x => { numbers.set(x, num); num += kindOf(x) === 'text' ? 0 : kindOf(x) === 'stack' ? Math.max(1, (x.layers || []).length) : 1; });
    for (const s of layoutShots(photos)) {
      const x = s.items[0], n = numbers.get(x);
      if (s.type === 'text' && x.style === 'chapter') {
        if (ch) html += '</div>';
        ch++;
        html += `<div class="yn-part yn-part-${ch}${ch === 2 || ch === 5 ? ' yn-dark' : ''}"><section class="paper yn-chapter yn-chapter-${ch}${ch === 3 ? ' yn-dark' : ''}" id="${ynID(x)}" data-yn-chapter data-yn-label="${esc(x.kicker || x.title)}"${ynTextStyle(x)}>
          <div class="yn-chapter-meta reveal"><span>Chapter ${pad2(ch)}</span><span>${esc(x.kicker || '')}</span><b>${pad2(ch)} / ${pad2(chapters.length)}</b></div>
          <div class="yn-chapter-body"><h2 class="reveal">${text(x.title)}</h2><p class="reveal" style="--d:1">${text(x.caption)}</p></div>${ch === 2 ? ynDyeHTML() : ynMark(ch)}
          <div class="yn-chapter-rule" aria-hidden="true"><i></i></div></section>`;
      } else if (s.type === 'text') {
        html += `<section class="paper yn-verse"${ynTextStyle(x)}>${ch === 2 ? ynDyeHTML() : ''}<div class="yn-eyebrow reveal">${esc(x.kicker || 'A note along the way')}</div><h2 class="reveal">${text(x.title)}</h2>${x.caption ? `<p class="reveal">${text(x.caption)}</p>` : ''}</section>`;
      } else if (s.type === 'stack' && x.layout === 'scroll') {
        html += `<section class="paper roll yn-river yn-dark" aria-label="${esc(x.caption)}"><div class="stick">
          <div class="yn-river-head"><div><div class="yn-eyebrow">A study in movement</div><h3>${esc(x.caption)}</h3></div><p>Follow the current<br><span>Scroll to unfold →</span></p></div>
          <div class="roll-track">${(x.layers || []).map((l, j) => `<figure class="frame roll-item yn-frame" style="--ar:${(+l.w || 3) / (+l.h || 2)}"><button class="clip" type="button" aria-label="View photograph: ${esc(l.label)}">${img({ ...l, caption: l.label })}</button><figcaption><b>${pad2(n + j)}</b><span>${esc(l.label)}</span></figcaption></figure>`).join('')}</div>
          <div class="yn-river-controls"><button type="button" data-yn-river="-1" aria-label="Previous river photograph">←</button><span>One river. Many ways of seeing.</span><button type="button" data-yn-river="1" aria-label="Next river photograph">→</button></div><div class="roll-line"><i></i></div></div></section>`;
      } else if (s.type === 'stack') {
        html += stackHTML(x, n - 1);
      } else if (s.type === 'dawn') {
        html += `<section class="dawn yn-wait" aria-label="Mountain light, a scroll study"><div class="stick"><button class="bg" type="button" aria-label="View photograph: ${esc(x.caption)}">${img(x)}</button><div class="dawn-cold"></div>
          <div class="yn-wait-type"><div class="yn-eyebrow">An exercise in waiting</div><h2>A few minutes.<br><em>An entire mountain.</em></h2></div>
          <div class="yn-wait-note"><span>${pad2(n)} &nbsp; ${esc(x.caption)}</span><span>Keep scrolling. Let the light arrive.</span><i></i></div></div></section>`;
      } else if (s.type === 'pair') {
        const [a, b] = s.items, shape = isPortrait(a) && isPortrait(b) ? 'portraits' : isPortrait(a) || isPortrait(b) ? 'mixed' : '';
        html += `<section class="paper yn-spread yn-pair ${shape} ${pair++ % 2 ? 'reverse' : ''}">${ynFigure(a, n)}${ynFigure(b, numbers.get(b))}</section>`;
      } else if (s.type === 'full' || s.type === 'wide') {
        html += `<section class="paper yn-photo-page"><div class="panel shot ${s.type === 'wide' ? 'wide' : 'yn-bleed'}" ${s.type === 'wide' ? `style="aspect-ratio:${+x.w || 3}/${+x.h || 2}"` : 'data-plx="3"'}>
          <button class="bg" type="button" aria-label="View photograph: ${esc(capLine(x.caption))}">${img(x)}</button></div>
          <div class="yn-photo-caption"><b>${pad2(n)}</b><span>${esc(capLine(x.caption))}</span><span>Yunnan / Field notes</span></div></section>`;
      } else if (s.type === 'video' || s.type === 'youtube') {
        html += mediaHTML(x, n - 1, total, 'l');
      } else {
        html += `<section class="paper yn-spread yn-single ${single++ % 2 ? 'right' : ''}"><div class="yn-margin-note"><span>Yunnan</span><i></i><span>Field note ${pad2(n)}</span></div>${ynFigure(x, n)}</section>`;
      }
    }
    if (ch) html += '</div>';
    const next = projects.length > 1 ? projects[(projects.indexOf(p) + 1) % projects.length] : null;
    html += `<footer class="paper yn-colophon"><div class="yn-eyebrow reveal">End of the journal</div><h2 class="reveal">The journey ends.<br><em>The light stays.</em></h2><p class="reveal">${pad2(total)} photographs from Yunnan. Thank you for wandering.</p>
      <div class="yn-colophon-row"><a href="#/">Explore all projects ${ARROW}</a><span>Photographs © Dewen Tao</span><button type="button" data-yn-top>Back to the beginning ↑</button></div></footer>`;
    if (next) html += `<section class="next yn-next" id="next" data-href="#/p/${esc(next.slug)}"><div class="bg">${img(coverOf(next))}</div><div class="next-inner"><div class="yn-eyebrow">Another place, another story</div><a class="yn-next-link" href="#/p/${esc(next.slug)}"><span>${esc(next.title)}</span>${ARROW}</a><div class="next-line">Keep scrolling to continue</div><div class="ring"><svg class="arc" viewBox="0 0 72 72"><circle class="track" cx="36" cy="36" r="34"/><circle class="fill" cx="36" cy="36" r="34" pathLength="100"/></svg><span>↓</span></div></div></section>`;
    html += `</article><nav class="yn-guide is-hidden" aria-label="Yunnan chapters"><button class="yn-guide-title" type="button" data-yn-top>Yunnan <em>Field journal</em></button><div class="yn-guide-chapters">${chapters.map((x, i) => `<button type="button" data-yn-jump="${ynID(x)}" aria-label="Chapter ${i + 1}: ${esc(x.title.replace(/\n/g, ' '))}"><b>${pad2(i + 1)}</b><span>${esc(labels[i])}</span></button>`).join('')}</div><div class="yn-guide-progress" aria-hidden="true"><i></i></div></nav>`;
    return html;
  }

  function projectHTML(p) {
    if (p.theme === 'yunnan') return yunnanHTML(p);
    pageTheme = p.theme || '';
    const photos = p.photos || [], total = countOf(p), idx = projects.indexOf(p);
    const next = projects.length > 1 ? projects[(idx + 1) % projects.length] : null;
    const pl = placeOf(p);
    edge = { code: (pl.en + (isCJK(pl.big) ? ' ' + pl.big : '')).trim() || p.title, coords: pl.coords };
    chTotal = photos.filter(x => kindOf(x) === 'text' && x.style === 'chapter').length;
    let html = `
    <section class="panel cover grow" data-plx="8">
      <div class="bg">${img(coverOf(p), '', true)}</div><div class="shade"></div>
      ${plate(p, { h: 'h1', btn: 'View full frame', zoom: true })}
      ${total ? '<div class="scroll-hint"><i></i></div>' : ''}
    </section>`;
    if (pageTheme === 'beijing') html += `<div class="bj-ruler is-hidden" aria-hidden="true"><span class="bj-r-top">永定门<em>Yongdingmen</em></span><span class="bj-r-bar"><i></i></span><span class="bj-r-km">0.0 km</span><span class="bj-r-bot">钟鼓楼<em>Bell &amp; Drum Towers</em></span></div>`;
    if (p.description) {
      html += `
    <section class="paper preface">
      <div class="label reveal"><span>Album ${pad2(idx + 1)}</span><b>${esc(p.subtitle || plural(total))}</b></div>
      <p class="statement words">${words(p.description)}</p>
    </section>`;
    }
    let pairs = 0, singles = 0, chapters = 0;
    for (const s of layoutShots(photos)) {
      if (s.type === 'wide') {   // whole photo, as wide as the screen; its height follows the photo
        const x = s.items[0];
        html += `<section class="panel shot wide" style="aspect-ratio:${+x.w || 3}/${+x.h || 2}" data-count="${pad2(s.from + 1)}" data-total="${pad2(total)}" data-cap="${esc(x.caption || '')}"><div class="bg">${img(x)}${fxIn(x)}</div></section>`;
      } else if (s.type === 'full') {
        const x = s.items[0];
        html += `<section class="panel shot grow" data-plx="5" style="--ar:${+x.w || 3}/${+x.h || 2}" data-count="${pad2(s.from + 1)}" data-total="${pad2(total)}" data-cap="${esc(x.caption || '')}"><div class="bg">${img(x)}${fxIn(x)}</div></section>`;
      } else if (s.type === 'dawn') {
        html += dawnHTML(s.items[0], s.from, total);
      } else if (s.type === 'pair') {
        const [a, b] = s.items, kind = isPortrait(a) && isPortrait(b) ? 'pp' : isPortrait(a) ? 'pl' : isPortrait(b) ? 'lp' : (pairs % 2 ? 'sl' : 'ls');
        pairs++;
        if (kind === 'ls' || kind === 'sl') {   // two landscapes: pinned while they trade sizes
          const ar = Math.max((+a.w || 3) / (+a.h || 2), (+b.w || 3) / (+b.h || 2)).toFixed(3);
          html += `<section class="paper spread pair swap ${kind}" style="--ar:${ar}"><div class="stick">${frame1(a, s.from)}${frame1(b, s.from + 1)}</div></section>`;
        } else html += `<section class="paper spread pair ${kind}">${frame1(a, s.from)}${frame1(b, s.from + 1)}</section>`;
      } else if (s.type === 'text') {
        html += textHTML(s.items[0], s.items[0].style === 'chapter' ? ++chapters : 0);
      } else if (s.type === 'stack') {
        html += stackHTML(s.items[0], s.from);
      } else if (s.type === 'video' || s.type === 'youtube') {
        html += mediaHTML(s.items[0], s.from, total, singles++ % 2 ? 'r' : 'l');
      } else {
        html += `<section class="paper spread single ${singles++ % 2 ? 'r' : 'l'}">${frame1(s.items[0], s.from)}</section>`;
      }
    }
    const target = next ? { href: '#/p/' + next.slug, title: next.title, sub: next.subtitle || '', image: coverOf(next), line: 'Keep scrolling for next project' }
                        : { href: '#/', title: content.site.title || 'Home', sub: '', image: coverOf(projects[0]), line: 'Keep scrolling to return home' };
    html += `
    <section class="next" id="next" data-href="${esc(target.href)}">
      <div class="bg">${img(target.image)}</div>
      <div class="next-blur" aria-hidden="true">${img(target.image)}</div>
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

  // ---------- nav + albums menu ----------
  // The nav is plain type: the name on the left, where you are in the middle, "Albums" on the right, which
  // opens a full-screen index (a photograph of the album you point at shows beside the list).
  function buildNav() {
    const site = content.site || {};
    $('#brand').textContent = site.title || 'Photography';
    menu.innerHTML = `<div class="menu-in">
      <div class="menu-head"><span>Albums</span><span>${pad2(projects.length)}</span></div>
      <nav class="menu-list">${projects.map((p, i) => { const pl = placeOf(p); return `<a href="#/p/${esc(p.slug)}" data-i="${i}"><b>${pad2(i + 1)}</b><span class="t${isCJK(pl.big) ? ' cjk' : ''}">${esc(pl.big)}</span><em>${esc(pl.en)}</em><span class="c">${esc(pl.coords)}</span></a>`; }).join('')}
        <a href="#/" class="home"><b>00</b><span class="t">Index</span><em>The beginning</em></a></nav>
      <div class="menu-peek" aria-hidden="true">${projects.map((p, i) => `<div data-i="${i}">${img(coverOf(p))}</div>`).join('')}</div>
    </div>`;
    $$('.menu-list a[data-i]', menu).forEach(a => a.addEventListener('pointerenter', () => peek(+a.dataset.i)));
  }
  function peek(i) { $$('.menu-peek > div', menu).forEach(d => d.classList.toggle('on', +d.dataset.i === i)); }
  function setMenu(open) {
    if (open === document.body.classList.contains('menu-open')) return;
    document.body.classList.toggle('menu-open', open);
    menuBtn.setAttribute('aria-expanded', String(open));
    if (open) { menu.hidden = false; void menu.offsetWidth; menu.classList.add('open'); Smooth.stop(); peek(route.type === 'project' ? projects.indexOf(route.project) : 0); }
    else { menu.classList.remove('open'); setTimeout(() => { if (!menu.classList.contains('open')) menu.hidden = true; }, 700); }
  }
  menuBtn.addEventListener('click', () => setMenu(!document.body.classList.contains('menu-open')));
  addEventListener('keydown', e => { if (e.key === 'Escape') setMenu(false); });
  menu.addEventListener('click', e => { if (e.target.closest('a')) setMenu(false); });
  function markWhere(r) {
    if (r.type === 'project') {
      const p = r.project, pl = placeOf(p), i = projects.indexOf(p);
      where.innerHTML = `<b>${pad2(i + 1)}</b>${esc(pl.en || p.title)}${isCJK(pl.big) ? ` <span>${esc(pl.big)}</span>` : ''}`;
    } else where.innerHTML = `<b>00</b>Index`;
    $$('.menu-list a', menu).forEach(a => a.classList.toggle('on', a.getAttribute('href') === r.hash));
  }

  // ---------- router ----------
  let route = { type: 'home' }, prevRoute = null;
  let instant = false, homeTop = false, rendering = false;
  let stacks = [], mediaIO = null, dawns = [], rolls = [];
  let panels = [], papers = [], wordSets = [], swaps = [], onLight = false, nextEl = null, revealIO = null;
  let toneMarks = [], toneKey = '', toneDark = false;
  let ynChapters = [], ynGuide = null, ynActive = -1, bjRuler = null;
  const TONE_VARS = ['--cloth', '--cloth-hi', '--cloth-lo', '--pink', '--pink-2', '--pink-3', '--accent', '--pat'];
  const mixTone = (a, b, k) => {
    const m = (p, q) => p.map((v, i) => v + (q[i] - v) * k);
    return { bg: m(a.bg, b.bg), hi: m(a.hi, b.hi), lo: m(a.lo, b.lo), ink: m(a.ink, b.ink), ac: m(a.ac, b.ac), pat: a.pat + (b.pat - a.pat) * k };
  };
  // each tone mark starts dyeing the page when its top enters the bottom of the screen and is done
  // by the time it reaches the top fifth; marks are in page order, so later ones blend over earlier ones
  function applyTones(vh) {
    let c = TONES[BASE_TONE[document.body.dataset.theme]] || TONES.indigo;
    for (const m of toneMarks) {
      const k = Math.min(1, Math.max(0, (vh * 0.9 - rect(m.el).top) / (vh * 0.7)));
      if (k <= 0) break;
      c = mixTone(c, m.t, k * k * (3 - 2 * k));
    }
    const rgb = v => `rgb(${v.slice(0, 3).map(Math.round)})`, rgba = (v, a) => `rgba(${v.slice(0, 3).map(Math.round)},${(a == null ? v[3] : a).toFixed(3)})`;
    const vals = [rgb(c.bg), rgba(c.hi), rgba(c.lo), rgb(c.ink), rgba(c.ink, .7), rgba(c.ink, .42), rgb(c.ac), c.pat.toFixed(3)];
    const key = vals.join('|');
    toneDark = c.bg[0] + c.bg[1] + c.bg[2] < 330;   // dark page: the nav keeps light ink even over paper
    if (key === toneKey) return;
    toneKey = key;
    const s = document.body.style;
    TONE_VARS.forEach((k, i) => s.setProperty(k, vals[i]));
  }

  function parse() {
    const m = location.hash.match(/^#\/p\/(.+)$/);
    if (m) { const p = projects.find(x => x.slug === decodeURIComponent(m[1])); if (p) return { type: 'project', project: p, hash: '#/p/' + p.slug }; }
    return { type: 'home', hash: '#/' };
  }

  async function render() {
    if (rendering) return; rendering = true;
    const r = parse(), skip = instant; instant = false;
    cancelSnap(); closeZoom(true); Smooth.stop();
    hud.classList.remove('show'); hudKey = null;
    if (!skip && view.childElementCount) { view.classList.add('out'); await wait(300); }

    prevRoute = route; route = r;
    view.innerHTML = r.type === 'project' ? projectHTML(r.project) : (projects.length || content.hero ? homeHTML() : '<div class="empty">No content yet.</div>');
    document.title = r.type === 'project' ? `${r.project.title} — ${content.site.title || ''}` : (content.site.title || 'Photography');
    // per-album page style ("theme"), set in the backstage; "indigo" is a dark theme
    const theme = r.type === 'project' && /^[a-z]+$/.test(r.project.theme || '') ? r.project.theme : '';
    document.body.dataset.theme = theme;
    document.body.classList.toggle('theme-dark', theme === 'indigo');
    document.body.classList.toggle('home', r.type === 'home');

    // returning home with the Back button lands on the project you just left
    let top = 0;
    if (r.type === 'home' && prevRoute && prevRoute.type === 'project' && !homeTop) {
      const el = document.getElementById('proj-' + prevRoute.project.slug);
      if (el) top = el.offsetTop;
    }
    homeTop = false;
    window.scrollTo(0, top);

    setupView();
    markWhere(r); setMenu(false);
    if (!skip) { view.classList.add('pre'); view.classList.remove('out'); void view.offsetWidth; view.classList.remove('pre'); }
    rendering = false; scrollRef = window.scrollY;
    if (!skip) poke();   // after the keep-scrolling hand-off the reader is still scrolling down: leave the chrome as it was
    if (parse().hash !== r.hash) render();
  }

  function setupView() {
    if (revealIO) revealIO.disconnect();
    revealIO = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); revealIO.unobserve(e.target); } }), { threshold: 0.25 });
    panels = $$('.panel, .next', view).map(el => ({
      el, plx: reduceMotion ? 0 : (+el.dataset.plx || 0) / 100, imgs: $$('.bg img, .bg .sparkle', el), all: $$('img', el), shot: el.classList.contains('shot'),
      grow: !reduceMotion && el.classList.contains('grow'), f: -1,
    }));
    panels.forEach(p => revealIO.observe(p.el));
    $$('.frame, .paper .reveal, .chapter, .pa-doodle', view).forEach(el => revealIO.observe(el));
    papers = document.body.classList.contains('theme-dark') ? [] : $$('.paper', view).filter(el => !el.closest('.yn-dark') && !el.classList.contains('yn-photo-page'));   // dark sections and photographs keep the light nav
    dawns = $$('.dawn', view).map(el => ({ el, sun: -1 }));
    rolls = $$('.roll', view).map(el => ({ el, track: $('.roll-track', el), items: $$('.roll-item', el), w: 0, p: -1 }));
    sizeRolls();
    $$('.chapter svg.contour', view).forEach(drawContour);
    $$('.chapter svg.shibori', view).forEach(drawShibori);
    $$('.chapter svg.pa-roofs', view).forEach(drawRoofs);
    $$('.chapter svg.pa-rose', view).forEach(drawRose);
    $$('.sparkle', view).forEach(placeSparkles);
    $$('canvas.fw', view).forEach(startFireworks);
    TONE_VARS.forEach(k => document.body.style.removeProperty(k)); toneKey = ''; toneDark = false;
    toneMarks = document.body.classList.contains('theme-dark') || !!BASE_TONE[document.body.dataset.theme]
      ? $$('[data-tone]', view).map(el => ({ el, t: TONES[el.dataset.tone] })).filter(m => m.t) : [];
    swaps = $$('.spread.swap', view).map(el => ({ el, stick: $('.stick', el), sl: el.classList.contains('sl'), s: -1 }));
    stacks = $$('.stack', view).map(el => ({ el, imgs: $$('img.layer', el), when: $('.when', el), ticks: $$('.ticks i', el), ops: [], cur: 0 }));
    if (mediaIO) mediaIO.disconnect();
    mediaIO = new IntersectionObserver(es => es.forEach(e => playMedia(e.target, e.isIntersecting)), { threshold: 0.35 });
    $$('video, .clip.yt', view).forEach(el => mediaIO.observe(el));
    wordSets = $$('.words', view).map(el => ({ el, ws: $$('.w', el), n: -1 }));
    ynGuide = $('.yn-guide', view); ynActive = -1;
    ynChapters = $$('[data-yn-chapter]', view);
    nextEl = $('#next', view);
    charge.v = 0; charge.done = false; charge.arrived = 0;
    Threshold.setup();
    bjRuler = $('.bj-ruler', view);
    lastY = -1;
  }

  // ---------- scroll loop: parallax, HUD, charge decay ----------
  let lastY = -1, lastT = 0, hudKey = null, hudTimer = 0;
  const charge = { v: 0, last: 0, arrived: 0, done: false, shown: -1 };
  const atBottom = () => window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;

  // One getBoundingClientRect per element per frame, all taken before any style is written, so the
  // writes don't force the browser to lay the page out again halfway through the frame.
  let rc = new Map();
  const rect = el => { let r = rc.get(el); if (!r) { r = el.getBoundingClientRect(); rc.set(el, r); } return r; };

  function frame(t) {
    const dt = Math.min(64, t - lastT) / 1000; lastT = t;
    const y = window.scrollY, vh = window.innerHeight;
    const moved = y !== lastY;
    if (moved) {
      lastY = y;
      rc = new Map();
      for (const list of [panels, wordSets, swaps, dawns, rolls, stacks, toneMarks]) for (const o of list) rect(o.el);
      papers.forEach(rect); (ynChapters || []).forEach(rect); if (nextEl) rect(nextEl);
      let current = null;
      for (const p of panels) {
        const r = rect(p.el);
        if (r.bottom < -50 || r.top > vh + 50) continue;
        if (r.top <= vh / 2 && r.bottom > vh / 2) current = p;
        if (p.plx) {
          const shift = -(r.top / vh) * p.plx * r.height;
          for (const im of p.imgs) im.style.transform = `translate3d(0,${shift.toFixed(1)}px,0)`;
        }
        // framed → full-bleed: a panel sits inside paper margins until it is centred
        if (p.grow) {
          const k = Math.min(1, Math.max(0, (Math.abs(r.top) / vh - 0.1) / 0.6)), f = +(k * k * (3 - 2 * k)).toFixed(3);
          if (f !== p.f) { p.f = f; p.el.style.setProperty('--f', f); }
        }
      }
      updateHud(current);
      if (ynGuide) {
        const hidden = y < vh * .75 || (nextEl && rect(nextEl).top < vh * .7);
        ynGuide.classList.toggle('is-hidden', hidden); ynGuide.inert = hidden;
        ynGuide.setAttribute('aria-hidden', String(hidden));
        let active = -1;
        ynChapters.forEach((el, i) => { if (rect(el).top <= vh * .5) active = i; });
        if (active !== ynActive) {
          ynActive = active;
          $$('[data-yn-jump]', ynGuide).forEach((b, i) => {
            if (i === active) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
          });
        }
        const progress = Math.max(0, Math.min(1, (y - vh) / Math.max(1, document.documentElement.scrollHeight - vh * 2)));
        ynGuide.style.setProperty('--yn-progress', progress.toFixed(4));
      }
      if (toneMarks.length) applyTones(vh);
      // 北京: the central-axis ruler on the right reads how far along the page you are (0 → 7.8 km)
      if (bjRuler) {
        const max = Math.max(1, document.documentElement.scrollHeight - vh * 2), k = Math.max(0, Math.min(1, (y - vh) / max));
        bjRuler.classList.toggle('is-hidden', y < vh * 0.75 || !!(nextEl && rect(nextEl).top < vh * 0.7));
        bjRuler.style.setProperty('--p', k.toFixed(4));
        bjRuler.lastChild.previousSibling.textContent = (k * 7.8).toFixed(1) + ' km';
      }
      // is the nav sitting on paper? then it switches to dark ink
      let light = Threshold.scroll(vh);
      for (const el of papers) { const r = rect(el); if (r.top <= 42 && r.bottom > 42) { light = true; break; } }
      if (toneDark) light = false;
      document.body.classList.toggle('tone-dark', toneDark);
      if (light !== onLight) { onLight = light; document.body.classList.toggle('on-light', light); }
      // statements light up word by word
      for (const s of wordSets) {
        const r = rect(s.el); if (r.bottom < -200 || r.top > vh + 200) continue;
        const k = reduceMotion ? 1 : (vh * 0.88 - r.top) / (r.height + vh * 0.38);
        const n = Math.max(0, Math.min(s.ws.length, Math.round(k * s.ws.length)));
        if (n !== s.n) { s.n = n; s.ws.forEach((w, i) => w.classList.toggle('on', i < n)); }
      }
      // paired landscapes: hold, trade sizes, hold (rewinds when scrolling back up)
      const canSwap = !reduceMotion && window.innerWidth > 760;
      for (const w of swaps) {
        const r = rect(w.el); if (r.bottom < -100 || r.top > vh + 100) continue;
        let s = w.sl ? 1 : 0;
        if (canSwap) {
          const p = Math.min(1, Math.max(0, -r.top / Math.max(1, r.height - vh)));
          const k = Math.min(1, Math.max(0, (p - 0.2) / 0.6)), t = k * k * (3 - 2 * k);
          s = +(w.sl ? 1 - t : t).toFixed(4);
        }
        if (s !== w.s) {
          w.s = s; w.el.style.setProperty('--s', s);
          w.stick.style.gridTemplateColumns = canSwap ? `${(7 - 3 * s).toFixed(4)}fr ${(4 + 3 * s).toFixed(4)}fr` : '';
        }
      }
      // dawn: scroll progress through the pinned section raises the sun (--sun 0 → 1)
      for (const d of dawns) {
        const r = rect(d.el); if (r.bottom < -100 || r.top > vh + 100) continue;
        const p = Math.min(1, Math.max(0, -r.top / Math.max(1, r.height - vh)));
        const k = reduceMotion ? 1 : Math.min(1, Math.max(0, (p - 0.08) / 0.7)), sun = +(k * k * (3 - 2 * k)).toFixed(3);
        if (sun !== d.sun) { d.sun = sun; d.el.style.setProperty('--sun', sun); }
      }
      // handscroll: vertical scroll → sideways travel of the strip
      for (const ro of rolls) {
        if (ro.native) continue;
        const r = rect(ro.el); if (r.bottom < -100 || r.top > vh + 100) continue;
        const p = +Math.min(1, Math.max(0, -r.top / Math.max(1, r.height - vh))).toFixed(4);
        if (p === ro.p) continue; ro.p = p;
        const shift = p * ro.w;
        ro.track.style.transform = `translate3d(${(-shift).toFixed(1)}px,0,0)`;
        ro.el.style.setProperty('--p', p);
        if (!reduceMotion) {   // each photo drifts a little inside its frame — depth, like looking through a window
          const vw = window.innerWidth;
          for (const it of ro.items) {
            if (it._cx == null) it._cx = it.offsetLeft + it.offsetWidth / 2;   // cached: reading offsets here would force a layout
            const c = it._cx - shift - vw / 2;
            const im = it._im || (it._im = $('img', it)); if (im) im.style.transform = `translate3d(${(-c * 0.06).toFixed(1)}px,0,0)`;
          }
        }
      }
      // time stacks: hold, cross-fade, hold … across the pinned scroll distance
      for (const st of stacks) {
        const r = rect(st.el), n = st.imgs.length; if (r.bottom < -100 || r.top > vh + 100 || n < 2) continue;
        const p = Math.min(1, Math.max(0, -r.top / Math.max(1, r.height - vh)));
        const t = Math.min(1, Math.max(0, (p - 0.06) / 0.86)) * (n - 1);
        const i = Math.min(n - 2, Math.floor(t)), k = Math.min(1, Math.max(0, (t - i - 0.18) / 0.64)), e = k * k * (3 - 2 * k);
        st.imgs.forEach((im, j) => {
          const o = j <= i ? 1 : j === i + 1 ? +e.toFixed(3) : 0;
          if (st.ops[j] !== o) { st.ops[j] = o; im.style.opacity = o; }
        });
        const cur = e >= 0.5 ? i + 1 : i;
        if (cur !== st.cur) {
          st.cur = cur; st.ticks.forEach((tk, j) => tk.classList.toggle('on', j <= cur));
          if (st.when) st.when.textContent = st.imgs[cur].dataset.label || '';
        }
      }
    }
    Threshold.tick(t);
    // charge bookkeeping
    if (nextEl && !charge.done) {
      if (atBottom()) { if (!charge.arrived) charge.arrived = t; }
      else { charge.arrived = 0; charge.v = 0; }
      if (charge.v > 0 && t - charge.last > 140) charge.v = Math.max(0, charge.v - dt * 0.9);
      if (charge.v !== charge.shown) { charge.shown = charge.v; nextEl.style.setProperty('--charge', charge.v.toFixed(3)); }
      const nr = rect(nextEl), nb = Math.min(1, Math.max(0, (vh - nr.top) / (vh * .9))).toFixed(3);
      if (nb !== charge.nb) { charge.nb = nb; nextEl.style.setProperty('--nb', nb); }
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
      hudCap.innerHTML = capRich(key.dataset.cap);
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
  // ---------- eased wheel scrolling ("non-linear" scrolling) ----------
  // Each wheel / trackpad step moves a target; the page glides towards it, covering a fixed share of
  // the remaining distance per frame (fast at first, then settling), instead of jumping in steps.
  // The real scroll position is used throughout, so sticky sections, the keep-scrolling charge and
  // everything scroll-driven work as before. Keys, the scrollbar and touch stay native.
  // SMOOTH = share of the distance covered per 60 fps frame: higher = snappier, lower = floatier, 0 = off.
  const SMOOTH = 0.13;
  const Smooth = (() => {
    const enabled = SMOOTH > 0 && !reduceMotion && matchMedia('(hover: hover) and (pointer: fine)').matches;
    let target = 0, cur = 0, raf = 0, last = 0;
    function stop() { if (raf) cancelAnimationFrame(raf); raf = 0; }
    function step(t) {
      const dt = Math.min(50, t - last || 16.7); last = t;
      cur += (target - cur) * (1 - Math.pow(1 - SMOOTH, dt / 16.7));   // same feel at 60 or 120 Hz
      if (Math.abs(target - cur) < 0.4) cur = target;
      window.scrollTo(0, cur);
      raf = cur === target ? 0 : requestAnimationFrame(step);
    }
    addEventListener('wheel', e => {
      if (!enabled || e.defaultPrevented || e.ctrlKey || zoomed || rendering) return;
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;   // sideways swipes stay native
      for (let el = e.target; el && el !== document.body; el = el.parentElement) {   // let inner scrollers scroll
        if (el.scrollHeight > el.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(el).overflowY)) return;
      }
      const max = document.documentElement.scrollHeight - window.innerHeight;
      if (!raf) { cur = target = window.scrollY; last = performance.now(); }
      const d = e.deltaMode === 1 ? e.deltaY * 40 : e.deltaMode === 2 ? e.deltaY * window.innerHeight : e.deltaY;
      target = Math.max(0, Math.min(max, target + d));
      e.preventDefault();
      if (!raf) raf = requestAnimationFrame(step);
    }, { passive: false });
    // something else moved the page (keys, scrollbar, a link, the snap) — let it
    addEventListener('scroll', () => { if (raf && Math.abs(window.scrollY - Math.round(cur)) > 3) stop(); }, { passive: true });
    addEventListener('keydown', stop);
    addEventListener('pointerdown', stop);
    return { stop, busy: () => !!raf };
  })();

  let touchY = null;
  addEventListener('touchstart', e => { touchY = e.touches[0].clientY; touching = true; cancelSnap(); }, { passive: true });
  addEventListener('touchend', () => { touching = false; queueSnap(); }, { passive: true });
  addEventListener('touchmove', e => {
    const y = e.touches[0].clientY; if (touchY !== null && y < touchY) feed((touchY - y) / 420); touchY = y;
  }, { passive: true });
  addEventListener('keydown', e => {
    if (['ArrowDown', 'PageDown', ' ', 'Spacebar'].includes(e.key) && !e.target.closest('input,textarea')) feed(0.16);
  });

  // ---------- link handling ----------
  document.addEventListener('click', e => {
    const b = e.target.closest('button[data-yn-jump], button[data-yn-top], button[data-yn-river]');
    if (!b) return;
    if (b.hasAttribute('data-yn-river')) {
      const ro = rolls.find(r => r.el === b.closest('.roll')); if (!ro) return;
      if (ro.native) { ro.track.scrollBy({ left: +b.dataset.ynRiver * (ro.items[0].offsetWidth + 32), behavior: reduceMotion ? 'auto' : 'smooth' }); return; }
      const current = Math.round(Math.max(0, ro.p) * (ro.items.length - 1));
      const target = Math.max(0, Math.min(ro.items.length - 1, current + +b.dataset.ynRiver));
      window.scrollTo({ top: ro.el.getBoundingClientRect().top + window.scrollY + ro.w * target / Math.max(1, ro.items.length - 1), behavior: reduceMotion ? 'auto' : 'smooth' });
      return;
    }
    const el = b.dataset.ynJump ? document.getElementById(b.dataset.ynJump) : view.firstElementChild;
    if (el) { cancelSnap(); el.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' }); }
  });
  document.addEventListener('click', e => {
    const a = e.target.closest('a[href^="#/"]'); if (!a) return;
    const href = a.getAttribute('href');
    if (href === '#/') homeTop = true;
    if (href === (location.hash || '#/') || (href === '#/' && route.type === 'home')) {
      e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });
  addEventListener('hashchange', render);
  addEventListener('resize', () => { lastY = -1; sizeRolls(); });
  // a handscroll section is as tall as its strip is wide, so scrolling down unrolls it exactly
  function sizeRolls() {
    for (const ro of rolls) {
      ro.native = ro.el.classList.contains('yn-river') && (reduceMotion || window.innerWidth <= 760);
      if (ro.native) { ro.w = 0; ro.el.style.height = ''; ro.track.style.transform = ''; continue; }
      ro.w = Math.max(0, ro.track.scrollWidth - window.innerWidth);
      ro.el.style.height = (window.innerHeight + ro.w) + 'px'; ro.p = -1;
      ro.items.forEach(it => { it._cx = null; });
    }
  }
  // mountain contour lines for chapter openings: wobbly rings around a summit, drawn in on reveal.
  // Seeded per chapter so they look the same on every visit.
  function drawContour(svg) {
    let seed = (+svg.closest('.chapter').dataset.seed || 1) * 9301 + 49297;
    const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
    const cx = 560 + rnd() * 260, cy = 380 + rnd() * 260, rings = 15, ph = [rnd() * 6, rnd() * 6, rnd() * 6];
    let out = '';
    for (let k = 1; k <= rings; k++) {
      const base = k * 44, pts = [];
      for (let a = 0; a <= 72; a++) {
        const t = a / 72 * Math.PI * 2;
        const r = base * (1 + 0.16 * Math.sin(3 * t + ph[0] + k * 0.18) + 0.08 * Math.sin(5 * t + ph[1] - k * 0.11) + 0.05 * Math.sin(2 * t + ph[2]));
        pts.push(`${(cx + Math.cos(t) * r * 1.25).toFixed(1)},${(cy + Math.sin(t) * r).toFixed(1)}`);
      }
      out += `<path d="M${pts.join('L')}Z" pathLength="1" style="--k:${k}"${k % 5 === 0 ? ' class="index"' : ''}/>`;
    }
    svg.innerHTML = out;
  }

  // Tie-dye (扎染) ornament: Bai-style medallions as the white "resist" left on indigo cloth — rings of
  // stitch dots and dashes around a tied centre, a ring of petals, short rays — plus scattered four-dot
  // flowers and a zigzag border. Every line is drawn twice: a blurred wide copy (the dye wicking into the
  // cloth) under a crisp one. Rings appear from the centre outwards when the chapter scrolls in.
  function drawShibori(svg) {
    const n = +svg.closest('.chapter').dataset.seed || 1;
    let seed = n * 7919 + 1013;
    const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
    const b = svg.getBoundingClientRect(), W = 1000;
    const H = Math.round(W * Math.min(1.6, Math.max(0.45, (b.height || 620) / (b.width || 1000))));
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const TAU = Math.PI * 2, f = v => v.toFixed(1);
    // a slightly wobbly closed loop: hand-tied, not compass-drawn
    const loop = (cx, cy, r, wob) => {
      const p1 = rnd() * TAU, p2 = rnd() * TAU; let d = '';
      for (let a = 0; a <= 90; a++) {
        const t = a / 90 * TAU, rr = r * (1 + wob * Math.sin(3 * t + p1) + wob * 0.6 * Math.sin(7 * t + p2));
        d += (a ? 'L' : 'M') + f(cx + Math.cos(t) * rr) + ',' + f(cy + Math.sin(t) * rr);
      }
      return d + 'Z';
    };
    const stitch = (d, r, kind, s) => {
      const N = Math.max(7, Math.round(TAU * r / ((kind === 'dot' ? 11 : 13) * s))), p = 1000 / N;
      return kind === 'dot'
        ? `<path d="${d}" pathLength="1000" class="dot" stroke-dasharray="0 ${p.toFixed(2)}"/>`
        : `<path d="${d}" pathLength="1000" class="dash" stroke-dasharray="${(p * 0.55).toFixed(2)} ${(p * 0.45).toFixed(2)}"/>`;
    };
    let out = '', m = 0;
    const discs = [];
    function medal(cx, cy, R) {
      discs.push([cx, cy, R]);
      const s = Math.max(0.4, R / 300), cyc = ['dot', 'dash', 'dot', 'petal', 'dot', 'dash', 'ray'];
      let g = `<g class="rg" style="--r:0"><circle cx="${f(cx)}" cy="${f(cy)}" r="${f(8 * s)}" class="core"/></g>`, r = 24 * s, i = 0;
      while (r < R) {
        const kind = cyc[i % cyc.length]; let inner = '';
        if (kind === 'petal') {
          const N = Math.max(6, Math.round(TAU * r / (36 * s))), pr = 11 * s;
          for (let j = 0; j < N; j++) { const t = j / N * TAU; inner += stitch(loop(cx + Math.cos(t) * r, cy + Math.sin(t) * r, pr, 0.06), pr, 'dot', s); }
          r += 30 * s;
        } else if (kind === 'ray') {
          const N = Math.round(TAU * r / (15 * s)); let d = '';
          for (let j = 0; j < N; j++) { const t = j / N * TAU, c = Math.cos(t), si = Math.sin(t); d += `M${f(cx + c * (r - 7 * s))},${f(cy + si * (r - 7 * s))}L${f(cx + c * (r + 7 * s))},${f(cy + si * (r + 7 * s))}`; }
          inner = `<path d="${d}" class="ray"/>`;
          r += 24 * s;
        } else {
          inner = stitch(loop(cx, cy, r, 0.012), r, kind, s);
          r += 15 * s;
        }
        g += `<g class="rg" style="--r:${++i}">${inner}</g>`;
      }
      out += `<g style="--m:${m++}">${g}</g>`;
    }
    const free = (x, y, pad) => discs.every(([cx, cy, R]) => Math.hypot(x - cx, y - cy) > R + pad);
    // keep the pattern out from under the chapter's text (boxes in viewBox units)
    const sc = W / (b.width || 1000);
    const boxes = $$('.ch-num, .ch-title, .ch-side', svg.parentNode).map(e => {
      const r = e.getBoundingClientRect();
      return [(r.left - b.left) * sc - 24, (r.top - b.top) * sc - 24, (r.right - b.left) * sc + 24, (r.bottom - b.top) * sc + 24];
    });
    const clear = (x, y, R) => boxes.every(([l, t, r, bm]) => Math.hypot(Math.max(l - x, 0, x - r), Math.max(t - y, 0, y - bm)) >= R);
    // one large medallion rising out of a corner or edge, then a few small ones where there is room
    const spots = [[0.07, 0.98], [0.97, 1.02], [1.03, 0.5], [0.95, -0.02], [0.05, 0.02]];
    let big = null;
    for (let R = Math.min(W, H) * 0.56; R > 110 && !big; R *= 0.88) {
      for (const [sx, sy] of spots) if (clear(W * sx, H * sy, R)) { big = [W * sx, H * sy, R]; break; }
    }
    medal(...(big || [W * 0.07, H * 0.98, 140]));
    for (let tries = 0, made = 0; tries < 160 && made < 5; tries++) {
      const R = 42 + rnd() * 60, x = R * 0.4 + rnd() * (W - R * 0.8), y = R + rnd() * (H - 2 * R);
      if (free(x, y, R + 30) && clear(x, y, R + 16)) { medal(x, y, R); made++; }
    }
    // four-dot flowers (撮花) scattered over the rest of the cloth
    let dots = '';
    for (let tries = 0, made = 0; tries < 500 && made < 52; tries++) {
      const x = 16 + rnd() * (W - 32), y = 20 + rnd() * (H - 90);
      if (!free(x, y, 22) || !clear(x, y, 14)) continue;
      const a = rnd() * TAU, e = 6;
      for (let j = 0; j < 4; j++) dots += `<circle cx="${f(x + Math.cos(a + j * TAU / 4) * e)}" cy="${f(y + Math.sin(a + j * TAU / 4) * e)}" r="2.4" class="core"/>`;
      made++;
    }
    // zigzag stitched border along the bottom
    let zz = '';
    for (let x = 0, k = 0; x <= W + 30; x += 30, k++) zz += (k ? 'L' : 'M') + x + ',' + (H - 46 + (k % 2 ? -14 : 14));
    out += `<g style="--m:${m + 1}"><g class="rg" style="--r:0">${dots}</g><g class="rg" style="--r:3"><path d="${zz}" pathLength="1000" class="dash" stroke-dasharray="4 4"/></g></g>`;
    // Baked into a static image: a live SVG with a full-screen blur re-renders on every frame while anything
    // moves over it (that made this chapter stutter). As an <img> it is rasterised once and only fades in.
    const ink = 'rgb(238,240,243)';
    const doc = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W * 2}" height="${H * 2}">
      <style>path{fill:none;stroke:${ink};stroke-linecap:round}.core{fill:${ink};stroke:none}.dot{stroke-width:3.4}.dash{stroke-width:2.3}.ray{stroke-width:1.8}.halo path{stroke-width:8}</style>
      <defs><filter id="b" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="3"/></filter></defs>
      <g class="halo" opacity=".16" filter="url(#b)">${out}</g><g opacity=".3">${out}</g></svg>`;
    const im = new Image();
    im.className = 'shibori-img'; im.alt = ''; im.decoding = 'async'; im.setAttribute('aria-hidden', 'true');
    im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(doc.replace(/style="--[^"]*"/g, ''));
    svg.replaceWith(im);
  }

  // ---------- 徽州 lantern ----------
  // On 徽州's night pages (a dark tone) the mouse carries a faint lantern glow across the paper. It hides
  // over photographs, so they are never tinted.
  const Lantern = (() => {
    if (reduceMotion || !matchMedia('(hover: hover) and (pointer: fine)').matches) return null;
    const el = document.createElement('div'); el.className = 'lantern'; el.setAttribute('aria-hidden', 'true');
    document.body.appendChild(el);
    let x = -999, y = -999, cx = -999, cy = -999, raf = 0, over = false;
    const step = () => {
      cx += (x - cx) * 0.12; cy += (y - cy) * 0.12;
      el.style.transform = `translate3d(${cx.toFixed(1)}px,${cy.toFixed(1)}px,0)`;
      raf = Math.abs(x - cx) + Math.abs(y - cy) > 0.5 ? requestAnimationFrame(step) : 0;
    };
    addEventListener('pointermove', e => {
      if (e.pointerType !== 'mouse') return;
      x = e.clientX; y = e.clientY; if (cx < -900) { cx = x; cy = y; }
      const o = !!(e.target.closest && e.target.closest('.clip, .panel, .stack, .dawn, .roll, .next'));
      if (o !== over) { over = o; el.classList.toggle('off', o); }
      if (!raf) raf = requestAnimationFrame(step);
    }, { passive: true });
    return el;
  })();

  // ---------- auto-hiding chrome ----------
  // Scrolling down half a screen, or 5 s without input, hides the nav / caption HUD / project title card
  // (CSS: body.ui-off). Both scroll directions need half a screen of travel: down to hide, up to show.
  // Once hidden, only three things bring them back: a click / tap, scrolling up half a screen,
  // or moving the mouse into the top TOP_ZONE of the screen (where the nav lives).
  const IDLE_MS = 5000;
  const SHOW_UP = 0.5;   // fraction of the screen height to scroll up before the UI returns
  const HIDE_DOWN = 0.5; // … and to scroll down before it hides
  const TOP_ZONE = 0.2;  // mouse moves only count inside this top fraction of the screen
  let uiOff = false, idleTimer = 0, onTimer = 0, scrollRef = 0, upFrom = 0, downFrom = 0, lastPX = -1, lastPY = -1;
  let zoomed = null, touching = false, snapT = 0, snapRAF = 0;
  function setUI(off) {
    if (off === uiOff) return; uiOff = off;
    upFrom = downFrom = window.scrollY;
    document.body.classList.toggle('ui-off', off);
    document.body.classList.toggle('ui-on', !off);
    clearTimeout(onTimer);
    if (!off) onTimer = setTimeout(() => document.body.classList.remove('ui-on'), 850);
  }
  function poke() {
    if (zoomed) return;
    setUI(false);
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => { if (document.querySelector('.nav:hover, .hud:hover') || document.body.classList.contains('menu-open')) poke(); else setUI(true); }, IDLE_MS);
  }
  addEventListener('scroll', () => {
    const y = window.scrollY, d = y - scrollRef;
    if (Math.abs(d) < 6) return;
    scrollRef = y;
    lastScrollT = performance.now();
    if (snapRAF) { scrollRef = y; return; }   // our own gentle snap is not the reader scrolling
    queueSnap();
    if (rendering) { upFrom = downFrom = y; return; }
    if (d > 0) {   // scrolling down: hide only after HIDE_DOWN screens of downward travel
      upFrom = y; if (y < downFrom) downFrom = y;
      if (uiOff) return;
      if (y - downFrom >= innerHeight * HIDE_DOWN) { clearTimeout(idleTimer); setUI(true); } else poke();
      return;
    }
    downFrom = y;
    // Scrolling up: while hidden, only come back after SHOW_UP screens of upward travel
    // (measured from the lowest point reached), or on arriving at the very top.
    if (y > upFrom) upFrom = y;
    if (!uiOff || upFrom - y >= innerHeight * SHOW_UP || y <= 2) poke();
  }, { passive: true });
  // Mouse movement only counts in the top of the screen — and not the synthetic moves browsers
  // fire when the page scrolls under a still pointer.
  let lastScrollT = 0;
  addEventListener('pointermove', e => {
    if (e.pointerType === 'touch') return;
    if (lastPX < 0 || performance.now() - lastScrollT < 700) { lastPX = e.clientX; lastPY = e.clientY; return; }
    if (Math.hypot(e.clientX - lastPX, e.clientY - lastPY) < 4) return;
    lastPX = e.clientX; lastPY = e.clientY;
    if (e.clientY <= window.innerHeight * TOP_ZONE) poke();
  }, { passive: true });
  addEventListener('pointerdown', poke, { passive: true });
  // keyboard users: Tab moves focus into the nav, so it has to be visible
  addEventListener('keydown', e => { if (e.key === 'Tab') poke(); });

  // ---------- rim colour ----------
  // ---------- video + YouTube ----------
  function playMedia(el, on) {
    if (el.tagName === 'VIDEO') { if (on) { const p = el.play(); if (p) p.catch(() => {}); } else el.pause(); return; }
    let f = el.querySelector('iframe');
    if (!f) {   // the YouTube player is only created the first time it comes on screen
      if (!on) return;
      const id = el.dataset.yt, origin = /^https?:/.test(location.origin) ? '&origin=' + encodeURIComponent(location.origin) : '';
      const quiet = el.classList.contains('bleed') ? '&controls=0&disablekb=1&fs=0&iv_load_policy=3&cc_load_policy=0' : '';
      f = document.createElement('iframe');
      f.src = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&mute=1&playsinline=1&loop=1&playlist=${id}&rel=0&modestbranding=1&enablejsapi=1${quiet}${origin}`;
      if (quiet) { f.tabIndex = -1; f.setAttribute('aria-hidden', 'true'); }
      f.title = 'YouTube video'; f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen'; f.allowFullscreen = true;
      el.appendChild(f); return;
    }
    if (f.contentWindow) f.contentWindow.postMessage(JSON.stringify({ event: 'command', func: on ? 'playVideo' : 'pauseVideo', args: [] }), '*');
  }
  // full-width film: click (or Enter) opens a full-screen player with sound and controls; leaving full screen closes it
  function openFilm(sec) {
    const id = sec.dataset.ytOpen, quiet = $('.clip.yt', sec); if (!id || document.querySelector('.ytmodal')) return;
    playMedia(quiet, false);
    const box = document.createElement('div'); box.className = 'ytmodal';
    box.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${id}?autoplay=1&playsinline=0&rel=0&modestbranding=1" title="YouTube video" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe><button class="ytclose" type="button" aria-label="Close">Close ✕</button>`;
    document.body.appendChild(box); setUI(true);
    const close = () => { if (!box.isConnected) return; box.remove(); if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); playMedia(quiet, true); poke(); };
    $('.ytclose', box).addEventListener('click', close);
    const fs = box.requestFullscreen || box.webkitRequestFullscreen;
    if (fs) { const r = fs.call(box); if (r && r.catch) r.catch(() => {}); }
    const onfs = () => { if (!document.fullscreenElement && !document.webkitFullscreenElement) { document.removeEventListener('fullscreenchange', onfs); document.removeEventListener('webkitfullscreenchange', onfs); close(); } };
    setTimeout(() => { document.addEventListener('fullscreenchange', onfs); document.addEventListener('webkitfullscreenchange', onfs); }, 400);
    box._close = close;
  }
  document.addEventListener('click', e => { const sec = e.target.closest && e.target.closest('[data-yt-open]'); if (sec) openFilm(sec); });
  addEventListener('keydown', e => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('[data-yt-open]')) { e.preventDefault(); openFilm(e.target); }
    if (e.key === 'Escape') { const m = document.querySelector('.ytmodal'); if (m && m._close) m._close(); }
  });
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('.snd'); if (!b) return;
    const v = b.parentElement.querySelector('video'); if (!v) return;
    v.muted = !v.muted; b.classList.toggle('on', !v.muted);
    if (v.paused) v.play().catch(() => {});
  });

  // ---------- gentle snap ----------
  // No CSS scroll-snap. Once scrolling has come to rest within SNAP_NEAR of a full-screen panel's
  // exact fit, ease the last few pixels into place. Any new input cancels it.
  // Full-width photos (.wide) are not screen-high, so they snap by their middle to the middle of the screen.
  const SNAP_NEAR = 0.1;
  function cancelSnap() { clearTimeout(snapT); if (snapRAF) { cancelAnimationFrame(snapRAF); snapRAF = 0; } }
  function queueSnap() { clearTimeout(snapT); snapT = setTimeout(trySnap, 180); }
  function trySnap() {
    if (rendering || zoomed || touching || reduceMotion || snapRAF || Smooth.busy()) return;
    const vh = window.innerHeight; let best = null;
    for (const p of panels) {
      if (p.el === nextEl) continue;
      const r = p.el.getBoundingClientRect();
      const top = p.el.classList.contains('wide') ? r.top + r.height / 2 - vh / 2 : r.top, a = Math.abs(top);
      if (a >= 1 && a <= vh * SNAP_NEAR && (best === null || a < Math.abs(best))) best = top;
    }
    if (best === null) return;
    const from = window.scrollY, t0 = performance.now(), dur = 560;
    const step = t => {
      const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      window.scrollTo(0, from + best * e);
      snapRAF = k < 1 ? requestAnimationFrame(step) : 0;
    };
    snapRAF = requestAnimationFrame(step);
  }
  addEventListener('wheel', cancelSnap, { passive: true });
  addEventListener('keydown', cancelSnap);
  addEventListener('pointerdown', cancelSnap, { passive: true });

  // ---------- click any photo to view it full screen ("zoom mode") ----------
  // Framed photos, full-screen photos, the album cover and time stacks. (Home-page panels are links to
  // albums, and videos need their own clicks, so those are left out.)
  const ZOOMABLE = '.frame.in:not(.media) .clip, .panel.shot:not(.media) .bg, .panel.cover .bg, .dawn .bg';
  // Where the photo sits on the page right now: the whole (uncropped) picture as a uniformly scaled
  // transform, plus a clip-path for the part that is actually visible — so cropped full-screen
  // photos grow out of exactly what you clicked, without stretching.
  const zoomFrom = (z) => {
    const im = z.im, r = im.getBoundingClientRect(), nw = im.naturalWidth || z.w, nh = im.naturalHeight || z.h;
    const sc = Math.max(r.width / nw, r.height / nh), dw = nw * sc, dh = nh * sc;
    const f = (im.style.objectPosition || '50% 50%').split(' ').map(parseFloat);
    const fx = isNaN(f[0]) ? 0.5 : f[0] / 100, fy = isNaN(f[1]) ? 0.5 : f[1] / 100;
    const L = r.left + (r.width - dw) * fx, T = r.top + (r.height - dh) * fy, k = dw / z.w;
    const c = z.src.getBoundingClientRect();
    const vl = Math.max(r.left, c.left, 0), vt = Math.max(r.top, c.top, 0);
    const vr = Math.min(r.right, c.right, window.innerWidth), vb = Math.min(r.bottom, c.bottom, window.innerHeight);
    const ins = [(vt - T) / k, (L + dw - vr) / k, (T + dh - vb) / k, (vl - L) / k].map(v => Math.max(0, v).toFixed(1) + 'px');
    return { t: `translate(${(L - z.x).toFixed(1)}px, ${(T - z.y).toFixed(1)}px) scale(${k.toFixed(5)})`, c: `inset(${ins.join(' ')})` };
  };
  const OPEN_CLIP = 'inset(0px 0px 0px 0px)';
  function openZoom(clip) {
    const imgs = $$('img', clip);
    const im = clip.classList.contains('layers') ? imgs.slice().reverse().find(x => +x.style.opacity >= 0.5) || imgs[0] : imgs[0];
    if (!im || zoomed) return;
    const vw = window.innerWidth, vh = window.innerHeight, r = clip.getBoundingClientRect();
    const ar = (im.naturalWidth / im.naturalHeight) || (r.width / r.height);
    let w = vw, h = vw / ar; if (h > vh) { h = vh; w = vh * ar; }
    const box = document.createElement('div'); box.className = 'zoom';
    const big = new Image(); big.src = im.currentSrc || im.src; big.alt = im.alt; big.draggable = false;
    const z = { box, big, src: clip, im, w, h, x: (vw - w) / 2, y: (vh - h) / 2 };
    const from = zoomFrom(z);
    Object.assign(big.style, { width: w + 'px', height: h + 'px', left: z.x + 'px', top: z.y + 'px', transform: from.t, clipPath: from.c });
    box.appendChild(big); document.body.appendChild(box);
    clip.style.visibility = 'hidden';
    void box.offsetWidth;
    box.classList.add('open'); big.style.transform = 'none'; big.style.clipPath = OPEN_CLIP;
    cancelSnap(); clearTimeout(idleTimer); setUI(true); zoomed = z;
    // zoom mode: the mouse becomes a glass magnifier once the photo has settled
    setTimeout(() => { if (zoomed === z) { z.ready = true; box.classList.add('lensing'); Lens.attach(big); if (z.mx !== undefined) Lens.move(z.mx, z.my); } }, 660);
    // it opens on the display copy (already loaded), then swaps in the full-size original for the magnifier
    if (im.dataset.full && im.dataset.full !== big.src) {
      const full = new Image(); full.src = im.dataset.full;
      (full.decode ? full.decode() : Promise.resolve()).then(() => {
        if (zoomed !== z) return;
        big.src = full.src;
        if (z.ready) { Lens.attach(big); if (z.mx !== undefined) Lens.move(z.mx, z.my); }
      }).catch(() => {});
    }
    box.addEventListener('pointermove', e => {
      if (e.pointerType !== 'mouse') return;
      z.mx = e.clientX; z.my = e.clientY; if (z.ready) Lens.move(e.clientX, e.clientY);
    });
    box.addEventListener('pointerleave', () => Lens.hide());
  }
  // quiet = closed by scrolling, so the chrome stays hidden
  function closeZoom(now, quiet) {
    const z = zoomed; if (!z) return; zoomed = null;
    Lens.detach();
    const done = () => { z.src.style.visibility = ''; z.box.remove(); };
    if (now === true || !z.src.isConnected) { done(); return; }
    const to = zoomFrom(z); z.big.style.transform = to.t; z.big.style.clipPath = to.c; z.box.classList.remove('open', 'lensing');
    setTimeout(done, 640); if (!quiet) poke();
  }
  document.addEventListener('click', e => {
    if (zoomed) { closeZoom(); return; }
    const zb = e.target.closest && e.target.closest('[data-zoom]');
    if (zb) { const bg = $('.bg', zb.closest('.panel')); if (bg) openZoom(bg); return; }
    const clip = e.target.closest && e.target.closest(ZOOMABLE); if (clip) openZoom(clip);
  });
  addEventListener('keydown', e => { if (zoomed && e.key === 'Escape') closeZoom(); });
  addEventListener('wheel', () => { if (zoomed) closeZoom(false, true); }, { passive: true });
  addEventListener('touchmove', () => { if (zoomed) closeZoom(false, true); }, { passive: true });

  // ---------- zoom-mode magnifier ----------
  // A round piece of clear glass, nothing painted on top of it:
  //   centre — the photo at 2×
  //   rim    — refraction like the edge of a glass bead: the image is squeezed and pulled in from
  //            beyond the lens (it "sees round" the edge), and red / green / blue bend by different
  //            amounts, so the rim splits into rainbow fringes (dispersion).
  // The photo is read into memory once when zoom mode opens; after that each frame is only
  // a table lookup per pixel (the table is built once per screen density).
  const Lens = (() => {
    const R = 144;          // lens radius, css px
    const B = 33;           // width of the refracting rim
    const M = 2;            // magnification in the centre
    const EDGE = 1.5;       // at the very edge the rim samples the photo this many radii away
    const DISPERSION = 0.32; // how far red and blue separate, relative to how much the rim bends
    const LEVELS = 4;       // the photo is kept at full, ½, ¼ and ⅛ resolution; squeezed rim pixels read
                            // from a smaller (pre-averaged) copy so they shimmer instead of sparkling
    let cv = null, ctx, out, alpha, lvl, ofs = null, size = 0, dpr = 0, mq = 0;
    let im = null, mips = null, q = 1, x = 0, y = 0, raf = 0, on = false;

    function canvas() {
      const d = Math.min(2, window.devicePixelRatio || 1);
      if (cv && d === dpr) return; dpr = d; mq = 0;
      size = Math.round(2 * R * dpr);
      if (!cv) { cv = document.createElement('canvas'); cv.className = 'lens'; ctx = cv.getContext('2d'); }
      cv.width = cv.height = size; cv.style.width = cv.style.height = 2 * R + 'px';
      out = ctx.createImageData(size, size);
    }
    // per output pixel and colour channel: where to read in the photo, as an offset from the pointer
    function table() {
      if (mq === q) return; mq = q;
      ofs = new Int32Array(size * size * 6); alpha = new Uint8Array(size * size); lvl = new Uint8Array(size * size);
      const c = size / 2, r0 = R - B, s0 = r0 / M, sMax = R * EDGE;
      const a = B / (M * (sMax - s0));   // keeps the rim's slope equal to the centre's where they meet
      for (let py = 0; py < size; py++) for (let pxl = 0; pxl < size; pxl++) {
        const i = py * size + pxl, dx = (pxl + 0.5 - c) / dpr, dy = (py + 0.5 - c) / dpr, d = Math.hypot(dx, dy);
        const al = Math.max(0, Math.min(1, R - d + 0.5)); alpha[i] = Math.round(al * 255);
        if (!al) continue;
        let s = d / M, split = 0, squeeze = 1 / M;
        if (d > r0) {
          const u = Math.min(0.9999, (d - r0) / B);
          s = s0 + (sMax - s0) * (a * u + (1 - a) * (1 - Math.sqrt(1 - u * u)));
          split = DISPERSION * (s - d) * u;   // dispersion grows with the bending
          squeeze = Math.max(s / d, (sMax - s0) / B * (a + (1 - a) * u / Math.sqrt(1 - u * u)));
        }
        // photo pixels covered by one lens pixel → which copy of the photo to read
        const L = Math.max(0, Math.min(LEVELS - 1, Math.floor(Math.log2(Math.max(1, squeeze * q / dpr)))));
        lvl[i] = L; const k = q / (1 << L);
        for (let ch = 0; ch < 3; ch++) {
          const f = d > 0 ? (s + (ch - 1) * split) / d : 0;
          ofs[i * 6 + ch * 2] = Math.round(dx * f * k);
          ofs[i * 6 + ch * 2 + 1] = Math.round(dy * f * k);
        }
      }
    }
    // read the photo once, at the resolution the 2× centre needs (capped to keep memory sane)
    function source() {
      const r = im.getBoundingClientRect();
      q = Math.min(M * dpr, im.naturalWidth / r.width);
      if (r.width * q * r.height * q > 14e6) q = Math.sqrt(14e6 / (r.width * r.height));
      mips = []; let prev = im;
      for (let L = 0; L < LEVELS; L++) {
        const w = Math.max(1, Math.round(r.width * q / (1 << L))), h = Math.max(1, Math.round(r.height * q / (1 << L)));
        const b = document.createElement('canvas'); b.width = w; b.height = h;
        const bx = b.getContext('2d', { willReadFrequently: true });
        bx.imageSmoothingQuality = 'high'; bx.drawImage(prev, 0, 0, w, h);
        try { mips.push({ d: bx.getImageData(0, 0, w, h).data, w, h }); } catch (e) { mips = null; return; }
        prev = b;
      }
    }
    function paint() {
      raf = 0; if (!on || !im || !im.naturalWidth) return;
      if (!mips) { source(); if (!mips) return; }
      table();
      const r = im.getBoundingClientRect();
      const cxs = mips.map((mp, L) => Math.round((x - r.left) * q / (1 << L))), cys = mips.map((mp, L) => Math.round((y - r.top) * q / (1 << L)));
      const o = out.data, n = size * size, BG = [8, 8, 10];   // beyond the photo: the zoom backdrop
      for (let i = 0, j = 0, m = 0; i < n; i++, j += 4, m += 6) {
        const al = alpha[i]; o[j + 3] = al; if (!al) continue;
        const L = lvl[i], mp = mips[L], pw = mp.w, ph = mp.h, px = mp.d, cx = cxs[L], cy = cys[L];
        for (let ch = 0; ch < 3; ch++) {
          const sx = cx + ofs[m + ch * 2], sy = cy + ofs[m + ch * 2 + 1];
          o[j + ch] = sx < 0 || sy < 0 || sx >= pw || sy >= ph ? BG[ch] : px[(sy * pw + sx) * 4 + ch];
        }
      }
      ctx.putImageData(out, 0, 0);
      cv.style.transform = `translate3d(${x - R}px, ${y - R}px, 0)`;
    }
    return {
      attach(img) { canvas(); im = img; mips = null; document.body.appendChild(cv); },
      detach() { on = false; im = null; mips = null; if (cv) { cv.classList.remove('on'); setTimeout(() => { if (!im && cv) cv.remove(); }, 260); } },
      hide() { on = false; if (cv) cv.classList.remove('on'); },
      move(mx, my) {
        if (!im || !cv) return;
        const r = im.getBoundingClientRect();
        if (mx < r.left || mx > r.right || my < r.top || my > r.bottom) { this.hide(); return; }
        x = mx; y = my; on = true; cv.classList.add('on');
        if (!raf) raf = requestAnimationFrame(paint);
      },
    };
  })();
  addEventListener('resize', () => closeZoom(true));

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
  }
  boot();
})();
