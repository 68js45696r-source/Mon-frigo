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
  pendingBarcode = null;
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
    if (pendingBarcode) item.barcode = pendingBarcode;
    Object.assign(item, data);
  } else {
    items.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7), barcode: pendingBarcode, ...data });
    rememberName(data.name);
    if (pendingBarcode && data.name) rememberBarcode(pendingBarcode, data.name);
  }
  pendingBarcode = null;
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
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && 'serviceWorker' in navigator) {
    render();
  }
});
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').then(() => systemAlert());
  window.addEventListener('load', requestNotifications);
}

let pendingBarcode = null;

function rememberBarcode(barcode, name) {
  const key = 'mon-frigo-barcodes';
  let map = {};
  try { map = JSON.parse(localStorage.getItem(key)) || {}; } catch {}
  map[barcode] = name;
  localStorage.setItem(key, JSON.stringify(map));
}

function getCachedBarcode(barcode) {
  let map = {};
  try { map = JSON.parse(localStorage.getItem('mon-frigo-barcodes')) || {}; } catch {}
  return map[barcode] || null;
}

async function fetchProductName(barcode) {
  if (!navigator.onLine) return null;
  try {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(
      'https://world.openfoodfacts.org/api/v2/product/' + barcode + '.json',
      { signal: ctrl.signal }
    );
    if (!res.ok) return null;
    const json = await res.json();
    if (json.status !== 1 || !json.product) return null;
    const p = json.product;
    return p.product_name_fr || p.product_name || null;
  } catch {
    return null;
  }
}

async function onBarcodeScanned(raw) {
  const barcode = String(raw).trim();
  stopScanner();
  beep();
  const existing = items.find((i) => i.barcode === barcode);
  if (existing) {
    existing.qty = Number(existing.qty) + 1;
    if (daysUntil(existing.expiry) < 0) existing.expiry = null;
    save();
    render();
    showToast(`${existing.name} : +1 ${existing.unit}`);
    return;
  }
  const cached = getCachedBarcode(barcode);
  const name = cached || await fetchProductName(barcode);
  if (name) {
    rememberBarcode(barcode, name);
    openPrefillDialog(name, barcode);
  } else {
    pendingBarcode = barcode;
    $('dialogTitle').textContent = `Produit ${barcode}`;
    openDialogEmpty();
    showToast('Produit inconnu — saisissez son nom une fois');
  }
}

function openPrefillDialog(name, barcode) {
  pendingBarcode = barcode;
  const form = $('form');
  form.reset();
  $('dialogTitle').textContent = 'Date de consommation ?';
  $('fName').value = name;
  $('fQty').value = 1;
  $('fMin').value = 1;
  $('fCategory').value = CATEGORIES[0];
  const suggest = new Date();
  suggest.setDate(suggest.getDate() + 3);
  $('fExpiry').value = suggest.toISOString().slice(0, 10);
  $('btnDelete').classList.add('hidden');
  $('dialog').showModal();
  $('fExpiry').focus();
}

function openDialogEmpty() {
  const form = $('form');
  form.reset();
  if (!$('dialog').open) $('dialog').showModal();
  $('fQty').value = 1;
  $('fMin').value = 1;
  $('fCategory').value = CATEGORIES[0];
  const suggest = new Date();
  suggest.setDate(suggest.getDate() + 3);
  $('fExpiry').value = suggest.toISOString().slice(0, 10);
  $('btnDelete').classList.add('hidden');
  $('fName').focus();
}

function showToast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => t.classList.add('hidden'), 2500);
}

function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g);
    g.connect(ctx.destination);
    o.type = 'sine';
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.15, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
    o.start();
    o.stop(ctx.currentTime + 0.25);
    setTimeout(() => ctx.close(), 500);
  } catch {}
}

const EAN_L = ['0001101','0011001','0010011','0111101','0100011','0110001','0101111','0111011','0110111','0001011'];
const EAN_G = ['0100111','0110011','0011011','0100001','0011101','0111001','0000101','0010001','0001001','0010111'];
const EAN_R = EAN_L.map((c) => c.split('').map((b) => (b === '1' ? '0' : '1')).join(''));
const EAN_PARITY = ['LLLLLL','LLGLGG','LLGGLG','LLGGGL','LGLLGG','LGGLLG','LGGGLL','LGLGLG','LGLGGL','LGGLGL'];

