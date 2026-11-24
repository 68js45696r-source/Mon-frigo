const STORAGE = {
  benefits: 'distrib-benefs-v1',
  dists: 'distrib-dists-v1'
};

const TARIF = 1;
const STATUTS = ['Célibataire', 'Couple avec enfant(s)', 'Monoparentale avec enfant(s)'];

let benefits = load(STORAGE.benefits, []);
let dists = load(STORAGE.dists, []);
let currentTab = 'benefs';
let currentDistId = null;
let editingBenefId = null;
let editingPartKey = null;
let pickerDistId = null;
let pickerContextDistId = null;

const $ = (id) => document.getElementById(id);

function load(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

function persist() {
  localStorage.setItem(STORAGE.benefits, JSON.stringify(benefits));
  localStorage.setItem(STORAGE.dists, JSON.stringify(dists));
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = String(s);
  return d.innerHTML;
}

function eur(n) {
  return n.toFixed(2).replace('.', ',') + ' €';
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return d ? `${d}/${m}/${y}` : iso;
}

function showToast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  setTimeout(() => t.classList.add('hidden'), 2200);
}

function benefById(id) {
  return benefits.find((b) => b.id === id) || null;
}

function nextProvisionalId() {
  let max = 0;
  for (const b of benefits) {
    const m = String(b.id || '').match(/^P-(\d+)$/i);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `P-${String(max + 1).padStart(3, '0')}`;
}

function payeOf(part) {
  return typeof part.paye === 'number' ? part.paye : 0;
}

function soldeOf(benefId, excludeDistId) {
  let solde = 0;
  for (const d of dists) {
    if (d.id === excludeDistId) continue;
    for (const p of d.participants) {
      if (p.benefId === benefId) solde += TARIF - payeOf(p);
    }
  }
  return Math.round(solde * 100) / 100;
}

function benefFull(b) {
  return `${b.prenom || ''} ${b.nom || ''}`.trim() || b.id;
}

function norm(s) {
  return String(s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
}

function toIsoDate(v) {
  if (v instanceof Date && !isNaN(v)) {
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`;
  }
  const s = String(v ?? '').trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  let m = s.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2})$/);
  if (m) return `${2000 + +m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  const n = Number(String(s).replace(',', '.'));
  if (Number.isFinite(n) && n > 20000 && n < 60000) {
    const d = new Date(Math.round((n - 25569) * 86400 * 1000));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  }
  return '';
}

function toNumber(v) {
  const n = Number(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

const HEADER_MAP = {
  id: ['identifiant', 'id', 'code', 'nbeneficiaire', 'numbeneficiaire', 'numerobeneficiaire', 'numero', 'reference', 'ref'],
  nom: ['nom', 'nomfamille', 'lastname', 'nomdereferent', 'nomreferent'],
  prenom: ['prenom', 'firstname', 'prenomdereferent', 'prenomreferent'],
  naissance: ['datedenaissance', 'naissance', 'datenaissance', 'dob'],
  tel: ['telephone', 'tel', 'numerodetelephone', 'portable', 'gsm'],
  statut: ['statut', 'situation', 'situationfamiliale', 'composition', 'compositionfamiliale', 'typefamille'],
  nb: ['nbdepersonnes', 'nbpersonnes', 'nombresdepersonnes', 'nombredepersonnes', 'personnes', 'taillefamille', 'nbpersonnesdanslafamille', 'nbpersonnesfamille']
};

const COLS = ['id', 'nom', 'prenom', 'naissance', 'tel', 'statut', 'nb'];

function mapHeaders(header) {
  const idx = {};
  header.forEach((h, i) => {
    const n = norm(h);
    for (const key of COLS) {
      if (HEADER_MAP[key].includes(n) && idx[key] === undefined) idx[key] = i;
    }
  });
  return idx;
}

function rowToBenef(row, idx) {
  const get = (k) => (idx[k] !== undefined ? String(row[idx[k]] ?? '').trim() : '');
  const nb = toNumber(get('nb'));
  return {
    id: get('id'),
    nom: get('nom'),
    prenom: get('prenom'),
    naissance: toIsoDate(get('naissance')),
    tel: get('tel').replace(/\s+/g, ' '),
    statut: get('statut'),
    nbPersonnes: nb && nb > 0 ? Math.round(nb) : null
  };
}

async function importFile(file) {
  const isCsv = /\.csv$/i.test(file.name);
  let rows;
  try {
    rows = isCsv ? XLSX.readCsv(await file.text()) : await XLSX.readXlsx(await file.arrayBuffer());
  } catch (e) {
    showToast('Fichier illisible : ' + e.message);
    return;
  }
  if (!rows.length) {
    showToast('Fichier vide');
    return;
  }
  let idx = null;
  let headerRow = 0;
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const cand = mapHeaders(rows[i]);
    if (cand.nom !== undefined) {
      idx = cand;
      headerRow = i;
      break;
    }
  }
  if (!idx) {
    showToast('Colonnes non reconnues : colonne « Nom « indispensable');
    return;
  }
  let added = 0;
  let updated = 0;
  const byId = new Map(benefits.map((b) => [String(b.id).toLowerCase(), b]));
  for (let r = headerRow + 1; r < rows.length; r++) {
    const data = rowToBenef(rows[r], idx);
    if (!data.nom && !data.prenom) continue;
    const existing = data.id ? byId.get(data.id.toLowerCase()) : null;
    if (existing) {
      for (const k of ['nom', 'prenom', 'naissance', 'tel', 'statut']) {
        if (data[k]) existing[k] = data[k];
      }
      if (data.nbPersonnes) existing.nbPersonnes = data.nbPersonnes;
      existing.provisoire = false;
      updated++;
    } else {
      const id = data.id || nextProvisionalId();
      if (byId.has(id.toLowerCase())) continue;
      const benef = {
        id,
        nom: data.nom,
        prenom: data.prenom,
        naissance: data.naissance,
        tel: data.tel,
        statut: data.statut,
        nbPersonnes: data.nbPersonnes,
        provisoire: !data.id
      };
      benefits.push(benef);
      byId.set(id.toLowerCase(), benef);
      added++;
    }
  }
  persist();
  render();
  showToast(`Import : ${added} ajouté(s), ${updated} mis à jour`);
}

function downloadXlsx(sheets, filename) {
  const bytes = XLSX.buildXlsx(sheets);
  const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const EXPORT_BENEF_HEADERS = ['Identifiant', 'Nom', 'Prénom', 'Date de naissance', 'Téléphone', 'Statut', 'Nb de personnes'];

function exportBenefits() {
  if (!benefits.length) {
    showToast('Aucun bénéficiaire à exporter');
    return;
  }
  const rows = [EXPORT_BENEF_HEADERS.slice()];
  for (const b of [...benefits].sort((a, b2) => a.nom.localeCompare(b2.nom, 'fr') || a.prenom.localeCompare(b2.prenom, 'fr'))) {
    const solde = soldeOf(b.id, null);
    rows.push([
      b.id,
      b.nom,
      b.prenom,
      b.naissance ? fmtDate(b.naissance) : '',
      b.tel || '',
      b.statut || '',
      b.nbPersonnes ?? '',
      solde !== 0 ? eur(solde) : '',
      b.provisoire ? 'Oui' : ''
    ]);
  }
  downloadXlsx([{ name: 'Bénéficiaires', rows }], `beneficiaires-${todayStr().replace(/-/g, '')}.xlsx`);
  showToast('Export Excel généré');
}

function exportDistribution(dist) {
  const rows = [
    [`Distribution du ${fmtDate(dist.date)}`],
    [],
    ['Identifiant', 'Nom', 'Prénom', 'Téléphone', 'Statut', 'Nb personnes', 'Solde antérieur', 'Attendu', 'Payé', 'Solde restant']
  ];
  let totalPaye = 0;
  const attendu = dist.participants.length * TARIF;
  for (const p of dist.participants) {
    const b = benefById(p.benefId);
    if (!b) continue;
    const avant = soldeOf(b.id, dist.id);
    totalPaye += payeOf(p);
    rows.push([
      b.id,
      b.nom,
      b.prenom,
      b.tel || '',
      b.statut || '',
      p.nbPersonnes,
      avant !== 0 ? eur(avant) : '',
      TARIF,
      payeOf(p),
      avant + TARIF - payeOf(p)
    ]);
  }
  rows.push(['TOTAL', '', '', '', '', totalPersonnes(dist), '', attendu, Math.round(totalPaye * 100) / 100, '']);
  const benefRows = [EXPORT_BENEF_HEADERS.slice()];
  for (const b of [...benefits].sort((a, b2) => a.nom.localeCompare(b2.nom, 'fr'))) {
    benefRows.push([b.id, b.nom, b.prenom, b.naissance ? fmtDate(b.naissance) : '', b.tel || '', b.statut || '', b.nbPersonnes ?? '']);
  }
  downloadXlsx(
    [{ name: 'Présences', rows }, { name: 'Bénéficiaires', rows: benefRows }],
    `distribution-${dist.date.replace(/-/g, '')}.xlsx`
  );
  showToast('Export Excel généré');
}

function currentDist() {
  return dists.find((d) => d.id === currentDistId) || null;
}

function totalPersonnes(dist) {
  return dist.participants.reduce((s, p) => s + (p.nbPersonnes || 0), 0);
}

function totalPaye(dist) {
  return Math.round(dist.participants.reduce((s, p) => s + payeOf(p), 0) * 100) / 100;
}

function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === tab));
  $('tabBenefs').classList.toggle('hidden', tab !== 'benefs');
  $('tabDists').classList.toggle('hidden', tab !== 'dists');
  render();
}

function render() {
  if (currentTab === 'benefs') {
    renderBenefits();
  } else if (currentDistId) {
    $('distListView').classList.add('hidden');
    $('distDetailView').classList.remove('hidden');
    renderDistDetail();
  } else {
    $('distListView').classList.remove('hidden');
    $('distDetailView').classList.add('hidden');
    renderDistList();
  }
}

function payeInfo(p) {
  const paye = payeOf(p);
  if (paye >= TARIF) return { label: 'Payé', cls: 'pill-ok' };
  if (paye > 0) return { label: `Partiel ${eur(paye)}`, cls: 'pill-part' };
  return { label: 'Impayé', cls: 'pill-no' };
}

function renderBenefits() {
  const q = norm($('benefSearch').value);
  const list = $('benefList');
  const items = benefits
    .filter((b) => !q || norm(benefFull(b) + ' ' + b.id + ' ' + b.tel + ' ' + b.statut).includes(q))
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr') || a.prenom.localeCompare(b.prenom, 'fr'));
  list.innerHTML = items.map((b) => {
    const solde = soldeOf(b.id, null);
    const badge = b.provisoire ? '<span class="badge badge-prov">Provisoire</span>' : '';
    const soldeBadge = solde > 0
      ? `<span class="badge badge-zero">Dû ${eur(solde)}</span>`
      : solde < 0
        ? `<span class="badge badge-low">Crédit ${eur(-solde)}</span>`
        : '';
    return `<div class="item" data-edit="${b.id}">
      <div class="item-info">
        <div class="item-name">${escapeHtml(benefFull(b))}<span class="item-id"> · ${escapeHtml(b.id)}</span>${badge}${soldeBadge}</div>
        <div class="item-meta">${escapeHtml(b.statut || 'Statut non renseigné')} · ${b.nbPersonnes ?? '?'} pers.${b.tel ? ' · ' + escapeHtml(b.tel) : ''}</div>
      </div>
      <div class="item-actions">
        <button class="icon-btn" data-act="edit" aria-label="Modifier">✏️</button>
        <button class="icon-btn" data-act="del" aria-label="Supprimer">🗑️</button>
      </div>
    </div>`;
  }).join('');
  $('emptyBenefs').classList.toggle('hidden', items.length > 0);
}

function openBenefDialog(benefId, fromDistId) {
  editingBenefId = benefId || null;
  pickerContextDistId = fromDistId || null;
  const b = benefId ? benefById(benefId) : null;
  $('dialogBenefTitle').textContent = b ? 'Modifier le bénéficiaire' : 'Nouveau bénéficiaire';
  $('fBenefId').textContent = b ? `Identifiant : ${b.id}` : `Identifiant provisoire auto : ${nextProvisionalId()}`;
  $('fNom').value = b ? b.nom : '';
  $('fPrenom').value = b ? b.prenom : '';
  $('fNaissance').value = b ? b.naissance : '';
  $('fTel').value = b ? b.tel : '';
  $('fStatut').value = b ? b.statut : '';
  $('fNb').value = b && b.nbPersonnes ? b.nbPersonnes : '';
  if (!$('dialogBenef').open) $('dialogBenef').showModal();
}

function saveBenef(e) {
  e.preventDefault();
  const nom = $('fNom').value.trim();
  if (!nom) return;
  const data = {
    nom,
    prenom: $('fPrenom').value.trim(),
    naissance: $('fNaissance').value,
    tel: $('fTel').value.trim(),
    statut: $('fStatut').value,
    nbPersonnes: Math.max(1, parseInt($('fNb').value, 10) || 1)
  };
  if (editingBenefId) {
    Object.assign(benefById(editingBenefId), data);
  } else {
    const benef = { id: nextProvisionalId(), ...data, provisoire: true };
    benefits.push(benef);
    if (pickerContextDistId) {
      const dist = dists.find((d) => d.id === pickerContextDistId);
      if (dist) dist.participants.push({ benefId: benef.id, paye: null, nbPersonnes: benef.nbPersonnes });
    }
  }
  persist();
  $('dialogBenef').close();
  render();
  showToast(editingBenefId ? 'Bénéficiaire modifié' : 'Bénéficiaire enregistré');
}

function deleteBenef(benefId) {
  const distCount = dists.filter((d) => d.participants.some((p) => p.benefId === benefId)).length;
  const msg = distCount
    ? `Supprimer ce bénéficiaire et ses ${distCount} présence(s) enregistrée(s) ?`
    : 'Supprimer ce bénéficiaire ?';
  if (!confirm(msg)) return;
  benefits = benefits.filter((b) => b.id !== benefId);
  for (const d of dists) d.participants = d.participants.filter((p) => p.benefId !== benefId);
  persist();
  render();
  showToast('Bénéficiaire supprimé');
}

function newDistribution() {
  const dist = { id: uid(), date: todayStr(), participants: [] };
  dists.unshift(dist);
  currentDistId = dist.id;
  persist();
  switchTab('dists');
  showToast('Nouvelle distribution créée');
}

function renderDistList() {
  const list = $('distList');
  const items = [...dists].sort((a, b) => b.date.localeCompare(a.date));
  list.innerHTML = items.map((d) => {
    const encaisse = totalPaye(d);
    const attendu = d.participants.length * TARIF;
    return `<div class="item" data-dist="${d.id}">
      <div class="item-info">
        <div class="item-name">Distribution du ${fmtDate(d.date)}</div>
        <div class="item-meta">${d.participants.length} foyer(s) · ${totalPersonnes(d)} pers. · encaissé ${eur(encaisse)} / attendu ${eur(attendu)}</div>
      </div>
      <div class="item-actions">
        <button class="icon-btn" data-act="del" aria-label="Supprimer">🗑️</button>
      </div>
    </div>`;
  }).join('');
  $('emptyDists').classList.toggle('hidden', items.length > 0);
}

function deleteDist(distId) {
  if (!confirm('Supprimer cette distribution et toutes ses présences ?')) return;
  dists = dists.filter((d) => d.id !== distId);
  if (currentDistId === distId) currentDistId = null;
  persist();
  render();
  showToast('Distribution supprimée');
}

function renderDistDetail() {
  const dist = currentDist();
  if (!dist) {
    currentDistId = null;
    render();
    return;
  }
  $('distDate').textContent = 'Distribution du ' + fmtDate(dist.date);
  const encaisse = totalPaye(dist);
  const attendu = dist.participants.length * TARIF;
  $('sumFoyers').textContent = dist.participants.length;
  $('sumPersonnes').textContent = totalPersonnes(dist);
  $('sumPaye').textContent = eur(encaisse);
  $('sumAttendu').textContent = eur(attendu);
  const list = $('partList');
  list.innerHTML = dist.participants.map((p, i) => {
    const b = benefById(p.benefId);
    if (!b) return '';
    const avant = soldeOf(b.id, dist.id);
    const info = payeInfo(p);
    const soldeTxt = avant > 0
      ? `<span class="badge badge-zero">Solde antérieur ${eur(avant)}</span>`
      : avant < 0
        ? `<span class="badge badge-low">Crédit ${eur(-avant)}</span>`
        : '';
    const restant = Math.round((avant + TARIF - payeOf(p)) * 100) / 100;
    const restantTxt = restant > 0 ? `<span class="badge badge-zero">Reste ${eur(restant)}</span>` : '';
    return `<div class="item ${payeOf(p) >= TARIF ? '' : payeOf(p) > 0 ? 'state-low' : 'state-zero'}">
      <div class="item-info">
        <div class="item-name">${escapeHtml(benefFull(b))}<span class="item-id"> · ${escapeHtml(b.id)}</span>${soldeTxt}${restantTxt}</div>
        <div class="item-meta">${p.nbPersonnes} personne(s) ce jour</div>
      </div>
      <div class="item-actions">
        <button class="pill ${info.cls}" data-pay="${i}">${info.label}</button>
        <button class="icon-btn" data-unsub="${i}" aria-label="Retirer">✖️</button>
      </div>
    </div>`;
  }).join('');
  $('emptyParts').classList.toggle('hidden', dist.participants.length > 0);
}

function openPicker() {
  pickerDistId = currentDistId;
  $('pickerSearch').value = '';
  renderPicker('');
  if (!$('dialogPicker').open) $('dialogPicker').showModal();
}

function renderPicker(q) {
  const dist = dists.find((d) => d.id === pickerDistId);
  if (!pickerDistId || !dist) return;
  const nq = norm(q);
  const present = new Set(dist.participants.map((p) => p.benefId));
  const items = benefits
    .filter((b) => !present.has(b.id))
    .filter((b) => !nq || norm(benefFull(b) + ' ' + b.id + ' ' + b.tel).includes(nq))
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  $('pickerList').innerHTML = items.map((b) => {
    const avant = soldeOf(b.id, pickerDistId);
    const soldeTxt = avant > 0
      ? `<span class="badge badge-zero">Dû ${eur(avant)}</span>`
      : avant < 0
        ? `<span class="badge badge-low">Crédit ${eur(-avant)}</span>`
        : '<span class="badge badge-ok">À jour</span>';
    const prov = b.provisoire ? '<span class="badge badge-prov">Provisoire</span>' : '';
    return `<div class="item" data-pick="${b.id}">
      <div class="item-info">
        <div class="item-name">${escapeHtml(benefFull(b))}<span class="item-id"> · ${escapeHtml(b.id)}</span>${soldeTxt}${prov}</div>
        <div class="item-meta">${escapeHtml(b.statut || 'Statut non renseigné')} · ${b.nbPersonnes ?? '?'} pers.</div>
      </div>
    </div>`;
  }).join('');
  $('pickerList').classList.toggle('hidden', items.length === 0 && nq.length > 0);
  $('pickerEmpty').classList.toggle('hidden', items.length > 0);
  $('pickerQuery').textContent = nq ? `Aucun résultat pour « ${q} »` : 'Aucun autre bénéficiaire enregistré';
}

function closePicker() {
  pickerDistId = null;
  if ($('dialogPicker').open) $('dialogPicker').close();
  render();
}

function addParticipant(distId, benefId) {
  const dist = dists.find((d) => d.id === distId);
  const b = benefById(benefId);
  if (!dist || !b) return;
  if (dist.participants.some((p) => p.benefId === benefId)) {
    showToast('Bénéficiaire déjà enregistré');
    return;
  }
  dist.participants.push({ benefId, paye: null, nbPersonnes: b.nbPersonnes || 1 });
  persist();
  if (pickerDistId) {
    renderPicker($('pickerSearch').value);
    renderDistDetail();
  } else {
    render();
  }
  showToast(`${benefFull(b)} enregistré(e)`);
}

function openPayDialog(index) {
  const dist = currentDist();
  if (!dist) return;
  const p = dist.participants[index];
  const b = benefById(p.benefId);
  if (!b) return;
  editingPartKey = index;
  const avant = soldeOf(b.id, dist.id);
  $('payTitle').textContent = `Paiement — ${benefFull(b)}`;
  $('paySolde').textContent = avant > 0
    ? `Solde antérieur : ${eur(avant)} dus`
    : avant < 0
      ? `Solde antérieur : crédit de ${eur(-avant)}`
      : 'Solde antérieur : à jour';
  $('payMontant').value = payeOf(p) ? payeOf(p).toFixed(2) : TARIF.toFixed(2);
  $('payTotal').textContent = `Total à régler : ${eur(avant + TARIF)} (1 € pour cette distribution${avant > 0 ? ' + solde antérieur' : ''})`;
  if (!$('dialogPay').open) $('dialogPay').showModal();
}

function savePay(e) {
  e.preventDefault();
  const dist = currentDist();
  if (!dist || editingPartKey === null) return;
  const montant = Number(String($('payMontant').value).replace(',', '.'));
  if (!Number.isFinite(montant) || montant < 0) {
    showToast('Montant invalide');
    return;
  }
  dist.participants[editingPartKey].paye = Math.round(montant * 100) / 100;
  persist();
  $('dialogPay').close();
  renderDistDetail();
  showToast('Paiement enregistré');
}

document.addEventListener('click', (e) => {
  const tab = e.target.closest('.tab');
  if (tab) {
    switchTab(tab.dataset.tab);
    return;
  }

  const benefItem = e.target.closest('[data-edit]');
  if (benefItem && currentTab === 'benefs') {
    const act = e.target.closest('[data-act]');
    if (act && act.dataset.act === 'del') deleteBenef(benefItem.dataset.edit);
    else if (act && act.dataset.act === 'edit') openBenefDialog(benefItem.dataset.edit);
    return;
  }

  const distItem = e.target.closest('[data-dist]');
  if (distItem && !currentDistId && $('distListView') && !$('distListView').classList.contains('hidden')) {
    const act = e.target.closest('[data-act]');
    if (act && act.dataset.act === 'del') deleteDist(distItem.dataset.dist);
    else {
      currentDistId = distItem.dataset.dist;
      render();
    }
    return;
  }

  const pick = e.target.closest('[data-pick]');
  if (pick) {
    addParticipant(pickerDistId, pick.dataset.pick);
    return;
  }

  const pay = e.target.closest('[data-pay]');
  if (pay) {
    openPayDialog(parseInt(pay.dataset.pay, 10));
    return;
  }

  const unsub = e.target.closest('[data-unsub]');
  if (unsub) {
    const dist = currentDist();
    if (dist) {
      dist.participants.splice(parseInt(unsub.dataset.unsub, 10), 1);
      persist();
      renderDistDetail();
    }
  }
});

$('btnAddBenef').addEventListener('click', () => openBenefDialog(null));
$('btnExport').addEventListener('click', exportBenefits);
$('btnImport').addEventListener('click', () => $('fileImport').click());
$('fileImport').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) importFile(file);
  e.target.value = '';
});
$('formBenef').addEventListener('submit', saveBenef);
$('btnCancelBenef').addEventListener('click', () => $('dialogBenef').close());

$('btnNewDist').addEventListener('click', newDistribution);
$('btnBackDists').addEventListener('click', () => {
  currentDistId = null;
  render();
});
$('btnExportDist').addEventListener('click', () => {
  const dist = currentDist();
  if (dist) exportDistribution(dist);
});
$('btnAddPart').addEventListener('click', openPicker);
$('pickerSearch').addEventListener('input', (e) => renderPicker(e.target.value));
$('btnClosePicker').addEventListener('click', closePicker);
$('btnNewBenefInPicker').addEventListener('click', () => {
  closePicker();
  openBenefDialog(null, currentDistId);
});

document.querySelectorAll('.chip[data-amount]').forEach((chip) => {
  chip.addEventListener('click', () => {
    $('payMontant').value = chip.dataset.amount;
  });
});
$('formPay').addEventListener('submit', savePay);
$('btnCancelPay').addEventListener('click', () => $('dialogPay').close());

STATUTS.forEach((s) => {
  const opt = document.createElement('option');
  opt.value = s;
  opt.textContent = s;
  $('fStatut').appendChild(opt);
});

switchTab('benefs');

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js'));
}
