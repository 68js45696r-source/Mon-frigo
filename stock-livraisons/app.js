const STORAGE = {
  produits: 'mon-stock-produits-v1',
  mouvements: 'mon-stock-mouvements-v1',
  inventaires: 'mon-stock-inventaires-v1'
};

const TYPES = ['Conserves', 'Surgelés', 'Épiceries sèches'];
const SENS = { E: 'Entrée', S: 'Sortie', I: 'Inventaire' };

let produits = load(STORAGE.produits, []);
let mouvements = load(STORAGE.mouvements, []);
let inventaires = load(STORAGE.inventaires, []);
let editingProduitId = null;
let targetProduitId = null;

const $ = (id) => document.getElementById(id);

function load(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

function persist() {
  localStorage.setItem(STORAGE.produits, JSON.stringify(produits));
  localStorage.setItem(STORAGE.mouvements, JSON.stringify(mouvements));
  localStorage.setItem(STORAGE.inventaires, JSON.stringify(inventaires));
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = String(s);
  return d.innerHTML;
}

function fmtQty(n) {
  return Number(n).toLocaleString('fr-FR', { maximumFractionDigits: 3 });
}

function fmtDate(s) {
  if (!s) return '—';
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('fr-FR');
}

function todayStr() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function stockOf(pid) {
  return mouvements
    .filter((m) => m.produitId === pid)
    .reduce((s, m) => s + (m.sens === 'S' ? -m.qty : m.qty), 0);
}

function lastDelivery(pid) {
  let best = null;
  for (const m of mouvements) {
    if (m.produitId === pid && m.sens === 'E' && (!best || m.dateLivraison > best)) best = m.dateLivraison;
  }
  return best;
}

function lastEntry(pid) {
  let best = null;
  for (const m of mouvements) {
    if (m.produitId === pid && m.sens === 'E' && (!best || (m.dateLivraison || '') >= (best.dateLivraison || ''))) best = m;
  }
  return best;
}

function nearestDlc(pid) {
  const today = todayStr();
  const dlcs = mouvements
    .filter((m) => m.produitId === pid && m.sens === 'E' && m.dlc)
    .map((m) => m.dlc);
  if (!dlcs.length) return null;
  const upcoming = dlcs.filter((d) => d >= today).sort();
  return upcoming[0] || dlcs.slice().sort()[0];
}

function produitById(pid) {
  return produits.find((p) => p.id === pid);
}

function showToast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => t.classList.add('hidden'), 2500);
}

function switchTab(name) {
  document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  for (const id of ['stock', 'mouvements', 'inventaire']) {
    $(`tab-${id}`).classList.toggle('hidden', id !== name);
  }
  if (name === 'stock') renderStock();
  if (name === 'mouvements') renderMouvements();
  if (name === 'inventaire') renderInventaire();
}

function renderStock() {
  const list = $('stockList');
  const search = $('search').value.trim().toLowerCase();
  const type = $('filterType').value;

  list.innerHTML = '';
  for (const t of TYPES) {
    if (type && t !== type) continue;
    const group = produits.filter((p) => p.type === t && (!search || p.nom.toLowerCase().includes(search)));
    if (!group.length) continue;
    const h = document.createElement('div');
    h.className = 'section-title';
    h.textContent = `${t} (${group.length})`;
    list.appendChild(h);
    for (const p of group) list.appendChild(renderProduitCard(p));
  }

  $('emptyStock').classList.toggle(
    'hidden',
    produits.some((p) => (!type || p.type === type) && (!search || p.nom.toLowerCase().includes(search)))
  );

  const sel = $('filterMvtProduit');
  const current = sel.value;
  sel.innerHTML = '<option value="">Tous produits</option>';
  for (const p of [...produits].sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))) {
    sel.insertAdjacentHTML('beforeend', `<option value="${p.id}">${escapeHtml(p.nom)}</option>`);
  }
  sel.value = current;
}

