const XLSX = (() => {

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

  function refCol(ref) {
    let n = 0;
    for (const ch of ref.replace(/\d+$/, '')) n = n * 26 + (ch.charCodeAt(0) - 64);
    return n - 1;
  }

  function sheetXml(rows) {
    let xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
    xml += '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>';
    rows.forEach((row, i) => {
      xml += `<row r="${i + 1}">`;
      row.forEach((cell, j) => {
        const ref = `${colRef(j)}${i + 1}`;
        if (cell === null || cell === undefined || cell === '') return;
        if (typeof cell === 'number' && Number.isFinite(cell)) {
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
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' + sheets + '</sheets></workbook>';
  }

  function workbookRels(count) {
    let rels = '';
    for (let i = 1; i <= count; i++) {
      rels += `<Relationship Id="rId${i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i}.xml"/>`;
    }
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + rels + '</Relationships>';
  }

  function contentTypes(count) {
    let overrides = '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>';
    for (let i = 1; i <= count; i++) {
      overrides += `<Override PartName="/xl/worksheets/sheet${i}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`;
    }
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' + overrides + '</Types>';
  }

  function rootRels() {
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      '</Relationships>';
  }

  const CRC_TABLE = new Uint32Array(256).map((_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });

  function crc32(bytes) {
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

    for (const e of entries) {
      const nameBytes = enc.encode(e.name);
      const data = enc.encode(e.data);
      const crc = crc32(data);
      const local = new Uint8Array(30 + nameBytes.length + data.length);
      const lv = new DataView(local.buffer);
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
      const cv = new DataView(c.buffer);
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
    const ev = new DataView(eocd.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, entries.length, true);
    ev.setUint16(10, entries.length, true);
    ev.setUint32(12, centralSize, true);
    ev.setUint32(16, offset, true);

    const out = new Uint8Array(offset + centralSize + 22);
    let pos = 0;
    for (const c of [...chunks, ...central, eocd]) {
      out.set(c, pos);
      pos += c.length;
    }
    return out;
  }

  function buildXlsx(sheets) {
    const names = sheets.map((s) => s.name);
    const parts = [
      { name: '[Content_Types].xml', data: contentTypes(sheets.length) },
      { name: '_rels/.rels', data: rootRels() },
      { name: 'xl/workbook.xml', data: workbookXml(names) },
      { name: 'xl/_rels/workbook.xml.rels', data: workbookRels(sheets.length) }
    ];
    sheets.forEach((s, i) => {
      parts.push({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(s.rows) });
    });
    return makeZip(parts);
  }

  async function inflateRaw(bytes) {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  function unzip(bytes) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let eocd = -1;
    for (let i = bytes.length - 22; i >= 0; i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('Ne semble pas être un fichier .xlsx');
    const count = dv.getUint16(eocd + 10, true);
    let p = dv.getUint32(eocd + 16, true);
    const files = new Map();
    for (let i = 0; i < count; i++) {
      if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('Archive corrompue');
      const method = dv.getUint16(p + 10, true);
      let csize = dv.getUint32(p + 20, true);
      const nameLen = dv.getUint16(p + 28, true);
      const extraLen = dv.getUint16(p + 30, true);
      const commentLen = dv.getUint16(p + 32, true);
      const localOff = dv.getUint32(p + 42, true);
      const name = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nameLen));
      let hf = localOff;
      if (dv.getUint32(hf, true) !== 0x04034b50) throw new Error('Archive corrompue');
      const fnLen = dv.getUint16(hf + 26, true);
      const exLen = dv.getUint16(hf + 28, true);
      const dataStart = hf + 30 + fnLen + exLen;
      if (!csize) csize = dv.getUint32(hf + 18, true);
      let data = bytes.subarray(dataStart, dataStart + csize);
      if (method === 8) data = inflateRawSyncHint(data);
      files.set(name, data);
      p += 46 + nameLen + extraLen + commentLen;
    }
    return files;
  }

  let inflateQueue = [];
  function inflateRawSyncHint(data) {
    inflateQueue.push(data);
    return null;
  }

  async function unzipAsync(bytes) {
    inflateQueue = [];
    const files = unzip(bytes);
    for (const [name, data] of files) {
      if (data === null) files.set(name, await inflateRaw(inflateQueue.shift()));
    }
    return files;
  }

  function parseSharedStrings(xml) {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const out = [];
    for (const si of doc.getElementsByTagName('si')) {
      let s = '';
      for (const t of si.getElementsByTagName('t')) s += t.textContent;
      out.push(s);
    }
    return out;
  }

  function parseSheet(xml, shared) {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const rows = [];
    for (const rowEl of doc.getElementsByTagName('row')) {
      const row = {};
      for (const c of rowEl.getElementsByTagName('c')) {
        const ref = c.getAttribute('r') || '';
        const t = c.getAttribute('t');
        const vEl = c.getElementsByTagName('v')[0];
        let val = '';
        if (t === 'inlineStr') {
          const isEl = c.getElementsByTagName('is')[0];
          if (isEl) for (const te of isEl.getElementsByTagName('t')) val += te.textContent;
        } else if (vEl) {
          const raw = vEl.textContent;
          if (t === 's') val = shared[parseInt(raw, 10)] ?? '';
          else if (t === 'str') val = raw;
          else val = raw;
        }
        const m = ref.match(/([A-Z]+)/);
        if (m) row[refCol(m[1] + '1')] = val;
      }
      const width = Object.keys(row).reduce((mx, k) => Math.max(mx, k), -1) + 1;
      const arr = [];
      for (let i = 0; i < width; i++) arr.push(row[i] ?? '');
      rows.push(arr);
    }
    return rows;
  }

  async function readXlsx(buffer) {
    const bytes = new Uint8Array(buffer);
    const files = await unzipAsync(bytes);
    const shared = files.has('xl/sharedStrings.xml')
      ? parseSharedStrings(new TextDecoder().decode(files.get('xl/sharedStrings.xml')))
      : [];
    const wb = new DOMParser().parseFromString(new TextDecoder().decode(files.get('xl/workbook.xml')), 'application/xml');
    const firstSheet = wb.getElementsByTagName('sheet')[0];
    if (!firstSheet) return [];
    const rid = firstSheet.getAttribute('r:id');
    let target = 'xl/worksheets/sheet1.xml';
    if (rid && files.has('xl/_rels/workbook.xml.rels')) {
      const rels = new DOMParser().parseFromString(new TextDecoder().decode(files.get('xl/_rels/workbook.xml.rels')), 'application/xml');
      for (const rel of rels.getElementsByTagName('Relationship')) {
        if (rel.getAttribute('Id') === rid) {
          const t = rel.getAttribute('Target');
          target = t.replace(/^\//, '').replace(/^xl\//, 'xl/');
          if (!target.startsWith('xl/')) target = 'xl/' + target;
        }
      }
    }
    if (!files.has(target)) {
      for (const [name] of files) {
        if (/^xl\/worksheets\/sheet\d+\.xml$/.test(name)) { target = name; break; }
      }
    }
    return parseSheet(new TextDecoder().decode(files.get(target)), shared);
  }

  function parseCsvLine(line, sep) {
    const out = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQ) {
        if (ch === '"') {
          if (line[i + 1] === '"') { cur += '"'; i++; }
          else inQ = false;
        } else cur += ch;
      } else if (ch === '"') {
        inQ = true;
      } else if (ch === sep) {
        out.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
    out.push(cur);
    return out;
  }

  function readCsv(text) {
    const clean = text.replace(/^\uFEFF/, '');
    const firstLine = clean.split(/\r\n|\n|\r/)[0] || '';
    const sep = (firstLine.match(/;/g) || []).length >= (firstLine.match(/,/g) || []).length ? ';' : ',';
    return clean.split(/\r\n|\n|\r/).filter((l) => l.length > 0).map((l) => parseCsvLine(l, sep));
  }

  return { buildXlsx, readXlsx, readCsv };
})();
