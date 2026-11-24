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
let editingDistId = null;
let editingPartKey = null;
let pickerDistId = null;
let pickerContextDistId = null;
let doublonSaisiePending = false;
let pendingDupes = [];

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
  nb: ['nbdepersonnes', 'nbpersonnes', 'nombresdepersonnes', 'nombredepersonnes', 'personnes', 'taillefamille', 'nbpersonnesdanslafamille', 'nbpersonnesfamille'],
  provisoire: ['provisoire', 'temporaire', 'provisional']
};

const COLS = ['id', 'provisoire', 'nom', 'prenom', 'naissance', 'tel', 'statut', 'nb'];

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

function parseProvisoire(v) {
  const n = norm(v);
  return ['oui', 'o', 'true', '1', 'x', 'provisoire', 'provisional', 'yes', 'y'].includes(n);
}

function rowToBenef(row, idx) {
  const get = (k) => (idx[k] !== undefined ? String(row[idx[k]] ?? '').trim() : '');
  const nb = toNumber(get('nb'));
  return {
    id: get('id'),
    provisoire: idx.provisoire !== undefined ? parseProvisoire(get('provisoire')) : null,
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
      existing.provisoire = data.provisoire !== null ? data.provisoire : false;
      updated++;
    } else {
      const suspects = data.nom
        ? benefits.filter((b) => b.id !== existing && String(b.id).toLowerCase() !== String(data.id || '').toLowerCase()
          && norm(b.nom) === norm(data.nom) && norm(b.prenom || '') === norm(data.prenom || ''))
        : [];
      if (suspects.length) {
        pendingDupes.push({ data, candidates: suspects });
        continue;
      }
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
        provisoire: data.provisoire !== null ? data.provisoire : !data.id
      };
      benefits.push(benef);
      byId.set(id.toLowerCase(), benef);
      added++;
    }
  }
  persist();
  render();
  if (pendingDupes.length) {
    openDupesDialog();
    showToast(`Import : ${added} ajouté(s), ${updated} mis à jour, ${pendingDupes.length} doublon(s) à valider`);
  } else {
    showToast(`Import : ${added} ajouté(s), ${updated} mis à jour`);
  }
}

function openDupesDialog() {
  if (!pendingDupes.length) return;
  renderDupes();
  if (!$('dialogDupes').open) $('dialogDupes').showModal();
}

function dupeLine(id, nomPrenom, naissance, tel, provisoireTag) {
  return `Identifiant : <strong>${escapeHtml(id || 'non renseigné')}</strong> · Nom/Prénom : ${escapeHtml(nomPrenom)} · Date de naissance : ${naissance ? fmtDate(naissance) : 'non renseignée'} · Tél : ${escapeHtml(tel || 'non renseigné')}${provisoireTag ? ' · <em>provisoire</em>' : ''}`;
}

function renderDupes() {
  const list = $('dupeList');
  list.innerHTML = pendingDupes.map((item, i) => {
    const d = item.data;
    const importe = `<div class="item-info">
      📄 Fichier secours : <div class="dupe-fields">${dupeLine(d.id, `${d.prenom || ''} ${d.nom}`.trim(), d.naissance, d.tel, false)}</div>
    </div>`;
    const candidats = item.candidates.length
      ? item.candidates.map((c, j) => `<div class="dupe-candidate">
          🧺 Appli (${c.provisoire ? 'identifiant créé P-xxxx' : 'identifiant secours'}) : <div class="dupe-fields">${dupeLine(c.id, benefFull(c), c.naissance, c.tel, c.provisoire)}</div>
          <button type="button" class="pill pill-ok" data-dupe="${i}" data-cand="${j}">Fusionner</button>
        </div>`).join('')
      : '<div class="dupe-candidate">Aucun bénéficiaire enregistré ne correspond</div>';
    return `<div class="dupe-item">
      ${importe}
      ${candidats}
      <button type="button" class="chip" data-dupe-new="${i}">Créer en séparé</button>
    </div>`;
  }).join('');
  $('dupeBanner').classList.toggle('hidden', pendingDupes.length === 0);
  $('dupeBannerText').textContent = `${pendingDupes.length} doublon(s) import(s) à valider`;
}

