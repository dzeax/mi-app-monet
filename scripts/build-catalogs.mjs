// scripts/build-catalogs.mjs
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SRC_DIR = path.join(ROOT, 'data', 'catalogs');

const ensureDir = (p) => { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); };
ensureDir(SRC_DIR);

function detectDelimiter(headerLine) {
  if (headerLine.includes('\t')) return '\t';
  if (headerLine.includes(';')) return ';';
  return ',';
}
function parseCSV(str) {
  const lines = str.replace(/\r/g, '').split('\n').filter(l => l.trim() !== '');
  if (lines.length === 0) return [];
  const delim = detectDelimiter(lines[0]);
  const headers = lines[0].split(delim).map(h => h.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const raw = lines[i];
    const parts = raw.split(delim).map(x => x.trim());
    const row = {};
    headers.forEach((h, idx) => { row[h] = (parts[idx] ?? '').trim(); });
    rows.push(row);
  }
  return rows;
}
const trimCollapse = (s) => (s || '').trim().replace(/\s+/g, ' ');

// ---- CAMPAIGNS ----
function buildCampaigns() {
  const csvPath = path.join(SRC_DIR, 'campaigns.csv');
  if (!fs.existsSync(csvPath)) { console.warn(`(info) No campaigns.csv`); return; }
  const rows = parseCSV(fs.readFileSync(csvPath, 'utf8'));

  const NAME_FIX = new Map([
    ['movistar + cpc', 'Movistar+ CPC'],
    ['inteligenza artificiale', 'Intelligenza artificiale'],
    ['national disreoair claims', 'National Disrepair Claims'],
    ['bussines alarm', 'Business alarm'],
    ['murprotect es', 'Murprotec ES'],
    ['murprotect it', 'Murprotec IT'],
    ['invesstiment immobilier', 'Investiment immobilier'],
  ]);

  const cleaned = rows
    .map(r => {
      const name = trimCollapse(r.name ?? '');
      const key = name.toLowerCase();
      return { name: NAME_FIX.get(key) ?? name, advertiser: trimCollapse(r.advertiser ?? '') };
    })
    .filter(r => r.name && r.advertiser);

  fs.writeFileSync(path.join(SRC_DIR, 'campaigns.json'), JSON.stringify(cleaned, null, 2));
  console.log(`✅ campaigns.json (${cleaned.length})`);
}

// ---- PARTNERS ----
function buildPartners() {
  const csvPath = path.join(SRC_DIR, 'partners.csv');
  if (!fs.existsSync(csvPath)) { console.warn(`(info) No partners.csv`); return; }
  const rows = parseCSV(fs.readFileSync(csvPath, 'utf8'));

  const cleaned = rows
    .map(r => ({ name: trimCollapse(r.name ?? ''), invoiceOffice: trimCollapse(r.invoiceoffice ?? '') }))
    .filter(r => r.name && r.invoiceOffice);

  fs.writeFileSync(path.join(SRC_DIR, 'partners.json'), JSON.stringify(cleaned, null, 2));
  console.log(`✅ partners.json (${cleaned.length})`);
}

// ---- DATABASES ----
function buildDatabases() {
  const csvPath = path.join(SRC_DIR, 'databases.csv');
  if (!fs.existsSync(csvPath)) { console.warn(`(info) No databases.csv`); return; }
  const rows = parseCSV(fs.readFileSync(csvPath, 'utf8'));

  const mapDbType = (t) => {
    const v = trimCollapse((t || '').toString()).toLowerCase();
    if (v === 'b2b') return 'B2B';
    if (v === 'b2c') return 'B2C';
    return 'Mixed'; // default seguro
  };
  const fixGeo = (g) => {
    const v = trimCollapse(g || '').toUpperCase();
    // Normalizaciones suaves (confírmame si prefieres otras):
    if (v === 'IR') return 'IE'; // Ireland
    // UK lo dejamos como 'UK' salvo que prefieras 'GB'
    return v || 'MULTI';
  };

  const uniq = new Set();
  const cleaned = [];
  for (const r of rows) {
    const name = trimCollapse(r.name ?? '');
    const geo = fixGeo(r.geo);
    const dbType = mapDbType(r.dbType);
    if (!name) continue;

    // id slug basado en name
    const base = name
      .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
    let id = base || 'db';
    let n = 2; while (uniq.has(id)) id = `${base}-${n++}`;
    uniq.add(id);

    cleaned.push({ id, name, geo, dbType });
  }

  fs.writeFileSync(path.join(SRC_DIR, 'databases.json'), JSON.stringify(cleaned, null, 2));
  console.log(`✅ databases.json (${cleaned.length})`);
}

// ---- THEMES ----
function buildThemes() {
  const csvPath = path.join(SRC_DIR, 'themes.csv');
  if (!fs.existsSync(csvPath)) { console.warn(`(info) No themes.csv`); return; }
  const rows = parseCSV(fs.readFileSync(csvPath, 'utf8'));

  // soporta cabecera "theme" o una única columna
  const cleaned = rows
    .map(r => {
      const label = trimCollapse(r.theme ?? r[Object.keys(r)[0]] ?? '');
      return { label };
    })
    .filter(r => r.label);

  fs.writeFileSync(path.join(SRC_DIR, 'themes.json'), JSON.stringify(cleaned, null, 2));
  console.log(`✅ themes.json (${cleaned.length})`);
}

function main() {
  buildCampaigns();
  buildPartners();
  buildDatabases();
  buildThemes();
}
main();
