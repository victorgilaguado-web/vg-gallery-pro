import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase, SUPABASE_URL, SUPABASE_KEY } from '../supabase';

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
    submissionIdRef.current = null; // otro revisor = otra fila de envío
    setSendState('idle');
    const reviewMap = await fetchReviews(data.rawPhotos.map(p => p.id), clean);
    const merged = mergeReviews(data.rawPhotos, reviewMap);
    photosRef.current = merged;
    setData(prev => ({ ...prev, photos: merged }));
  }, [data.project, data.rawPhotos]);

  // ── Auto-envío al estudio ───────────────────────────────────────────────
  // La selección se manda sola: tras cada cambio (con un pequeño retardo) y al
  // cerrar/ocultar la pestaña. Se mantiene UNA fila por revisor en submissions,
  // que se va actualizando — el cliente no tiene que pulsar nada.
  const [sendState, setSendState] = useState('idle'); // 'idle' | 'saving' | 'sent'
  const submissionIdRef = useRef(null);
  const creatingRef = useRef(false);
  const autoTimer = useRef(null);
  const notifiedStartRef = useRef(false); // avisar al estudio solo una vez al empezar

  // Aviso al estudio (email vía función de servidor). Fire-and-forget, nunca rompe la app.
  const notify = (event, summary = {}, keepalive = false) => {
    const proj = data.project;
    if (!proj || !reviewer) return;
    try {
      fetch('/api/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project: proj.name, reviewer, event, summary }),
        keepalive
      }).catch(() => {});
    } catch { /* sin red: ignorar */ }
  };

  const computeSummary = () => {
    const photos = photosRef.current;
    const marked = photos.filter(p => (parseInt(p.stars) || 0) > 0 || p.color != null || (p.note && p.note.trim()));
    return {
      total_photos: photos.length,
      reviewed: marked.length,
      selects: photos.filter(p => parseInt(p.color) === 3).length,
      retouch: photos.filter(p => parseInt(p.color) === 2).length,
      review: photos.filter(p => parseInt(p.color) === 1).length,
      discard: photos.filter(p => parseInt(p.color) === 0).length,
      starred: photos.filter(p => (parseInt(p.stars) || 0) > 0).length,
      notes: photos.filter(p => p.note && p.note.trim()).length
    };
  };

  // Localiza (una vez) la fila de envío existente de este revisor
  const ensureSubmissionId = useCallback(async (projectId, reviewerName) => {
    if (submissionIdRef.current) return submissionIdRef.current;
    const { data: rows } = await supabase
      .from('submissions')
      .select('id')
      .eq('project_id', projectId)
      .eq('reviewer', reviewerName)
      .order('created_at', { ascending: false })
      .limit(1);
    if (rows && rows[0]) submissionIdRef.current = rows[0].id;
    return submissionIdRef.current;
  }, []);

  // Crea o actualiza la fila. keepalive=true para que sobreviva al cierre de pestaña.
  // force=true crea la fila aunque no haya marcas (para registrar "ha entrado").
  const flushSubmission = useCallback(async (keepalive = false, force = false) => {
    const proj = data.project;
    const rev = reviewer;
    if (!proj || !rev) return;
    const summary = computeSummary();
    if (summary.reviewed === 0 && !force) return; // nada que enviar todavía
    const h = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' };
    try {
      const existingId = await ensureSubmissionId(proj.id, rev);
      if (existingId) {
        await fetch(`${SUPABASE_URL}/rest/v1/submissions?id=eq.${existingId}`, {
          method: 'PATCH',
          headers: { ...h, Prefer: 'return=minimal' },
          body: JSON.stringify({ summary, created_at: new Date().toISOString() }),
          keepalive
        });
      } else if (!creatingRef.current) {
        creatingRef.current = true;
        const res = await fetch(`${SUPABASE_URL}/rest/v1/submissions`, {
          method: 'POST',
          headers: { ...h, Prefer: 'return=representation' },
          body: JSON.stringify({ project_id: proj.id, reviewer: rev, summary }),
          keepalive
        });
        const created = await res.json().catch(() => null);
        if (created && created[0]) submissionIdRef.current = created[0].id;
        creatingRef.current = false;
      }
      setSendState('sent');
    } catch {
      setSendState('idle');
    }
  }, [data.project, reviewer, ensureSubmissionId]);

  // Agenda el auto-envío unos segundos después del último cambio
  const scheduleAutoSubmit = useCallback(() => {
    setSendState('saving');
    if (autoTimer.current) clearTimeout(autoTimer.current);
    autoTimer.current = setTimeout(() => flushSubmission(false), 2500);
  }, [flushSubmission]);

  // Aviso "ha ENTRADO": en cuanto un revisor identificado abre la galería cargada,
  // marque o no. Una sola vez por carga de página.
  useEffect(() => {
    if (!loading && reviewer && data.project && !notifiedStartRef.current) {
      notifiedStartRef.current = true;
      notify('start', computeSummary());
      flushSubmission(false, true); // registra "ha entrado" en el panel del admin, aunque no marque nada
    }
  }, [loading, reviewer, data.project]);

  // Flush + aviso "ha terminado" al ocultar/cerrar la pestaña (best-effort con keepalive)
  useEffect(() => {
    const finish = () => {
      const summary = computeSummary();
      flushSubmission(true);
      // Solo avisar de fin si llegó a marcar algo y ya habíamos avisado del inicio
      if (summary.reviewed > 0 && notifiedStartRef.current) notify('finished', summary, true);
    };
    const onHide = () => { if (document.visibilityState === 'hidden') finish(); };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', finish);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', finish);
    };
  }, [flushSubmission]);

  // Guardado resiliente: una marca NUNCA se pierde aunque falle la red.
  // Cola por foto (gana la última) que se reintenta con backoff y al reconectar.
  const pendingWrites = useRef(new Map()); // photo_id -> row
  const [unsaved, setUnsaved] = useState(0);

  const persistReview = useCallback(async (row, attempt = 0) => {
    const { error } = await supabase.from('photo_reviews').upsert(row, { onConflict: 'photo_id,reviewer' });
    if (!error) {
      // Si esta era la última versión pendiente de esa foto, sácala de la cola
      if (pendingWrites.current.get(row.photo_id) === row) {
        pendingWrites.current.delete(row.photo_id);
        setUnsaved(pendingWrites.current.size);
      }
      return;
    }
    // Falló: guardar la última versión y reintentar (3 intentos con backoff)
    pendingWrites.current.set(row.photo_id, row);
    setUnsaved(pendingWrites.current.size);
    if (attempt < 3) {
      setTimeout(() => {
        if (pendingWrites.current.get(row.photo_id) === row) persistReview(row, attempt + 1);
      }, 1000 * (attempt + 1));
    }
  }, []);

  // Reintentar todo lo pendiente al recuperar conexión
  useEffect(() => {
    const onOnline = () => {
      pendingWrites.current.forEach(row => persistReview(row));
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [persistReview]);

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
    pendingWrites.current.set(id, row); // marcar pendiente hasta confirmar
    persistReview(row);
    scheduleAutoSubmit(); // el envío al estudio se actualiza solo
  };

  const updateProject = async (id, patch) => {
    setData(prev => ({
      ...prev,
      project: { ...prev.project, ...patch }
    }));
    await supabase.from('projects').update(patch).eq('id', id);
  };

  // Selecciones de los DEMÁS revisores (las marcadas como Select / verde),
  // agrupadas por persona y ordenadas. Se carga bajo demanda.
  const loadOthersSelections = useCallback(async () => {
    const raw = photosRef.current.length ? photosRef.current : data.rawPhotos;
    const ids = raw.map(p => p.id);
    const byId = Object.fromEntries(raw.map(p => [p.id, p]));
    const order = Object.fromEntries(raw.map((p, i) => [p.id, i]));

    const rows = [];
    for (let i = 0; i < ids.length; i += 100) {
      const { data: chunk } = await supabase
        .from('photo_reviews')
        .select('photo_id, reviewer, stars, color, note')
        .in('photo_id', ids.slice(i, i + 100))
        .eq('color', 3); // 3 = Select (verde)
      if (chunk) rows.push(...chunk);
    }

    const groups = {};
    rows.forEach(r => {
      if (!r.reviewer || r.reviewer === reviewer) return; // excluir al revisor actual
      (groups[r.reviewer] ||= []).push({ ...(byId[r.photo_id] || {}), reviewer: r.reviewer, _stars: r.stars, _note: r.note });
    });
    // ordenar las fotos de cada persona por el orden de la galería
    Object.values(groups).forEach(arr => arr.sort((a, b) => (order[a.id] ?? 0) - (order[b.id] ?? 0)));
    // devolver lista de { reviewer, photos } ordenada por nombre
    return Object.entries(groups)
      .map(([rev, photos]) => ({ reviewer: rev, photos }))
      .sort((a, b) => a.reviewer.localeCompare(b.reviewer));
  }, [data.rawPhotos, reviewer]);

  return { ...data, loading, error, locked, reviewer, sendState, unsaved, setReviewer, validatePassword, updatePhoto, updateProject, loadOthersSelections };
}