function resolveDupe(index, candIndex) {
  const item = pendingDupes[index];
  if (!item) return;
  const d = item.data;
  const target = candIndex !== null && item.candidates[candIndex] ? item.candidates[candIndex] : null;
  if (target) {
    const newId = d.id || target.id;
    if (newId !== target.id) {
      for (const dist of dists) {
        for (const p of dist.participants) {
          if (p.benefId === target.id) p.benefId = newId;
        }
      }
    }
    target.id = newId;
    target.nom = d.nom || target.nom;
    target.prenom = d.prenom || target.prenom;
    target.naissance = d.naissance || target.naissance;
    target.tel = d.tel || target.tel;
    target.statut = d.statut || target.statut;
    if (d.nbPersonnes) target.nbPersonnes = d.nbPersonnes;
    target.provisoire = d.provisoire !== null ? d.provisoire : false;
  } else {
    const id = d.id || nextProvisionalId();
    if (!benefById(id)) {
      benefits.push({
        id,
        nom: d.nom,
        prenom: d.prenom,
        naissance: d.naissance,
        tel: d.tel,
        statut: d.statut,
        nbPersonnes: d.nbPersonnes,
        provisoire: d.provisoire !== null ? d.provisoire : !d.id
      });
    }
  }
  pendingDupes.splice(index, 1);
  persist();
  if (pendingDupes.length) renderDupes();
  else if ($('dialogDupes').open) $('dialogDupes').close();
  render();
}

function resolveAllDupes(merge) {
  while (pendingDupes.length) resolveDupe(0, merge ? 0 : null);
  if ($('dialogDupes').open) $('dialogDupes').close();
  showToast(merge ? 'Doublons fusionnés' : 'Doublons créés en séparé');
  render();
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

const EXPORT_BENEF_HEADERS = ['Identifiant', 'Provisoire', 'Nom', 'Prénom', 'Date de naissance', 'Téléphone', 'Statut', 'Nb de personnes'];

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
      b.provisoire ? 'Oui' : '',
      b.nom,
      b.prenom,
      b.naissance ? fmtDate(b.naissance) : '',
      b.tel || '',
      b.statut || '',
      b.nbPersonnes ?? '',
      solde !== 0 ? eur(solde) : ''
    ]);
  }
  downloadXlsx([{ name: 'Bénéficiaires', rows }], `beneficiaires-${todayStr().replace(/-/g, '')}.xlsx`);
  showToast('Export Excel généré');
}

function composition(statut, nb) {
  const n = norm(statut);
  const adultes = (n.includes('couple') && !n.includes('monoparentale')) ? Math.min(2, nb) : Math.min(1, nb);
  return { adultes, enfants: Math.max(0, nb - adultes) };
}