function renderProduitCard(p) {
  const stock = stockOf(p.id);
  const low = stock <= p.seuil;
  const el = document.createElement('div');
  el.className = 'item' + (stock <= 0 ? ' state-zero' : low ? ' state-low' : '');
  const lastDel = lastDelivery(p.id);
  let meta = `Type : ${p.type} · seuil ${fmtQty(p.seuil)} ${p.unite}`;
  if (lastDel) {
    const le = lastEntry(p.id);
    meta += ` · Dernière livraison : ${le.bordereau ? escapeHtml(le.bordereau) : '—'} · lot ${le.lot ? escapeHtml(le.lot) : '—'} · ${fmtDate(lastDel)}`;
  }
  const dlc = nearestDlc(p.id);
  if (dlc) meta += ` · DLC : ${fmtDate(dlc)}`;
  const states = [];
  if (stock <= 0) states.push('<span class="badge badge-zero">Rupture</span>');
  else if (low) states.push('<span class="badge badge-low">Stock bas</span>');
  el.innerHTML = `
    <div class="item-info">
      <span class="item-name">${escapeHtml(p.nom)}${states.join('')}</span>
      <span class="item-meta"><strong>${fmtQty(stock)} ${p.unite}</strong> en stock</span>
      <span class="item-meta">${meta}</span>
    </div>
    <div class="item-actions">
      <button class="icon-btn" data-action="entree" aria-label="Entrée livraison">📥</button>
      <button class="icon-btn" data-action="sortie" aria-label="Sortie">📤</button>
      <button class="icon-btn" data-action="edit" aria-label="Modifier">✏️</button>
      <button class="icon-btn" data-action="del" aria-label="Supprimer">🗑️</button>
    </div>`;
  el.querySelector('[data-action="entree"]').addEventListener('click', () => openEntree(p.id));
  el.querySelector('[data-action="sortie"]').addEventListener('click', () => openSortie(p.id));
  el.querySelector('[data-action="edit"]').addEventListener('click', () => openDialogProduit(p.id));
  el.querySelector('[data-action="del"]').addEventListener('click', () => {
    if (!confirm(`Supprimer « ${p.nom} » et tous ses mouvements ?`)) return;
    produits = produits.filter((x) => x.id !== p.id);
    mouvements = mouvements.filter((m) => m.produitId !== p.id);
    persist();
    renderStock();
    showToast('Produit supprimé');
  });
  return el;
}

function openDialogProduit(id = null) {
  editingProduitId = id;
  $('formProduit').reset();
  if (id) {
    const p = produitById(id);
    $('produitTitle').textContent = 'Modifier le produit';
    $('pNom').value = p.nom;
    $('pType').value = p.type;
    $('pUnite').value = p.unite;
    $('pSeuil').value = p.seuil;
    $('wrapStockInit').classList.add('hidden');
    $('btnDeleteProduit').classList.remove('hidden');
  } else {
    $('produitTitle').textContent = 'Nouveau produit';
    $('pSeuil').value = 1;
    $('pStockInit').value = 0;
    $('wrapStockInit').classList.remove('hidden');
    $('btnDeleteProduit').classList.add('hidden');
  }
  $('dialogProduit').showModal();
}

$('btnAdd').addEventListener('click', () => openDialogProduit());
$('btnDeleteProduit').addEventListener('click', () => {
  if (!confirm('Supprimer ce produit et tous ses mouvements ?')) return;
  produits = produits.filter((x) => x.id !== editingProduitId);
  mouvements = mouvements.filter((m) => m.produitId !== editingProduitId);
  persist();
  $('dialogProduit').close();
  renderStock();
});

$('formProduit').addEventListener('submit', (e) => {
  e.preventDefault();
  const data = {
    nom: $('pNom').value.trim(),
    type: $('pType').value,
    unite: $('pUnite').value,
    seuil: Number($('pSeuil').value)
  };
  if (editingProduitId) {
    Object.assign(produitById(editingProduitId), data);
  } else {
    const stockInit = Number($('pStockInit').value) || 0;
    const p = { id: uid(), barcode: pendingScanBarcode || null, ...data };
    produits.push(p);
    if (stockInit > 0) {
      mouvements.push({
        id: uid(),
        produitId: p.id,
        sens: 'E',
        qty: stockInit,
        bordereau: 'Stock initial',
        dateLivraison: todayStr(),
        date: todayStr(),
        motif: ''
      });
    }
    if (pendingScanBarcode && data.nom) rememberBarcodeName(pendingScanBarcode, data.nom);
    pendingScanBarcode = null;
  }
  persist();
  $('dialogProduit').close();
  renderStock();
});