function decodeEAN13From(runs, s) {
  if (s + 59 > runs.length || !runs[s].black) return null;
  let total = 0;
  for (let i = 0; i < 59; i++) total += runs[s + i].len;
  const m = total / 95;
  if (m < 1.5) return null;
  const u = [];
  for (let i = 0; i < 59; i++) u.push(Math.max(1, Math.round(runs[s + i].len / m)));
  if (u[0] !== 1 || u[1] !== 1 || u[2] !== 1) return null;
  if (u[27] !== 1 || u[28] !== 1 || u[29] !== 1 || u[30] !== 1 || u[31] !== 1) return null;
  if (u[56] !== 1 || u[57] !== 1 || u[58] !== 1) return null;
  for (let j = 0; j < 12; j++) {
    const off = j < 6 ? 3 + 4 * j : 32 + 4 * (j - 6);
    const bits = j < 6
      ? '0'.repeat(u[off]) + '1'.repeat(u[off + 1]) + '0'.repeat(u[off + 2]) + '1'.repeat(u[off + 3])
      : '1'.repeat(u[off]) + '0'.repeat(u[off + 1]) + '1'.repeat(u[off + 2]) + '0'.repeat(u[off + 3]);
    if (bits.length !== 7) return null;
    u[j] = bits;
  }
  const digits = [];
  let parity = '';
  for (let j = 0; j < 6; j++) {
    const li = EAN_L.indexOf(u[j]);
    const gi = EAN_G.indexOf(u[j]);
    if (li >= 0) { digits.push(li); parity += 'L'; }
    else if (gi >= 0) { digits.push(gi); parity += 'G'; }
    else return null;
  }
  for (let j = 6; j < 12; j++) {
    const ri = EAN_R.indexOf(u[j]);
    if (ri < 0) return null;
    digits.push(ri);
  }
  const first = EAN_PARITY.indexOf(parity);
  if (first < 0) return null;
  const all = String(first) + digits.join('');
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(all[i]) * (i % 2 === 1 ? 3 : 1);
  if ((10 - (sum % 10)) % 10 !== Number(all[12])) return null;
  return all;
}

function decodeEAN8From(runs, s) {
  if (s + 43 > runs.length || !runs[s].black) return null;
  let total = 0;
  for (let i = 0; i < 43; i++) total += runs[s + i].len;
  const m = total / 67;
  if (m < 1.5) return null;
  const u = [];
  for (let i = 0; i < 43; i++) u.push(Math.max(1, Math.round(runs[s + i].len / m)));
  if (u[0] !== 1 || u[1] !== 1 || u[2] !== 1) return null;
  if (u[19] !== 1 || u[20] !== 1 || u[21] !== 1 || u[22] !== 1 || u[23] !== 1) return null;
  if (u[40] !== 1 || u[41] !== 1 || u[42] !== 1) return null;
  for (let j = 0; j < 8; j++) {
    const off = j < 4 ? 3 + 4 * j : 24 + 4 * (j - 4);
    const bits = j < 4
      ? '0'.repeat(u[off]) + '1'.repeat(u[off + 1]) + '0'.repeat(u[off + 2]) + '1'.repeat(u[off + 3])
      : '1'.repeat(u[off]) + '0'.repeat(u[off + 1]) + '1'.repeat(u[off + 2]) + '0'.repeat(u[off + 3]);
    if (bits.length !== 7) return null;
    u[j] = bits;
  }
  const digits = [];
  for (let j = 0; j < 4; j++) {
    const li = EAN_L.indexOf(u[j]);
    if (li < 0) return null;
    digits.push(li);
  }
  for (let j = 4; j < 8; j++) {
    const ri = EAN_R.indexOf(u[j]);
    if (ri < 0) return null;
    digits.push(ri);
  }
  const all = digits.join('');
  let sum = 0;
  for (let i = 0; i < 7; i++) sum += Number(all[i]) * (i % 2 === 0 ? 3 : 1);
  if ((10 - (sum % 10)) % 10 !== Number(all[7])) return null;
  return all;
}

