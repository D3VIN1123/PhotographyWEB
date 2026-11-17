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
  const tabsScroll = $('#tabs-scroll'), lens = $('#tabs-lens');

  // ---------- data ----------
  let content = { site: {}, hero: {}, projects: [] };
  let projects = [];
  // a project's "photos" are modules: image (default), stack (time layers), video (uploaded file), youtube
  const kindOf = ph => (ph && ph.type) || 'image';
  const visual = ph => ph && (kindOf(ph) === 'image' || kindOf(ph) === 'stack') && ph.src;
  const coverOf = p => p && ((p.photos || []).find(x => x.id === p.cover && visual(x)) || (p.photos || []).find(visual)) || null;
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
    <section class="panel hero grow" data-plx="8">
      <div class="bg">${img(h.image, '', true)}</div><div class="shade"></div>
      <div class="card glass" data-lg="46">
        ${h.kicker ? `<div class="kicker reveal"><i></i>${esc(h.kicker)}</div>` : ''}
        <h1 class="reveal" style="--d:1">${text(h.title)}</h1>
        ${h.body ? `<p class="lead reveal" style="--d:2">${text(h.body)}</p>` : ''}
        ${h.label && h.url ? `<a class="btn reveal" style="--d:3" href="${esc(h.url)}"${ext}>${esc(h.label)}${ARROW}</a>` : ''}
      </div>
      ${projects.length ? '<div class="scroll-hint"><span>Gallery</span><i></i></div>' : ''}
    </section>`;
    // paper interlude: statement that lights up word by word, then the list of albums
    const intro = site.intro || site.tagline || '';
    if (projects.length) {
      const names = projects.map(p => `<span>${esc(p.title)}</span>`).join('<i>—</i>') + '<i>—</i>';
      html += `
    <section class="paper intro">
      <div class="label reveal">A photographic record<b>${pad2(projects.length)} album${projects.length === 1 ? '' : 's'}</b></div>
      ${intro ? `<p class="statement words">${words(intro)}</p>` : ''}
      <div class="index">
        ${projects.map((p, i) => `<a class="reveal" style="--d:${i}" href="#/p/${esc(p.slug)}"><b>№${pad2(i + 1)}</b><span class="t">${esc(p.title)}</span><span class="s">${esc(p.subtitle || '')}</span><span class="n">${plural((p.photos || []).length)} ${ARROW}</span></a>`).join('')}
      </div>
    </section>
    <div class="paper marquee" aria-hidden="true"><div class="track">${names}${names}${names}${names}</div></div>`;
    }
    projects.forEach((p, i) => {
      const n = (p.photos || []).length;
      html += `
    <a class="panel proj grow" id="proj-${esc(p.slug)}" href="#/p/${esc(p.slug)}" data-plx="8">
      <div class="bg">${img(coverOf(p), '', i === 0)}</div><div class="shade"></div>
      <div class="card glass" data-lg="40">
        <div class="idx reveal">Album ${pad2(i + 1)} / ${pad2(projects.length)}</div>
        <h2 class="reveal" style="--d:1">${esc(p.title)}</h2>
        ${p.subtitle ? `<p class="sub reveal" style="--d:2">${esc(p.subtitle)}</p>` : ''}
        <div class="row reveal" style="--d:3"><span>${plural(n)}</span><span class="open">Open album ${ARROW}</span></div>
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
    <footer class="paper foot">
      <div class="label reveal">Afterword</div>
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
    for (let i = 0; i < photos.length; i++) {
      const p = photos[i], lay = p.layout || 'auto';
      if (kindOf(p) !== 'image') { out.push({ type: kindOf(p), items: [p], from: i }); alt = 0; continue; }
      if (lay === 'fill' || (lay === 'auto' && !isPortrait(p) && alt === 0)) {
        out.push({ type: 'full', items: [p], from: i }); if (lay === 'auto') alt = 1; continue;
      }
      if (lay === 'auto' && auto(photos[i + 1])) { out.push({ type: 'pair', items: [p, photos[i + 1]], from: i }); i++; }
      else out.push({ type: 'single', items: [p], from: i });
      alt = 0;
    }
    return out;
  }

  const frame1 = (ph, i) => `<figure class="frame${isPortrait(ph) ? ' tall' : ''}" style="--ar:${((+ph.w || 3) / (+ph.h || 2)).toFixed(3)}">` +
    `<div class="clip" style="aspect-ratio:${+ph.w || 3}/${+ph.h || 2}">${img(ph)}</div>` +
    `<figcaption><b>№${pad2(i + 1)}</b>${esc(ph.caption || '')}</figcaption></figure>`;

  // Time stack: the frame stays pinned while scrolling cross-fades layer to layer.
  // Halfway through a fade both photos show at 50 % — an average, like a slow double exposure.
  function stackHTML(x, i) {
    const L = (x.layers || []).filter(l => l && l.src); if (!L.length) return '';
    const full = x.layout === 'fill', w = +L[0].w || 3, h = +L[0].h || 2;
    const layers = L.map((l, j) => `<img class="layer" src="${esc(l.src)}" alt="${esc(l.label || x.caption || '')}" data-label="${esc(l.label || '')}" style="opacity:${j ? 0 : 1};${pos(x)}" loading="lazy" decoding="async" draggable="false">`).join('');
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

  const SOUND = '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 6h2.2L8 3.2v9.6L4.7 10H2.5z"/><path class="on" d="M10.6 5.6a3.4 3.4 0 0 1 0 4.8M12.4 3.8a6 6 0 0 1 0 8.4"/><path class="off" d="M10.5 6l4 4M14.5 6l-4 4"/></svg>';
  // Uploaded video or YouTube link. Both start muted when they come on screen and pause when they leave.
  function mediaHTML(x, i, total, side) {
    const w = +x.w || 16, h = +x.h || 9, cap = esc(x.caption || '');
    if (kindOf(x) === 'youtube') {
      const id = String(x.yt || '').match(/^[\w-]{11}$/) ? x.yt : ''; if (!id) return '';
      return `
    <section class="paper spread single media ${side}"><figure class="frame media" style="--ar:${(w / h).toFixed(3)}">
      <div class="clip yt" style="aspect-ratio:${w}/${h}" data-yt="${id}"></div>
      <figcaption><b>№${pad2(i + 1)}</b>${cap}</figcaption></figure></section>`;
    }
    if (!x.src) return '';
    const vid = cls => `<video class="${cls}" src="${esc(x.src)}"${x.thumb ? ` poster="${esc(x.thumb)}"` : ''} muted loop playsinline preload="metadata" style="${pos(x)}"></video>` +
      `<button class="snd glass" type="button" aria-label="Sound">${SOUND}<span>Sound</span></button>`;
    if (x.layout === 'fill') {
      return `<section class="panel shot grow media" data-count="${pad2(i + 1)}" data-total="${pad2(total)}" data-cap="${cap}"><div class="bg">${vid('cover')}</div></section>`;
    }
    return `
    <section class="paper spread single media ${side}"><figure class="frame media" style="--ar:${(w / h).toFixed(3)}">
      <div class="clip" style="aspect-ratio:${w}/${h}">${vid('')}</div>
      <figcaption><b>№${pad2(i + 1)}</b>${cap}</figcaption></figure></section>`;
  }

  function projectHTML(p) {
    const photos = p.photos || [], total = photos.length, idx = projects.indexOf(p);
    const next = projects.length > 1 ? projects[(idx + 1) % projects.length] : null;
    let html = `
    <section class="panel cover grow" data-plx="8">
      <div class="bg">${img(coverOf(p), '', true)}</div><div class="shade"></div>
      <div class="card glass" data-lg="46">
        <div class="kicker reveal">Album ${pad2(idx + 1)}</div>
        <h1 class="reveal" style="--d:1">${esc(p.title)}</h1>
        <div class="meta reveal" style="--d:2">
          ${p.subtitle ? `<span class="chip">${esc(p.subtitle)}</span>` : ''}
          <span class="chip">${plural(total)}</span>
        </div>
      </div>
      ${total ? '<div class="scroll-hint"><span>Scroll</span><i></i></div>' : ''}
    </section>`;
    if (p.description) {
      html += `
    <section class="paper preface">
      <div class="label reveal">Album ${pad2(idx + 1)}<b>${esc(p.subtitle || plural(total))}</b></div>
      <p class="statement words">${words(p.description)}</p>
    </section>`;
    }
    let pairs = 0, singles = 0;
    for (const s of layoutShots(photos)) {
      if (s.type === 'full') {
        const x = s.items[0];
        html += `<section class="panel shot grow" data-plx="5" data-count="${pad2(s.from + 1)}" data-total="${pad2(total)}" data-cap="${esc(x.caption || '')}"><div class="bg">${img(x)}</div></section>`;
      } else if (s.type === 'pair') {
        const [a, b] = s.items, kind = isPortrait(a) && isPortrait(b) ? 'pp' : isPortrait(a) ? 'pl' : isPortrait(b) ? 'lp' : (pairs % 2 ? 'sl' : 'ls');
        pairs++;
        if (kind === 'ls' || kind === 'sl') {   // two landscapes: pinned while they trade sizes
          const ar = Math.max((+a.w || 3) / (+a.h || 2), (+b.w || 3) / (+b.h || 2)).toFixed(3);
          html += `<section class="paper spread pair swap ${kind}" style="--ar:${ar}"><div class="stick">${frame1(a, s.from)}${frame1(b, s.from + 1)}</div></section>`;
        } else html += `<section class="paper spread pair ${kind}">${frame1(a, s.from)}${frame1(b, s.from + 1)}</section>`;
      } else if (s.type === 'stack') {
        html += stackHTML(s.items[0], s.from);
      } else if (s.type === 'video' || s.type === 'youtube') {
        html += mediaHTML(s.items[0], s.from, total, singles++ % 2 ? 'r' : 'l');
      } else {
        html += `<section class="paper spread single ${singles++ % 2 ? 'r' : 'l'}">${frame1(s.items[0], s.from)}</section>`;
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
  let stacks = [], mediaIO = null;
  let panels = [], papers = [], wordSets = [], swaps = [], onLight = false, nextEl = null, revealIO = null;
  const progress = $('#progress');

  function parse() {
    const m = location.hash.match(/^#\/p\/(.+)$/);
    if (m) { const p = projects.find(x => x.slug === decodeURIComponent(m[1])); if (p) return { type: 'project', project: p, hash: '#/p/' + p.slug }; }
    return { type: 'home', hash: '#/' };
  }

  async function render() {
    if (rendering) return; rendering = true;
    const r = parse(), skip = instant; instant = false;
    cancelSnap(); closeZoom(true);
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
    rendering = false; scrollRef = window.scrollY;
    if (!skip) poke();   // after the keep-scrolling hand-off the reader is still scrolling down: leave the chrome as it was
    if (parse().hash !== r.hash) render();
  }

  function setupView() {
    if (revealIO) revealIO.disconnect();
    revealIO = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); revealIO.unobserve(e.target); } }), { threshold: 0.25 });
    panels = $$('.panel, .next', view).map(el => ({
      el, plx: reduceMotion ? 0 : (+el.dataset.plx || 0) / 100, imgs: $$('.bg img', el), all: $$('img', el), shot: el.classList.contains('shot'),
      grow: !reduceMotion && el.classList.contains('grow'), f: -1,
    }));
    panels.forEach(p => revealIO.observe(p.el));
    $$('.frame, .paper .reveal', view).forEach(el => revealIO.observe(el));
    papers = $$('.paper', view);
    swaps = $$('.spread.swap', view).map(el => ({ el, stick: $('.stick', el), sl: el.classList.contains('sl'), s: -1 }));
    stacks = $$('.stack', view).map(el => ({ el, imgs: $$('img.layer', el), when: $('.when', el), ticks: $$('.ticks i', el), ops: [], cur: 0 }));
    if (mediaIO) mediaIO.disconnect();
    mediaIO = new IntersectionObserver(es => es.forEach(e => playMedia(e.target, e.isIntersecting)), { threshold: 0.35 });
    $$('video, .clip.yt', view).forEach(el => mediaIO.observe(el));
    wordSets = $$('.words', view).map(el => ({ el, ws: $$('.w', el), n: -1 }));
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
        // framed → full-bleed: a panel sits inside paper margins until it is centred
        if (p.grow) {
          const k = Math.min(1, Math.max(0, (Math.abs(r.top) / vh - 0.1) / 0.6)), f = +(k * k * (3 - 2 * k)).toFixed(3);
          if (f !== p.f) { p.f = f; p.el.style.setProperty('--f', f); }
        }
      }
      updateHud(current);
      // is the nav sitting on paper? then it switches to dark ink
      let light = false;
      for (const el of papers) { const r = el.getBoundingClientRect(); if (r.top <= 42 && r.bottom > 42) { light = true; break; } }
      if (light !== onLight) { onLight = light; document.body.classList.toggle('on-light', light); }
      // statements light up word by word
      for (const s of wordSets) {
        const r = s.el.getBoundingClientRect(); if (r.bottom < -200 || r.top > vh + 200) continue;
        const k = reduceMotion ? 1 : (vh * 0.88 - r.top) / (r.height + vh * 0.38);
        const n = Math.max(0, Math.min(s.ws.length, Math.round(k * s.ws.length)));
        if (n !== s.n) { s.n = n; s.ws.forEach((w, i) => w.classList.toggle('on', i < n)); }
      }
      // paired landscapes: hold, trade sizes, hold (rewinds when scrolling back up)
      const canSwap = !reduceMotion && window.innerWidth > 760;
      for (const w of swaps) {
        const r = w.el.getBoundingClientRect(); if (r.bottom < -100 || r.top > vh + 100) continue;
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
      // time stacks: hold, cross-fade, hold … across the pinned scroll distance
      for (const st of stacks) {
        const r = st.el.getBoundingClientRect(), n = st.imgs.length; if (r.bottom < -100 || r.top > vh + 100 || n < 2) continue;
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
      const max = document.documentElement.scrollHeight - vh;
      progress.style.transform = `scaleX(${max > 0 ? Math.min(1, y / max).toFixed(4) : 0})`;
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
    idleTimer = setTimeout(() => { if (document.querySelector('.nav .glass:hover, .hud:hover')) poke(); else setUI(true); }, IDLE_MS);
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
      f = document.createElement('iframe');
      f.src = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&mute=1&playsinline=1&loop=1&playlist=${id}&rel=0&modestbranding=1&enablejsapi=1${origin}`;
      f.title = 'YouTube video'; f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen'; f.allowFullscreen = true;
      el.appendChild(f); return;
    }
    if (f.contentWindow) f.contentWindow.postMessage(JSON.stringify({ event: 'command', func: on ? 'playVideo' : 'pauseVideo', args: [] }), '*');
  }
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('.snd'); if (!b) return;
    const v = b.parentElement.querySelector('video'); if (!v) return;
    v.muted = !v.muted; b.classList.toggle('on', !v.muted);
    if (v.paused) v.play().catch(() => {});
  });

  // ---------- gentle snap ----------
  // No CSS scroll-snap. Once scrolling has come to rest within SNAP_NEAR of a full-screen panel's
  // exact fit, ease the last few pixels into place. Any new input cancels it.
  const SNAP_NEAR = 0.1;
  function cancelSnap() { clearTimeout(snapT); if (snapRAF) { cancelAnimationFrame(snapRAF); snapRAF = 0; } }
  function queueSnap() { clearTimeout(snapT); snapT = setTimeout(trySnap, 180); }
  function trySnap() {
    if (rendering || zoomed || touching || reduceMotion || snapRAF) return;
    const vh = window.innerHeight; let best = null;
    for (const p of panels) {
      if (p.el === nextEl) continue;
      const top = p.el.getBoundingClientRect().top, a = Math.abs(top);
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
  const ZOOMABLE = '.frame.in:not(.media) .clip, .panel.shot:not(.media) .bg, .panel.cover .bg';
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
