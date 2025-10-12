// scripts/test-catalogs.mjs
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const DIR = path.join(process.cwd(), 'data', 'catalogs');
const ok = (m) => console.log('✅', m);
const fail = (m) => { console.error('❌', m); process.exitCode = 1; };

const readJson = (f) => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));

try {
  // 1) Genera los JSON
  execSync('node scripts/build-catalogs.mjs', { stdio: 'inherit' });

  // 2) Carga
  const campaigns = readJson('campaigns.json');
  const partners  = readJson('partners.json');
  const databases = readJson('databases.json');
  const themes    = readJson('themes.json');

  // 3) Validaciones básicas
  // campaigns
  if (!Array.isArray(campaigns) || campaigns.length === 0) fail('campaigns.json vacío');
  for (const r of campaigns) {
    if (!r.name?.trim() || !r.advertiser?.trim()) fail('campaign sin name/advertiser');
  }
  ok(`campaigns.json (${campaigns.length})`);

  // partners
  const OFFICES = new Set(['CAR','DAT','INT']);
  for (const p of partners) {
    if (!p.name?.trim() || !OFFICES.has(String(p.invoiceOffice).toUpperCase())) {
      fail(`partner inválido: ${JSON.stringify(p)}`);
    }
  }
  ok(`partners.json (${partners.length})`);

  // databases
  const ids = new Set();
  for (const d of databases) {
    if (!d.id?.trim() || ids.has(d.id)) fail(`database id duplicado o vacío: ${d.id}`);
    ids.add(d.id);
    if (!d.name?.trim()) fail('database sin name');
    if (!d.dbType || !['B2B','B2C','Mixed'].includes(d.dbType)) fail(`dbType inválido: ${d.dbType}`);
    if (!d.geo?.trim() || d.geo !== d.geo.toUpperCase()) fail(`geo debe ir en MAYÚSCULAS: ${d.geo}`);
  }
  ok(`databases.json (${databases.length})`);

  // themes (únicos case-insensitive)
  const seen = new Set();
  for (const t of themes) {
    const label = (t.label ?? '').trim();
    if (!label) fail('theme sin label');
    const key = label.toLowerCase();
    if (seen.has(key)) fail(`theme duplicado (case-insensitive): ${label}`);
    seen.add(key);
  }
  ok(`themes.json (${themes.length})`);

  console.log('\n✨ Catálogos OK');
} catch (e) {
  console.error(e);
  fail('Fallo en test-catalogs');
}
