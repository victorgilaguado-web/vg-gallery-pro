import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../supabase';

export function useGalleryData() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [locked, setLocked] = useState(false); // Estado del cerrojo de seguridad
  const [reviewer, setReviewerState] = useState(null); // quién está revisando (selección por persona)

  const [data, setData] = useState({
    project: null,
    days: [],
    looks: [],
    photos: [],      // fotos con stars/color/note del revisor actual ya mergeados
    rawPhotos: [],   // fotos tal cual vienen de la tabla, sin marcas de revisor
    moodboard: []
  });

  // Espejo síncrono de las fotos: evita stale-closures cuando hay varias
  // actualizaciones en el mismo ciclo de render (p. ej. estrella + color seguidos)
  const photosRef = useRef([]);

  const getProjectId = async () => {
    let slug = window.location.pathname.replace(/^\/+/, '').replace(/\/+$/, '');
    let params = new URLSearchParams(window.location.search);
    let pid = params.get('p');

    if (pid) return pid;

    try {
      if (!slug || slug === 'index.html' || slug === 'admin') {
         const { data } = await supabase.from('projects').select('id').order('created_at', { ascending: true }).limit(1).single();
         if (data) return data.id;
         return '00000000-0000-0000-0000-000000000001';
      }

      const { data } = await supabase.from('projects').select('id').eq('slug', slug.toLowerCase()).single();
      if (data) return data.id;
      return slug;
    } catch (err) {
      return '00000000-0000-0000-0000-000000000001';
    }
  };

  // Marcas del revisor sobre las fotos crudas
  const fetchReviews = async (photoIds, reviewerName) => {
    const map = {};
    if (!photoIds.length || !reviewerName) return map;
    const chunkSize = 100;
    for (let i = 0; i < photoIds.length; i += chunkSize) {
      const chunk = photoIds.slice(i, i + chunkSize);
      const { data: rows } = await supabase
        .from('photo_reviews')
        .select('photo_id, stars, color, note')
        .eq('reviewer', reviewerName)
        .in('photo_id', chunk);
      (rows || []).forEach(r => { map[r.photo_id] = r; });
    }
    return map;
  };

  const mergeReviews = (rawPhotos, reviewMap) =>
    rawPhotos.map(p => {
      const r = reviewMap[p.id];
      return { ...p, stars: r?.stars ?? 0, color: r?.color ?? null, note: r?.note ?? '' };
    });

  const fetchRealData = async (projectData, reviewerName) => {
    try {
      setLoading(true);
      const pid = projectData.id;

      const [
        { data: days },
        { data: moodboard },
      ] = await Promise.all([
        supabase.from('days').select('*').eq('project_id', pid).order('sort_order'),
        supabase.from('moodboard').select('*').eq('project_id', pid).limit(5000)
      ]);

      const daysList = days || [];
      const looksPromises = daysList.map(d =>
        supabase.from('looks').select('*').eq('day_id', d.id).order('sort_order')
      );

      const looksResults = await Promise.all(looksPromises);
      let allLooks = [];

      daysList.forEach((d, i) => {
        d.looks = looksResults[i].data || [];
        allLooks = [...allLooks, ...d.looks];
      });

      const lids = Array.from(new Set(allLooks.map(l => l.id)));
      let filteredPhotos = [];

      if (lids.length > 0) {
         const chunkSize = 50;
         for (let i = 0; i < lids.length; i += chunkSize) {
            const chunk = lids.slice(i, i + chunkSize);

            let page = 0;
            const pageSize = 1000;
            let hasMore = true;

            while (hasMore) {
               const { data: chunkPhotos } = await supabase
                  .from('photos')
                  .select('*')
                  .in('look_id', chunk)
                  .order('sort_order')
                  .range(page * pageSize, (page + 1) * pageSize - 1);

               if (chunkPhotos && chunkPhotos.length > 0) {
                  filteredPhotos.push(...chunkPhotos);
                  if (chunkPhotos.length < pageSize) {
                     hasMore = false;
                  } else {
                     page++;
                  }
               } else {
                  hasMore = false;
               }
            }
         }
      }

      const reviewMap = await fetchReviews(filteredPhotos.map(p => p.id), reviewerName);
      const mergedPhotos = mergeReviews(filteredPhotos, reviewMap);
      photosRef.current = mergedPhotos;

      setData({
        project: projectData,
        days: daysList,
        looks: allLooks,
        photos: mergedPhotos,
        rawPhotos: filteredPhotos,
        moodboard: moodboard || []
      });
      setLocked(false);

    } catch (err) {
      console.error("Error fetching payload:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // En /admin no cargamos la galería: el panel admin tiene su propia carga de datos
    if (window.location.pathname === '/admin') {
      setLoading(false);
      return;
    }
    const fetchInitial = async () => {
      try {
        setLoading(true);
        const pid = await getProjectId();
        const { data: project } = await supabase.from('projects').select('*').eq('id', pid).single();

        if (!project) throw new Error("Project not found");

        const savedReviewer = localStorage.getItem(`vg_reviewer_${project.id}`) || null;
        setReviewerState(savedReviewer);

        // Analizar Cerrojo de Privacidad (el admin entra con su propia vista)
        const sessionAuth = sessionStorage.getItem(`vg_auth_${project.id}`);
        const isAdminRoute = window.location.pathname === '/admin';
        if (project.password && sessionAuth !== 'true' && !isAdminRoute) {
           // Interceptar la descarga, bloquear app
           setData(prev => ({ ...prev, project }));
           setLocked(true);
           setLoading(false);
           return;
        }

        // Flujo libre o ya autenticado
        await fetchRealData(project, savedReviewer);

      } catch (err) {
        console.error("Error fetching project:", err);
        setError("Error loading the gallery or the link has expired.");
        setLoading(false);
      }
    };

    fetchInitial();
  }, []);

  const validatePassword = async (passAttempt) => {
    if (data.project && data.project.password === passAttempt) {
      sessionStorage.setItem(`vg_auth_${data.project.id}`, 'true');
      await fetchRealData(data.project, reviewer);
      return true;
    }
    return false;
  };

  // Cambiar/establecer quién revisa: persiste y re-mergea sus marcas
  const setReviewer = useCallback(async (name) => {
    const clean = (name || '').trim();
    if (!clean || !data.project) return;
    localStorage.setItem(`vg_reviewer_${data.project.id}`, clean);
    setReviewerState(clean);
    const reviewMap = await fetchReviews(data.rawPhotos.map(p => p.id), clean);
    const merged = mergeReviews(data.rawPhotos, reviewMap);
    photosRef.current = merged;
    setData(prev => ({ ...prev, photos: merged }));
  }, [data.project, data.rawPhotos]);

  // Las marcas van a photo_reviews (una fila por foto+revisor), no a la tabla photos
  const updatePhoto = async (id, patch) => {
    if (!reviewer) return;
    // Leer del ref (siempre al día) para no perder cambios de la misma tanda de clics
    const current = photosRef.current.find(p => p.id === id) || {};
    const merged = { ...current, ...patch };
    photosRef.current = photosRef.current.map(p => p.id === id ? merged : p);
    setData(prev => ({
      ...prev,
      photos: prev.photos.map(p => p.id === id ? { ...p, ...patch } : p)
    }));
    const row = {
      photo_id: id,
      reviewer,
      stars: parseInt(merged.stars) || 0,
      color: merged.color ?? null,
      note: merged.note ?? '',
      updated_at: new Date().toISOString()
    };
    await supabase.from('photo_reviews').upsert(row, { onConflict: 'photo_id,reviewer' });
  };

  // Enviar la selección al estudio: snapshot en la tabla submissions
  const submitSelection = async () => {
    if (!data.project || !reviewer) return { error: 'No reviewer' };
    const marked = data.photos.filter(p => (parseInt(p.stars) || 0) > 0 || p.color != null || (p.note && p.note.trim()));
    const summary = {
      total_photos: data.photos.length,
      reviewed: marked.length,
      selects: data.photos.filter(p => parseInt(p.color) === 3).length,
      retouch: data.photos.filter(p => parseInt(p.color) === 2).length,
      review: data.photos.filter(p => parseInt(p.color) === 1).length,
      discard: data.photos.filter(p => parseInt(p.color) === 0).length,
      starred: data.photos.filter(p => (parseInt(p.stars) || 0) > 0).length,
      notes: data.photos.filter(p => p.note && p.note.trim()).length
    };
    const { error } = await supabase.from('submissions').insert({
      project_id: data.project.id,
      reviewer,
      summary
    });
    return { error: error?.message || null, summary };
  };

  const updateProject = async (id, patch) => {
    setData(prev => ({
      ...prev,
      project: { ...prev.project, ...patch }
    }));
    await supabase.from('projects').update(patch).eq('id', id);
  };

  return { ...data, loading, error, locked, reviewer, setReviewer, validatePassword, updatePhoto, updateProject, submitSelection };
}
