/* ============================================================
   Backstage (admin) — edits public/data/content.json through server.py
   One document (`doc`) is held in memory; every change autosaves it.
   Inputs use data-bind="path.to.field"; buttons use data-act="name".
   ============================================================ */
(() => {
  'use strict';
  const app = document.getElementById('app'), toastEl = document.getElementById('toast');
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const url = src => src ? '/' + String(src).replace(/^\//, '') : '';
  const MAX_EDGE = 5120;   // longest side of published photos, px
  const THUMB_EDGE = 640;

  let doc = null, sel = 'hero', saveTimer = 0, saving = false, queued = false, busy = false;

  // ---------- api ----------
  async function api(method, path, body, raw) {
    const opt = { method, headers: {}, credentials: 'same-origin' };
    if (raw) opt.body = body;
    else if (body !== undefined) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
    const res = await fetch(path, opt);
    let data = {};
    try { data = await res.json(); } catch (e) { /* non-json */ }
    if (res.status === 401 && path !== '/api/login') { gate('login'); throw new Error('Please log in again.'); }
    if (!res.ok) throw new Error(data.error || ('Request failed (' + res.status + ')'));
    return data;
  }
  function toast(msg) { toastEl.textContent = msg; toastEl.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => toastEl.classList.remove('show'), 2600); }

  // ---------- saving ----------
  function setStatus(kind, label) { const el = document.getElementById('status'); if (el) { el.className = 'status ' + kind; el.textContent = label; } }
  function dirty(now) { setStatus('dirty', '未保存 Unsaved…'); clearTimeout(saveTimer); saveTimer = setTimeout(save, now ? 0 : 700); }
  async function save() {
    if (saving) { queued = true; return; }
    saving = true; fixSlugs();
    try { await api('PUT', '/api/content', doc); setStatus('', '已保存 Saved'); }
    catch (e) { setStatus('error', '保存失败 ' + e.message); }
    saving = false;
    if (queued) { queued = false; save(); }
  }
  function slugify(s) { return String(s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); }
  function fixSlugs() {
    const seen = new Set();
    for (const p of doc.projects) {
      let s = slugify(p.slug) || 'project-' + p.id.slice(-4), base = s, n = 2;
      while (seen.has(s)) s = base + '-' + n++;
      seen.add(s); p.slug = s;
    }
  }

  // ---------- path binding ----------
  function setPath(path, value) {
    const keys = path.split('.'); let o = doc;
    for (let i = 0; i < keys.length - 1; i++) o = o[keys[i]];
    o[keys[keys.length - 1]] = value;
  }
  const project = () => doc.projects.find(p => p.id === sel);
  const coverOf = p => p && (p.photos.find(x => x.id === p.cover) || p.photos[0]);

  // ---------- gate (setup / login) ----------
  function gate(mode, state) {
    doc = null;
    const setup = mode === 'setup';
    if (setup && state && !state.canSetup) {
      app.innerHTML = `<div class="gate"><form><h1>Backstage</h1><p>No admin password yet. Set the <b>ADMIN_PASSWORD</b> environment variable on the server, or create the password on your own computer first.</p></form></div>`;
      return;
    }
    app.innerHTML = `<div class="gate"><form id="gate">
      <h1>${setup ? '创建密码 Create password' : '后台 Backstage'}</h1>
      <p>${setup ? '第一次使用：设置一个后台密码（至少 6 位）。' : '输入密码进入后台。 Enter your password.'}</p>
      <label class="field"><span>密码 Password</span><input type="password" name="pw" autocomplete="${setup ? 'new-password' : 'current-password'}" autofocus></label>
      <div class="err" id="gate-err"></div>
      <button class="btn primary block">${setup ? '创建并进入 Create' : '登录 Log in'}</button>
    </form></div>`;
    document.getElementById('gate').addEventListener('submit', async e => {
      e.preventDefault();
      try { await api('POST', setup ? '/api/setup' : '/api/login', { password: e.target.pw.value }); await load(); }
      catch (err) { document.getElementById('gate-err').textContent = err.message; }
    });
  }

  async function load() {
    doc = await api('GET', '/api/content');
    doc.site = doc.site || {}; doc.hero = doc.hero || { mode: 'project' }; doc.projects = doc.projects || [];
    doc.projects.forEach(p => { p.photos = p.photos || []; p.id = p.id || uid(); });
    render();
  }

  // ---------- render ----------
  function render() {
    const y = window.scrollY;
    app.innerHTML = `<div class="shell">${sideHTML()}<main class="main">${sel === 'hero' ? heroHTML() : sel === 'site' ? siteHTML() : projectHTML()}</main></div>`;
    window.scrollTo(0, y);
    if (sel === 'hero') updatePreview();
  }

  function sideHTML() {
    return `<aside class="side">
      <div class="logo">${esc(doc.site.title || 'Backstage')}<small>后台 Backstage</small></div>
      <button class="item ${sel === 'hero' ? 'on' : ''}" data-act="go" data-id="hero"><span class="ico">★</span><span class="name">常驻页面 Top page</span></button>
      <div class="label">Projects 项目 <span style="float:right;text-transform:none;letter-spacing:0;font-weight:400">拖动排序</span></div>
      ${doc.projects.map((p, i) => {
        const c = coverOf(p);
        return `<button class="item ${sel === p.id ? 'on' : ''}" draggable="true" data-act="go" data-id="${p.id}" data-pi="${i}">
          <span class="ico" style="${c ? `background-image:url('${esc(url(c.thumb || c.src))}')` : ''}">${c ? '' : '▢'}</span>
          <span class="name">${esc(p.title || 'Untitled')}</span><span class="tag">${p.published === false ? '隐藏' : p.photos.length}</span></button>`;
      }).join('')}
      <button class="item add" data-act="add-project"><span class="ico">＋</span><span class="name">新建项目 Add a new project</span></button>
      <div class="grow"></div>
      <button class="item ${sel === 'site' ? 'on' : ''}" data-act="go" data-id="site"><span class="ico">⚙</span><span class="name">网站设置 Site settings</span></button>
      <a class="item" href="/" target="_blank"><span class="ico">↗</span><span class="name">查看网站 View site</span></a>
      <button class="item" data-act="logout"><span class="ico">⏻</span><span class="name">退出 Log out</span></button>
    </aside>`;
  }

  const top = (title, sub) => `<div class="top"><h1>${title}<small>${sub}</small></h1><span class="status" id="status">已保存 Saved</span></div>`;
  const field = (label, bind, value, o = {}) => `<label class="field ${o.full ? 'full' : ''}"><span>${label}</span>${
    o.area ? `<textarea data-bind="${bind}" placeholder="${esc(o.ph || '')}" rows="${o.rows || 3}">${esc(value || '')}</textarea>`
           : `<input type="text" data-bind="${bind}" value="${esc(value || '')}" placeholder="${esc(o.ph || '')}">`}</label>`;

  function heroHTML() {
    const h = doc.hero, isProj = h.mode === 'project';
    const p = doc.projects.find(x => x.id === h.projectId) || doc.projects[0];
    return `${top('常驻页面 Top page', '网站最上方的第一屏：用来发布最新内容、公告或任何信息。')}
    <div class="cardbox">
      <div class="preview" id="preview"><div class="pv-card"><div class="pv-k"></div><div class="pv-t"></div><div class="pv-b"></div><span class="pv-btn"></span></div></div>
      <div class="seg">
        <button class="${isProj ? 'on' : ''}" data-act="hero-mode" data-mode="project">推荐一个项目 Feature a project</button>
        <button class="${!isProj ? 'on' : ''}" data-act="hero-mode" data-mode="custom">自定义内容 Custom</button>
      </div>
      <div class="grid2">
        ${isProj ? `<label class="field full"><span>展示并链接到哪个项目 Project to show & link to</span>
          <select data-bind="hero.projectId" data-rerender>${doc.projects.map(x => `<option value="${x.id}" ${p && x.id === p.id ? 'selected' : ''}>${esc(x.title || 'Untitled')}</option>`).join('') || '<option value="">（还没有项目）</option>'}</select></label>` : ''}
        ${field('小标签 Kicker', 'hero.kicker', h.kicker, { ph: 'Latest · 最新' })}
        ${field('按钮文字 Button label', 'hero.linkLabel', h.linkLabel, { ph: isProj ? 'View project' : '留空则不显示按钮' })}
        ${field(`标题 Title ${isProj ? '<em>（留空 = 用项目标题）</em>' : ''}`, 'hero.title', h.title, { full: true, ph: isProj && p ? p.title : '' })}
        ${field(`正文 Text ${isProj ? '<em>（留空 = 用项目简介）</em>' : ''}`, 'hero.text', h.text, { full: true, area: true, ph: isProj && p ? (p.description || '') : '' })}
        ${!isProj ? field('按钮链接 Button link <em>（网址，或 #/p/项目slug）</em>', 'hero.linkUrl', h.linkUrl, { full: true, ph: 'https://…' }) : ''}
      </div>
      ${!isProj ? `<div class="rowend"><div><b>背景图 Background image</b><div class="hint" style="margin:0">点击上方预览图可设置裁切焦点。留空则使用第一个项目的封面。</div></div>
        <div><button class="btn" data-act="hero-image">${h.image ? '更换图片 Replace' : '上传图片 Upload'}</button>
        ${h.image ? '<button class="btn danger" data-act="hero-image-remove">移除 Remove</button>' : ''}</div></div>` : ''}
    </div>`;
  }

  function updatePreview() {
    const el = document.getElementById('preview'); if (!el) return;
    const h = doc.hero, isProj = h.mode === 'project';
    const p = isProj ? (doc.projects.find(x => x.id === h.projectId) || doc.projects[0]) : null;
    const c = p ? coverOf(p) : (h.image ? { src: h.image, thumb: h.imageThumb, focus: h.focus } : coverOf(doc.projects[0]));
    const f = (c && c.focus) || [50, 50];
    el.style.backgroundImage = c ? `url('${url(c.src)}')` : '';
    el.style.backgroundPosition = `${f[0]}% ${f[1]}%`;
    el.style.cursor = !isProj && h.image ? 'crosshair' : '';
    el.querySelector('.pv-k').textContent = h.kicker || (isProj ? 'Latest' : '');
    el.querySelector('.pv-t').textContent = h.title || (p ? p.title : doc.site.title || '');
    el.querySelector('.pv-b').textContent = h.text || (p ? (p.description || p.subtitle || '') : '');
    const label = h.linkLabel || (isProj ? 'View project' : '');
    const b = el.querySelector('.pv-btn'); b.textContent = label ? label + ' →' : ''; b.style.display = label ? '' : 'none';
  }

  function projectHTML() {
    const p = project(); if (!p) { sel = 'hero'; return heroHTML(); }
    const i = doc.projects.indexOf(p), base = `projects.${i}`;
    return `${top(esc(p.title || 'Untitled'), `项目页面 Project gallery · /#/p/${esc(p.slug || '')}`)}
    <div class="cardbox">
      <div class="grid2">
        ${field('项目名称 Title', base + '.title', p.title)}
        ${field('副标题 Subtitle <em>（地点 / 年份）</em>', base + '.subtitle', p.subtitle, { ph: 'Iceland · 2026' })}
        ${field('简介 Description', base + '.description', p.description, { full: true, area: true })}
        ${field('网址名 URL slug <em>（英文小写，用 - 连接）</em>', base + '.slug', p.slug)}
        <div class="field"><span>状态 Visibility</span><label class="switch" style="height:42px"><input type="checkbox" data-bind="${base}.published" ${p.published === false ? '' : 'checked'}> 在网站上显示 Published</label></div>
      </div>
    </div>
    <div class="cardbox">
      <h2>照片 Photos <span style="font-weight:400;color:var(--ink-3)">· ${p.photos.length}</span></h2>
      <p class="hint">点击缩略图 = 设置裁切焦点（全屏裁切时保留的位置） · 拖动 ⠿ 排序 · 竖图会自动两张并排。</p>
      <div class="drop" id="drop" data-act="pick"><strong>＋ 添加照片 Add images</strong>拖拽到这里，或点击选择（JPG / PNG / WebP，可多选）</div>
      <input type="file" id="file" accept="image/jpeg,image/png,image/webp" multiple hidden>
      <div class="photos" id="photos">${p.photos.map((ph, k) => photoHTML(p, ph, k, i)).join('') || '<div class="empty">还没有照片 No photos yet</div>'}</div>
    </div>
    <div class="rowend"><span class="hint">上移/下移项目：在左侧列表拖动。</span><button class="btn danger" data-act="delete-project">删除这个项目 Delete project</button></div>`;
  }

  function photoHTML(p, ph, k, i) {
    const f = ph.focus || [50, 50], isCover = coverOf(p) === ph, lay = ph.layout || 'auto';
    const ratio = ph.w && ph.h ? `${ph.w} / ${ph.h}` : '3 / 2';
    return `<div class="photo" data-k="${k}">
      <div class="thumb" data-act="focus" data-k="${k}" style="aspect-ratio:${ratio}" title="点击设置焦点 Click to set focus">
        <img src="${esc(url(ph.thumb || ph.src))}" loading="lazy" alt="">
        <span class="dot" style="left:${f[0]}%;top:${f[1]}%"></span>
        <span class="badge">${String(k + 1).padStart(2, '0')}</span>${isCover ? '<span class="badge cover">封面 Cover</span>' : ''}
      </div>
      <div class="body">
        <textarea data-bind="projects.${i}.photos.${k}.caption" placeholder="说明文字 Caption…" rows="2">${esc(ph.caption || '')}</textarea>
        <div class="acts">
          <span class="grip" data-grip title="拖动排序 Drag to reorder">⠿</span>
          <select data-bind="projects.${i}.photos.${k}.layout" title="显示方式 Layout">
            <option value="auto" ${lay === 'auto' ? 'selected' : ''}>自动 Auto</option>
            <option value="fill" ${lay === 'fill' ? 'selected' : ''}>铺满裁切 Fill</option>
            <option value="fit" ${lay === 'fit' ? 'selected' : ''}>完整显示 Fit</option>
          </select>
          ${isCover ? '' : `<button class="btn small" data-act="cover" data-k="${k}">设为封面</button>`}
          <button class="btn small danger" data-act="delete-photo" data-k="${k}" title="删除 Delete">✕</button>
        </div>
      </div>
    </div>`;
  }

  function siteHTML() {
    const s = doc.site;
    return `${top('网站设置 Site settings', '网站名称、页脚与联系方式。')}
    <div class="cardbox"><div class="grid2">
      ${field('网站名称 Site title', 'site.title', s.title)}
      ${field('标语 Tagline <em>（显示在名称旁）</em>', 'site.tagline', s.tagline, { ph: 'Photography' })}
      ${field('页脚文字 Footer text', 'site.footer', s.footer, { full: true, area: true, rows: 2 })}
      ${field('邮箱 Email', 'site.email', s.email, { ph: 'hello@example.com' })}
      ${field('Instagram <em>（用户名）</em>', 'site.instagram', s.instagram, { ph: '@yourname' })}
    </div></div>
    <div class="cardbox"><h2>修改密码 Change password</h2><p class="hint">只影响这台电脑 / 服务器上的后台。</p>
      <form id="pwform" class="grid2">
        <label class="field"><span>当前密码 Current</span><input type="password" name="cur" autocomplete="current-password"></label>
        <label class="field"><span>新密码 New</span><input type="password" name="pw" autocomplete="new-password"></label>
        <div class="field full"><button class="btn" style="align-self:start">更新密码 Update</button></div>
      </form></div>`;
  }

  // ---------- image processing + upload ----------
  function draw(bmp, w, h, q) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d'); ctx.imageSmoothingQuality = 'high'; ctx.drawImage(bmp, 0, 0, w, h);
    return new Promise(r => c.toBlob(r, 'image/jpeg', q));
  }
  async function processFile(file) {
    let bmp;
    try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
    catch (e) { throw new Error(`无法读取 ${file.name}（请用 JPG / PNG / WebP）`); }
    const w = bmp.width, h = bmp.height, long = Math.max(w, h);
    let blob = file, ext = file.type.includes('webp') ? 'webp' : 'jpg', W = w, H = h;
    const keepOriginal = /jpe?g|webp/.test(file.type) && long <= MAX_EDGE && file.size < 6e6;
    if (!keepOriginal) {
      const s = Math.min(1, MAX_EDGE / long); W = Math.round(w * s); H = Math.round(h * s);
      blob = await draw(bmp, W, H, 0.9); ext = 'jpg';
    }
    const ts = Math.min(1, THUMB_EDGE / long);
    const thumb = await draw(bmp, Math.round(w * ts), Math.round(h * ts), 0.8);
    bmp.close && bmp.close();
    const r = await api('POST', '/api/upload?ext=' + ext, blob, true);
    const t = await api('POST', `/api/upload?ext=jpg&thumb=1&id=${r.id}`, thumb, true);
    return { id: r.id, src: r.src, thumb: t.src, w: W, h: H, caption: '', focus: [50, 50], layout: 'auto' };
  }

  async function addFiles(files) {
    const p = project(); if (!p || busy) return;
    files = [...files].filter(f => /^image\//.test(f.type)); if (!files.length) return;
    busy = true;
    const drop = document.getElementById('drop'); let done = 0, failed = 0;
    for (const f of files) {
      if (drop) { drop.classList.add('busy'); drop.innerHTML = `<strong>上传中 Uploading… ${done + 1} / ${files.length}</strong>${esc(f.name)}`; }
      try { p.photos.push(await processFile(f)); if (!p.cover) p.cover = p.photos[0].id; }
      catch (e) { failed++; toast(e.message); }
      done++;
    }
    busy = false; dirty(true);
    if (project() === p) render();
    toast(failed ? `完成，${failed} 张失败` : `已添加 ${files.length} 张照片 ✓`);
  }

  const filesOf = ph => [ph.src, ph.thumb].filter(s => s && s.startsWith('uploads/'));

  // ---------- events ----------
  app.addEventListener('input', e => {
    const b = e.target.dataset.bind; if (!b || !doc) return;
    const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    if (/\.title$/.test(b) && b.startsWith('projects.')) {   // keep slug following the title until it is customised
      const p = project();
      if (p && (!p.slug || p.slug === slugify(p.title) || /^project-/.test(p.slug))) {
        p.slug = slugify(v) || 'project-' + p.id.slice(-4);
        const s = app.querySelector(`[data-bind$=".slug"]`); if (s) s.value = p.slug;
      }
    }
    setPath(b, v); dirty();
    if (sel === 'hero') updatePreview();
  });
  app.addEventListener('change', e => {
    const t = e.target;
    if (t.id === 'file') { addFiles(t.files); t.value = ''; return; }
    if (t.id === 'herofile') return;
    if (t.dataset.bind && (t.dataset.rerender !== undefined || /\.(layout|published|title|slug)$/.test(t.dataset.bind))) { fixSlugs(); render(); dirty(); }
  });

  app.addEventListener('click', async e => {
    const el = e.target.closest('[data-act]'); if (!el || !doc) return;
    const act = el.dataset.act, p = project(), k = +el.dataset.k;
    if (act === 'go') { sel = el.dataset.id; render(); window.scrollTo(0, 0); }
    else if (act === 'logout') { await api('POST', '/api/logout', {}); gate('login'); }
    else if (act === 'add-project') {
      const id = uid(); doc.projects.push({ id, slug: 'project-' + id.slice(-4), title: 'New Project', subtitle: '', description: '', cover: '', published: true, photos: [] });
      sel = id; dirty(true); render(); window.scrollTo(0, 0);
      const t = app.querySelector('[data-bind$=".title"]'); if (t) { t.focus(); t.select(); }
    }
    else if (act === 'delete-project' && p) {
      if (!confirm(`删除项目「${p.title}」和它的 ${p.photos.length} 张照片？此操作无法撤销。\nDelete this project and its photos? This cannot be undone.`)) return;
      const files = p.photos.flatMap(filesOf);
      doc.projects = doc.projects.filter(x => x !== p);
      if (doc.hero.projectId === p.id) doc.hero.projectId = '';
      sel = 'hero'; render(); await save();
      if (files.length) api('POST', '/api/delete-file', { files }).catch(() => {});
      toast('项目已删除 Project deleted');
    }
    else if (act === 'hero-mode') { doc.hero.mode = el.dataset.mode; dirty(); render(); }
    else if (act === 'pick') document.getElementById('file').click();
    else if (act === 'cover' && p) { p.cover = p.photos[k].id; dirty(); render(); }
    else if (act === 'delete-photo' && p) {
      const ph = p.photos[k];
      if (!confirm('删除这张照片？ Delete this photo?')) return;
      p.photos.splice(k, 1); if (p.cover === ph.id) p.cover = p.photos[0] ? p.photos[0].id : '';
      render(); await save();
      api('POST', '/api/delete-file', { files: filesOf(ph) }).catch(() => {});
    }
    else if (act === 'focus' && p) {
      const r = el.getBoundingClientRect(), ph = p.photos[k];
      ph.focus = [Math.round((e.clientX - r.left) / r.width * 100), Math.round((e.clientY - r.top) / r.height * 100)];
      const d = el.querySelector('.dot'); d.style.left = ph.focus[0] + '%'; d.style.top = ph.focus[1] + '%'; dirty();
    }
    else if (act === 'hero-image') {
      const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/jpeg,image/png,image/webp';
      inp.onchange = async () => {
        if (!inp.files[0]) return; toast('上传中 Uploading…');
        try {
          const old = [doc.hero.image, doc.hero.imageThumb].filter(s => s && s.startsWith('uploads/'));
          const ph = await processFile(inp.files[0]);
          Object.assign(doc.hero, { image: ph.src, imageThumb: ph.thumb, focus: [50, 50] });
          render(); await save(); if (old.length) api('POST', '/api/delete-file', { files: old }).catch(() => {});
          toast('背景图已更新 ✓');
        } catch (err) { toast(err.message); }
      };
      inp.click();
    }
    else if (act === 'hero-image-remove') {
      const old = [doc.hero.image, doc.hero.imageThumb].filter(s => s && s.startsWith('uploads/'));
      doc.hero.image = ''; doc.hero.imageThumb = ''; render(); await save();
      if (old.length) api('POST', '/api/delete-file', { files: old }).catch(() => {});
    }
  });

  // focus point for the custom top-page image: click the preview
  app.addEventListener('click', e => {
    const pv = e.target.closest('#preview'); if (!pv || !doc || doc.hero.mode === 'project' || !doc.hero.image) return;
    const r = pv.getBoundingClientRect();
    doc.hero.focus = [Math.round((e.clientX - r.left) / r.width * 100), Math.round((e.clientY - r.top) / r.height * 100)];
    updatePreview(); dirty();
  });

  app.addEventListener('submit', async e => {
    if (e.target.id !== 'pwform') return; e.preventDefault();
    try { await api('POST', '/api/password', { current: e.target.cur.value, password: e.target.pw.value }); e.target.reset(); toast('密码已更新 Password updated ✓'); }
    catch (err) { toast(err.message); }
  });

  // ---------- drag & drop: files, photo order, project order ----------
  let drag = null; // {type:'photo'|'project', index}
  app.addEventListener('mousedown', e => { const c = e.target.closest('.photo'); if (c) c.draggable = !!e.target.closest('[data-grip]'); });
  app.addEventListener('dragstart', e => {
    const ph = e.target.closest('.photo'), pr = e.target.closest('.item[data-pi]');
    if (ph) { drag = { type: 'photo', index: +ph.dataset.k }; ph.classList.add('dragging'); }
    else if (pr) drag = { type: 'project', index: +pr.dataset.pi };
    else return;
    e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', 'x');
  });
  app.addEventListener('dragend', () => { drag = null; app.querySelectorAll('.dragging,.dragover,.over').forEach(x => x.classList.remove('dragging', 'dragover', 'over')); });
  const dropTarget = e => {
    if (drag && drag.type === 'photo') return e.target.closest('.photo');
    if (drag && drag.type === 'project') return e.target.closest('.item[data-pi]');
    return [...(e.dataTransfer.types || [])].includes('Files') ? (e.target.closest('.main') && document.getElementById('drop')) : null;
  };
  app.addEventListener('dragover', e => {
    const t = dropTarget(e); if (!t) return; e.preventDefault();
    app.querySelectorAll('.dragover,.over').forEach(x => x !== t && x.classList.remove('dragover', 'over'));
    t.classList.add(drag ? 'dragover' : 'over');
  });
  app.addEventListener('drop', e => {
    const t = dropTarget(e); if (!t) return; e.preventDefault();
    if (!drag) { t.classList.remove('over'); addFiles(e.dataTransfer.files); return; }
    const list = drag.type === 'photo' ? project().photos : doc.projects;
    const to = +(drag.type === 'photo' ? t.dataset.k : t.dataset.pi);
    if (to !== drag.index) { const [m] = list.splice(drag.index, 1); list.splice(to, 0, m); dirty(); }
    drag = null; render();
  });
  addEventListener('beforeunload', e => { if (document.querySelector('.status.dirty') || busy) { e.preventDefault(); e.returnValue = ''; } });

  // ---------- boot ----------
  (async () => {
    try {
      const st = await api('GET', '/api/state');
      if (st.needsSetup) gate('setup', st); else if (!st.authed) gate('login'); else await load();
    } catch (e) {
      app.innerHTML = `<div class="gate"><form><h1>后台未启动</h1><p>后台需要通过 <b>python3 server.py</b>（或双击 start.command）启动后访问。<br>The backstage only works through the local server.</p></form></div>`;
    }
  })();
})();
