import React, { useState, useEffect } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';

const COLORS = ['#E74C3C', '#F39C12', '#3498DB', '#2ECC71'];
const CLABELS = ['Discard', 'Review', 'Retouch', 'Select'];

function thumb(url, w=800) {
  if (!url) return '';
  if (url.includes('cloudinary.com')) {
    return url.replace('/upload/', `/upload/w_${w},q_auto,f_auto,dpr_auto/`);
  }
  return url;
}

export function PhotoModal({ photo, allPhotos, onNavigate, onClose, onUpdate }) {
  const [zoomScale, setZoomScale] = useState(1);
  const [zoomPos, setZoomPos] = useState({ x: 50, y: 50 });
  
  // Cuando navegamos de foto en foto, queremos que el estado interno se refresque al cambiar la prop "photo"
  const [note, setNote] = useState(photo.note || '');
  useEffect(() => {
    setNote(photo.note || '');
    setZoomScale(1); // reset zoom en cambio de foto
  }, [photo]);

  const curColor = photo.color == null ? -1 : parseInt(photo.color);
  const curStars = parseInt(photo.stars) || 0;
  
  const currentIndex = allPhotos ? allPhotos.findIndex(p => p.id === photo.id) : -1;

  // Lógica de atajos de teclado para Slider
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ignorar teclado si estamos escribiendo la nota
      if (document.activeElement.tagName === 'TEXTAREA') return;
      
      if (e.key === 'ArrowRight' && currentIndex >= 0 && currentIndex < allPhotos.length - 1) {
        onNavigate(allPhotos[currentIndex + 1]);
      }
      if (e.key === 'ArrowLeft' && currentIndex > 0) {
        onNavigate(allPhotos[currentIndex - 1]);
      }
      if (e.key === 'Escape') onClose();

      // Atajos de puntuacion rapida por teclado
      if (['1', '2', '3', '4', '5'].includes(e.key)) {
        onUpdate(photo.id, { stars: parseInt(e.key) });
      }
      if (e.key === '0') {
        onUpdate(photo.id, { stars: 0 });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, allPhotos, photo.id, onNavigate, onClose, onUpdate]);

  const handleZoomClick = (e) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.round(((e.clientX - rect.left) / rect.width) * 100);
    const y = Math.round(((e.clientY - rect.top) / rect.height) * 100);
    setZoomPos({ x, y });
    setZoomScale(prev => prev === 1 ? 2.5 : 1);
  };

  const handleWheel = (e) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.round(((e.clientX - rect.left) / rect.width) * 100);
    const y = Math.round(((e.clientY - rect.top) / rect.height) * 100);
    setZoomPos({ x, y });
    setZoomScale(prev => Math.min(4, Math.max(1, prev - (e.deltaY > 0 ? 0.3 : -0.3))));
  };

  const handleSave = () => {
    onUpdate(photo.id, { note });
    onClose();
  };

  // Autoreset Note immediately if we close before saving? We just save what's in local state
  // But wait, if they change the note and hit Next Arrow, the note is NOT saved automatically.
  // Let's implement auto-save note on blur or navigation
  const autoSaveNote = () => {
    if (note !== (photo.note || '')) {
       onUpdate(photo.id, { note });
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-img-area" onClick={e => e.stopPropagation()}>
        
        {/* Flecha Izquierda */}
        {currentIndex > 0 && (
          <button 
            className="nav-btn left"
            style={{ position: 'absolute', left: 40, zIndex: 10, background: 'rgba(0,0,0,0.6)', border: 'none', color: '#fff', borderRadius: '50%', padding: '12px', cursor: 'pointer', transition: 'all 0.2s', display: 'flex', outline: 'none' }}
            onClick={(e) => { e.stopPropagation(); autoSaveNote(); onNavigate(allPhotos[currentIndex - 1]); }}
            onMouseEnter={e => e.currentTarget.style.background='rgba(52, 152, 219, 0.8)'}
            onMouseLeave={e => e.currentTarget.style.background='rgba(0,0,0,0.6)'}
          >
            <ChevronLeft size={36} />
          </button>
        )}

        <div 
          className="modal-img-box" 
          onClick={handleZoomClick} 
          onWheel={handleWheel}
          style={{ cursor: zoomScale > 1 ? 'zoom-out' : 'zoom-in' }}
        >
          {photo.url && (
             <img 
               src={thumb(photo.url, 1400)} 
               alt="" 
               style={{ 
                 transformOrigin: `${zoomPos.x}% ${zoomPos.y}%`, 
                 transform: `scale(${zoomScale})` 
               }} 
             />
          )}
          {curColor >= 0 && (
             <div className="color-dot" style={{ background: COLORS[curColor], width: 14, height: 14, top: 16, left: 16 }}></div>
          )}
        </div>

        {/* Flecha Derecha */}
        {currentIndex >= 0 && currentIndex < allPhotos.length - 1 && (
          <button 
            className="nav-btn right"
            style={{ position: 'absolute', right: 40, zIndex: 10, background: 'rgba(0,0,0,0.6)', border: 'none', color: '#fff', borderRadius: '50%', padding: '12px', cursor: 'pointer', transition: 'all 0.2s', display: 'flex', outline: 'none' }}
            onClick={(e) => { e.stopPropagation(); autoSaveNote(); onNavigate(allPhotos[currentIndex + 1]); }}
            onMouseEnter={e => e.currentTarget.style.background='rgba(52, 152, 219, 0.8)'}
            onMouseLeave={e => e.currentTarget.style.background='rgba(0,0,0,0.6)'}
          >
            <ChevronRight size={36} />
          </button>
        )}

      </div>

      <div className="modal-panel" onClick={e => e.stopPropagation()}>
        
        <div className="panel-header-top">
           <h2 style={{ fontSize: 18, fontFamily: 'Outfit, sans-serif', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 20 }}>Feedback</h2>
        </div>

        <div className="panel-section">
          <div className="section-title">
            Photo Rating <span style={{ textTransform: 'none', color: '#666', fontSize: '9px', marginLeft: 4 }}>(Press 1-5, 0 to clear)</span>
          </div>
          <div className="stars-selector">
            {[1, 2, 3, 4, 5].map(star => (
              <span 
                key={star} 
                className={`star-icon ${curStars >= star ? 'filled' : ''}`}
                onClick={() => onUpdate(photo.id, { stars: curStars === star ? 0 : star })}
              >
                ★
              </span>
            ))}
          </div>
        </div>

        <div className="panel-section">
          <div className="section-title">Color Labels</div>
          <div>
            {COLORS.map((c, i) => (
              <div 
                key={i} 
                className="color-row-item" 
                style={{ opacity: curColor === i ? 1 : 0.4 }}
                onClick={() => onUpdate(photo.id, { color: curColor === i ? null : i })}
              >
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: c }}></div>
                <span style={{ color: c }}>{CLABELS[i]}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="panel-section" style={{ flex: 1 }}>
          <div className="section-title">User Notes</div>
          <textarea 
            className="note-input" 
            placeholder="Añadir comentarios de edición..."
            value={note} 
            onChange={(e) => setNote(e.target.value)}
            onBlur={autoSaveNote}
          />
        </div>

        <div className="modal-actions">
           {/* Si pulsan el botón, cerramos, porque el note ya se autoguarda onBlur */}
           <button className="btn-primary" onClick={handleSave}>Guardar Salir</button>
           <button className="btn-secondary" onClick={onClose}><X size={16} /></button>
        </div>

      </div>
    </div>
  );
}