document.getElementById('dialogProduit').addEventListener('close', () => {
  pendingScanBarcode = null;
});

function openEntree(pid) {
  targetProduitId = pid;
  const p = produitById(pid);
  $('entreeProduit').textContent = `Produit : ${p.nom} (stock actuel : ${fmtQty(stockOf(pid))} ${p.unite})`;
  $('formEntree').reset();
  $('eDate').value = todayStr();
  $('dialogEntree').showModal();
}

$('formEntree').addEventListener('submit', (e) => {
  e.preventDefault();
  const p = produitById(targetProduitId);
  if (!p) return;
  mouvements.push({
    id: uid(),
    produitId: p.id,
    sens: 'E',
    qty: Number($('eQty').value),
    bordereau: $('eBordereau').value.trim(),
    dateLivraison: $('eDate').value,
    lot: $('eLot').value.trim(),
    dlc: $('eDlc').value,
    date: todayStr(),
    motif: ''
  });
  persist();
  $('dialogEntree').close();
  renderStock();
  showToast(`+ ${fmtQty($('eQty').value)} ${p.unite} de ${p.nom}`);
});

function openSortie(pid) {
  targetProduitId = pid;
  const p = produitById(pid);
  $('sortieProduit').textContent = `Produit : ${p.nom} (stock actuel : ${fmtQty(stockOf(pid))} ${p.unite})`;
  $('formSortie').reset();
  $('dialogSortie').showModal();
}

$('formSortie').addEventListener('submit', (e) => {
  e.preventDefault();
  const p = produitById(targetProduitId);
  if (!p) return;
  const qty = Number($('sQty').value);
  if (qty > stockOf(p.id)) {
    if (!confirm(`La quantité dépasse le stock actuel (${fmtQty(stockOf(p.id))} ${p.unite}). Enregistrer quand même ?`)) return;
  }
  mouvements.push({
    id: uid(),
    produitId: p.id,
    sens: 'S',
    qty,
    bordereau: '',
    dateLivraison: '',
    date: todayStr(),
    motif: $('sMotif').value.trim()
  });
  persist();
  $('dialogSortie').close();
  renderStock();
  showToast(`− ${fmtQty(qty)} ${p.unite} de ${p.nom}`);
});

function renderMouvements() {
  const list = $('mvtList');
  const pid = $('filterMvtProduit').value;
  const type = $('filterMvtType').value;
  let rows = mouvements.filter((m) => (!pid || m.produitId === pid) && (!type || m.sens === type));
  rows = rows.slice().sort((a, b) =>
    b.date.localeCompare(a.date) || (b.dateLivraison || '').localeCompare(a.dateLivraison || '')
  );
  list.innerHTML = '';
  for (const m of rows) {
    const p = produitById(m.produitId);
    if (!p) continue;
    const el = document.createElement('div');
    el.className = `item mvt-item mvt-${m.sens}`;
    let meta = `${fmtDate(m.date)} · ${p.type}`;
    if (m.sens === 'E') {
      meta += ` · BL : ${m.bordereau ? escapeHtml(m.bordereau) : '—'} · livré le ${fmtDate(m.dateLivraison)} · lot : ${m.lot ? escapeHtml(m.lot) : '—'} · DLC : ${m.dlc ? fmtDate(m.dlc) : '—'}`;
    } else if (m.motif) {
      meta += ` · ${escapeHtml(m.motif)}`;
    }
    const sign = m.sens === 'S' ? '−' : '+';
    const cls = m.sens === 'S' ? 'mvt-neg' : 'mvt-pos';
    el.innerHTML = `
      <div class="item-info">
        <span class="item-name">${escapeHtml(p.nom)} <span class="mvt-qty ${cls}">${sign}${fmtQty(m.qty)} ${p.unite}</span></span>
        <span class="item-meta">${SENS[m.sens]} · ${meta}</span>
      </div>
      <div class="item-actions">
        <button class="icon-btn" data-action="del" aria-label="Supprimer">🗑️</button>
      </div>`;
    el.querySelector('[data-action="del"]').addEventListener('click', () => {
      if (!confirm('Supprimer ce mouvement ?')) return;
      mouvements = mouvements.filter((x) => x.id !== m.id);
      persist();
      renderMouvements();
    });
    list.appendChild(el);
  }
  $('emptyMvt').classList.toggle('hidden', rows.length !== 0);
}

