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
  const url = src => !src ? '' : /^https?:/i.test(src) ? src : '/' + String(src).replace(/^\//, '');
  const MAX_EDGE = 5120;   // longest side of published photos, px
  const THUMB_EDGE = 640;
  const MID_EDGE = 2560;    // display copy the website shows; the server makes it as AVIF (<id>_m.avif) — this JPEG one is only
                            // the fallback when the server can't (not on a Mac). The full-size file is only loaded for zoom.
  const MAX_VIDEO_MB = 95; // GitHub refuses files over 100 MB
  // a project's "photos" list holds modules: plain images, image stacks, video files, YouTube links
  const kindOf = ph => (ph && ph.type) || 'image';
  const visual = ph => ph && (kindOf(ph) === 'image' || kindOf(ph) === 'stack') && ph.src;
  function syncStack(st) {   // a stack mirrors its first layer, so covers and previews just work
    const f = (st.layers || [])[0] || {};
    st.src = f.src || ''; st.thumb = f.thumb || ''; st.mid = f.mid || ''; st.w = f.w || 3; st.h = f.h || 2;
  }
  function parseYouTube(u) {
    u = String(u || '').trim();
    const m = u.match(/(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/|v\/))([\w-]{11})/) || u.match(/^([\w-]{11})$/);
    return m ? { id: m[1], shorts: /\/shorts\//.test(u) } : null;
  }

  let doc = null, sel = 'hero', saveTimer = 0, saving = false, queued = false, busy = false;
  // rev = the version of content.json this tab loaded; a save is refused if the file changed since
  // (another tab, another device, or an edit made outside the backstage), so nothing gets overwritten.
  let rev = '', stale = false;

  // ---------- api ----------
  async function api(method, path, body, raw) {
    const opt = { method, headers: {}, credentials: 'same-origin' };
    if (raw) opt.body = body;
    else if (body !== undefined) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
    if (path === '/api/content' && method === 'PUT') opt.headers['If-Match'] = rev;
    const res = await fetch(path, opt);
    let data = {};
    try { data = await res.json(); } catch (e) { /* non-json */ }
    if (res.status === 401 && path !== '/api/login') { gate('login'); throw new Error('Please log in again.'); }
    if (!res.ok) { const err = new Error(data.error || ('Request failed (' + res.status + ')')); err.conflict = res.status === 409; throw err; }
    if (path === '/api/content' && res.headers.get('X-Content-Rev')) rev = res.headers.get('X-Content-Rev');
    return data;
  }
  function toast(msg) { toastEl.textContent = msg; toastEl.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => toastEl.classList.remove('show'), 2600); }

  // ---------- saving ----------
  function setStatus(kind, label) { const el = document.getElementById('status'); if (el) { el.className = 'status ' + kind; el.textContent = label; } }
  function dirty(now) { setStatus('dirty', '未保存 Unsaved…'); clearTimeout(saveTimer); saveTimer = setTimeout(save, now ? 0 : 700); }
  async function save() {
    if (stale) { setStatus('error', '请刷新页面 Reload this page'); return; }
    if (saving) { queued = true; return; }
    saving = true; fixSlugs();
    try { await api('PUT', '/api/content', doc); setStatus('', '已保存 Saved'); }
    catch (e) {
      setStatus('error', '保存失败 ' + e.message);
      if (e.conflict) {
        stale = true; queued = false;
        if (confirm('这个后台页面打开之后，网站内容已经在别处被修改过（另一个标签页或别的设备）。\n' +
                    '为了不覆盖新的内容，刚才的修改没有保存。点「确定」重新载入最新内容。\n\n' +
                    'The content was changed elsewhere since this page was opened, so this change was not saved. ' +
                    'Press OK to reload the latest version.')) location.reload();
      }
    }
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
  const coverOf = p => p && (p.photos.find(x => x.id === p.cover && visual(x)) || p.photos.find(visual));

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
          <span class="name">${esc(p.title || 'Untitled')}</span><span class="tag">${p.published === false ? '隐藏' : p.photos.filter(x => kindOf(x) !== 'text').length}</span></button>`;
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
        ${field('大标题 Big title <em>（封面左下角的大字，留空 = 项目名称）</em>', base + '.place', p.place, { ph: '北京' })}
        ${field('英文名 English name <em>（大字旁的斜体，留空 = 副标题）</em>', base + '.placeEn', p.placeEn, { ph: 'Beijing' })}
        ${field('坐标 Coordinates <em>（封面右上角）</em>', base + '.coords', p.coords, { ph: '39.92°N · 116.39°E' })}
        ${field('简介 Description', base + '.description', p.description, { full: true, area: true })}
        ${field('网址名 URL slug <em>（英文小写，用 - 连接）</em>', base + '.slug', p.slug)}
        <label class="field"><span>页面风格 Page style</span><select data-bind="${base}.theme" data-rerender>
          <option value="" ${!p.theme ? 'selected' : ''}>默认 · 米白纸 Paper</option>
          <option value="indigo" ${p.theme === 'indigo' ? 'selected' : ''}>靛蓝 · 深色 Indigo (dark)</option>
          <option value="yunnan" ${p.theme === 'yunnan' ? 'selected' : ''}>云南手记 · Yunnan journal</option>
          <option value="paris" ${p.theme === 'paris' ? 'selected' : ''}>巴黎 · 石头与玻璃 Paris (stone &amp; glass)</option>
          <option value="huizhou" ${p.theme === 'huizhou' ? 'selected' : ''}>徽州 · 粉墙黛瓦 Huizhou (ink &amp; white walls)</option>
          <option value="beijing" ${p.theme === 'beijing' ? 'selected' : ''}>北京 · 皇城 Beijing (palace red &amp; gold)</option></select></label>
        <div class="field"><span>状态 Visibility</span><label class="switch" style="height:42px"><input type="checkbox" data-bind="${base}.published" ${p.published === false ? '' : 'checked'}> 在网站上显示 Published</label></div>
      </div>
    </div>
    <div class="cardbox">
      <h2>内容 Content <span style="font-weight:400;color:var(--ink-3)">· ${p.photos.length}</span></h2>
      <p class="hint">按住卡片任意空白处拖动 = 排序 · 点击缩略图 = 设置裁切焦点 · 时间叠图里的小图也可以拖动排序。</p>
      <div class="drop" id="drop" data-act="pick"><strong>＋ 添加照片 Add images</strong>拖拽到这里，或点击选择（JPG / PNG / WebP，可多选）</div>
      <div class="adders">
        <button class="btn" data-act="add-stack"><b>＋ 时间叠图</b> Image stack<small>同一地点不同时间的一组照片，滚动时渐变过渡</small></button>
        <button class="btn" data-act="add-video"><b>＋ 视频文件</b> Video file<small>MP4 / MOV / WebM，最大 ${MAX_VIDEO_MB} MB，静音自动播放</small></button>
        <button class="btn" data-act="add-youtube"><b>＋ YouTube 链接</b> YouTube link<small>粘贴链接，进入画面时静音自动播放</small></button>
        <button class="btn" data-act="add-text"><b>＋ 文字</b> Subtitle<small>标题 + 正文，放在照片之间，可调对齐、高度、字号、字体、颜色</small></button>
      </div>
      <input type="file" id="file" accept="image/jpeg,image/png,image/webp" multiple hidden>
      <div class="photos" id="photos">${p.photos.map((ph, k) => photoHTML(p, ph, k, i)).join('') || '<div class="empty">还没有照片 No photos yet</div>'}</div>
    </div>
    <div class="rowend"><span class="hint">上移/下移项目：在左侧列表拖动。</span><button class="btn danger" data-act="delete-project">删除这个项目 Delete project</button></div>`;
  }

  // ---- subtitle (text) module ----
  // page colour that a text block switches the (indigo) page to as it scrolls in — see TONES in site.js
  const TONES = [
    ['', '不变 · 沿用上一段 Keep'], ['indigo', '靛蓝 Indigo'], ['dye', '扎染蓝 Tie-dye blue'], ['jade', '碧青 Jade'],
    ['maroon', '绛红 Maroon'], ['dusk', '暮紫 Dusk'], ['night', '夜 Night'],
    ['stone', '石灰岩 Limestone (light)'], ['zinc', '锌灰 Zinc (light)'], ['lilac', '黄昏淡紫 Lilac (light)'], ['vitrail', '彩窗暗色 Stained glass (dark)'],
    ['gilt', '鎏金 Gilt (dark)'], ['seine', '秋日河岸 Seine (light)'],
    ['whitewall', '粉墙 White wall (light)'], ['misty', '烟雨 Misty green (light)'], ['lanternnight', '灯夜 Lantern night (dark)'],
    ['hutong', '胡同灰 Hutong grey (light)'], ['palace', '宫墙红 Palace red (dark)'], ['apricot', '冬日杏色 Winter apricot (light)'],
  ];
  const FONTS = [
    ['serif', '衬线 Serif', '"Cormorant Garamond", "Iowan Old Style", "Palatino Linotype", Palatino, "Songti SC", Georgia, serif'],
    ['sans', '无衬线 Sans', '-apple-system, BlinkMacSystemFont, "PingFang SC", "Helvetica Neue", Arial, sans-serif'],
    ['song', '宋体 Song', '"Songti SC", "STSong", "Noto Serif SC", "SimSun", serif'],
    ['kai', '楷体 Kai', '"Kaiti SC", "STKaiti", "KaiTi", serif'],
    ['mono', '等宽 Mono', 'ui-monospace, "SF Mono", Menlo, Consolas, monospace'],
  ];
  function textPreview(ph, k) {   // a half-size preview of how the block will look on the site
    const font = (FONTS.find(f => f[0] === ph.font) || FONTS[0])[2];
    const color = /^#[0-9a-f]{6}$/i.test(ph.color || '') ? ph.color : '#1d1a16';
    const ts = (+ph.size > 0 ? +ph.size : 56) / 2, cs = (+ph.csize > 0 ? +ph.csize : 19) / 2, h = +ph.height > 0 ? Math.min(+ph.height / 2, 320) : 0;
    const al = ['left', 'center', 'right'].includes(ph.align) ? ph.align : 'left';
    return `<div class="tpv" data-k="${k}" style='text-align:${al};color:${color};font-family:${font};${h ? `min-height:${h}px;` : ''}'>
      <div class="tpv-t" style="font-size:${ts}px">${esc(ph.title || '') || '<span class="ph">标题 Subtitle</span>'}</div>
      <div class="tpv-c" style="font-size:${cs}px">${esc(ph.caption || '').replace(/\n/g, '<br>') || '<span class="ph">正文 Caption</span>'}</div></div>`;
  }
  function textCard(ph, k, base) {
    const al = ph.align || 'left', num = (v, ph2) => `value="${esc(v || '')}" placeholder="${ph2}"`;
    return `<div class="photo text" data-k="${k}">
      ${textPreview(ph, k)}
      <div class="body">
        <div class="tgrid">
          <label class="mini"><span>样式 Style</span><select data-bind="${base}.style" data-rerender>
            <option value="" ${ph.style !== 'chapter' ? 'selected' : ''}>普通 Text</option>
            <option value="chapter" ${ph.style === 'chapter' ? 'selected' : ''}>章节开篇 Chapter</option></select></label>
          ${ph.style === 'chapter' ? `<label class="mini"><span>装饰 Ornament</span><select data-bind="${base}.ornament">
            <option value="contour" ${!ph.ornament || ph.ornament === 'contour' ? 'selected' : ''}>山形等高线 Contours</option>
            <option value="flags" ${ph.ornament === 'flags' ? 'selected' : ''}>经幡 Prayer flags</option>
            <option value="shibori" ${ph.ornament === 'shibori' ? 'selected' : ''}>扎染 Tie-dye</option>
            <option value="roofs" ${ph.ornament === 'roofs' ? 'selected' : ''}>巴黎屋顶 Paris rooftops</option>
            <option value="rose" ${ph.ornament === 'rose' ? 'selected' : ''}>玫瑰窗 Rose window</option>
            <option value="opera" ${ph.ornament === 'opera' ? 'selected' : ''}>歌剧院线描 Opéra (line drawing)</option>
            <option value="seine" ${ph.ornament === 'seine' ? 'selected' : ''}>塞纳河桥线描 Seine bridge (line drawing)</option>
            <option value="versailles" ${ph.ornament === 'versailles' ? 'selected' : ''}>凡尔赛金门线描 Versailles gate (line drawing)</option>
            <option value="huiwalls" ${ph.ornament === 'huiwalls' ? 'selected' : ''}>马头墙线描 Horse-head walls (line drawing)</option>
            <option value="fishdance" ${ph.ornament === 'fishdance' ? 'selected' : ''}>舞鱼灯线描 Fish-lantern dance (line drawing)</option>
            <option value="eaves" ${ph.ornament === 'eaves' ? 'selected' : ''}>宫殿线描 Palace hall (line drawing)</option>
            <option value="studs" ${ph.ornament === 'studs' ? 'selected' : ''}>宫门门钉 Palace gate studs (北京)</option>
            <option value="none" ${ph.ornament === 'none' ? 'selected' : ''}>无 None</option></select></label>`
            : ['paris', 'huizhou', 'beijing'].includes((project() || {}).theme) ? `<label class="mini"><span>小插画 Line drawing</span><select data-bind="${base}.ornament">
            ${[['', '无 None'], ['metro', '地铁口 Métro entrance'], ['cafe', '咖啡桌 Café table'], ['lamp', '路灯 Street lamp'], ['chandelier', '吊灯 Chandelier'], ['eiffel', '铁塔 Eiffel Tower'], ['fish', '鱼灯 Fish lantern'], ['lantern', '灯笼 Lantern'], ['cloud', '祥云 Cloud scroll']]
              .map(o => `<option value="${o[0]}" ${(ph.ornament || '') === o[0] ? 'selected' : ''}>${o[1]}</option>`).join('')}</select></label>` : ''}
          ${['indigo', 'paris', 'huizhou', 'beijing'].includes((project() || {}).theme) ? `<label class="mini"><span title="从这一段开始，整页慢慢染成这个颜色（靛蓝 / 巴黎页面风格有效） The page fades to this colour from this block on">底色 Page colour</span><select data-bind="${base}.tone">
            ${TONES.map(t => `<option value="${t[0]}" ${(ph.tone || '') === t[0] ? 'selected' : ''}>${t[1]}</option>`).join('')}</select></label>` : ''}
        </div>
        <label class="mini"><span>小标题 Kicker <em>（标题上方的一行小字，章节里显示为英文副题）</em></span><input type="text" data-bind="${base}.kicker" value="${esc(ph.kicker || '')}"></label>
        <label class="mini"><span>${ph.style === 'chapter' ? '章节名 Chapter title' + ((project() || {}).theme === 'yunnan' ? '（横排）' : (project() || {}).theme === 'paris' ? '（路牌上的地名）' : (project() || {}).theme === 'beijing' ? '（匾额上的字）' : '（竖排）') : '标题 Subtitle'}</span><input type="text" data-bind="${base}.title" value="${esc(ph.title || '')}"></label>
        <label class="mini"><span>正文 Caption</span><textarea data-bind="${base}.caption" rows="3">${esc(ph.caption || '')}</textarea></label>
        <div class="seg small">${[['left', '左 Left'], ['center', '中 Centre'], ['right', '右 Right']].map(([v, l]) =>
          `<button class="${al === v ? 'on' : ''}" data-act="text-align" data-k="${k}" data-v="${v}">${l}</button>`).join('')}</div>
        <div class="tgrid">
          <label class="mini"><span>高度 Height (px)</span><input type="number" min="0" step="10" data-bind="${base}.height" ${num(ph.height, '自动 Auto')}></label>
          <label class="mini"><span>标题字号 (px)</span><input type="number" min="8" max="400" data-bind="${base}.size" ${num(ph.size, '自动 Auto')}></label>
          <label class="mini"><span>正文字号 (px)</span><input type="number" min="8" max="200" data-bind="${base}.csize" ${num(ph.csize, '自动 Auto')}></label>
          <label class="mini"><span>字体 Font</span><select data-bind="${base}.font">${FONTS.map(f => `<option value="${f[0]}" ${(ph.font || 'serif') === f[0] ? 'selected' : ''}>${f[1]}</option>`).join('')}</select></label>
          <div class="mini"><span>颜色 Colour</span><div class="colorrow"><input type="color" data-bind="${base}.color" value="${/^#[0-9a-f]{6}$/i.test(ph.color || '') ? ph.color : '#1d1a16'}">
            <button class="btn small" data-act="text-color-reset" data-k="${k}">${ph.color ? '恢复默认' : '默认 Default'}</button></div></div>
        </div>
        <div class="acts"><span class="grip" title="按住拖动排序 Drag to reorder">⠿ 文字 Subtitle</span><span style="flex:1"></span>
          <button class="btn small danger" data-act="delete-photo" data-k="${k}" title="删除 Delete">✕</button></div>
      </div>
    </div>`;
  }

  function photoHTML(p, ph, k, i) {
    const kind = kindOf(ph), base = `projects.${i}.photos.${k}`;
    if (kind === 'text') return textCard(ph, k, base);
    const f = ph.focus || [50, 50], isCover = coverOf(p) === ph, lay = ph.layout || 'auto';
    const ratio = ph.w && ph.h ? `${ph.w} / ${ph.h}` : '16 / 9';
    const num = String(k + 1).padStart(2, '0');
    const badge = { stack: `时间叠图 Stack · ${(ph.layers || []).length} 层`, video: '视频 Video', youtube: 'YouTube' }[kind];
    const focusable = kind !== 'youtube';
    const thumbSrc = ph.thumb || (kind === 'video' ? '' : ph.src);
    const select = kind === 'image'
      ? `<select data-bind="${base}.layout" title="显示方式 Layout">
            <option value="auto" ${lay === 'auto' ? 'selected' : ''}>自动 Auto</option>
            <option value="fill" ${lay === 'fill' ? 'selected' : ''}>铺满裁切 Fill</option>
            <option value="wide" ${lay === 'wide' ? 'selected' : ''}>铺满横屏 Full width</option>
            <option value="fit" ${lay === 'fit' ? 'selected' : ''}>完整显示 Fit</option>
            <option value="pair" ${lay === 'pair' ? 'selected' : ''}>与下一张并排 Pair with next</option></select>`
      : kind === 'youtube'
      ? `<select data-ratio="${k}" title="画面比例 Aspect ratio">${['16:9', '9:16', '4:3', '1:1', '21:9'].map(r => `<option ${r === `${ph.w}:${ph.h}` ? 'selected' : ''}>${r}</option>`).join('')}</select>`
      : `<select data-bind="${base}.layout" title="显示方式 Layout">
            <option value="auto" ${lay !== 'fill' && lay !== 'scroll' ? 'selected' : ''}>带白边 Framed</option>
            <option value="fill" ${lay === 'fill' ? 'selected' : ''}>全屏 Full screen</option>
            ${kind === 'stack' ? `<option value="scroll" ${lay === 'scroll' ? 'selected' : ''}>横向长卷 Handscroll</option>` : ''}</select>`;
    const fxSel = kind === 'image' ? `<select data-bind="${base}.fx" title="特效 Effect">
            <option value="" ${!ph.fx ? 'selected' : ''}>无特效 No effect</option>
            <option value="mist" ${ph.fx === 'mist' ? 'selected' : ''}>流云 Drifting mist</option>
            <option value="dawn" ${ph.fx === 'dawn' ? 'selected' : ''}>日照金山 Sunrise on scroll</option>
            <option value="sparkle" ${ph.fx === 'sparkle' ? 'selected' : ''}>闪烁灯光 Sparkling lights</option>
            <option value="embers" ${ph.fx === 'embers' ? 'selected' : ''}>飞火 Rising sparks</option>
            <option value="fireworks" ${ph.fx === 'fireworks' ? 'selected' : ''}>烟花 Fireworks</option></select>` : '';
    return `<div class="photo ${kind}" data-k="${k}">
      <div class="thumb" ${focusable ? `data-act="focus" data-k="${k}" title="点击设置焦点 Click to set focus"` : ''} style="aspect-ratio:${ratio}">
        ${thumbSrc ? `<img src="${esc(url(thumbSrc))}" loading="lazy" alt="">` : ''}
        ${kind === 'video' || kind === 'youtube' ? '<span class="play">▶</span>' : ''}
        ${focusable ? `<span class="dot" style="left:${f[0]}%;top:${f[1]}%"></span>` : ''}
        <span class="badge">${num}</span>${badge ? `<span class="badge kind">${badge}</span>` : ''}${isCover ? '<span class="badge cover">封面 Cover</span>' : ''}
      </div>
      <div class="body">
        ${kind === 'stack' ? `<div class="layers" data-k="${k}">${(ph.layers || []).map((l, j) => `
          <div class="layer" data-j="${j}"><div class="lt"><img src="${esc(url(l.thumb || l.src))}" alt="" draggable="false"><span>${j + 1}</span>
            <button class="x" data-act="del-layer" data-k="${k}" data-j="${j}" title="删除这一层">✕</button></div>
            <input type="text" data-bind="${base}.layers.${j}.label" value="${esc(l.label || '')}" placeholder="时间 e.g. 06:10"></div>`).join('')}
          <button class="layer add" data-act="add-layer" data-k="${k}" title="添加图层 Add layers">＋</button></div>` : ''}
        ${kind === 'youtube' ? `<input type="text" data-yt="${k}" value="${esc(ph.url || '')}" placeholder="https://youtu.be/…">` : ''}
        <textarea data-bind="${base}.caption" placeholder="说明文字 Caption…（第二行可写英文）" rows="2">${esc(ph.caption || '')}</textarea>
        ${fxSel ? `<div class="acts">${fxSel}</div>` : ''}
        <div class="acts">
          <span class="grip" title="按住拖动排序 Drag to reorder">⠿</span>
          ${select}
          ${isCover || !visual(ph) ? '' : `<button class="btn small" data-act="cover" data-k="${k}">设为封面</button>`}
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
      ${field('首页引言 Intro <em>（首页第一屏下方的大字，留空则用标语）</em>', 'site.intro', s.intro, { full: true, area: true, rows: 3, ph: 'A record of light, kept while walking.' })}
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
    const r = await api('POST', '/api/upload?ext=' + ext, blob, true);
    const t = await api('POST', `/api/upload?ext=jpg&thumb=1&id=${r.id}`, thumb, true);
    let mid = r.mid || '';
    const ms = MID_EDGE / long;
    if (!mid && ms < 0.9) {
      const m = await api('POST', `/api/upload?ext=jpg&size=m&id=${r.id}`, await draw(bmp, Math.round(w * ms), Math.round(h * ms), 0.84), true);
      mid = m.src;
    }
    bmp.close && bmp.close();
    return { id: r.id, src: r.src, mid, thumb: t.src, w: W, h: H, caption: '', focus: [50, 50], layout: 'auto' };
  }

  // raw upload with a progress callback (fetch cannot report upload progress)
  function uploadRaw(path, blob, onProgress) {
    return new Promise((resolve, reject) => {
      const x = new XMLHttpRequest(); x.open('POST', path); x.withCredentials = true;
      x.upload.onprogress = e => e.lengthComputable && onProgress && onProgress(e.loaded / e.total);
      x.onload = () => {
        let d = {}; try { d = JSON.parse(x.responseText); } catch (e) { /* */ }
        if (x.status === 401) { gate('login'); reject(new Error('Please log in again.')); }
        else if (x.status >= 400) reject(new Error(d.error || 'Upload failed (' + x.status + ')'));
        else resolve(d);
      };
      x.onerror = () => reject(new Error('网络错误 Upload failed'));
      x.send(blob);
    });
  }

  async function processVideo(file, onProgress) {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (!['mp4', 'm4v', 'mov', 'webm'].includes(ext)) throw new Error(`${file.name}：请用 MP4 / MOV / WebM`);
    const mb = file.size / 1048576;
    if (mb > MAX_VIDEO_MB) throw new Error(`${file.name} 有 ${mb.toFixed(0)} MB，超过 ${MAX_VIDEO_MB} MB。请先压缩（例如 HandBrake 或 iMovie 导出 1080p）。`);
    // poster frame + size, read in the browser
    let poster = null, w = 16, h = 9;
    const v = document.createElement('video'), src = URL.createObjectURL(file);
    try {
      v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = src;
      await new Promise((ok, no) => { v.onloadeddata = ok; v.onerror = no; setTimeout(() => no(new Error('timeout')), 20000); });
      w = v.videoWidth || 16; h = v.videoHeight || 9;
      v.currentTime = Math.min(1, (v.duration || 4) / 4);
      await new Promise(ok => { v.onseeked = ok; setTimeout(ok, 4000); });
      const sc = Math.min(1, 1600 / Math.max(w, h));
      poster = await draw(v, Math.round(w * sc), Math.round(h * sc), 0.82);
    } catch (e) { toast('这个视频在浏览器里无法预览（可能是 HEVC 编码），仍会上传，但部分浏览器可能播放不了。'); }
    URL.revokeObjectURL(src);
    const r = await uploadRaw('/api/upload?ext=' + ext, file, onProgress);
    let thumb = '';
    if (poster) thumb = (await api('POST', `/api/upload?ext=jpg&thumb=1&id=${r.id}`, poster, true)).src;
    return { id: r.id, type: 'video', src: r.src, thumb, w, h, caption: '', focus: [50, 50], layout: 'auto' };
  }

  function pickFiles(accept, multiple) {
    return new Promise(res => {
      const inp = document.createElement('input'); inp.type = 'file'; inp.accept = accept; inp.multiple = !!multiple;
      inp.onchange = () => res([...inp.files]); inp.click();
    });
  }
  const byName = (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });

  // upload a group of images as the layers of one stack (new stack, or appended to stack k)
  async function addStackFiles(files, k) {
    const p = project(); if (!p || busy) return;
    files = files.filter(f => /^image\//.test(f.type)).sort(byName); if (!files.length) return;
    if (k === undefined && files.length < 2) { toast('时间叠图至少需要 2 张照片 A stack needs at least 2 images'); return; }
    busy = true;
    const drop = document.getElementById('drop'), layers = []; let failed = 0;
    for (let n = 0; n < files.length; n++) {
      if (drop) { drop.classList.add('busy'); drop.innerHTML = `<strong>上传叠图 Uploading stack… ${n + 1} / ${files.length}</strong>${esc(files[n].name)}`; }
      try { const ph = await processFile(files[n]); layers.push({ id: ph.id, src: ph.src, mid: ph.mid, thumb: ph.thumb, w: ph.w, h: ph.h, label: '' }); }
      catch (e) { failed++; toast(e.message); }
    }
    busy = false;
    if (layers.length) {
      if (k === undefined) { const st = { id: uid(), type: 'stack', layers, caption: '', focus: [50, 50], layout: 'auto' }; syncStack(st); p.photos.push(st); }
      else { const st = p.photos[k]; st.layers = (st.layers || []).concat(layers); syncStack(st); }
      if (!p.cover) p.cover = (p.photos.find(visual) || {}).id || '';
      dirty(true);
    }
    if (project() === p) render();
    toast(failed ? `完成，${failed} 张失败` : `已添加 ${layers.length} 层 ✓（按文件名排序，可拖动调整）`);
  }

  async function addVideoFile() {
    const p = project(); if (!p || busy) return;
    const [file] = await pickFiles('video/mp4,video/quicktime,video/webm,.mp4,.m4v,.mov,.webm'); if (!file) return;
    busy = true;
    const drop = document.getElementById('drop');
    const show = f => { if (drop) { drop.classList.add('busy'); drop.innerHTML = `<strong>上传视频 Uploading video… ${Math.round(f * 100)}%</strong>${esc(file.name)} · ${(file.size / 1048576).toFixed(1)} MB`; } };
    show(0);
    try { p.photos.push(await processVideo(file, show)); dirty(true); toast('视频已添加 ✓'); }
    catch (e) { toast(e.message); }
    busy = false;
    if (project() === p) render();
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

  const filesOf = ph => (kindOf(ph) === 'stack' ? (ph.layers || []).flatMap(l => [l.src, l.mid, l.thumb]) : [ph.src, ph.mid, ph.thumb])
    .filter(s => s && String(s).startsWith('uploads/'));

  // ---------- events ----------
  app.addEventListener('input', e => {
    const b = e.target.dataset.bind; if (!b || !doc) return;
    const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    if (/^projects\.\d+\.title$/.test(b)) {   // keep slug following the title until it is customised
      const p = project();
      if (p && (!p.slug || p.slug === slugify(p.title) || /^project-/.test(p.slug))) {
        p.slug = slugify(v) || 'project-' + p.id.slice(-4);
        const s = app.querySelector(`[data-bind$=".slug"]`); if (s) s.value = p.slug;
      }
    }
    setPath(b, v); dirty();
    if (sel === 'hero') updatePreview();
    const tc = e.target.closest('.photo.text');   // live preview of a subtitle block
    if (tc) { const k = +tc.dataset.k, old = tc.querySelector('.tpv'); old.outerHTML = textPreview(project().photos[k], k); }
  });
  app.addEventListener('change', e => {
    const t = e.target;
    if (t.id === 'file') { addFiles(t.files); t.value = ''; return; }
    if (t.id === 'herofile') return;
    if (t.dataset.yt !== undefined) {
      const ph = project().photos[+t.dataset.yt], yt = parseYouTube(t.value);
      if (!yt) { toast('无法识别这个 YouTube 链接 Not a YouTube link'); t.value = ph.url || ''; return; }
      Object.assign(ph, { yt: yt.id, url: t.value.trim(), thumb: `https://i.ytimg.com/vi/${yt.id}/hqdefault.jpg` });
      dirty(); render(); return;
    }
    if (t.dataset.ratio !== undefined) {
      const ph = project().photos[+t.dataset.ratio], [w, h] = t.value.split(':').map(Number);
      ph.w = w; ph.h = h; dirty(); render(); return;
    }
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
    else if (act === 'add-stack') addStackFiles(await pickFiles('image/jpeg,image/png,image/webp', true));
    else if (act === 'add-layer' && p) addStackFiles(await pickFiles('image/jpeg,image/png,image/webp', true), k);
    else if (act === 'add-video') addVideoFile();
    else if (act === 'add-text' && p) {
      p.photos.push({ id: uid(), type: 'text', title: '', caption: '', align: 'left', height: '', size: '', csize: '', font: 'serif', color: '' });
      dirty(true); render();
      const cards = app.querySelectorAll('.photo.text'), last = cards[cards.length - 1];
      if (last) { last.scrollIntoView({ block: 'center' }); const t = last.querySelector('input[type=text]'); if (t) t.focus(); }
    }
    else if (act === 'text-align' && p) { p.photos[k].align = el.dataset.v; dirty(); render(); }
    else if (act === 'text-color-reset' && p) { p.photos[k].color = ''; dirty(); render(); }
    else if (act === 'add-youtube' && p) {
      const u = prompt('粘贴 YouTube 链接 Paste a YouTube link'); if (!u) return;
      const yt = parseYouTube(u); if (!yt) { toast('无法识别这个 YouTube 链接 Not a YouTube link'); return; }
      p.photos.push({ id: uid(), type: 'youtube', yt: yt.id, url: u.trim(), thumb: `https://i.ytimg.com/vi/${yt.id}/hqdefault.jpg`,
                      w: yt.shorts ? 9 : 16, h: yt.shorts ? 16 : 9, caption: '', layout: 'auto' });
      dirty(true); render(); toast('YouTube 视频已添加 ✓');
    }
    else if (act === 'del-layer' && p) {
      const st = p.photos[k], j = +el.dataset.j, l = st.layers[j];
      if (!confirm('删除这一层？ Delete this layer?')) return;
      st.layers.splice(j, 1);
      if (!st.layers.length) { p.photos.splice(k, 1); if (p.cover === st.id) p.cover = (p.photos.find(visual) || {}).id || ''; }
      else syncStack(st);
      render(); await save();
      api('POST', '/api/delete-file', { files: [l.src, l.mid, l.thumb].filter(x => x && x.startsWith('uploads/')) }).catch(() => {});
    }
    else if (act === 'cover' && p) { p.cover = p.photos[k].id; dirty(); render(); }
    else if (act === 'delete-photo' && p) {
      const ph = p.photos[k];
      const what = { stack: `这组时间叠图（${(ph.layers || []).length} 张）`, video: '这个视频', youtube: '这个 YouTube 视频', text: '这个文字块' }[kindOf(ph)] || '这张照片';
      if (!confirm(`删除${what}？ Delete?`)) return;
      p.photos.splice(k, 1); if (p.cover === ph.id) p.cover = (p.photos.find(visual) || {}).id || '';
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
          const old = [doc.hero.image, doc.hero.imageMid, doc.hero.imageThumb].filter(s => s && s.startsWith('uploads/'));
          const ph = await processFile(inp.files[0]);
          Object.assign(doc.hero, { image: ph.src, imageMid: ph.mid, imageThumb: ph.thumb, focus: [50, 50] });
          render(); await save(); if (old.length) api('POST', '/api/delete-file', { files: old }).catch(() => {});
          toast('背景图已更新 ✓');
        } catch (err) { toast(err.message); }
      };
      inp.click();
    }
    else if (act === 'hero-image-remove') {
      const old = [doc.hero.image, doc.hero.imageMid, doc.hero.imageThumb].filter(s => s && s.startsWith('uploads/'));
      doc.hero.image = ''; doc.hero.imageMid = ''; doc.hero.imageThumb = ''; render(); await save();
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

  // ---------- sortable cards: press anywhere on a card, drag, the others slide out of the way ----------
  // Works for the content cards (.photo in #photos) and the layers inside a stack (.layer in .layers).
  let sd = null, swallowClick = false;
  function flip(list, skip, mutate) {
    const els = [...list.children].filter(c => c !== skip);
    const before = new Map(els.map(c => [c, c.getBoundingClientRect()]));
    mutate();
    els.forEach(c => { c.style.transition = 'none'; c.style.transform = ''; });
    els.forEach(c => {
      const a = before.get(c), b = c.getBoundingClientRect(), dx = a.left - b.left, dy = a.top - b.top;
      if (!dx && !dy) return;
      c.style.transform = `translate(${dx}px, ${dy}px)`;
      requestAnimationFrame(() => requestAnimationFrame(() => { c.style.transition = 'transform .32s cubic-bezier(.2, .8, .2, 1)'; c.style.transform = ''; }));
    });
  }
  app.addEventListener('pointerdown', e => {
    if (e.button !== 0 || busy || sd) return;
    const item = e.target.closest('.photo, .layer:not(.add)');
    if (!item || e.target.closest('input, textarea, select, button, a')) return;
    sd = { item, list: item.parentElement, x0: e.clientX, y0: e.clientY, started: false };
  });
  addEventListener('pointermove', e => {
    if (!sd) return;
    const dx = e.clientX - sd.x0, dy = e.clientY - sd.y0;
    if (!sd.started) {
      if (Math.hypot(dx, dy) < 6) return;
      const { item, list } = sd, r = item.getBoundingClientRect();
      sd.started = true; sd.r = r; sd.cls = item.classList.contains('layer') ? 'layer' : 'photo';
      const slot = document.createElement('div');
      slot.className = `${sd.cls} slot${item.classList.contains('stack') ? ' stack' : ''}`;
      slot.style.height = r.height + 'px'; if (sd.cls === 'layer') slot.style.width = r.width + 'px';
      list.insertBefore(slot, item); sd.slot = slot;
      Object.assign(item.style, { position: 'fixed', left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px', zIndex: 1000, pointerEvents: 'none', margin: 0, transition: 'none' });
      document.body.appendChild(item);   // out of the card box, whose backdrop-filter would trap position:fixed
      item.classList.add('lifted'); document.body.classList.add('sorting');
      window.getSelection && window.getSelection().removeAllRanges();
    }
    e.preventDefault();
    sd.item.style.transform = `translate(${dx}px, ${dy}px) scale(1.03) rotate(${Math.max(-2, Math.min(2, dx / 120))}deg)`;
    // slot follows the card under the pointer
    const { list, slot, item } = sd;
    const sibs = [...list.children].filter(c => c !== item && c !== slot && c.classList.contains(sd.cls) && !c.classList.contains('add'));
    const over = sibs.find(c => { const r = c.getBoundingClientRect(); return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom; });
    if (!over) return;
    const kids = [...list.children], after = kids.indexOf(over) > kids.indexOf(slot);
    flip(list, item, () => (after ? over.after(slot) : over.before(slot)));
  }, { passive: false });
  function endSort() {
    const d = sd; sd = null; if (!d || !d.started) return;
    swallowClick = true; setTimeout(() => { swallowClick = false; }, 0);
    const r = d.slot.getBoundingClientRect();
    d.item.style.transition = 'transform .26s cubic-bezier(.2, .8, .2, 1)';
    d.item.style.transform = `translate(${r.left - d.r.left}px, ${r.top - d.r.top}px)`;
    setTimeout(() => {
      d.slot.replaceWith(d.item);
      ['position', 'left', 'top', 'width', 'height', 'zIndex', 'pointerEvents', 'margin', 'transform', 'transition'].forEach(k => { d.item.style[k] = ''; });
      d.item.classList.remove('lifted'); document.body.classList.remove('sorting');
      const p = project(); if (!p) return;
      if (d.cls === 'photo') {
        const order = [...d.list.children].filter(c => c.classList.contains('photo')).map(c => p.photos[+c.dataset.k]);
        if (order.some((x, n) => x !== p.photos[n])) { p.photos = order; dirty(); }
      } else {
        const st = p.photos[+d.list.dataset.k];
        const order = [...d.list.children].filter(c => c.matches('.layer[data-j]')).map(c => st.layers[+c.dataset.j]);
        if (order.some((x, n) => x !== st.layers[n])) { st.layers = order; syncStack(st); dirty(); }
      }
      render();
    }, 270);
  }
  addEventListener('pointerup', endSort);
  addEventListener('pointercancel', endSort);
  app.addEventListener('click', e => { if (swallowClick) { e.stopPropagation(); e.preventDefault(); } }, true);
  app.addEventListener('dragstart', e => { if (e.target.closest && e.target.closest('.photo')) e.preventDefault(); });

  // ---------- drag & drop: files onto the page, project order in the sidebar ----------
  let drag = null; // {type:'project', index}
  app.addEventListener('dragstart', e => {
    const pr = e.target.closest && e.target.closest('.item[data-pi]');
    if (pr) drag = { type: 'project', index: +pr.dataset.pi };
    else return;
    e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', 'x');
  });
  app.addEventListener('dragend', () => { drag = null; app.querySelectorAll('.dragging,.dragover,.over').forEach(x => x.classList.remove('dragging', 'dragover', 'over')); });
  const dropTarget = e => {
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
    const list = doc.projects, to = +t.dataset.pi;
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
