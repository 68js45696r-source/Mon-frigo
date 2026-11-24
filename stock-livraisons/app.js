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
    const bl = mouvements
      .filter((m) => m.produitId === p.id && m.sens === 'E' && m.dateLivraison === lastDel)
      .map((m) => m.bordereau)
      .filter(Boolean);
    meta += ` · Dernière livraison : ${bl.length ? escapeHtml(bl[bl.length - 1]) + ' · ' : ''}${fmtDate(lastDel)}`;
  }
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
    $('btnDeleteProduit').classList.remove('hidden');
  } else {
    $('produitTitle').textContent = 'Nouveau produit';
    $('pSeuil').value = 1;
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
    produits.push({ id: uid(), ...data });
  }
  persist();
  $('dialogProduit').close();
  renderStock();
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
      meta += ` · BL : ${m.bordereau ? escapeHtml(m.bordereau) : '—'} · livré le ${fmtDate(m.dateLivraison)}`;
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

  const stockRows = [['Produit', 'Type', 'Stock actuel', 'Unité', 'Seuil alerte', 'État', 'Dernier bordereau', 'Date livraison']];
  for (const p of [...produits].sort((a, b) => a.type.localeCompare(b.type, 'fr') || a.nom.localeCompare(b.nom, 'fr'))) {
    const st = stockOf(p.id);
    const ld = lastDelivery(p.id);
    const bl = ld
      ? mouvements.filter((m) => m.produitId === p.id && m.sens === 'E' && m.dateLivraison === ld && m.bordereau).map((m) => m.bordereau)
      : [];
    stockRows.push([
      p.nom,
      p.type,
      st,
      p.unite,
      p.seuil,
      st <= 0 ? 'Rupture' : st <= p.seuil ? 'Stock bas' : 'OK',
      bl.length ? bl[bl.length - 1] : '',
      ld ? fmtDate(ld) : ''
    ]);
  }

  const mvtRows = [['Date', 'Type', 'Produit', 'Type produit', 'Quantité', 'Sens', 'Quantité signée', 'Unité', 'N° bordereau', 'Date livraison', 'Motif']];
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