$('filterMvtProduit').addEventListener('input', renderMouvements);
$('filterMvtType').addEventListener('input', renderMouvements);

function renderInventaire() {
  const list = $('invList');
  list.innerHTML = '';
  for (const p of [...produits].sort((a, b) => a.type.localeCompare(b.type, 'fr') || a.nom.localeCompare(b.nom, 'fr'))) {
    const theo = stockOf(p.id);
    const el = document.createElement('div');
    el.className = 'item inv-row';
    el.dataset.pid = p.id;
    el.innerHTML = `
      <div class="item-info">
        <span class="item-name">${escapeHtml(p.nom)}</span>
        <span class="item-meta">${p.type}</span>
      </div>
      <span class="inv-theo" title="Stock théorique">${fmtQty(theo)} ${p.unite}</span>
      <input type="number" min="0" step="any" placeholder="Réel" data-reel>
      <span class="inv-ecart" data-ecart></span>`;
    const input = el.querySelector('[data-reel]');
    const ecartEl = el.querySelector('[data-ecart]');
    input.addEventListener('input', () => {
      if (input.value === '') {
        ecartEl.textContent = '';
        ecartEl.className = 'inv-ecart';
      } else {
        const ecart = Number(input.value) - theo;
        ecartEl.textContent = (ecart > 0 ? '+' : '') + fmtQty(ecart);
        ecartEl.className = 'inv-ecart' + (ecart < 0 ? ' ecart-neg' : ecart > 0 ? ' ecart-pos' : '');
      }
      updateValidateBtn();
    });
    list.appendChild(el);
  }
  updateValidateBtn();
  if (!$('invDate').value) $('invDate').value = todayStr();
}

function updateValidateBtn() {
  const any = [...document.querySelectorAll('#invList [data-reel]')].some((i) => i.value !== '');
  $('btnValidateInv').disabled = !any;
}

$('btnValidateInv').addEventListener('click', () => {
  const invDate = $('invDate').value || todayStr();
  const invId = uid();
  const lignes = [];
  for (const row of document.querySelectorAll('#invList .inv-row')) {
    const input = row.querySelector('[data-reel]');
    if (input.value === '') continue;
    const pid = row.dataset.pid;
    const p = produitById(pid);
    const theo = stockOf(pid);
    const reel = Number(input.value);
    const ecart = reel - theo;
    lignes.push({ produitId: pid, theo, reel, ecart });
    if (ecart !== 0) {
      mouvements.push({
        id: uid(),
        produitId: pid,
        sens: 'I',
        qty: ecart,
        bordereau: '',
        dateLivraison: '',
        date: invDate,
        motif: `Ajustement inventaire du ${fmtDate(invDate)}`
      });
    }
  }
  inventaires.push({ id: invId, date: invDate, lignes });
  persist();
  renderInventaire();
  showToast(`Inventaire enregistré (${lignes.length} produit${lignes.length > 1 ? 's' : ''})`);
});

document.querySelectorAll('.tab').forEach((b) => {
  b.addEventListener('click', () => switchTab(b.dataset.tab));
});

$('search').addEventListener('input', renderStock);
$('filterType').addEventListener('input', renderStock);
document.querySelectorAll('[data-close]').forEach((b) => {
  b.addEventListener('click', () => b.closest('dialog').close());
});

