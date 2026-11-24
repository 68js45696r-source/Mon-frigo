const STORAGE_KEY = 'mon-frigo-items-v1';
const SOON_DAYS = 2;

const CATEGORIES = [
  'Fruits & Légumes',
  'Produits laitiers',
  'Viande & Poisson',
  'Plats préparés',
  'Boissons',
  'Surgelés',
  'Autre'
];

let items = load();
let editingId = null;
let activeFilter = null;

const $ = (id) => document.getElementById(id);

function load() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function today() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function parseDate(str) {
  if (!str) return null;
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function daysUntil(dateStr) {
  const t = today();
  const d = parseDate(dateStr);
  return Math.round((d - t) / 86400000);
}

function isExpired(item) {
  return item.expiry && daysUntil(item.expiry) < 0;
}

function isSoon(item) {
  const n = daysUntil(item.expiry);
  return item.expiry && n >= 0 && n <= SOON_DAYS;
}

function isLow(item) {
  return Number(item.qty) <= Number(item.min);
}

function formatDate(dateStr) {
  const d = parseDate(dateStr);
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

function render() {
  const list = $('list');
  const search = $('search').value.trim().toLowerCase();
  const cat = $('filterCategory').value;

  let visible = items.filter((i) => {
    const matchSearch = !search || i.name.toLowerCase().includes(search);
    const matchCat = !cat || i.category === cat;
    return matchSearch && matchCat;
  });

  const counts = {
    expired: items.filter(isExpired).length,
    soon: items.filter(isSoon).length,
    low: items.filter(isLow).length,
    total: items.length
  };
  $('sumExpired').textContent = counts.expired;
  $('sumSoon').textContent = counts.soon;
  $('sumLow').textContent = counts.low;
  $('sumTotal').textContent = counts.total;
  document.querySelectorAll('.summary-card').forEach((c) => {
    c.classList.toggle('active', c.dataset.filter === activeFilter);
  });

  if (activeFilter) {
    const tests = { expired: isExpired, soon: isSoon, low: isLow };
    visible = visible.filter(tests[activeFilter]);
  }

  const rank = (i) => {
    if (isExpired(i)) return 0;
    if (isSoon(i)) return 1;
    if (!i.expiry) return 3;
    return 2;
  };
  visible.sort((a, b) => {
    const r = rank(a) - rank(b);
    if (r !== 0) return r;
    if (a.expiry && b.expiry) return a.expiry.localeCompare(b.expiry);
    return a.name.localeCompare(b.name, 'fr');
  });

  list.innerHTML = '';
  for (const item of visible) {
    list.appendChild(renderItem(item));
  }

  $('empty').classList.toggle('hidden', visible.length !== 0);

  const banner = $('alertBanner');
  const expired = counts.expired;
  const soon = counts.soon;
  const low = counts.low;
  if (expired > 0 || soon > 0 || low > 0) {
    const parts = [];
    if (expired > 0) parts.push(`${expired} produit${expired > 1 ? 's' : ''} périmé${expired > 1 ? 's' : ''}`);
    if (soon > 0) parts.push(`${soon} périme${soon > 1 ? 'nt' : ''} sous ${SOON_DAYS} jours`);
    if (low > 0) parts.push(`${low} en stock bas`);
    banner.textContent = '⚠️ ' + parts.join(' · ');
    banner.className = 'alert-banner' + (expired > 0 ? '' : ' warn');
  } else {
    banner.className = 'hidden';
  }
}

function renderItem(item) {
  const el = document.createElement('div');
  el.className = 'item';
  const states = [];
  if (isExpired(item)) { el.classList.add('state-expired'); states.push('<span class="badge badge-expired">Périmé</span>'); }
  else if (isSoon(item)) { el.classList.add('state-soon'); states.push('<span class="badge badge-soon">Bientôt</span>'); }
  if (isLow(item)) states.push('<span class="badge badge-low">Stock bas</span>');

  let meta = `${item.qty} ${item.unit} · ${item.category}`;
  if (item.expiry) {
    const n = daysUntil(item.expiry);
    let dateInfo = `à consommer avant le ${formatDate(item.expiry)}`;
    if (n < 0) dateInfo = `périmé depuis ${-n} jour${-n > 1 ? 's' : ''}`;
    else if (n === 0) dateInfo = 'à consommer aujourd\u2019hui !';
    else if (n <= SOON_DAYS) dateInfo = `à consommer dans ${n} jour${n > 1 ? 's' : ''}`;
    meta += ` · ${dateInfo}`;
  }

  el.innerHTML = `
    <div class="item-info">
      <span class="item-name">${escapeHtml(item.name)}${states.join('')}</span>
      <span class="item-meta">${meta}</span>
    </div>
    <div class="item-actions">
      <button class="icon-btn" data-action="edit" aria-label="Modifier">✏️</button>
      <button class="icon-btn" data-action="stock" aria-label="+1 stock">➕</button>
    </div>`;

  el.querySelector('[data-action="edit"]').addEventListener('click', () => openDialog(item.id));
  el.querySelector('[data-action="stock"]').addEventListener('click', () => {
    item.qty = Number(item.qty) + 1;
    save();
    render();
  });
  return el;
}

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function openDialog(id = null) {
  editingId = id;
  const form = $('form');
  form.reset();
  if (id) {
    const item = items.find((i) => i.id === id);
    $('dialogTitle').textContent = 'Modifier le produit';
    $('fName').value = item.name;
    $('fQty').value = item.qty;
    $('fMin').value = item.min;
    $('fUnit').value = item.unit;
    $('fCategory').value = item.category;
    $('fExpiry').value = item.expiry || '';
    $('btnDelete').classList.remove('hidden');
  } else {
    $('dialogTitle').textContent = 'Ajouter un produit';
    $('fQty').value = 1;
    $('fMin').value = 1;
    $('fCategory').value = CATEGORIES[0];
    const suggest = new Date();
    suggest.setDate(suggest.getDate() + 3);
    $('fExpiry').value = suggest.toISOString().slice(0, 10);
    $('btnDelete').classList.add('hidden');
  }
  $('dialog').showModal();
}

function closeDialog() {
  $('dialog').close();
  editingId = null;
}

$('btnAdd').addEventListener('click', () => openDialog());
$('btnCancel').addEventListener('click', closeDialog);

$('btnDelete').addEventListener('click', () => {
  items = items.filter((i) => i.id !== editingId);
  save();
  closeDialog();
  render();
});

$('form').addEventListener('submit', (e) => {
  e.preventDefault();
  const data = {
    name: $('fName').value.trim(),
    qty: Number($('fQty').value),
    min: Number($('fMin').value),
    unit: $('fUnit').value,
    category: $('fCategory').value,
    expiry: $('fExpiry').value || null
  };
  if (editingId) {
    const item = items.find((i) => i.id === editingId);
    Object.assign(item, data);
  } else {
    items.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7), ...data });
    rememberName(data.name);
  }
  save();
  closeDialog();
  render();
});

