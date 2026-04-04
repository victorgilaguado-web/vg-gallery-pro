import { useState, useEffect } from 'react';
import { supabase } from '../supabase';

export function useGalleryData() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState({
    project: null,
    days: [],
    looks: [],
    photos: [],
    moodboard: []
  });

  // Extract from original code logic
  const getProjectId = async () => {
    let slug = window.location.pathname.replace(/^\/+/, '').replace(/\/+$/, '');
    let params = new URLSearchParams(window.location.search);
    let pid = params.get('p');

    if (pid) return pid;
    if (!slug || slug === 'index.html') return '00000000-0000-0000-0000-000000000001';

    try {
      const { data } = await supabase.from('projects').select('id').eq('slug', slug.toUpperCase()).single();
      if (data) return data.id;
      return slug; 
    } catch (err) {
      return '00000000-0000-0000-0000-000000000001';
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const pid = await getProjectId();

        const [
          { data: project },
          { data: days },
          { data: photos },
          { data: moodboard },
        ] = await Promise.all([
          supabase.from('projects').select('*').eq('id', pid).single(),
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

        // Filter photos strictly to known looks
        const lids = new Set(allLooks.map(l => l.id));
        const filteredPhotos = (photos || []).filter(p => !p.look_id || lids.has(p.look_id));

        setData({
          project: project || { name: 'VG Studio Gallery', id: pid },
          days: daysList,
          looks: allLooks,
          photos: filteredPhotos,
          moodboard: moodboard || []
        });

      } catch (err) {
        console.error("Error fetching data:", err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

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

  return { ...data, loading, error, updatePhoto, updateProject };
}