function scanRow(lum) {
  let min = 255, max = 0;
  for (let i = 0; i < lum.length; i++) {
    if (lum[i] < min) min = lum[i];
    if (lum[i] > max) max = lum[i];
  }
  if (max - min < 60) return null;
  const mid = (min + max) / 2;
  const runs = [];
  let black = lum[0] < mid;
  let len = 1;
  for (let i = 1; i < lum.length; i++) {
    const b = lum[i] < mid;
    if (b === black) len++;
    else { runs.push({ black, len }); black = b; len = 1; }
  }
  runs.push({ black, len });
  for (let s = 0; s + 43 <= runs.length; s++) {
    const e13 = decodeEAN13From(runs, s);
    if (e13) return e13;
    const e8 = decodeEAN8From(runs, s);
    if (e8) return e8;
  }
  return null;
}

let stream = null;
let scanning = false;
let rafId = null;
let lastDecode = 0;
let lastFound = { code: null, time: 0 };
let barcodeDetector = null;

if ('BarcodeDetector' in window) {
  BarcodeDetector.getSupportedFormats().then((f) => {
    if (f.includes('ean_13') || f.includes('ean_8')) barcodeDetector = new BarcodeDetector({ formats: ['ean_13', 'ean_8'] });
  }).catch(() => {});
}

async function startScanner() {
  const video = $('scanVideo');
  $('scanner').classList.remove('hidden');
  $('scanHint').classList.add('hidden');
  $('scanStatus').textContent = 'Alignez le code-barres dans le cadre';
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false
    });
  } catch {
    $('scanHint').classList.remove('hidden');
    return;
  }
  video.srcObject = stream;
  try { await video.play(); } catch {}
  scanning = true;
  if (barcodeDetector) detectLoop();
  else decodeLoop();
}

function stopScanner() {
  scanning = false;
  if (rafId) cancelAnimationFrame(rafId);
  rafId = null;
  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }
  $('scanVideo').srcObject = null;
  $('scanner').classList.add('hidden');
}

async function detectLoop() {
  if (!scanning) return;
  try {
    const codes = await barcodeDetector.detect($('scanVideo'));
    const now = performance.now();
    if (codes.length && !(codes[0].rawValue === lastFound.code && now - lastFound.time < 3000)) {
      lastFound = { code: codes[0].rawValue, time: now };
      onBarcodeScanned(codes[0].rawValue);
      return;
    }
  } catch {}
  rafId = requestAnimationFrame(detectLoop);
}

function decodeLoop() {
  if (!scanning) return;
  const now = performance.now();
  if (now - lastDecode > 130) {
    lastDecode = now;
    const code = processFrame();
    if (code && !(code === lastFound.code && now - lastFound.time < 3000)) {
      lastFound = { code, time: now };
      onBarcodeScanned(code);
      return;
    }
  }
  rafId = requestAnimationFrame(decodeLoop);
}

function processFrame() {
  const video = $('scanVideo');
  const canvas = $('scanCanvas');
  const w = 480;
  const h = Math.max(240, Math.round(w * video.videoHeight / Math.max(1, video.videoWidth)));
  if (!video.videoWidth) return null;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(video, 0, 0, w, h);
  for (const frac of [0.34, 0.44, 0.54, 0.64]) {
    const y = Math.floor(h * frac);
    const data = ctx.getImageData(0, y, w, 1).data;
    const lum = new Array(w);
    for (let x = 0; x < w; x++) {
      lum[x] = 0.299 * data[x * 4] + 0.587 * data[x * 4 + 1] + 0.114 * data[x * 4 + 2];
    }
    const code = scanRow(lum);
    if (code) return code;
  }
  return null;
}

$('btnScan').addEventListener('click', startScanner);
$('btnCloseScanner').addEventListener('click', stopScanner);
$('dialog').addEventListener('close', () => {
  editingId = null;
  pendingBarcode = null;
});
