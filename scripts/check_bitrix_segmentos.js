import fetch from 'node-fetch';

// Script rápido para consultar Bitrix y buscar coincidencias con "segmentos" proporcionados.
// Ajusta las URL si tu portal/tokens son diferentes.

const BITRIX_FIELDS_URL = 'https://cristmedical.bitrix24.es/rest/5149/b4eirrr8ila4cpzk/crm.company.fields.json';
const BITRIX_LIST_URL = 'https://cristmedical.bitrix24.es/rest/5149/qly93wxo8xvetemt/crm.company.list.json';

const segmentos = [
  'Merida Montaña - ALTA (timotes)',
  'Merida Montaña - BAJA (bailadores)',
  'Merida Montaña - capital',
  'Merida Plano - Arapuey',
  'Merida Plano - Capital',
  'Merida Plano - Sta Barbara',
];

const targetFields = [
  'UF_CRM_1634787828',
  'UF_CRM_1635903069',
  'UF_CRM_1638457710',
  'UF_CRM_1651251237102',
  'UF_CRM_1686015739936',
];

const PAGE_SIZE = 50; // página estándar
const BITRIX_FILTER = { '!UF_CRM_1638457710': ['921', '3135'] };

function normalizeStr(s) {
  if (!s && s !== 0) return '';
  // convertir a string, quitar acentos y normalizar
  const st = String(s).toLowerCase().trim();
  return st.normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[\s\-_/\\()\[\]:;,\.]+/g, ' ').trim();
}

async function fetchFields() {
  const r = await fetch(BITRIX_FIELDS_URL);
  return r.json();
}

async function fetchCompaniesPage(start) {
  const r = await fetch(BITRIX_LIST_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ select: ['ID', 'TITLE', ...targetFields], filter: BITRIX_FILTER, start }),
  });
  return r.json();
}

(async function run() {
  try {
    console.log('Fetching fields...');
    const fieldsDef = await fetchFields();
    if (!fieldsDef || !fieldsDef.result) {
      console.error('No field definitions returned');
    }

    // construir mapas de items para traducir UF_CRM_xxx
    const fieldMaps = {};
    if (fieldsDef && fieldsDef.result) {
      targetFields.forEach((f) => {
        const meta = fieldsDef.result[f];
        if (!meta) return;
        const map = {};
        if (meta.items && Array.isArray(meta.items)) {
          meta.items.forEach((it) => { if (it.ID !== undefined) map[it.ID] = it.VALUE; });
        } else if (meta.LIST && Array.isArray(meta.LIST)) {
          meta.LIST.forEach((it) => { if (it.ID !== undefined) map[it.ID] = it.VALUE; });
        }
        if (Object.keys(map).length > 0) fieldMaps[f] = map;
      });
    }

    // Detectar campos candidatos a segmento por label
    const candidateSegmentFields = [];
    if (fieldsDef && fieldsDef.result) {
      Object.keys(fieldsDef.result).forEach((k) => {
        const meta = fieldsDef.result[k];
        const label = (meta.title || meta.NAME || meta.editFormLabel || '').toString().toLowerCase();
        if (label.includes('seg') || label.includes('segment')) candidateSegmentFields.push(k);
      });
    }
    console.log('Campos candidatos a segmento detectados:', candidateSegmentFields);

    // Obtener todas las páginas (iterar hasta que no venga next)
    console.log('Fetching companies (paginando hasta agotar)...');
    let all = [];
    let start = 0;
    while (true) {
      const data = await fetchCompaniesPage(start);
      if (!data || !data.result) break;
      if (Array.isArray(data.result) && data.result.length === 0) break;
      all = all.concat(data.result);
      if (data.next !== undefined && data.next !== null) {
        start = data.next;
      } else {
        // si no viene next, pero la cantidad < PAGE_SIZE asumimos fin
        if (!Array.isArray(data.result) || data.result.length < PAGE_SIZE) break;
        start += PAGE_SIZE;
      }
      // pequeño delay para no saturar
      await new Promise((r) => setTimeout(r, 200));
    }

    console.log('Total compañías descargadas:', all.length);

    // Traducir campos UF_CRM usando fieldMaps
    const translated = all.map((c) => {
      const copy = { ...c };
      targetFields.forEach((f) => {
        if (copy[f] !== undefined && copy[f] !== null && fieldMaps[f]) {
          const raw = copy[f];
          if (Array.isArray(raw)) {
            copy[f] = raw.map((v) => fieldMaps[f][v] || v);
          } else {
            copy[f] = fieldMaps[f][raw] || raw;
          }
        }
      });
      return copy;
    });

    // Normalizar segmentos para búsqueda
    const segNorm = segmentos.map((s) => normalizeStr(s));

    // Buscar coincidencias en TITLE, en los targetFields traducidos y en campos candidatos
    const matches = [];
    translated.forEach((c) => {
      const values = [];
      if (c.TITLE) values.push(c.TITLE);
      targetFields.forEach((f) => {
        if (c[f] !== undefined && c[f] !== null) values.push(typeof c[f] === 'string' ? c[f] : JSON.stringify(c[f]));
      });
      candidateSegmentFields.forEach((f) => {
        if (c[f] !== undefined && c[f] !== null) values.push(typeof c[f] === 'string' ? c[f] : JSON.stringify(c[f]));
      });
      const hay = values.map(normalizeStr).join(' | ');
      const found = segNorm.some((s) => hay.includes(normalizeStr(s)));
      if (found) matches.push(c);
    });

    console.log('Coincidencias encontradas:', matches.length);
    const sample = matches.slice(0, 200).map((m) => ({ id: m.ID, title: m.TITLE, seg: targetFields.reduce((acc, f) => ({ ...acc, [f]: m[f] }), {}) }));
    console.log(JSON.stringify({ found: matches.length, sample }, null, 2));
  } catch (e) {
    console.error('Error en script:', e);
  }
})();
