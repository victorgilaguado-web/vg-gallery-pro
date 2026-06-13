import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';
import { Edit2, Plus, Folder, Calendar, Trash2, Settings, Image as ImageIcon, Link as LinkIcon, Eye, Inbox, ClipboardCopy, FileDown, Printer, RefreshCw, Aperture } from 'lucide-react';
import { DialogHost, dialogAlert, dialogConfirm, dialogPrompt } from './components/Dialogs';

// Miniatura JPEG (~1200px lado largo) generada en el navegador antes de subir
const makeThumb = (file, maxSize = 1200, quality = 0.82) => new Promise((resolve) => {
  const img = new Image();
  const url = URL.createObjectURL(file);
  img.onload = () => {
    const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
    if (scale >= 1) { URL.revokeObjectURL(url); resolve(null); return; }
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(b => { URL.revokeObjectURL(url); resolve(b); }, 'image/jpeg', quality);
  };
  img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
  img.src = url;
});

const fileNameFromUrl = (url) => (url || '').split('/').pop().split('?')[0];

export function Admin() {
  const [pass, setPass] = useState('');
  const [auth, setAuth] = useState(false);
  
  // States de Colecciones Maestras
  const [projectsList, setProjectsList] = useState([]);
  const [project, setProject] = useState(null);
  
  // States Locales por Proyecto
  const [days, setDays] = useState([]);
  const [looks, setLooks] = useState([]);
  
  const [selectedLook, setSelectedLook] = useState('');
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  // Selecciones de clientes (photo_reviews) y envíos (submissions)
  const [submissionsList, setSubmissionsList] = useState([]);
  const [selectionData, setSelectionData] = useState({ photos: [], reviews: [] });
  const [selectionsLoaded, setSelectionsLoaded] = useState(false);
  const [loadingSelections, setLoadingSelections] = useState(false);
  const [exportReviewer, setExportReviewer] = useState('');
  const [exportCriteria, setExportCriteria] = useState('selects');

  // States Gestor de Fotos
  const [managingLook, setManagingLook] = useState(null);
  const [folderPhotos, setFolderPhotos] = useState([]);
  const [loadingPhotos, setLoadingPhotos] = useState(false);

  const loadProjects = async () => {
    // 1. Cargar la lista entera de proyectos
    let { data: list } = await supabase.from('projects').select('*').order('created_at', { ascending: false });
    
    // Si no hay ninguno, el array está vacio
    if (!list) list = [];
    setProjectsList(list);
    
    return list;
  };

  const loadProjectData = async (activeProj) => {
    if (!activeProj) return;
    
    const { data: dData } = await supabase.from('days').select('*').eq('project_id', activeProj.id).order('sort_order', { ascending: true, nullsFirst: false });
    setDays(dData || []);
    
    // Looks can technically just be queried globally and filtered, or explicitly queried if foreign keys are mapped correctly. As currently modeled:
    const { data: lData } = await supabase.from('looks').select('*').order('sort_order', { ascending: true, nullsFirst: false });
    if (lData) {
      setLooks(lData);
      
      // Auto-seleccionar primer look si existe para el nuevo proyecto
      // Wait, we need to only auto-select looks that belong to this project's days.
      const projDaysIds = (dData || []).map(d => d.id);
      const projLooks = lData.filter(l => projDaysIds.includes(l.day_id));
      
      if (projLooks.length > 0) setSelectedLook(projLooks[0].id);
      else setSelectedLook('');
    }

    // Reset selecciones: se cargan bajo demanda (pueden ser miles de fotos)
    setSelectionData({ photos: [], reviews: [] });
    setSelectionsLoaded(false);

    const { data: subs } = await supabase.from('submissions').select('*')
      .eq('project_id', activeProj.id).order('created_at', { ascending: false }).limit(12);
    setSubmissionsList(subs || []);
  };

  // Fotos + marcas de todos los revisores del proyecto (para export y hoja de contactos).
  // Bajo demanda: puede traer miles de fotos, así que solo al pulsar el botón.
  const loadSelections = async () => {
    setLoadingSelections(true);
    try {
      const dayIds = days.map(d => d.id);
      const lookIds = looks.filter(l => dayIds.includes(l.day_id)).map(l => l.id);
      let photos = [];
      for (let i = 0; i < lookIds.length; i += 50) {
        const chunk = lookIds.slice(i, i + 50);
        let page = 0, more = chunk.length > 0;
        while (more) {
          const { data } = await supabase.from('photos').select('id,label,url,thumb_url')
            .in('look_id', chunk).range(page * 1000, (page + 1) * 1000 - 1);
          if (data && data.length) { photos.push(...data); more = data.length === 1000; page++; }
          else more = false;
        }
      }
      const ids = photos.map(p => p.id);
      let reviews = [];
      for (let i = 0; i < ids.length; i += 100) {
        const { data } = await supabase.from('photo_reviews').select('*').in('photo_id', ids.slice(i, i + 100));
        if (data) reviews.push(...data);
      }
      setSelectionData({ photos, reviews });
      setSelectionsLoaded(true);
      const reviewers = [...new Set(reviews.map(r => r.reviewer))];
      setExportReviewer(prev => reviewers.includes(prev) ? prev : (reviewers[0] || ''));
    } finally {
      setLoadingSelections(false);
    }
  };

  const matchCriteria = (r, crit) => {
    const st = parseInt(r.stars) || 0;
    const col = r.color == null ? -1 : parseInt(r.color);
    if (crit === 'selects') return col === 3;
    if (crit === 'retouch') return col === 2;
    if (crit === 's3') return st >= 3;
    if (crit === 'any') return st > 0 || col >= 0 || (r.note || '').trim() !== '';
    return false;
  };

  const buildExportList = () => {
    const byId = Object.fromEntries(selectionData.photos.map(p => [p.id, p]));
    return selectionData.reviews
      .filter(r => r.reviewer === exportReviewer && matchCriteria(r, exportCriteria))
      .map(r => ({ ...(byId[r.photo_id] || {}), _review: r }))
      .filter(p => p.id);
  };

  const exportName = (p) => p.label || fileNameFromUrl(p.url).replace(/\.[^.]+$/, '');

  // Lista de nombres para pegar como filtro en Capture One / Lightroom
  const copyExportList = async () => {
    const list = buildExportList();
    if (!list.length) return dialogAlert('No photos match that reviewer + criteria.', 'Nothing to export');
    await navigator.clipboard.writeText(list.map(exportName).join('\n'));
    await dialogAlert(`${list.length} file names copied to the clipboard. Paste them into the filename filter in Capture One or Lightroom.`, 'Copied');
  };

  const downloadExportList = async () => {
    const list = buildExportList();
    if (!list.length) return dialogAlert('No photos match that reviewer + criteria.', 'Nothing to export');
    const blob = new Blob([list.map(exportName).join('\n')], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${(project?.name || 'selection').replace(/[^a-z0-9]+/gi, '_')}_${exportReviewer}_${exportCriteria}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  // Hoja de contactos imprimible (guardar como PDF desde el diálogo de impresión)
  const openContactSheet = async () => {
    const list = buildExportList();
    if (!list.length) return dialogAlert('No photos match that reviewer + criteria.', 'Nothing to export');
    const CL = ['Discard', 'Review', 'Retouch', 'Select'];
    const CC = ['#E74C3C', '#F39C12', '#3498DB', '#2ECC71'];
    const cells = list.map(p => {
      const r = p._review;
      const st = parseInt(r.stars) || 0;
      const col = r.color == null ? -1 : parseInt(r.color);
      const img = p.thumb_url || (p.url.includes('cloudinary.com') ? p.url.replace('/upload/', '/upload/w_500,q_auto/') : p.url);
      return `<div class="cell">
        <div class="imgbox"><img src="${img}" loading="lazy"></div>
        <div class="cap">
          <div class="fn">${exportName(p)}</div>
          <div class="marks">${st ? '★'.repeat(st) : ''}${col >= 0 ? ` <span style="color:${CC[col]}">● ${CL[col]}</span>` : ''}</div>
          ${(r.note || '').trim() ? `<div class="note">${r.note.replace(/</g, '&lt;')}</div>` : ''}
        </div>
      </div>`;
    }).join('');
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${project?.name || ''} — Contact Sheet</title>
<style>
  body { font-family: -apple-system, 'Helvetica Neue', sans-serif; margin: 0; padding: 32px; color: #111; }
  .hdr { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 2px solid #111; padding-bottom: 14px; margin-bottom: 22px; }
  .hdr h1 { font-size: 20px; font-weight: 600; margin: 0; letter-spacing: 1px; }
  .hdr .meta { font-size: 11px; color: #666; text-align: right; line-height: 1.6; }
  .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; }
  .cell { break-inside: avoid; border: 1px solid #ddd; border-radius: 4px; overflow: hidden; }
  .imgbox { aspect-ratio: 3/4; background: #f4f4f4; }
  .imgbox img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .cap { padding: 7px 9px; }
  .fn { font-size: 9px; font-weight: 600; letter-spacing: 0.3px; word-break: break-all; }
  .marks { font-size: 9px; color: #b58900; margin-top: 3px; }
  .note { font-size: 8.5px; color: #555; margin-top: 4px; font-style: italic; line-height: 1.4; }
  .printbtn { position: fixed; top: 14px; right: 14px; padding: 10px 22px; background: #111; color: #fff; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; }
  @media print { .printbtn { display: none; } body { padding: 0; } }
</style></head><body>
<button class="printbtn" onclick="window.print()">Print / Save PDF</button>
<div class="hdr">
  <h1>${(project?.name || '').toUpperCase()}</h1>
  <div class="meta">VG Studio — Contact Sheet<br>Reviewer: ${exportReviewer} · ${list.length} photos · ${new Date().toLocaleDateString('en-GB')}</div>
</div>
<div class="grid">${cells}</div>
</body></html>`;
    const w = window.open('', '_blank');
    if (!w) return dialogAlert('The browser blocked the pop-up. Allow pop-ups for this site and try again.', 'Pop-up blocked');
    w.document.write(html);
    w.document.close();
  };

  // Genera un AppleScript que aplica estrellas (rating) y etiquetas de color
  // del revisor sobre el documento abierto de Capture One, emparejando por nombre.
  // Mapeo de color VG → Capture One: Discard→rojo(1), Review→naranja(2), Retouch→azul(5), Select→verde(4)
  const downloadCaptureOneScript = async () => {
    const byId = Object.fromEntries(selectionData.photos.map(p => [p.id, p]));
    const C1COLOR = { 0: 1, 1: 2, 2: 5, 3: 4 };
    const recs = selectionData.reviews
      .filter(r => r.reviewer === exportReviewer && ((parseInt(r.stars) || 0) > 0 || r.color != null))
      .map(r => {
        const p = byId[r.photo_id];
        if (!p) return null;
        const nm = exportName(p).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        const rt = parseInt(r.stars) || 0;
        const ct = r.color == null ? -1 : (C1COLOR[parseInt(r.color)] ?? -1);
        return `{nm:"${nm}", rt:${rt}, ct:${ct}}`;
      })
      .filter(Boolean);

    if (!recs.length) return dialogAlert('No stars or color labels to sync for this reviewer.', 'Nothing to sync');

    const script = `-- VG Studio -> Capture One sync
-- Project: ${(project?.name || '').replace(/-/g, ' ')}   Reviewer: ${exportReviewer}
-- Generated ${new Date().toLocaleString('en-GB')}
--
-- HOW TO USE
-- 1. Open your Capture One session and click the album/collection with these photos.
-- 2. In Script Editor (this window) press the Run button.
-- 3. Star ratings and color tags are applied to the matching photos by filename.
--    (Capture One is detected automatically, whatever version you have.)

use framework "Foundation"
use scripting additions

set theData to {${recs.join(', ')}}

set coName to my findCO()

-- Read every variant name from the open Capture One document
-- (run script compiles against the live app, so the version name never matters)
set allNames to (run script "tell application \\"" & coName & "\\" to tell current document to get name of every variant")

-- Native, fast name -> index lookup (case- and extension-insensitive)
set d to current application's NSMutableDictionary's dictionary()
repeat with i from 1 to (count of allNames)
  (d's setObject:i forKey:(my norm(item i of allNames)))
end repeat

-- Resolve matches and compose one batch of commands
set lf to linefeed
set body to ""
set matched to 0
set missingCount to 0
repeat with rec in theData
  set idxObj to (d's objectForKey:(my norm(nm of rec)))
  if idxObj is missing value then
    set missingCount to missingCount + 1
  else
    set ix to (idxObj as integer)
    if (rt of rec) > 0 then set body to body & "set rating of variant " & ix & " to " & (rt of rec) & lf
    if (ct of rec) is not -1 then set body to body & "set color tag of variant " & ix & " to " & (ct of rec) & lf
    set matched to matched + 1
  end if
end repeat

if body is not "" then
  run script ("tell application \\"" & coName & "\\"" & lf & "tell current document" & lf & body & "end tell" & lf & "end tell")
end if

set msg to (matched as text) & " photos updated in Capture One (" & coName & ")."
if missingCount > 0 then set msg to msg & lf & (missingCount as text) & " were not found in the open session (check the right album is selected)."
display dialog msg buttons {"OK"} default button "OK" with title "VG Studio -> Capture One"

on findCO()
  tell application "System Events"
    set ns to (name of (every process whose name contains "Capture One"))
  end tell
  if ns is {} then error "Capture One isn't running. Open your session first, then run this script again."
  return item 1 of ns
end findCO

on norm(t)
  set s to current application's NSString's stringWithString:t
  set s to s's lastPathComponent()
  set s to s's stringByDeletingPathExtension()
  return (s's lowercaseString()) as text
end norm
`;

    const blob = new Blob([script], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `CaptureOne_${(project?.name || 'sync').replace(/[^a-z0-9]+/gi, '_')}_${exportReviewer}.applescript`;
    a.click();
    URL.revokeObjectURL(a.href);
    await dialogAlert(`Script downloaded with ${recs.length} photos.\n\nOpen it (it launches Script Editor), make sure your Capture One session is open with the right album selected, and press Run. Stars and color tags will be applied to the matching files automatically.`, 'Capture One sync ready');
  };

  const initializeAdmin = async () => {
    const list = await loadProjects();
    // Auto-seleccionamos el más reciente (o el último que haya) si project es null
    if (list.length > 0 && !project) {
       setProject(list[0]);
    }
  };

  // Efecto Maestro
  useEffect(() => {
    if (auth) {
      initializeAdmin();
    }
  }, [auth]);

  // Efecto reactivo: si cambia el proyecto activo, cargamos sus entrañas
  useEffect(() => {
    if (project) {
      loadProjectData(project);
    }
  }, [project]);


  // --- LOGICA DE PROYECTOS MAESTRO (CRUD) ---
  const addProject = async () => {
    const name = await dialogPrompt("Name of the new client or commercial session:", "", "New project");
    if (!name || name.trim() === '') return;
    
    const cleanName = name.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
    const slug = cleanName || `proyecto-${Date.now()}`;
    
    // Insert! (Requiere `INSERT` role anon en RLS schemes de Supabase)
    const { data, error } = await supabase.from('projects').insert([{ name: name.trim(), slug }]).select().single();
    
    if (error) {
       await dialogAlert("Error creating project. Did you enable the INSERT policy in your DB?: " + error.message, "Error");
       return;
    }
    if (data) {
       const list = await loadProjects();
       setProject(data); // Saltamos a la vista en blanco de este nuevo proyecto
       await dialogAlert("Project created and private link generated!", "Done");
    }
  };

  const deleteProject = async () => {
    if (!project) return;
    const word = await dialogPrompt(`Type "DELETE" to permanently remove the project "${project.name}" and physically purge all its photos from storage. This cannot be undone.`, "", "Danger zone");
    if (word !== 'DELETE') return;
    
    // 1. Recolectar toda la basura física que hay que purgar de la Nube
    try {
      let fileNames = [];
      const { data: daysData } = await supabase.from('days').select('id').eq('project_id', project.id);
      
      if (daysData && daysData.length > 0) {
        const dayIds = daysData.map(d => d.id);
        const { data: looksData } = await supabase.from('looks').select('id').in('day_id', dayIds);
        
        if (looksData && looksData.length > 0) {
           const lookIds = looksData.map(l => l.id);
           const { data: photosData } = await supabase.from('photos').select('url').in('look_id', lookIds);
           if (photosData) fileNames = [...fileNames, ...photosData.map(p => p.url)];
        }
      }
      
      const { data: moodData } = await supabase.from('moodboard').select('url').eq('project_id', project.id);
      if (moodData) fileNames = [...fileNames, ...moodData.map(m => m.url)];
      
      if (project.client_logo) fileNames.push(project.client_logo);

      // Limpiar URLs y sacar solo el nombre final del archivo
      const filesToDelete = fileNames.filter(Boolean).map(url => {
         const partes = url.split('/');
         let finalPath = partes[partes.length - 1];
         // Clean query strings si es q hubiese
         return finalPath.split('?')[0]; 
      });

      // 2. Disparar los misiles de purgado al Storage
      if (filesToDelete.length > 0) {
         const { error: sErr } = await supabase.storage.from('photos').remove(filesToDelete);
         if (sErr) console.warn("Aviso de Storage (Falta permiso DELETE en bucket Storage):", sErr.message);
      }
    } catch(e) {
      console.warn("Fallo recolectando basura", e);
    }

    // 3. Destruir la obra definitivamente en la Base de Datos
    const { error } = await supabase.from('projects').delete().eq('id', project.id);
    if (error) {
       await dialogAlert("Delete failed. Check that DELETE is enabled in your Supabase policies: " + error.message, "Error");
       return;
    }
    
    await dialogAlert("Purge complete! Storage space freed and project destroyed.", "Done");
    const list = await loadProjects();
    setProject(list.length > 0 ? list[0] : null);
  };

  const renameProject = async () => {
    const name = await dialogPrompt("Rename the project (website and tab title):", project?.name, "Rename project");
    if (!name || name.trim() === '' || name === project?.name) return;
    
    const { error } = await supabase.from('projects').update({ name: name.trim() }).eq('id', project.id);
    if (error) await dialogAlert("Error updating: " + error.message, "Error");
    
    // Recargar solo para forzar actualización del título
    const { data } = await supabase.from('projects').select('*').eq('id', project.id).single();
    setProject(data);
    loadProjects();
  };

  const uploadClientLogo = async (file) => {
    if (!file) return;
    setUploading(true);
    const fileExt = file.name.split('.').pop();
    const fileName = `client_logo_${Date.now()}.${fileExt}`;
    
    const { data, error } = await supabase.storage.from('photos').upload(fileName, file);
    if (!error && data) {
       const { data: { publicUrl } } = supabase.storage.from('photos').getPublicUrl(fileName);
       await supabase.from('projects').update({ client_logo: publicUrl }).eq('id', project.id);
       
       const { data: p } = await supabase.from('projects').select('*').eq('id', project.id).single();
       setProject(p);
       loadProjects();
       
       await dialogAlert('Client logo updated successfully!', 'Done');
    } else {
       await dialogAlert("There was an error uploading the logo: " + (error?.message || JSON.stringify(error)), "Error");
    }
    setUploading(false);
  };

  const updatePassword = async () => {
    const defaultMsg = project?.password ? `The project is currently protected with "${project.password}".` : "The project is PUBLIC with no barriers.";
    const pass = await dialogPrompt(`${defaultMsg}\n\nType the new PIN or secret key to protect access. Leave it completely blank (and press OK) to disable the lock:`, project?.password || '', "Privacy lock");
    
    if (pass === null) return; // Si la cancela
    
    // Si la pone vacia, guardamos NULL para que supabase lo respete y lo haga publico
    const finalPass = pass.trim() === '' ? null : pass.trim();
    
    const { error } = await supabase.from('projects').update({ password: finalPass }).eq('id', project.id);
    if (error) await dialogAlert("Error updating the key: " + error.message, "Error");
    else {
      const { data } = await supabase.from('projects').select('*').eq('id', project.id).single();
      setProject(data);
      loadProjects();
      await dialogAlert(finalPass ? `Gallery locked! Current key: ${finalPass}` : "Lock removed. The gallery is now public again for anyone with the URL.", "Privacy lock");
    }
  };


  // --- LOGICA DEL GESTOR (CRUD CARPETAS) ---
  const addDay = async () => {
    const name = await dialogPrompt("Name of the new main section (e.g. Studio, Product, Wedding):", "", "New section");
    if (!name || name.trim() === '') return;
    const { data } = await supabase.from('days').insert([{ name: name.trim(), project_id: project?.id }]).select().single();
    if (data) setDays(prev => [...prev, data]);
  };
  
  const renameDay = async (id, oldName) => {
    const name = await dialogPrompt("Type the new name for this section:", oldName, "Rename section");
    if (!name || name.trim() === '' || name === oldName) return;
    await supabase.from('days').update({ name: name.trim() }).eq('id', id);
    loadProjectData(project);
  };

  const deleteDay = async (id, name) => {
    if (!(await dialogConfirm(`This cannot be undone: are you sure you want to completely delete the section "${name}"?`, "Delete section", true))) return;
    await supabase.from('days').delete().eq('id', id);
    loadProjectData(project);
  };

  const addLook = async (dayId) => {
    const name = await dialogPrompt("Name of the new destination folder (e.g. Shoes, Night, Outdoor):", "", "New folder");
    if (!name || name.trim() === '') return;
    const { data } = await supabase.from('looks').insert([{ name: name.trim(), day_id: dayId }]).select().single();
    if (data) {
      setLooks(prev => [...prev, data]);
      setSelectedLook(data.id);
    }
  };

  const renameLook = async (id, oldName) => {
    const name = await dialogPrompt("New folder name:", oldName, "Rename folder");
    if (!name || name.trim() === '' || name === oldName) return;
    await supabase.from('looks').update({ name: name.trim() }).eq('id', id);
    loadProjectData(project);
  };

  const deleteLook = async (id, name) => {
    if (!(await dialogConfirm(`Are you sure you want to permanently delete the sub-folder "${name}"? Any photos inside will be orphaned.`, "Delete folder", true))) return;
    await supabase.from('looks').delete().eq('id', id);
    loadProjectData(project);
  };


  // --- LOGICA DE SUBIDA (SUBMIT FILES MULTIUSO) ---
  const handleFiles = async (files) => {
    if (!selectedLook) return dialogAlert("First select a destination folder.", "No folder selected");
    if (files.length === 0) return;
    
    setUploading(true);
    let done = 0;
    
    for (const file of Array.from(files)) {
      const baseName = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const fileExt = file.name.split('.').pop();
      const fileName = `${baseName}.${fileExt}`;

      const { data, error: uploadError } = await supabase.storage
        .from('photos')
        .upload(fileName, file);

      if (!uploadError && data) {
        const { data: { publicUrl } } = supabase.storage.from('photos').getPublicUrl(fileName);

        // Generar y subir miniatura ligera para que la galería cargue rápido
        let thumbUrl = null;
        try {
          const thumbBlob = await makeThumb(file);
          if (thumbBlob) {
            const thumbName = `${baseName}_thumb.jpg`;
            const { error: tErr } = await supabase.storage.from('photos').upload(thumbName, thumbBlob, { contentType: 'image/jpeg' });
            if (!tErr) thumbUrl = supabase.storage.from('photos').getPublicUrl(thumbName).data.publicUrl;
          }
        } catch (e) { console.warn('thumb fail', e); }

        await supabase.from('photos').insert([
          { url: publicUrl, thumb_url: thumbUrl, look_id: selectedLook, stars: 0, color: null }
        ]);
      } else {
        console.error("Error subiendo ", file.name, uploadError);
        await dialogAlert("Photo upload failed: " + uploadError?.message, "Error");
      }

      done++;
      setProgress(Math.round((done / files.length) * 100));
    }
    
    setUploading(false);
    setProgress(0);
    await dialogAlert('Images uploaded and synced successfully!', 'Done');
  };

  const handleDrop = (e) => {
    e.preventDefault();
    if (!uploading) handleFiles(e.dataTransfer.files);
  };

  // --- LOGICA GESTOR INDIVIDUAL DE FOTOS ---
  const loadLookPhotos = async (look) => {
    setManagingLook(look);
    setLoadingPhotos(true);
    let allPhotos = [];
    let page = 0;
    let hasMore = true;
    while (hasMore) {
       const { data } = await supabase.from('photos').select('*').eq('look_id', look.id).order('id', { ascending: false }).range(page * 1000, (page + 1) * 1000 - 1);
       if (data && data.length > 0) {
          allPhotos.push(...data);
          if (data.length < 1000) hasMore = false;
          else page++;
       } else {
          hasMore = false;
       }
    }
    setFolderPhotos(allPhotos);
    setLoadingPhotos(false);
  };

  const deletePhoto = async (photoId, photoUrl) => {
     if (!(await dialogConfirm("Are you sure you want to permanently delete this photo from the servers and the gallery?", "Delete photo", true))) return;
     
     try {
       // Purge from storage
       const partes = photoUrl.split('/');
       let finalPath = partes[partes.length - 1];
       finalPath = finalPath.split('?')[0];
       
       await supabase.storage.from('photos').remove([finalPath]);
     } catch (e) {
       console.warn('Fallo borrando del storage físico:', e);
     }
     
     const { error } = await supabase.from('photos').delete().eq('id', photoId);
     if (error) {
       await dialogAlert("Error deleting photo from the database: " + error.message, "Error");
     } else {
       setFolderPhotos(prev => prev.filter(p => p.id !== photoId));
     }
  };


  // --- Interfaz Lógica ---
  if (!auth) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0a0a', color: '#fff' }}>
        <form onSubmit={e => { e.preventDefault(); if (pass === '181122') setAuth(true); }}>
          <h2 style={{ fontFamily: 'Outfit', fontWeight: 300, marginBottom: 20 }}>Command Center</h2>
          <input 
            type="password" 
            placeholder="Access Key" 
            value={pass} 
            onChange={e => setPass(e.target.value)}
            style={{ padding: '12px', background: '#111', border: '1px solid #333', color: '#fff', borderRadius: 4, marginRight: 10, width: 200 }}
          />
          <button type="submit" style={{ padding: '12px 24px', background: '#fff', color: '#000', borderRadius: 4, fontWeight: 500 }}>Enter</button>
        </form>
      </div>
    );
  }

  const siteHost = window.location.host;
  // Fallback si algún proyecto viejo no tiene slug (caso extremo)
  const projectUrl = project ? `https://${siteHost}/${project.slug || '?p=' + project.id}` : `https://${siteHost}`;

  const reviewerNames = [...new Set(selectionData.reviews.map(r => r.reviewer))];
  const exportCount = buildExportList().length;

  return (
    <div style={{ padding: '40px', background: '#0a0a0a', minHeight: '100vh', color: '#fff', fontFamily: 'Inter' }}>
      <DialogHost />

      {/* 0. SECCIÓN: SELECTOR DE ARQUITECTURA MULTI-PROYECTO */}
      <div style={{ background: '#18181b', padding: '20px 30px', borderRadius: 8, marginBottom: 30, border: '1px solid #3f3f46', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
         <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
           <div>
              <label style={{ fontSize: 11, color: '#a1a1aa', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 6 }}>Multi-Client Hub</label>
              <select 
                value={project?.id || ''}
                onChange={e => {
                  const p = projectsList.find(x => x.id === e.target.value);
                  setProject(p);
                }}
                style={{ background: '#09090b', color: '#fff', border: '1px solid #52525b', padding: '10px 14px', borderRadius: 6, fontSize: 16, minWidth: 250, outline: 'none', cursor: 'pointer', fontFamily: 'Outfit' }}
              >
                {projectsList.map(p => (
                   <option key={p.id} value={p.id}>📂 {p.name}</option>
                ))}
              </select>
           </div>
           <button 
             onClick={addProject}
             style={{ background: 'transparent', color: '#fff', border: '1px dashed #52525b', padding: '10px 16px', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, marginTop: 17 }}
           >
             <Plus size={16} /> New Session/Client
           </button>
         </div>

         <button onClick={deleteProject} style={{ background: 'transparent', color: '#ef4444', border: '1px solid #ef4444', padding: '8px 14px', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, marginTop: 17 }}>
           <Trash2 size={14} /> Delete Project
         </button>
      </div>


      {/* 1. SECCIÓN: CONFIGURACIÓN BÁSICA DEL PROYECTO ACTUAL */}
      <div style={{ background: '#111', padding: '30px', borderRadius: 8, marginBottom: 40, border: '1px solid #222' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <Settings size={20} color="#3498DB" />
          <h2 style={{ fontSize: 18, fontWeight: 500, margin: 0 }}>Session Master Settings</h2>
        </div>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr) 1.5fr', gap: 30, marginBottom: 30 }}>
           
           <div>
             <label style={{ fontSize: 13, color: '#aaa', display: 'block', marginBottom: 8 }}>Official Web Title</label>
             <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
               <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{project?.name || '...'}</h3>
               <button onClick={renameProject} style={{ background: '#222', border: '1px solid #444', color: '#eee', padding: '6px 12px', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}>Edit</button>
             </div>
           </div>

           <div>
             <label style={{ fontSize: 13, color: '#aaa', display: 'block', marginBottom: 8 }}>Co-Branding Logo</label>
             <div style={{ display: 'flex', alignItems: 'center', gap: 15 }}>
               {project?.client_logo ? <img src={project.client_logo} alt="Logo" style={{ height: 35, objectFit: 'contain', background: '#fff', padding: 5, borderRadius: 4 }} /> : <span style={{color: '#666', fontSize: 13}}>Add logo →</span>}
               
               <input type="file" id="clientLogoUpload" accept="image/*" style={{display: 'none'}} onChange={(e) => uploadClientLogo(e.target.files[0])} />
               <button onClick={() => document.getElementById('clientLogoUpload').click()} style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#222', border: '1px solid #444', color: '#eee', padding: '6px 12px', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}>
                 <ImageIcon size={14} /> Upload Logo
               </button>
             </div>
           </div>

           <div style={{ background: '#09090b', padding: '15px 20px', borderRadius: 6, border: '1px solid #3f3f46' }}>
              <label style={{ fontSize: 11, color: '#3498DB', textTransform: 'uppercase', letterSpacing: 1, display: 'flex', alignItems: 'center', gap: 5, marginBottom: 8 }}>
                 <LinkIcon size={12} /> Client Private Link
              </label>
              <a href={projectUrl} target="_blank" rel="noreferrer" style={{ color: '#fff', fontSize: 15, textDecoration: 'none', background: '#27272a', padding: '8px 12px', borderRadius: 4, display: 'inline-block', width: '100%', wordBreak: 'break-all' }}>
                 {projectUrl}
              </a>
           </div>

        </div>

        {/* Zona de Cerrojo de Seguridad */}
        <div style={{ borderTop: '1px solid #222', paddingTop: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
           <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ background: project?.password ? '#e74c3c' : '#222', padding: 10, borderRadius: '50%', color: project?.password ? '#fff' : '#666' }}>
                <LinkIcon size={18} />
              </div>
              <div>
                <h4 style={{ margin: 0, fontSize: 15, fontWeight: 500 }}>Privacy Lock</h4>
                <p style={{ margin: 0, fontSize: 12, color: '#888', marginTop: 4 }}>
                   {project?.password ? `Protected. The client must enter the PIN to get in.` : `Disabled. Public site with direct URL access.`}
                </p>
              </div>
           </div>
           <button onClick={updatePassword} style={{ background: project?.password ? '#e74c3c' : 'transparent', border: project?.password ? 'none' : '1px solid #555', color: project?.password ? '#fff' : '#ccc', padding: '10px 20px', borderRadius: 6, fontSize: 13, cursor: 'pointer', fontWeight: 500, transition: 'all 0.2s' }}>
             {project?.password ? 'Disable Lock' : 'Enable Security PIN'}
           </button>
        </div>

      </div>
      
      {/* 1.5 SECCIÓN: SELECCIONES DE CLIENTE (envíos + export + hoja de contactos) */}
      <div style={{ background: '#111', padding: '30px', borderRadius: 8, marginBottom: 40, border: '1px solid #222' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <Inbox size={20} color="#2ECC71" />
          <h2 style={{ fontSize: 18, fontWeight: 500, margin: 0 }}>Client Selections</h2>
          <button onClick={() => loadProjectData(project)} title="Refresh"
            style={{ marginLeft: 'auto', background: 'transparent', border: '1px solid #333', color: '#888', padding: '6px 10px', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
            <RefreshCw size={13} /> Refresh
          </button>
        </div>

        {/* Envíos recibidos */}
        <div style={{ marginBottom: 26 }}>
          <label style={{ fontSize: 11, color: '#a1a1aa', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 10 }}>Submissions received</label>
          {submissionsList.length === 0 ? (
            <p style={{ color: '#555', fontSize: 13 }}>No submissions yet. Clients press “Submit selection” when they finish reviewing.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {submissionsList.map(sub => {
                const sm = sub.summary || {};
                return (
                  <div key={sub.id} style={{ display: 'flex', alignItems: 'center', gap: 16, background: '#18181b', border: '1px solid #2a2a2a', borderRadius: 6, padding: '12px 16px' }}>
                    <div style={{ width: 34, height: 34, borderRadius: '50%', background: '#2ECC71', color: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: 14, flexShrink: 0 }}>
                      {(sub.reviewer || '?').charAt(0).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, color: '#eee', fontWeight: 500 }}>{sub.reviewer || 'Anonymous'}</div>
                      <div style={{ fontSize: 11, color: '#888' }}>{new Date(sub.created_at).toLocaleString('en-GB')}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 18, fontSize: 12, color: '#aaa', flexWrap: 'wrap' }}>
                      <span><b style={{ color: '#2ECC71' }}>{sm.selects ?? 0}</b> selects</span>
                      <span><b style={{ color: '#3498DB' }}>{sm.retouch ?? 0}</b> retouch</span>
                      <span><b style={{ color: '#fff' }}>{sm.starred ?? 0}</b> ★</span>
                      <span><b style={{ color: '#fff' }}>{sm.reviewed ?? 0}</b>/{sm.total_photos ?? 0} reviewed</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Export a Capture One / hoja de contactos */}
        <div style={{ borderTop: '1px solid #222', paddingTop: 22 }}>
          <label style={{ fontSize: 11, color: '#a1a1aa', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 12 }}>Export selection</label>
          {!selectionsLoaded ? (
            <button onClick={loadSelections} disabled={loadingSelections}
              style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#222', color: '#eee', border: '1px solid #444', padding: '10px 18px', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>
              <RefreshCw size={14} /> {loadingSelections ? 'Loading client marks…' : 'Load client marks to export'}
            </button>
          ) : reviewerNames.length === 0 ? (
            <p style={{ color: '#555', fontSize: 13 }}>No client marks yet for this project.</p>
          ) : (
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, flexWrap: 'wrap' }}>
              <div>
                <label style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 5 }}>Reviewer</label>
                <select value={exportReviewer} onChange={e => setExportReviewer(e.target.value)}
                  style={{ background: '#0a0a0a', color: '#fff', border: '1px solid #444', padding: '9px 12px', borderRadius: 6, fontSize: 13, minWidth: 150, cursor: 'pointer' }}>
                  {reviewerNames.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 5 }}>Criteria</label>
                <select value={exportCriteria} onChange={e => setExportCriteria(e.target.value)}
                  style={{ background: '#0a0a0a', color: '#fff', border: '1px solid #444', padding: '9px 12px', borderRadius: 6, fontSize: 13, minWidth: 160, cursor: 'pointer' }}>
                  <option value="selects">● Selects only</option>
                  <option value="retouch">● Retouch</option>
                  <option value="s3">★★★ or more</option>
                  <option value="any">Any mark</option>
                </select>
              </div>
              <span style={{ fontSize: 13, color: '#666', paddingBottom: 9 }}>{exportCount} photo{exportCount !== 1 ? 's' : ''}</span>
              <button onClick={copyExportList} style={{ display: 'flex', alignItems: 'center', gap: 7, background: '#fff', color: '#000', border: 'none', padding: '10px 16px', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                <ClipboardCopy size={14} /> Copy file names
              </button>
              <button onClick={downloadExportList} style={{ display: 'flex', alignItems: 'center', gap: 7, background: '#222', color: '#eee', border: '1px solid #444', padding: '10px 16px', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>
                <FileDown size={14} /> .txt
              </button>
              <button onClick={openContactSheet} style={{ display: 'flex', alignItems: 'center', gap: 7, background: '#222', color: '#eee', border: '1px solid #444', padding: '10px 16px', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>
                <Printer size={14} /> Contact sheet (PDF)
              </button>
              <button onClick={downloadCaptureOneScript} title="Apply stars + color tags straight into the open Capture One document" style={{ display: 'flex', alignItems: 'center', gap: 7, background: '#2ECC71', color: '#000', border: 'none', padding: '10px 16px', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                <Aperture size={14} /> Sync to Capture One
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 2. SECCIÓN DE ESTRUCTURA Y CARPETAS */}
      <div style={{ background: '#111', padding: '30px', borderRadius: 8, marginBottom: 40, border: '1px solid #222' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ fontSize: 18, fontWeight: 500 }}>Sections & Folders Tree</h2>
          <button 
            onClick={addDay}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#3498DB', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 4, cursor: 'pointer', fontSize: 12, fontWeight: 500 }}
          >
            <Plus size={14} /> New Main Section
          </button>
        </div>

        {days.length === 0 ? <p style={{color:'#666', fontSize:13}}>No sections created yet for this session.</p> : null}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {days.map(day => {
            const dayLooks = looks.filter(l => l.day_id === day.id);
            return (
              <div key={day.id} style={{ borderLeft: '2px solid #333', paddingLeft: 15 }}>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <Calendar size={18} color="#aaa" />
                  <span style={{ fontSize: 16, fontWeight: 600, color: '#eee' }}>{day.name}</span>
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
                    <button onClick={() => renameDay(day.id, day.name)} style={{ background: 'transparent', border: 'none', color: '#666', cursor: 'pointer' }}><Edit2 size={14} /></button>
                    <button onClick={() => deleteDay(day.id, day.name)} style={{ background: 'transparent', border: 'none', color: '#E74C3C', cursor: 'pointer' }}><Trash2 size={14} /></button>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10, marginBottom: 15 }}>
                  {dayLooks.map(look => (
                    <div key={look.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#1a1a1a', border: '1px solid #333', padding: '10px 15px', borderRadius: 6 }}>
                      <div style={{display:'flex', alignItems:'center', gap: 8}}>
                         <Folder size={14} color="#666" />
                         <span style={{fontSize: 13, color: '#ccc'}}>{look.name}</span>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                         <button onClick={() => loadLookPhotos(look)} style={{ background: 'transparent', border: 'none', color: '#aaa', cursor: 'pointer', padding: 0 }} title="View Photos"><Eye size={14} /></button>
                         <button onClick={() => renameLook(look.id, look.name)} style={{ background: 'transparent', border: 'none', color: '#555', cursor: 'pointer', padding: 0 }} title="Rename"><Edit2 size={14} /></button>
                         <button onClick={() => deleteLook(look.id, look.name)} style={{ background: 'transparent', border: 'none', color: '#c0392b', cursor: 'pointer', padding: 0 }} title="Delete"><Trash2 size={14} /></button>
                      </div>
                    </div>
                  ))}
                  
                  <div 
                    onClick={() => addLook(day.id)}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, border: '1px dashed #444', padding: '10px', borderRadius: 6, cursor: 'pointer', color: '#888', fontSize: 13 }}
                  >
                    <Plus size={14} /> New Folder
                  </div>
                </div>

              </div>
            );
          })}
        </div>
      </div>


      {/* 3. ZONA DE UPLOAD */}
      <div style={{ background: '#111', padding: '30px', borderRadius: 8, border: '1px solid #222' }}>
         <h2 style={{ fontSize: 18, fontWeight: 500, marginBottom: 20 }}>Bulk Upload Engine</h2>
         
          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 13, color: '#aaa', display: 'block', marginBottom: 8 }}>Where should these uploads go in {project?.name}?</label>
            <select 
              value={selectedLook} 
              onChange={e => setSelectedLook(e.target.value)}
              style={{ background: '#0a0a0a', color: '#fff', border: '1px solid #444', padding: '14px 12px', borderRadius: 6, width: '100%', maxWidth: '400px', cursor: 'pointer', fontSize: 15 }}
            >
              
              <option value="" disabled>─ Gallery Folders ─</option>
              {days.map(d => {
                 const lks = looks.filter(l => l.day_id === d.id);
                 if(lks.length > 0) {
                     return (
                       <optgroup key={d.id} label={`↳ Day: ${d.name}`}>
                          {lks.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                       </optgroup>
                     )
                 }
                 return null;
              })}
            </select>
          </div>

        <div 
          onDragOver={e => e.preventDefault()}
          onDrop={handleDrop}
          style={{ 
            marginTop: 20,
            border: uploading ? '2px solid #3498DB' : '2px dashed #444', 
            borderRadius: 8, 
            padding: 80, 
            textAlign: 'center',
            background: uploading ? '#1a1a1a' : '#0a0a0a',
            cursor: uploading ? 'wait' : 'pointer',
            transition: 'all 0.3s ease',
            opacity: selectedLook ? 1 : 0.6,
            pointerEvents: selectedLook ? 'auto' : 'none'
          }}
          onClick={() => !uploading && selectedLook && document.getElementById('fileUpload').click()}
        >
          <input 
            id="fileUpload" 
            type="file" 
            multiple 
            accept="image/*" 
            style={{ display: 'none' }} 
            onChange={e => handleFiles(e.target.files)}
          />
          
          {uploading ? (
            <div>
              <h3 style={{ fontWeight: 400, color: '#3498DB', margin: 0 }}>Processing in the cloud... {progress}%</h3>
              <div style={{ width: '100%', maxWidth: 400, background: '#000', height: 8, margin: '20px auto', borderRadius: 4 }}>
                <div style={{ width: `${progress}%`, background: '#3498DB', height: '100%', borderRadius: 4, transition: 'width 0.3s' }}></div>
              </div>
            </div>
          ) : (
            <div>
              <h3 style={{ fontWeight: 400, color: '#ccc', marginBottom: 10 }}>Drag the images for this folder here</h3>
              <p style={{ fontSize: 13, color: '#666' }}>Or click the box to pick files from your disk.</p>
            </div>
          )}
        </div>
      </div>

      {/* MODAL GESTOR DE FOTOS PARA LA CARPETA */}
      {managingLook && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.95)', zIndex: 9999, padding: '40px 60px', overflowY: 'auto' }}>
           <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 30, borderBottom: '1px solid #333', paddingBottom: 20 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 24, fontWeight: 500, color: '#fff', fontFamily: 'Outfit' }}>
                   Folder: {managingLook.name}
                </h2>
                <p style={{ margin: '5px 0 0 0', color: '#888', fontSize: 13 }}>Individual file manager</p>
              </div>
              <button 
                 onClick={() => setManagingLook(null)} 
                 style={{ background: '#333', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: 6, cursor: 'pointer', fontWeight: 500 }}
              >
                 Close Manager
              </button>
           </div>
           
           {loadingPhotos ? (
              <p style={{ color: '#aaa', textAlign: 'center', marginTop: 100 }}>Loading photos from the server...</p>
           ) : folderPhotos.length === 0 ? (
              <p style={{ color: '#aaa', textAlign: 'center', marginTop: 100 }}>No photos in this folder.</p>
           ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 15 }}>
                 {folderPhotos.map(p => {
                    const thumbUrl = p.url.includes('cloudinary.com') 
                       ? p.url.replace('/upload/', '/upload/w_300,q_auto,f_auto,dpr_auto/') 
                       : p.url;

                    return (
                      <div key={p.id} style={{ position: 'relative', aspectRatio: '1', borderRadius: 8, overflow: 'hidden', border: '1px solid #222', background: '#111' }}>
                         <img src={thumbUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                         <button 
                            onClick={() => deletePhoto(p.id, p.url)}
                            style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(231, 76, 60, 0.9)', color: '#fff', border: 'none', borderRadius: '50%', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 4px 6px rgba(0,0,0,0.3)', transition: 'all 0.2s' }}
                            title="Delete Photo"
                            onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.1)'}
                            onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                         >
                            <Trash2 size={16}/>
                         </button>
                      </div>
                    );
                 })}
              </div>
           )}
        </div>
      )}

    </div>
  );
}
