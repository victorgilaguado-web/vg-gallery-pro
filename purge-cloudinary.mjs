#!/usr/bin/env node
/**
 * Purga REAL de fotos de Cloudinary para un proyecto de VG Gallery.
 *
 * Por defecto es un SIMULACRO (dry-run): solo lista lo que borraría.
 * Para borrar de verdad hay que añadir --confirm.
 *
 * Uso:
 *   export CLOUDINARY_API_KEY=xxxx
 *   export CLOUDINARY_API_SECRET=xxxx
 *
 *   node purge-cloudinary.mjs --project gerryweber              # simulacro
 *   node purge-cloudinary.mjs --project gerryweber --confirm    # borra de Cloudinary
 *   node purge-cloudinary.mjs --project gerryweber --confirm --delete-db
 *        # borra de Cloudinary Y elimina el proyecto entero de Supabase
 *
 *   node purge-cloudinary.mjs --orphans                         # simulacro: archivos de
 *        # Cloudinary que NO están referenciados por ninguna foto de la base de datos
 *        # (p. ej. los de proyectos ya borrados)
 *   node purge-cloudinary.mjs --orphans --confirm               # borra los huérfanos
 *
 * --project acepta slug ("gerryweber"), id (uuid) o nombre exacto ("GERRYWEBER").
 */

const SB = 'https://rdzjbvkzpusegtyudhtn.supabase.co';
const SK = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJkempidmt6cHVzZWd0eXVkaHRuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyMTU0MDEsImV4cCI6MjA5MDc5MTQwMX0.25id5riBB8LHywjLcXOZC8te62MnL-LvICF6Dfv9jDI';
const CLOUD = 'dfkxnfxof';

const args = process.argv.slice(2);
const getArg = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const PROJECT = getArg('--project');
const ORPHANS = args.includes('--orphans');
const CONFIRM = args.includes('--confirm');
const DELETE_DB = args.includes('--delete-db');

const API_KEY = process.env.CLOUDINARY_API_KEY;
const API_SECRET = process.env.CLOUDINARY_API_SECRET;

if (!PROJECT && !ORPHANS) {
  console.error('Falta --project <slug|id|nombre> o --orphans. Ej: node purge-cloudinary.mjs --orphans');
  process.exit(1);
}
// El modo huérfanos necesita credenciales incluso para el simulacro (hay que listar Cloudinary)
if ((CONFIRM || ORPHANS) && (!API_KEY || !API_SECRET)) {
  console.error('Exporta CLOUDINARY_API_KEY y CLOUDINARY_API_SECRET.');
  console.error('Los encuentras en https://console.cloudinary.com → Settings → API Keys.');
  process.exit(1);
}

const sb = async (path) => {
  const r = await fetch(`${SB}/rest/v1/${path}`, {
    headers: { apikey: SK, Authorization: `Bearer ${SK}` }
  });
  if (!r.ok) throw new Error(`Supabase ${path}: HTTP ${r.status}`);
  return r.json();
};

const sbDelete = async (path) => {
  const r = await fetch(`${SB}/rest/v1/${path}`, {
    method: 'DELETE',
    headers: { apikey: SK, Authorization: `Bearer ${SK}` }
  });
  if (!r.ok) throw new Error(`Supabase DELETE ${path}: HTTP ${r.status} ${await r.text()}`);
};

// public_id de una URL de Cloudinary: último segmento sin extensión ni query
// (las fotos de la galería se suben sin carpeta)
const publicIdFromUrl = (url) => {
  if (!url || !url.includes('cloudinary.com')) return null;
  const last = url.split('/').pop().split('?')[0];
  return last.replace(/\.[^.]+$/, '');
};

