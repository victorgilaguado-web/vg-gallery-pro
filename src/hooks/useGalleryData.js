import { useState, useEffect } from 'react';
import { supabase } from '../supabase';

export function useGalleryData() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [locked, setLocked] = useState(false); // Estado del cerrojo de seguridad
  
  const [data, setData] = useState({
    project: null,
    days: [],
    looks: [],
    photos: [],
    moodboard: []
  });

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

  const fetchRealData = async (projectData) => {
    try {
      setLoading(true);
      const pid = projectData.id;
      
      const [
        { data: days },
        { data: photos },
        { data: moodboard },
      ] = await Promise.all([
        supabase.from('days').select('*').eq('project_id', pid).order('sort_order'),
        supabase.from('photos').select('*').order('sort_order'),
        supabase.from('moodboard').select('*').eq('project_id', pid)
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

      const lids = new Set(allLooks.map(l => l.id));
      const filteredPhotos = (photos || []).filter(p => !p.look_id || lids.has(p.look_id));

      setData({
        project: projectData,
        days: daysList,
        looks: allLooks,
        photos: filteredPhotos,
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
    const fetchInitial = async () => {
      try {
        setLoading(true);
        const pid = await getProjectId();
        const { data: project } = await supabase.from('projects').select('*').eq('id', pid).single();
        
        if (!project) throw new Error("Proyecto no encontrado");

        // Analizar Cerrojo de Privacidad
        const sessionAuth = sessionStorage.getItem(`vg_auth_${project.id}`);
        if (project.password && sessionAuth !== 'true') {
           // Interceptar la descarga, bloquear app
           setData(prev => ({ ...prev, project }));
           setLocked(true);
           setLoading(false);
           return; 
        }

        // Flujo libre o ya autenticado
        await fetchRealData(project);

      } catch (err) {
        console.error("Error fetching project:", err);
        setError("Error cargando la galería o enlace caducado.");
        setLoading(false);
      }
    };

    fetchInitial();
  }, []);

  const validatePassword = async (passAttempt) => {
    if (data.project && data.project.password === passAttempt) {
      sessionStorage.setItem(`vg_auth_${data.project.id}`, 'true');
      await fetchRealData(data.project);
      return true;
    }
    return false;
  };

  const updatePhoto = async (id, patch) => {
    setData(prev => ({
      ...prev,
      photos: prev.photos.map(p => p.id === id ? { ...p, ...patch } : p)
    }));
    await supabase.from('photos').update(patch).eq('id', id);
  };

  const updateProject = async (id, patch) => {
    setData(prev => ({
      ...prev,
      project: { ...prev.project, ...patch }
    }));
    await supabase.from('projects').update(patch).eq('id', id);
  };

  return { ...data, loading, error, locked, validatePassword, updatePhoto, updateProject };
}
