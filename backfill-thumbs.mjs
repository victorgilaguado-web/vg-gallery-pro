#!/usr/bin/env node
/**
 * Genera miniaturas (~1200px JPEG) para las fotos de Supabase Storage que aún
 * no tienen thumb_url, las sube al mismo bucket y rellena photos.thumb_url.
 * Las fotos en Cloudinary se omiten (ya se redimensionan al vuelo por URL).
 *
 * Uso:
 *   node backfill-thumbs.mjs            # simulacro: cuenta lo que haría
 *   node backfill-thumbs.mjs --confirm  # ejecuta
 *
 * Requiere: npm i sharp   (solo para este script, no entra en el bundle)
 */
import sharp from 'sharp';

const SB = 'https://rdzjbvkzpusegtyudhtn.supabase.co';
const SK = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJkempidmt6cHVzZWd0eXVkaHRuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyMTU0MDEsImV4cCI6MjA5MDc5MTQwMX0.25id5riBB8LHywjLcXOZC8te62MnL-LvICF6Dfv9jDI';
const BUCKET = 'photos';
const CONFIRM = process.argv.includes('--confirm');
const H = { apikey: SK, Authorization: `Bearer ${SK}` };

const allPhotos = async () => {
  const rows = [];
  let off = 0;
  for (;;) {
    const r = await fetch(`${SB}/rest/v1/photos?select=id,url,thumb_url`, { headers: { ...H, Range: `${off}-${off + 999}` } });
    const page = await r.json();
    rows.push(...page);
    if (page.length < 1000) break;
    off += page.length;
  }
  return rows;
};

const main = async () => {
  const photos = await allPhotos();
  // Solo Storage de Supabase, sin thumb todavía
  const pending = photos.filter(p => p.url && p.url.includes('/storage/v1/object/public/') && !p.thumb_url);
  console.log(`Fotos totales: ${photos.length}`);
  console.log(`En Supabase Storage sin miniatura: ${pending.length}`);

  if (!CONFIRM) {
    console.log('\n── SIMULACRO ── Añade --confirm para generar y subir las miniaturas.');
    return;
  }

  let ok = 0, fail = 0;
  for (const p of pending) {
    try {
      const orig = p.url.split('/storage/v1/object/public/' + BUCKET + '/')[1].split('?')[0];
      const buf = Buffer.from(await (await fetch(p.url)).arrayBuffer());
      const thumb = await sharp(buf).rotate().resize(1200, 1200, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();

      const thumbPath = orig.replace(/\.[^.]+$/, '') + '_thumb.jpg';
      const up = await fetch(`${SB}/storage/v1/object/${BUCKET}/${thumbPath}`, {
        method: 'POST',
        headers: { ...H, 'Content-Type': 'image/jpeg', 'x-upsert': 'true' },
        body: thumb
      });
      if (!up.ok) throw new Error('upload ' + up.status + ' ' + (await up.text()).slice(0, 120));

      const thumbUrl = `${SB}/storage/v1/object/public/${BUCKET}/${thumbPath}`;
      const patch = await fetch(`${SB}/rest/v1/photos?id=eq.${p.id}`, {
        method: 'PATCH', headers: { ...H, 'Content-Type': 'application/json' },
        body: JSON.stringify({ thumb_url: thumbUrl })
      });
      if (!patch.ok) throw new Error('patch ' + patch.status);

      ok++;
      process.stdout.write(`\r${ok}/${pending.length} done...`);
    } catch (e) {
      fail++;
      console.error(`\n  ✗ ${p.id}: ${e.message}`);
    }
  }
  console.log(`\n\nDone. ${ok} thumbnails created, ${fail} failed.`);
};

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
