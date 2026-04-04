import React, { useState } from 'react';
import { useGalleryData } from './hooks/useGalleryData';
import { Header } from './components/Header';
import { Tabs, LooksTabs } from './components/Tabs';
import { FilterBar } from './components/FilterBar';
import { GalleryGrid } from './components/GalleryGrid';
import { Summary } from './components/Summary';
import './App.css';

function thumb(url, w=800) {
  if (!url) return '';
  if (url.includes('cloudinary.com')) {
    return url.replace('/upload/', `/upload/w_${w},q_auto,f_auto,dpr_auto/`);
  }
  return url;
}

function App() {
  const { project, days, looks, photos, moodboard, loading, error, updatePhoto, updateProject } = useGalleryData();

  const [activeDay, setActiveDay] = useState(null);
  const [activeLook, setActiveLook] = useState(null);
  const [filter, setFilter] = useState(null);

  // Default to first day/look when data loads
  React.useEffect(() => {
    if (!loading && days.length > 0 && !activeDay && !activeLook) {
      setActiveDay(days[0].id);
      if (days[0].looks && days[0].looks.length > 0) {
        setActiveLook(days[0].looks[0].id);
      }
    }
  }, [loading, days, activeDay, activeLook]);

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner">◌</div>
        <div>Loading Gallery...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="loading-screen">
        <div style={{ color: '#E74C3C' }}>Error loading data: {error}</div>
      </div>
    );
  }

  const totalStarred = photos.filter(p => parseInt(p.stars) > 0).length;
  const totalSel = photos.filter(p => parseInt(p.color) === 2).length;

  const handleTabChange = (dayId, lookId) => {
    setActiveDay(dayId);
    setActiveLook(lookId);
    setFilter(null); // Reset filter on tab change
  };

  const handleLookChange = (lookId) => {
    setActiveLook(lookId);
    setFilter(null);
  };

  const currentDayInfo = days.find(d => d.id === activeDay);
  const currentLooks = currentDayInfo?.looks || [];

  const renderContent = () => {
    if (activeLook === 'moodboard' && !activeDay) {
      if (!moodboard || moodboard.length === 0) {
         return <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text-tertiary)', fontSize: 11, letterSpacing: 2, textTransform: 'uppercase' }}>Sin imágenes en moodboard</div>;
      }
      return (
        <div style={{ padding: '24px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '4px' }}>
            {moodboard.map(m => (
               <div key={m.id} style={{ aspectRatio: 1, overflow: 'hidden', borderRadius: '4px' }}>
                 <img src={thumb(m.url, 600)} alt="moodboard" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
               </div>
            ))}
          </div>
        </div>
      );
    } 

    if (activeLook === 'summary' && !activeDay) {
      return <Summary photos={photos} onUpdatePhoto={updatePhoto} />;
    }

    if (activeLook) {
      const lookPhotos = photos.filter(p => p.look_id === activeLook);
      const filteredPhotos = filter ? lookPhotos.filter(p => {
        const st = parseInt(p.stars) || 0;
        const col = p.color == null ? -1 : parseInt(p.color);
        if (filter === 's5') return st === 5;
        if (filter === 's4') return st === 4;
        if (filter === 's3') return st === 3;
        if (filter === 's2') return st === 2;
        if (filter === 's1') return st === 1;
        if (filter === 'c0') return col === 0;
        if (filter === 'c1') return col === 1;
        if (filter === 'c2') return col === 2;
        if (filter === 'notes') return !!(p.note && p.note.trim());
        return false;
      }) : lookPhotos;

      return (
        <>
          <FilterBar S_filt={filter} setFilt={setFilter} lookPhotos={lookPhotos} filteredPhotos={filteredPhotos} />
          <GalleryGrid photos={filteredPhotos} onUpdatePhoto={updatePhoto} />
        </>
      );
    }

    return <div style={{ height: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', color: 'var(--text-tertiary)', letterSpacing: '2px', textTransform: 'uppercase' }}>Selecciona una opción del menú</div>;
  };

  return (
    <div className="app-container">
      <Header 
        project={project} 
        photosCount={photos.length} 
        daysCount={days.length} 
        totalStarred={totalStarred} 
        totalSel={totalSel}
        onUpdateProject={updateProject}
      />
      
      <Tabs 
        days={days} 
        activeDay={activeDay} 
        activeLook={activeLook} 
        onTabChange={handleTabChange} 
      />

      {currentLooks.length > 0 && (
         <LooksTabs looks={currentLooks} activeLook={activeLook} onChange={handleLookChange} />
      )}

      <main className="main-content">
        {renderContent()}
      </main>
    </div>
  );
}

export default App;