renderStock();

let pendingScanBarcode = null;

function rememberBarcodeName(barcode, name) {
  const key = 'mon-stock-barcodes';
  let map = {};
  try { map = JSON.parse(localStorage.getItem(key)) || {}; } catch {}
  map[barcode] = name;
  localStorage.setItem(key, JSON.stringify(map));
}

function getCachedBarcodeName(barcode) {
  let map = {};
  try { map = JSON.parse(localStorage.getItem('mon-stock-barcodes')) || {}; } catch {}
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
  const p = produits.find((x) => x.barcode === barcode);
  if (p) {
    showToast(`Produit reconnu : ${p.nom} — enregistrez la livraison`);
    openEntree(p.id);
    return;
  }
  pendingScanBarcode = barcode;
  const cached = getCachedBarcodeName(barcode);
  const name = cached || await fetchProductName(barcode);
  if (name) rememberBarcodeName(barcode, name);
  openDialogProduit();
  if (pendingScanBarcode !== barcode) return;
  if (name) {
    $('pNom').value = name;
    $('produitTitle').textContent = 'Nouveau produit scanné';
  } else {
    $('pNom').setAttribute('placeholder', `Nom du produit ${barcode}`);
    $('pNom').focus();
  }
}

function xmlEscape(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function colRef(n) {
  let s = '';
  n += 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function sheetXml(rows) {
  let xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  xml += '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>';
  rows.forEach((row, i) => {
    xml += `<row r="${i + 1}">`;
    row.forEach((cell, j) => {
      const ref = `${colRef(j)}${i + 1}`;
      if (cell === null || cell === undefined || cell === '') {
        return;
      } else if (typeof cell === 'number' && Number.isFinite(cell)) {
        xml += `<c r="${ref}"><v>${cell}</v></c>`;
      } else {
        xml += `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(cell)}</t></is></c>`;
      }
    });
    xml += '</row>';
  });
  xml += '</sheetData></worksheet>';
  return xml;
}

function workbookXml(names) {
  let sheets = '';
  names.forEach((name, i) => {
    sheets += `<sheet name="${xmlEscape(name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`;
  });
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ` +
    `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets}</sheets></workbook>`;
}

function workbookRels(count) {
  let rels = '';
  for (let i = 1; i <= count; i++) {
    rels += `<Relationship Id="rId${i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i}.xml"/>`;
  }
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}</Relationships>`;
}

function contentTypes(count) {
  let overrides = `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>`;
  for (let i = 1; i <= count; i++) {
    overrides += `<Override PartName="/xl/worksheets/sheet${i}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`;
  }
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>${overrides}</Types>`;
}

function rootRels() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
    `</Relationships>`;
}

let CRC_TABLE = null;
function crc32(bytes) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function makeZip(entries) {
  const enc = new TextEncoder();
  const chunks = [];
  const central = [];
  let offset = 0;
  const d = new Date();
  const dosTime = ((d.getHours() & 31) << 11) | ((d.getMinutes() & 63) << 5) | ((d.getSeconds() / 2) & 31);
  const dosDate = (((d.getFullYear() - 1980) & 127) << 9) | (((d.getMonth() + 1) & 15) << 5) | (d.getDate() & 31);

  const hdr = (view) => {
    view.setUint16(0, 0, true);
  };
  const dv = (arr) => new DataView(arr.buffer);

  for (const e of entries) {
    const nameBytes = enc.encode(e.name);
    const data = enc.encode(e.data);
    const crc = crc32(data);
    const local = new Uint8Array(30 + nameBytes.length + data.length);
    const lv = dv(local);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true);
    lv.setUint16(8, 0, true);
    lv.setUint16(10, dosTime, true);
    lv.setUint16(12, dosDate, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    local.set(nameBytes, 30);
    local.set(data, 30 + nameBytes.length);
    chunks.push(local);

    const c = new Uint8Array(46 + nameBytes.length);
    const cv = dv(c);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, dosTime, true);
    cv.setUint16(14, dosDate, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);
    c.set(nameBytes, 46);
    central.push(c);

    offset += local.length;
  }

  const centralSize = central.reduce((s, c) => s + c.length, 0);
  const eocd = new Uint8Array(22);
  const ev = dv(eocd);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);

  const total = offset + centralSize + 22;
  const out = new Uint8Array(total);
  let pos = 0;
  for (const c of [...chunks, ...central, eocd]) {
    out.set(c, pos);
    pos += c.length;
  }
  return out;
}

function buildWorkbookBytes() {
  const pMap = new Map(produits.map((p) => [p.id, p]));

  const stockRows = [['Produit', 'Type', 'Stock actuel', 'Unité', 'Seuil alerte', 'État', 'Dernier bordereau', 'Date livraison', 'Dernier n° de lot', 'DLC la plus proche']];
  for (const p of [...produits].sort((a, b) => a.type.localeCompare(b.type, 'fr') || a.nom.localeCompare(b.nom, 'fr'))) {
    const st = stockOf(p.id);
    const ld = lastDelivery(p.id);
    const le = ld ? lastEntry(p.id) : null;
    const dlc = nearestDlc(p.id);
    stockRows.push([
      p.nom,
      p.type,
      st,
      p.unite,
      p.seuil,
      st <= 0 ? 'Rupture' : st <= p.seuil ? 'Stock bas' : 'OK',
      le && le.bordereau ? le.bordereau : '',
      ld ? fmtDate(ld) : '',
      le && le.lot ? le.lot : '',
      dlc ? fmtDate(dlc) : ''
    ]);
  }

  const mvtRows = [['Date', 'Type', 'Produit', 'Type produit', 'Quantité', 'Sens', 'Quantité signée', 'Unité', 'N° bordereau', 'Date livraison', 'N° de lot', 'DLC', 'Motif']];
  const mvts = mouvements.slice().sort((a, b) => b.date.localeCompare(a.date) || (b.dateLivraison || '').localeCompare(a.dateLivraison || ''));
  for (const m of mvts) {
    const p = pMap.get(m.produitId);
    if (!p) continue;
    mvtRows.push([
      fmtDate(m.date),
      SENS[m.sens],
      p.nom,
      p.type,
      m.qty,
      m.sens === 'S' ? 'Sortie' : 'Entrée',
      m.sens === 'S' ? -m.qty : m.qty,
      p.unite,
      m.bordereau || '',
      m.dateLivraison ? fmtDate(m.dateLivraison) : '',
      m.lot || '',
      m.dlc ? fmtDate(m.dlc) : '',
      m.motif || ''
    ]);
  }

  const invRows = [['Date inventaire', 'Produit', 'Type produit', 'Stock théorique', 'Stock réel', 'Écart', 'Unité']];
  const invs = inventaires.slice().sort((a, b) => b.date.localeCompare(a.date));
  for (const inv of invs) {
    for (const l of inv.lignes) {
      const p = pMap.get(l.produitId);
      if (!p) continue;
      invRows.push([fmtDate(inv.date), p.nom, p.type, l.theo, l.reel, l.ecart, p.unite]);
    }
  }

  return makeZip([
    { name: '[Content_Types].xml', data: contentTypes(3) },
    { name: '_rels/.rels', data: rootRels() },
    { name: 'xl/workbook.xml', data: workbookXml(['Stock actuel', 'Mouvements', 'Inventaires']) },
    { name: 'xl/_rels/workbook.xml.rels', data: workbookRels(3) },
    { name: 'xl/worksheets/sheet1.xml', data: sheetXml(stockRows) },
    { name: 'xl/worksheets/sheet2.xml', data: sheetXml(mvtRows) },
    { name: 'xl/worksheets/sheet3.xml', data: sheetXml(invRows) }
  ]);
}

$('btnExport').addEventListener('click', () => {
  if (!produits.length) {
    showToast('Aucun produit à exporter');
    return;
  }
  const bytes = buildWorkbookBytes();
  const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `mon-stock-${todayStr().replace(/-/g, '')}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  showToast('Export Excel généré');
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js'));
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
