import React, { useState, useEffect, useRef } from 'react';
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
  const dragRef = useRef(null); // { startX, startY, posX, posY, moved }
  const stripRef = useRef(null);

  // Cuando navegamos de foto en foto, queremos que el estado interno se refresque al cambiar la prop "photo"
  const [note, setNote] = useState(photo.note || '');
  useEffect(() => {
    setNote(photo.note || '');
    setZoomScale(1); // reset zoom en cambio de foto
  }, [photo]);

  const curColor = photo.color == null ? -1 : parseInt(photo.color);
  const curStars = parseInt(photo.stars) || 0;

  const currentIndex = allPhotos ? allPhotos.findIndex(p => p.id === photo.id) : -1;

  // Precargar vecinas para navegación instantánea
  useEffect(() => {
    if (currentIndex < 0) return;
    [currentIndex + 1, currentIndex - 1, currentIndex + 2].forEach(i => {
      const p = allPhotos[i];
      if (p?.url) { const img = new Image(); img.src = thumb(p.url, 1400); }
    });
  }, [currentIndex, allPhotos]);

  // Centrar la miniatura activa en el filmstrip
  useEffect(() => {
    const el = stripRef.current?.querySelector('.strip-thumb.active');
    if (el) el.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [photo.id]);

  const autoSaveNote = () => {
    if (note !== (photo.note || '')) {
       onUpdate(photo.id, { note });
    }
  };

  const goTo = (idx) => {
    if (idx >= 0 && idx < allPhotos.length) {
      autoSaveNote();
      onNavigate(allPhotos[idx]);
    }
  };

  // Atajos de teclado estilo Capture One
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ignorar teclado si estamos escribiendo la nota
      if (document.activeElement.tagName === 'TEXTAREA' || document.activeElement.tagName === 'INPUT') return;

      if (e.key === 'ArrowRight') goTo(currentIndex + 1);
      if (e.key === 'ArrowLeft') goTo(currentIndex - 1);
      if (e.key === 'Escape') { autoSaveNote(); onClose(); }

      // 1-5 estrellas, 0 limpia
      if (['1', '2', '3', '4', '5'].includes(e.key)) {
        const v = parseInt(e.key);
        onUpdate(photo.id, { stars: v });
      }
      if (e.key === '0') onUpdate(photo.id, { stars: 0 });

      // 6-9 etiquetas de color (toggle)
      if (['6', '7', '8', '9'].includes(e.key)) {
        const c = parseInt(e.key) - 6;
        onUpdate(photo.id, { color: curColor === c ? null : c });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, allPhotos, photo.id, curStars, curColor, note, onNavigate, onClose, onUpdate]);

  const relPoint = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.round(((e.clientX - rect.left) / rect.width) * 100),
      y: Math.round(((e.clientY - rect.top) / rect.height) * 100)
    };
  };

  const handleZoomClick = (e) => {
    e.stopPropagation();
    if (dragRef.current?.moved) { dragRef.current = null; return; } // era un arrastre, no un clic
    setZoomPos(relPoint(e));
    setZoomScale(prev => prev === 1 ? 2.5 : 1);
  };

  const handleWheel = (e) => {
    e.stopPropagation();
    setZoomPos(relPoint(e));
    setZoomScale(prev => Math.min(4, Math.max(1, prev - (e.deltaY > 0 ? 0.3 : -0.3))));
  };

  // Pan arrastrando cuando hay zoom (como en Capture One)
  const handleMouseDown = (e) => {
    if (zoomScale <= 1) return;
    dragRef.current = { startX: e.clientX, startY: e.clientY, posX: zoomPos.x, posY: zoomPos.y, moved: false };
  };
  const handleMouseMove = (e) => {
    const d = dragRef.current;
    if (!d || zoomScale <= 1) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const dx = ((e.clientX - d.startX) / rect.width) * 100;
    const dy = ((e.clientY - d.startY) / rect.height) * 100;
    if (Math.abs(dx) > 1 || Math.abs(dy) > 1) d.moved = true;
    setZoomPos({
      x: Math.min(100, Math.max(0, d.posX - dx)),
      y: Math.min(100, Math.max(0, d.posY - dy))
    });
  };
  const handleMouseUp = () => {
    if (dragRef.current && !dragRef.current.moved) dragRef.current = null;
    // si hubo arrastre, dejamos la marca "moved" para que el click posterior no haga toggle de zoom
  };

  const handleSave = () => {
    onUpdate(photo.id, { note });
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={() => { autoSaveNote(); onClose(); }}>
      <div className="modal-img-area" onClick={e => e.stopPropagation()}>

        {/* Contador + nombre de archivo */}
        <div className="modal-meta-bar">
          <span className="modal-counter">{currentIndex + 1} / {allPhotos.length}</span>
          {photo.label && <span className="modal-filename">{photo.label}</span>}
          {curStars > 0 && <span className="modal-meta-stars">{'★'.repeat(curStars)}</span>}
        </div>

        {/* Flecha Izquierda */}
        {currentIndex > 0 && (
          <button
            className="nav-btn left"
            style={{ position: 'absolute', left: 40, zIndex: 10, background: 'rgba(0,0,0,0.6)', border: 'none', color: '#fff', borderRadius: '50%', padding: '12px', cursor: 'pointer', transition: 'all 0.2s', display: 'flex', outline: 'none' }}
            onClick={(e) => { e.stopPropagation(); goTo(currentIndex - 1); }}
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
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          style={{ cursor: zoomScale > 1 ? 'grab' : 'zoom-in' }}
        >
          {photo.url && (
             <img
               src={thumb(photo.url, 1400)}
               alt=""
               draggable={false}
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
            onClick={(e) => { e.stopPropagation(); goTo(currentIndex + 1); }}
            onMouseEnter={e => e.currentTarget.style.background='rgba(52, 152, 219, 0.8)'}
            onMouseLeave={e => e.currentTarget.style.background='rgba(0,0,0,0.6)'}
          >
            <ChevronRight size={36} />
          </button>
        )}

        {/* Filmstrip estilo Capture One */}
        <div className="filmstrip" ref={stripRef} onClick={e => e.stopPropagation()}>
          {allPhotos.map((p, i) => {
            const pc = p.color == null ? -1 : parseInt(p.color);
            const ps = parseInt(p.stars) || 0;
            return (
              <div
                key={p.id}
                className={`strip-thumb ${p.id === photo.id ? 'active' : ''}`}
                onClick={() => goTo(i)}
                title={p.label || ''}
              >
                <img src={thumb(p.thumb_url || p.url, 200)} alt="" loading="lazy" draggable={false} />
                {pc >= 0 && <span className="strip-dot" style={{ background: COLORS[pc] }}></span>}
                {ps > 0 && <span className="strip-stars">{ps}★</span>}
              </div>
            );
          })}
        </div>

      </div>

      <div className="modal-panel" onClick={e => e.stopPropagation()}>

        <div className="panel-header-top">
           <h2 style={{ fontSize: 18, fontFamily: 'Outfit, sans-serif', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 20 }}>Feedback</h2>
        </div>

        <div className="panel-section">
          <div className="section-title">
            Photo Rating <span style={{ textTransform: 'none', color: '#666', fontSize: '9px', marginLeft: 4 }}>(Keys 1-5, 0 clears)</span>
          </div>
          <div className="stars-selector">
            {[1, 2, 3, 4, 5].map(star => (
              <span
                key={star}
                className={`star-icon ${curStars >= star ? 'filled' : ''}`}
                onClick={() => onUpdate(photo.id, { stars: star })}
              >
                ★
              </span>
            ))}
          </div>
        </div>

        <div className="panel-section">
          <div className="section-title">
            Color Labels <span style={{ textTransform: 'none', color: '#666', fontSize: '9px', marginLeft: 4 }}>(Keys 6-9)</span>
          </div>
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
                <span style={{ marginLeft: 'auto', color: '#555', fontSize: 9 }}>{i + 6}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="panel-section" style={{ flex: 1 }}>
          <div className="section-title">User Notes</div>
          <textarea
            className="note-input"
            placeholder="Add editing comments..."
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onBlur={autoSaveNote}
          />
        </div>

        <div className="modal-actions">
           {/* Si pulsan el botón, cerramos, porque el note ya se autoguarda onBlur */}
           <button className="btn-primary" onClick={handleSave}>Save & Close</button>
           <button className="btn-secondary" onClick={() => { autoSaveNote(); onClose(); }}><X size={16} /></button>
        </div>

      </div>
    </div>
  );
}