// Borra una lista de public_ids de Cloudinary en lotes de 100. Devuelve [borrados, fallidos].
const cloudinaryDelete = async (ids) => {
  const auth = Buffer.from(`${API_KEY}:${API_SECRET}`).toString('base64');
  let deleted = 0, failed = 0;
  for (let i = 0; i < ids.length; i += 100) {
    const batch = ids.slice(i, i + 100);
    const params = new URLSearchParams();
    batch.forEach(id => params.append('public_ids[]', id));
    params.append('invalidate', 'true');
    const r = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD}/resources/image/upload?${params}`, {
      method: 'DELETE',
      headers: { Authorization: `Basic ${auth}` }
    });
    const body = await r.json();
    if (!r.ok) {
      console.error(`Lote ${i / 100 + 1}: HTTP ${r.status}`, body.error?.message || body);
      failed += batch.length;
      continue;
    }
    const ok = Object.values(body.deleted || {}).filter(v => v === 'deleted').length;
    deleted += ok;
    failed += batch.length - ok;
    process.stdout.write(`\rBorrados ${deleted}/${ids.length}...`);
  }
  return [deleted, failed];
};

// Todas las URLs de Cloudinary referenciadas en la base de datos (fotos + moodboard de todos los proyectos)
const referencedIds = async () => {
  const ids = new Set();
  let off = 0;
  for (;;) {
    const r = await fetch(`${SB}/rest/v1/photos?select=url,thumb_url`, {
      headers: { apikey: SK, Authorization: `Bearer ${SK}`, Range: `${off}-${off + 999}` }
    });
    const rows = await r.json();
    rows.forEach(p => {
      const a = publicIdFromUrl(p.url); if (a) ids.add(a);
      const b = publicIdFromUrl(p.thumb_url); if (b) ids.add(b);
    });
    if (rows.length < 1000) break;
    off += rows.length;
  }
  try {
    const mood = await sb('moodboard?select=url');
    mood.forEach(m => { const a = publicIdFromUrl(m.url); if (a) ids.add(a); });
  } catch { /* tabla opcional */ }
  try {
    const projs = await sb('projects?select=client_logo');
    projs.forEach(p => { const a = publicIdFromUrl(p.client_logo); if (a) ids.add(a); });
  } catch { /* sin permisos */ }
  return ids;
};

// Lista todos los recursos image/upload de la cuenta de Cloudinary (paginado por cursor)
const allCloudinaryIds = async () => {
  const auth = Buffer.from(`${API_KEY}:${API_SECRET}`).toString('base64');
  const ids = [];
  let cursor = '';
  for (;;) {
    const url = `https://api.cloudinary.com/v1_1/${CLOUD}/resources/image/upload?max_results=500${cursor ? `&next_cursor=${cursor}` : ''}`;
    const r = await fetch(url, { headers: { Authorization: `Basic ${auth}` } });
    const body = await r.json();
    if (!r.ok) throw new Error(`Cloudinary list: HTTP ${r.status} ${body.error?.message || ''}`);
    body.resources.forEach(res => ids.push(res.public_id));
    if (!body.next_cursor) break;
    cursor = body.next_cursor;
    process.stdout.write(`\rListando Cloudinary: ${ids.length}...`);
  }
  console.log(`\rListando Cloudinary: ${ids.length} archivos en total.`);
  return ids;
};

const purgeOrphans = async () => {
  console.log('\nModo HUÉRFANOS: archivos de Cloudinary no referenciados en la base de datos.\n');
  const [all, used] = await Promise.all([allCloudinaryIds(), referencedIds()]);
  const orphans = all.filter(id => !used.has(id));
  console.log(`Referenciados en la base de datos: ${used.size}`);
  console.log(`Huérfanos a borrar: ${orphans.length}`);
  if (orphans.length) console.log(`Ejemplos: ${orphans.slice(0, 3).join(', ')} ...`);

  if (!CONFIRM) {
    const { writeFileSync } = await import('fs');
    writeFileSync('orphans-list.txt', orphans.join('\n'));
    console.log('\nLista completa guardada en orphans-list.txt para revisión.');
    console.log('── SIMULACRO ── No se ha borrado nada. Añade --confirm para ejecutar.');
    return;
  }
  const [deleted, failed] = await cloudinaryDelete(orphans);
  console.log(`\n\nCloudinary: ${deleted} borrados, ${failed} fallidos.\nHecho.`);
};