function exportDistribution(dist) {
  let totalPaye = 0;
  let totalAdultes = 0;
  let totalEnfants = 0;
  let totalAVenir = 0;
  const attendu = dist.participants.length * TARIF;
  const dataRows = [
    ['Identifiant', 'Nom', 'Prénom', 'Téléphone', 'Statut', 'Nb personnes', 'Adultes', 'Enfants', 'Solde antérieur', 'Attendu', 'Payé', 'Solde restant']
  ];
  for (const p of dist.participants) {
    const b = benefById(p.benefId);
    if (!b) continue;
    const avant = soldeOf(b.id, dist.id);
    const c = composition(b.statut, p.nbPersonnes);
    const restant = Math.max(0, avant + TARIF - payeOf(p));
    totalPaye += payeOf(p);
    totalAdultes += c.adultes;
    totalEnfants += c.enfants;
    totalAVenir += restant;
    dataRows.push([
      b.id,
      b.nom,
      b.prenom,
      b.tel || '',
      b.statut || '',
      p.nbPersonnes,
      c.adultes,
      c.enfants,
      avant !== 0 ? eur(avant) : '',
      TARIF,
      payeOf(p),
      restant
    ]);
  }
  dataRows.push(['TOTAL', '', '', '', '', totalPersonnes(dist), totalAdultes, totalEnfants, '', attendu, Math.round(totalPaye * 100) / 100, Math.round(totalAVenir * 100) / 100]);
  const rows = [
    [`Distribution du ${fmtDate(dist.date)}`],
    [],
    ['Foyers (référents)', 'Adultes', 'Enfants', 'Euros récupérés', 'Euros à venir'],
    [dist.participants.length, totalAdultes, totalEnfants, eur(Math.round(totalPaye * 100) / 100), eur(Math.round(totalAVenir * 100) / 100)],
    [],
    ...dataRows
  ];
  const benefRows = [EXPORT_BENEF_HEADERS.slice()];
  for (const b of [...benefits].sort((a, b2) => a.nom.localeCompare(b2.nom, 'fr'))) {
    benefRows.push([b.id, b.provisoire ? 'Oui' : '', b.nom, b.prenom, b.naissance ? fmtDate(b.naissance) : '', b.tel || '', b.statut || '', b.nbPersonnes ?? '']);
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
        <div class="item-meta">${escapeHtml(b.statut || 'Statut non renseigné')} · ${b.nbPersonnes ?? '?'} pers.${b.naissance ? ' · né(e) le ' + fmtDate(b.naissance) : ''}${b.tel ? ' · ' + escapeHtml(b.tel) : ''}</div>
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

function nameSuspects(excludeId) {
  const nom = $('fNom').value.trim();
  const prenom = $('fPrenom').value.trim();
  if (!norm(nom)) return [];
  return benefits.filter((b) => b.id !== excludeId
    && norm(b.nom) === norm(nom) && norm(b.prenom || '') === norm(prenom || ''));
}

function renderDoublonSaisie(suspects) {
  const nom = $('fNom').value.trim();
  const prenom = $('fPrenom').value.trim();
  $('doublonBenefList').innerHTML = `
    <div class="dupe-item">
      \ud83d\uddfe Nouvelle fiche : <div class="dupe-fields">${escapeHtml(`${prenom} ${nom}`.trim())} · Date de naissance : ${$('fNaissance').value ? fmtDate($('fNaissance').value) : 'non renseignée'} · Tél : ${escapeHtml($('fTel').value.trim() || 'non renseigné')}</div>
    </div>` + suspects.map((b) => `<div class="dupe-item">
      \ud83e\uddfa Déjà enregistré : <div class="dupe-fields">${dupeLine(b.id, benefFull(b), b.naissance, b.tel, b.provisoire)}</div>
    </div>`).join('');
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
  if (!doublonSaisiePending) {
    const suspects = nameSuspects(editingBenefId);
    if (suspects.length) {
      renderDoublonSaisie(suspects);
      if (!$('dialogDoublonBenef').open) $('dialogDoublonBenef').showModal();
      return;
    }
  }
  doublonSaisiePending = false;
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

function openDistDialog(distId) {
  editingDistId = distId || null;
  const dist = distId ? dists.find((d) => d.id === distId) : null;
  $('dialogDistTitle').textContent = dist ? 'Modifier la distribution' : 'Nouvelle distribution';
  $('fDistDate').value = dist ? dist.date : todayStr();
  if (!$('dialogDist').open) $('dialogDist').showModal();
}

function saveDist(e) {
  e.preventDefault();
  const date = $('fDistDate').value;
  if (!date) return;
  if (editingDistId) {
    const dist = dists.find((d) => d.id === editingDistId);
    if (dist) dist.date = date;
    persist();
    showToast('Date modifiée');
  } else {
    const dist = { id: uid(), date, participants: [] };
    dists.unshift(dist);
    currentDistId = dist.id;
    persist();
    switchTab('dists');
    showToast('Nouvelle distribution créée');
  }
  $('dialogDist').close();
  render();
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
        <button class="icon-btn" data-act="export" aria-label="Exporter en Excel">📊</button>
        <button class="icon-btn" data-act="date" aria-label="Modifier la date">🗓️</button>
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
        <div class="item-meta">${escapeHtml(b.statut || 'Statut non renseigné')} · ${b.nbPersonnes ?? '?'} pers.${b.naissance ? ' · né(e) le ' + fmtDate(b.naissance) : ''}${b.tel ? ' · ' + escapeHtml(b.tel) : ''}</div>
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
    else if (act && act.dataset.act === 'export') {
      const dist = dists.find((d) => d.id === distItem.dataset.dist);
      if (dist) exportDistribution(dist);
    } else if (act && act.dataset.act === 'date') openDistDialog(distItem.dataset.dist);
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

  const dupeMerge = e.target.closest('[data-dupe]');
  if (dupeMerge) {
    resolveDupe(parseInt(dupeMerge.dataset.dupe, 10), parseInt(dupeMerge.dataset.cand, 10));
    return;
  }
  const dupeNew = e.target.closest('[data-dupe-new]');
  if (dupeNew) {
    resolveDupe(parseInt(dupeNew.dataset.dupeNew, 10), null);
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
$('btnShowDupes').addEventListener('click', openDupesDialog);
$('btnDupesMergeAll').addEventListener('click', () => resolveAllDupes(true));
$('btnDupesNewAll').addEventListener('click', () => resolveAllDupes(false));
$('btnDupesClose').addEventListener('click', () => $('dialogDupes').close());
$('btnDoublonBenefYes').addEventListener('click', () => {
  doublonSaisiePending = true;
  if ($('dialogDoublonBenef').open) $('dialogDoublonBenef').close();
  const submit = document.querySelector('#formBenef button[type="submit"]');
  if (submit) submit.click();
});
$('btnDoublonBenefNo').addEventListener('click', () => {
  doublonSaisiePending = false;
  if ($('dialogDoublonBenef').open) $('dialogDoublonBenef').close();
});
$('btnCancelBenef').addEventListener('click', () => {
  doublonSaisiePending = false;
  $('dialogBenef').close();
});

$('btnNewDist').addEventListener('click', () => openDistDialog(null));
$('formDist').addEventListener('submit', saveDist);
$('btnCancelDist').addEventListener('click', () => $('dialogDist').close());
$('btnEditDistDate').addEventListener('click', () => openDistDialog(currentDistId));
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
