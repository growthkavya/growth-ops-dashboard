// Supabase client (lazy init).
let sb = null;
function getSupabase() {
  if (!sb) sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true } });
  return sb;
}

// Tiny DOM helpers
function $(sel, root = document) { return root.querySelector(sel); }
function $$(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }
function h(tag, attrs = {}, children = []) {
  const el = document.createElement(tag);
  for (const k in attrs) {
    if (k === 'class') el.className = attrs[k];
    else if (k === 'html') el.innerHTML = attrs[k];
    else if (k === 'style' && typeof attrs[k] === 'object') Object.assign(el.style, attrs[k]);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
    else if (attrs[k] !== null && attrs[k] !== undefined && attrs[k] !== false) el.setAttribute(k, attrs[k]);
  }
  (Array.isArray(children) ? children : [children]).forEach((c) => {
    if (c == null || c === false) return;
    el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  });
  return el;
}

// Date utilities
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function monthStartStr(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}
function mondayOf(date) {
  const d = new Date(date);
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function formatTime(iso) { if (!iso) return '—'; return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false }); }
function formatDate(d) { if (!d) return '—'; return new Date(d).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }); }
function formatDateTime(iso) { if (!iso) return '—'; return new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }); }
function daysBetween(a, b) { return Math.round((new Date(a) - new Date(b)) / 86400000); }
function timeAgo(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const s = Math.floor((Date.now() - d) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  if (s < 7 * 86400) return Math.floor(s / 86400) + 'd ago';
  return formatDate(iso);
}

// Modal helpers
function openModal(node, opts = {}) {
  const backdrop = h('div', { class: 'modal-backdrop', onclick: (e) => { if (e.target === backdrop) closeModal(); } });
  const modal = h('div', { class: 'modal' + (opts.wide ? ' wide' : '') });
  modal.appendChild(node);
  backdrop.appendChild(modal);
  $('#modal-mount').appendChild(backdrop);
  return { backdrop, modal };
}
function closeModal() { $('#modal-mount').innerHTML = ''; }
function confirmModal(message, onYes) {
  const card = h('div', {}, [
    h('h3', {}, 'Confirm'),
    h('p', {}, message),
    h('div', { class: 'modal-actions' }, [
      h('button', { class: 'btn-ghost', onclick: closeModal }, 'Cancel'),
      h('button', { class: 'btn-primary', onclick: () => { closeModal(); onYes(); } }, 'Yes'),
    ]),
  ]);
  openModal(card);
}

function readForm(formEl) {
  const o = {};
  $$('input, textarea, select', formEl).forEach((el) => {
    if (!el.name) return;
    if (el.type === 'checkbox') o[el.name] = el.checked;
    else if (el.type === 'number') o[el.name] = el.value === '' ? null : Number(el.value);
    else o[el.name] = el.value;
  });
  return o;
}

const bus = {
  l: {},
  on(e, cb) { (this.l[e] = this.l[e] || []).push(cb); },
  emit(e, p) { (this.l[e] || []).forEach((cb) => cb(p)); },
};

function esc(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

// Open a comment-thread modal for any entity (task, idea, checkin, kra, review, one_on_one).
async function openCommentThread(entityType, entityId, internId, label) {
  const card = h('div');
  card.appendChild(h('h3', {}, `💬 ${label || entityType} · comments`));
  const list = h('div', { style: 'max-height: 320px; overflow-y: auto; margin-bottom: 14px;' });
  card.appendChild(list);
  const input = h('textarea', { placeholder: 'Write a comment…', style: 'min-height:60px;' });
  card.appendChild(h('label', {}, [h('span', {}, 'New comment'), input]));
  const post = h('button', { class: 'btn-primary', onclick: async () => {
    if (!input.value.trim()) return;
    try {
      await api.postComment({ entity_type: entityType, entity_id: entityId, intern_id: internId, body: input.value });
      input.value = '';
      await refresh();
    } catch (e) { alert('Failed: ' + e.message); }
  } }, 'Post');
  card.appendChild(h('div', { class: 'modal-actions' }, [
    h('button', { class: 'btn-ghost', onclick: closeModal }, 'Close'),
    post,
  ]));
  openModal(card, { wide: true });

  async function refresh() {
    list.innerHTML = '';
    let comments = [];
    try { comments = await api.listComments(entityType, entityId); }
    catch (e) { list.appendChild(h('div', { class: 'help-text' }, 'Failed to load: ' + e.message)); return; }
    if (!comments.length) { list.appendChild(h('div', { class: 'empty-state' }, 'No comments yet. Start the thread.')); return; }
    comments.forEach((c) => list.appendChild(h('div', { style: 'padding:10px 0; border-bottom:1px solid var(--border);' }, [
      h('div', { style: 'display:flex; justify-content:space-between;' }, [
        h('strong', { style: 'font-size:13px;' }, c.author_name || 'Someone'),
        h('span', { class: 'help-text' }, timeAgo(c.created_at) + (c.author_role ? ' · ' + c.author_role : '')),
      ]),
      h('div', { style: 'font-size:13px; margin-top:4px; white-space:pre-wrap;' }, c.body),
    ])));
  }
  refresh();
}
