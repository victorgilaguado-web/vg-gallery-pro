import React, { useState, useEffect, useRef } from 'react';
import { PhotoModal } from './PhotoModal';
import { CompareView } from './CompareView';

const COLORS = ['#E74C3C', '#F39C12', '#3498DB', '#2ECC71'];
const MAX_COMPARE = 4;

function thumb(url, w=800) {
  if (!url) return '';
  if (url.includes('cloudinary.com')) {
    return url.replace('/upload/', `/upload/w_${w},q_auto,f_auto,dpr_auto/`);
  }
  return url;
}

export function GalleryGrid({ photos, onUpdatePhoto, gridCols }) {
  const [selPhotoId, setSelPhotoId] = useState(null);
  const [activeId, setActiveId] = useState(null);       // foto con foco de teclado
  const [compareIds, setCompareIds] = useState([]);     // selección para comparar (Cmd+clic)
  const [comparing, setComparing] = useState(false);
  const gridRef = useRef(null);

  const selPhoto = selPhotoId ? photos.find(p => p.id === selPhotoId) : null;
  const comparePhotos = compareIds.map(id => photos.find(p => p.id === id)).filter(Boolean);

  // Si cambia el set de fotos (filtro/look), limpiar estado efímero
  useEffect(() => {
    setActiveId(null);
    setCompareIds([]);
  }, [photos]);

  // Cerrar comparación si quedan menos de 2
  useEffect(() => {
    if (comparing && comparePhotos.length < 2) setComparing(false);
  }, [comparing, comparePhotos.length]);

  // Mantener visible la foto activa
  useEffect(() => {
    if (!activeId) return;
    const el = gridRef.current?.querySelector(`[data-pid="${activeId}"]`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [activeId]);

  // Navegación y valoración por teclado en la cuadrícula (estilo Capture One)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (selPhotoId || comparing) return; // el visor/comparador tiene su propio teclado
      if (document.activeElement.tagName === 'TEXTAREA' || document.activeElement.tagName === 'INPUT') return;
      if (!photos.length) return;

      const idx = activeId ? photos.findIndex(p => p.id === activeId) : -1;
      // El layout es de columnas CSS (masonry): índice+1 = foto de debajo en la misma columna.
      // Derecha/izquierda saltan una columna entera (aproximación).
      const colHeight = Math.ceil(photos.length / (gridCols || 4));

      const move = (delta) => {
        e.preventDefault();
        const next = idx < 0 ? 0 : Math.min(photos.length - 1, Math.max(0, idx + delta));
        setActiveId(photos[next].id);
      };

      if (e.key === 'ArrowDown') return move(1);
      if (e.key === 'ArrowUp') return move(-1);
      if (e.key === 'ArrowRight') return move(idx < 0 ? 0 : colHeight);
      if (e.key === 'ArrowLeft') return move(idx < 0 ? 0 : -colHeight);

      if (!activeId || idx < 0) return;
      const photo = photos[idx];
      const curStars = parseInt(photo.stars) || 0;
      const curColor = photo.color == null ? -1 : parseInt(photo.color);

      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setSelPhotoId(photo.id);
      }
      if (e.key === 'Escape') setActiveId(null);

      if (['1','2','3','4','5'].includes(e.key)) {
        const v = parseInt(e.key);
        onUpdatePhoto(photo.id, { stars: curStars === v ? 0 : v });
      }
      if (e.key === '0') onUpdatePhoto(photo.id, { stars: 0 });
      if (['6','7','8','9'].includes(e.key)) {
        const c = parseInt(e.key) - 6;
        onUpdatePhoto(photo.id, { color: curColor === c ? null : c });
      }
      if ((e.key === 'c' || e.key === 'C') && comparePhotos.length >= 2) setComparing(true);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [photos, activeId, selPhotoId, comparing, comparePhotos.length, gridCols, onUpdatePhoto]);

  if (!photos || photos.length === 0) {
    return <div style={{ textAlign: 'center', padding: '48px', fontSize: '11px', color: '#555', letterSpacing: '2px', textTransform: 'uppercase' }}>Sin fotos</div>;
  }

  const toggleCompare = (pid) => {
    setCompareIds(prev => {
      if (prev.includes(pid)) return prev.filter(x => x !== pid);
      if (prev.length >= MAX_COMPARE) return [...prev.slice(1), pid]; // FIFO si pasa del máximo
      return [...prev, pid];
    });
  };

  const handleCardClick = (e, pid) => {
    if (e.metaKey || e.ctrlKey) {
      // Cmd/Ctrl+clic = añadir a comparación, como seleccionar variantes en C1
      toggleCompare(pid);
      setActiveId(pid);
      return;
    }
    setSelPhotoId(pid);
  };

  return (
    <div className="gallery-container">
      <div className="grid-layout" ref={gridRef} style={{ columnCount: gridCols }}>
        {photos.map(p => {
          const col = p.color == null ? -1 : parseInt(p.color);
          const st = parseInt(p.stars) || 0;
          const inCompare = compareIds.includes(p.id);

          return (
            <div
              key={p.id}
              data-pid={p.id}
              className={`photo-card ${activeId === p.id ? 'kbd-active' : ''} ${inCompare ? 'in-compare' : ''}`}
              onClick={(e) => handleCardClick(e, p.id)}
            >
              <div className="img-wrap">
                {p.url && <img src={thumb(p.url, 1000)} alt="" loading="lazy" />}
                {col >= 0 && <div className="color-dot" style={{ background: COLORS[col] }}></div>}
                {st > 0 && <div className="star-badge">{st}★</div>}
                {inCompare && <div className="compare-badge">{compareIds.indexOf(p.id) + 1}</div>}
                <div className="card-layer"></div>
              </div>

              <div className="card-footer">
                <div className="stars-selector" onClick={e => e.stopPropagation()}>
                  {[1,2,3,4,5].map(star => (
                    <span
                      key={star}
                      className={`star-icon ${st >= star ? 'filled' : ''}`}
                      onClick={() => onUpdatePhoto(p.id, { stars: st === star ? 0 : star })}
                    >
                      ★
                    </span>
                  ))}
                </div>
                <div className="colors-selector" onClick={e => e.stopPropagation()}>
                  {COLORS.map((c, i) => (
                    <div
                      key={i}
                      className={`color-choice ${col === i ? 'active' : ''}`}
                      style={{ background: col === i ? c : '#333' }}
                      onClick={() => onUpdatePhoto(p.id, { color: col === i ? null : i })}
                    ></div>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Barra flotante de comparación */}
      {comparePhotos.length >= 1 && !comparing && (
        <div className="compare-bar">
          <span className="compare-bar-count">{comparePhotos.length} seleccionada{comparePhotos.length !== 1 ? 's' : ''}</span>
          <span className="compare-bar-hint">Cmd+clic para añadir</span>
          {comparePhotos.length >= 2 && (
            <button className="btn-primary compare-bar-btn" onClick={() => setComparing(true)}>
              Comparar (C)
            </button>
          )}
          <button className="btn-secondary compare-bar-btn" onClick={() => setCompareIds([])}>
            Limpiar
          </button>
        </div>
      )}

      {selPhoto && (
        <PhotoModal
          photo={selPhoto}
          allPhotos={photos}
          onNavigate={(p) => setSelPhotoId(p.id)}
          onClose={() => { setActiveId(selPhotoId); setSelPhotoId(null); }}
          onUpdate={onUpdatePhoto}
        />
      )}

      {comparing && comparePhotos.length >= 2 && (
        <CompareView
          photos={comparePhotos}
          onUpdatePhoto={onUpdatePhoto}
          onClose={() => setComparing(false)}
          onRemove={(pid) => setCompareIds(prev => prev.filter(x => x !== pid))}
        />
      )}
    </div>
  );
}