const main = async () => {
  if (ORPHANS) return purgeOrphans();

  // 1. Resolver proyecto
  const q = encodeURIComponent(PROJECT);
  let projects = await sb(`projects?or=(slug.eq.${q},name.eq.${q},id.eq.${/^[0-9a-f-]{36}$/i.test(PROJECT) ? q : '00000000-0000-0000-0000-000000000000'})&select=*`);
  if (!projects.length) {
    console.error(`No se encontró ningún proyecto con slug/nombre/id "${PROJECT}".`);
    const all = await sb('projects?select=name,slug,id');
    console.error('Proyectos disponibles:', all.map(p => `${p.name} (${p.slug || p.id})`).join(' · '));
    process.exit(1);
  }
  const project = projects[0];
  console.log(`\nProyecto: ${project.name} (id ${project.id})\n`);

  // 2. Recolectar URLs: days → looks → photos (paginado), + moodboard + logo
  const days = await sb(`days?project_id=eq.${project.id}&select=id`);
  let lookIds = [];
  if (days.length) {
    const looks = await sb(`looks?day_id=in.(${days.map(d => d.id).join(',')})&select=id`);
    lookIds = looks.map(l => l.id);
  }

  let photoUrls = [];
  if (lookIds.length) {
    let off = 0;
    for (;;) {
      const r = await fetch(`${SB}/rest/v1/photos?look_id=in.(${lookIds.join(',')})&select=url`, {
        headers: { apikey: SK, Authorization: `Bearer ${SK}`, Range: `${off}-${off + 999}` }
      });
      const rows = await r.json();
      photoUrls.push(...rows.map(p => p.url));
      if (rows.length < 1000) break;
      off += rows.length;
    }
  }

  let moodUrls = [];
  try {
    const mood = await sb(`moodboard?project_id=eq.${project.id}&select=url`);
    moodUrls = mood.map(m => m.url);
  } catch { /* tabla opcional */ }

  const cloudinaryIds = [...photoUrls, ...moodUrls]
    .map(publicIdFromUrl)
    .filter(Boolean);
  const uniqueIds = [...new Set(cloudinaryIds)];

  console.log(`Fotos en base de datos: ${photoUrls.length}`);
  console.log(`Archivos de Cloudinary a borrar: ${uniqueIds.length}`);
  if (uniqueIds.length) console.log(`Ejemplos: ${uniqueIds.slice(0, 3).join(', ')} ...`);

  if (!CONFIRM) {
    console.log('\n── SIMULACRO ── No se ha borrado nada.');
    console.log('Para ejecutar de verdad: añade --confirm (y --delete-db si también quieres eliminar el proyecto de Supabase).');
    return;
  }

  // 3. Borrar de Cloudinary en lotes de 100 (Admin API, borrado + invalidación de CDN)
  const [deleted, failed] = await cloudinaryDelete(uniqueIds);
  console.log(`\n\nCloudinary: ${deleted} borrados, ${failed} no encontrados o fallidos.`);

  // 4. Opcional: eliminar el proyecto de Supabase (fotos → looks → days → proyecto)
  if (DELETE_DB) {
    console.log('\nEliminando proyecto de Supabase...');
    if (lookIds.length) await sbDelete(`photos?look_id=in.(${lookIds.join(',')})`);
    if (days.length) await sbDelete(`looks?day_id=in.(${days.map(d => d.id).join(',')})`);
    await sbDelete(`days?project_id=eq.${project.id}`);
    try { await sbDelete(`moodboard?project_id=eq.${project.id}`); } catch { /* opcional */ }
    await sbDelete(`projects?id=eq.${project.id}`);
    console.log(`Proyecto "${project.name}" eliminado de la base de datos.`);
  }

  console.log('\nHecho.');
};

main().catch(e => { console.error('\nError:', e.message); process.exit(1); });