function rememberName(name) {
  const key = 'mon-frigo-names';
  let names = [];
  try { names = JSON.parse(localStorage.getItem(key)) || []; } catch {}
  if (!names.includes(name)) {
    names.push(name);
    localStorage.setItem(key, JSON.stringify(names.slice(-30)));
  }
}

function refreshSuggestions() {
  let names = [];
  try { names = JSON.parse(localStorage.getItem('mon-frigo-names')) || []; } catch {}
  $('suggestions').innerHTML = names.map((n) => `<option value="${escapeHtml(n)}">`).join('');
}

document.querySelectorAll('.summary-card').forEach((card) => {
  card.addEventListener('click', () => {
    const f = card.dataset.filter;
    activeFilter = activeFilter === f ? null : f;
    render();
  });
});

$('search').addEventListener('input', render);
$('filterCategory').addEventListener('input', () => {
  saveFilters();
  render();
});

function saveFilters() {
  localStorage.setItem('mon-frigo-cat', $('filterCategory').value);
}

function restoreFilters() {
  const saved = localStorage.getItem('mon-frigo-cat');
  if (saved) $('filterCategory').value = saved;
}

async function requestNotifications() {
  if (!('Notification' in window) || Notification.permission !== 'default') return;
  try { await Notification.requestPermission(); } catch {}
}

function systemAlert() {
  const soon = items.filter(isSoon);
  const expired = items.filter(isExpired);
  const msg =
    (expired.length ? `${expired.length} produit(s) périmé(s)` : '') +
    (soon.length ? `${expired.length ? ' · ' : ''}${soon.length} périment sous ${SOON_DAYS} jours` : '');
  if (msg && 'Notification' in window && Notification.permission === 'granted') {
    try {
      navigator.serviceWorker.ready.then((reg) =>
        reg.showNotification('Mon Frigo', { body: msg, icon: 'icon-192.png' })
      );
    } catch {}
  }
}

CATEGORIES.forEach((c) => {
  const opt = document.createElement('option');
  opt.textContent = c;
  $('filterCategory').appendChild(opt);
});

restoreFilters();
refreshSuggestions();
render();
$('dialog').addEventListener('close', () => { editingId = null; });
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && 'serviceWorker' in navigator) {
    render();
  }
});
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').then(() => systemAlert());
  window.addEventListener('load', requestNotifications);
}
