import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';
import { Edit2, Plus, Folder, Calendar, Trash2, Settings, Image as ImageIcon, Link as LinkIcon, Eye } from 'lucide-react';

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
    const name = window.prompt("Name of the new client or commercial session:");
    if (!name || name.trim() === '') return;
    
    const cleanName = name.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
    const slug = cleanName || `proyecto-${Date.now()}`;
    
    // Insert! (Requiere `INSERT` role anon en RLS schemes de Supabase)
    const { data, error } = await supabase.from('projects').insert([{ name: name.trim(), slug }]).select().single();
    
    if (error) {
       alert("Error creating project. Did you enable the INSERT policy in your DB?: " + error.message);
       return;
    }
    if (data) {
       const list = await loadProjects();
       setProject(data); // Saltamos a la vista en blanco de este nuevo proyecto
       alert("Project created and private link generated!");
    }
  };

  const deleteProject = async () => {
    if (!project) return;
    const word = window.prompt(`DANGER ZONE: Type "DELETE" to permanently remove the project "${project.name}" and physically purge all its photos from storage (frees up space):`);
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
       alert("Delete failed. Check that DELETE is enabled in your Supabase policies: " + error.message);
       return;
    }
    
    alert("Purge complete! Storage space freed and project destroyed.");
    const list = await loadProjects();
    setProject(list.length > 0 ? list[0] : null);
  };

  const renameProject = async () => {
    const name = window.prompt("Rename the project (website and tab title):", project?.name);
    if (!name || name.trim() === '' || name === project?.name) return;
    
    const { error } = await supabase.from('projects').update({ name: name.trim() }).eq('id', project.id);
    if (error) alert("Error updating: " + error.message);
    
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
       
       alert('Client logo updated successfully!');
    } else {
       alert("There was an error uploading the logo: " + (error?.message || JSON.stringify(error)));
    }
    setUploading(false);
  };

  const updatePassword = async () => {
    const defaultMsg = project?.password ? `The project is currently protected with "${project.password}".` : "The project is PUBLIC with no barriers.";
    const pass = window.prompt(`${defaultMsg}\n\nType the new PIN or secret key to protect access. Leave it completely blank (and press OK) to disable the lock:`, project?.password || '');
    
    if (pass === null) return; // Si la cancela
    
    // Si la pone vacia, guardamos NULL para que supabase lo respete y lo haga publico
    const finalPass = pass.trim() === '' ? null : pass.trim();
    
    const { error } = await supabase.from('projects').update({ password: finalPass }).eq('id', project.id);
    if (error) alert("Error updating the key: " + error.message);
    else {
      const { data } = await supabase.from('projects').select('*').eq('id', project.id).single();
      setProject(data);
      loadProjects();
      alert(finalPass ? `Gallery LOCKED! Current key: ${finalPass}` : "Lock removed. The gallery is now public again for anyone with the URL.");
    }
  };


  // --- LOGICA DEL GESTOR (CRUD CARPETAS) ---
  const addDay = async () => {
    const name = window.prompt("Name of the new main section (e.g. Studio, Product, Wedding):");
    if (!name || name.trim() === '') return;
    const { data } = await supabase.from('days').insert([{ name: name.trim(), project_id: project?.id }]).select().single();
    if (data) setDays(prev => [...prev, data]);
  };
  
  const renameDay = async (id, oldName) => {
    const name = window.prompt("Type the new name for this section:", oldName);
    if (!name || name.trim() === '' || name === oldName) return;
    await supabase.from('days').update({ name: name.trim() }).eq('id', id);
    loadProjectData(project);
  };

  const deleteDay = async (id, name) => {
    if (!window.confirm(`⚠️ THIS CANNOT BE UNDONE: Are you sure you want to completely delete the section "${name}"?`)) return;
    await supabase.from('days').delete().eq('id', id);
    loadProjectData(project);
  };

  const addLook = async (dayId) => {
    const name = window.prompt("Name of the new destination folder (e.g. Shoes, Night, Outdoor):");
    if (!name || name.trim() === '') return;
    const { data } = await supabase.from('looks').insert([{ name: name.trim(), day_id: dayId }]).select().single();
    if (data) {
      setLooks(prev => [...prev, data]);
      setSelectedLook(data.id);
    }
  };

  const renameLook = async (id, oldName) => {
    const name = window.prompt("New folder name:", oldName);
    if (!name || name.trim() === '' || name === oldName) return;
    await supabase.from('looks').update({ name: name.trim() }).eq('id', id);
    loadProjectData(project);
  };

  const deleteLook = async (id, name) => {
    if (!window.confirm(`⚠️ Are you sure you want to permanently delete the sub-folder "${name}"? (Any photos inside will be orphaned)`)) return;
    await supabase.from('looks').delete().eq('id', id);
    loadProjectData(project);
  };


  // --- LOGICA DE SUBIDA (SUBMIT FILES MULTIUSO) ---
  const handleFiles = async (files) => {
    if (!selectedLook) return alert("First select a destination folder or the Moodboard option.");
    if (files.length === 0) return;
    
    setUploading(true);
    let done = 0;
    
    for (const file of Array.from(files)) {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}.${fileExt}`;

      const { data, error: uploadError } = await supabase.storage
        .from('photos')
        .upload(fileName, file);
        
      if (!uploadError && data) {
        const { data: { publicUrl } } = supabase.storage.from('photos').getPublicUrl(fileName);
        
        await supabase.from('photos').insert([
          { url: publicUrl, look_id: selectedLook, stars: 0, color: null }
        ]);
      } else {
        console.error("Error subiendo ", file.name, uploadError);
        alert("Photo upload failed: " + uploadError?.message);
      }
      
      done++;
      setProgress(Math.round((done / files.length) * 100));
    }
    
    setUploading(false);
    setProgress(0);
    alert('Images uploaded and synced successfully!');
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
     if (!window.confirm('⚠️ WARNING: Are you sure you want to PERMANENTLY delete this photo from the servers and the gallery?')) return;
     
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
       alert("Error deleting photo from the database: " + error.message);
     } else {
       setFolderPhotos(prev => prev.filter(p => p.id !== photoId));
     }
  };


  // --- Interfaz Lógica ---
  if (!auth) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0a0a', color: '#fff' }}>
        <form onSubmit={e => { e.preventDefault(); if (pass === '181122') setAuth(true); }}>
          <h2 style={{ fontFamily: 'Outfit', fontWeight: 300, marginBottom: 20 }}>Centro de Mando</h2>
          <input 
            type="password" 
            placeholder="Access Key" 
            value={pass} 
            onChange={e => setPass(e.target.value)}
            style={{ padding: '12px', background: '#111', border: '1px solid #333', color: '#fff', borderRadius: 4, marginRight: 10, width: 200 }}
          />
          <button type="submit" style={{ padding: '12px 24px', background: '#fff', color: '#000', borderRadius: 4, fontWeight: 500 }}>Entrar</button>
        </form>
      </div>
    );
  }

  const siteHost = window.location.host;
  // Fallback si algún proyecto viejo no tiene slug (caso extremo)
  const projectUrl = project ? `https://${siteHost}/${project.slug || '?p=' + project.id}` : `https://${siteHost}`;

  return (
    <div style={{ padding: '40px', background: '#0a0a0a', minHeight: '100vh', color: '#fff', fontFamily: 'Inter' }}>
      
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
                    <Plus size={14} /> Crear Carpeta
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
              <h3 style={{ fontWeight: 400, color: '#3498DB', margin: 0 }}>Procesando en la nube... {progress}%</h3>
              <div style={{ width: '100%', maxWidth: 400, background: '#000', height: 8, margin: '20px auto', borderRadius: 4 }}>
                <div style={{ width: `${progress}%`, background: '#3498DB', height: '100%', borderRadius: 4, transition: 'width 0.3s' }}></div>
              </div>
            </div>
          ) : (
            <div>
              <h3 style={{ fontWeight: 400, color: '#ccc', marginBottom: 10 }}>Drag the images for this folder here</h3>
              <p style={{ fontSize: 13, color: '#666' }}>O pulsa sobre el recuadro para seleccionar desde tu disco.</p>
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
                   Carpeta: {managingLook.name}
                </h2>
                <p style={{ margin: '5px 0 0 0', color: '#888', fontSize: 13 }}>Gestor de archivos individuales</p>
              </div>
              <button 
                 onClick={() => setManagingLook(null)} 
                 style={{ background: '#333', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: 6, cursor: 'pointer', fontWeight: 500 }}
              >
                 Cerrar Gestor
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
