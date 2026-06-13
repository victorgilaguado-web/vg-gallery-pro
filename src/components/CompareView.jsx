import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';

const COLORS = ['#E74C3C', '#F39C12', '#3498DB', '#2ECC71'];
const CLABELS = ['Discard', 'Review', 'Retouch', 'Select'];

function thumb(url, w=800) {
  if (!url) return '';
  if (url.includes('cloudinary.com')) {
    return url.replace('/upload/', `/upload/w_${w},q_auto,f_auto,dpr_auto/`);
  }
  return url;
}

// Vista de comparación lado a lado estilo Capture One.
// Cada panel mantiene sus propios controles de rating/color; el panel "activo"
// (clic o borde resaltado) recibe los atajos de teclado 1-5 / 0 / 6-9.
export function CompareView({ photos, onUpdatePhoto, onClose, onRemove }) {
  const [activeId, setActiveId] = useState(photos[0]?.id || null);
  const [zoomed, setZoomed] = useState(false); // zoom sincronizado de todos los paneles

  useEffect(() => {
    if (!photos.find(p => p.id === activeId) && photos.length) setActiveId(photos[0].id);
  }, [photos, activeId]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (document.activeElement.tagName === 'TEXTAREA' || document.activeElement.tagName === 'INPUT') return;
      if (e.key === 'Escape') { onClose(); return; }

      const idx = photos.findIndex(p => p.id === activeId);
      if (e.key === 'ArrowRight') setActiveId(photos[Math.min(photos.length - 1, idx + 1)]?.id || activeId);
      if (e.key === 'ArrowLeft') setActiveId(photos[Math.max(0, idx - 1)]?.id || activeId);

      const photo = photos.find(p => p.id === activeId);
      if (!photo) return;
      const curStars = parseInt(photo.stars) || 0;
      const curColor = photo.color == null ? -1 : parseInt(photo.color);

      if (['1','2','3','4','5'].includes(e.key)) {
        const v = parseInt(e.key);
        onUpdatePhoto(photo.id, { stars: curStars === v ? 0 : v });
      }
      if (e.key === '0') onUpdatePhoto(photo.id, { stars: 0 });
      if (['6','7','8','9'].includes(e.key)) {
        const c = parseInt(e.key) - 6;
        onUpdatePhoto(photo.id, { color: curColor === c ? null : c });
      }
      if (e.key === 'z' || e.key === 'Z') setZoomed(z => !z);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [photos, activeId, onUpdatePhoto, onClose]);

  return (
    <div className="compare-overlay">
      <div className="compare-topbar">
        <span className="compare-title">Compare · {photos.length} photos</span>
        <span className="compare-hint">Click a photo to activate it · 1-5 stars · 6-9 color · Z zoom · Esc to exit</span>
        <button className="btn-secondary" onClick={onClose}><X size={16} /></button>
      </div>

      <div className="compare-grid" style={{ gridTemplateColumns: `repeat(${photos.length}, 1fr)` }}>
        {photos.map(p => {
          const st = parseInt(p.stars) || 0;
          const col = p.color == null ? -1 : parseInt(p.color);
          const isActive = p.id === activeId;
          return (
            <div key={p.id} className={`compare-cell ${isActive ? 'active' : ''}`} onClick={() => setActiveId(p.id)}>
              <div className="compare-img-wrap">
                <img
                  src={thumb(p.thumb_url || p.url, 1200)}
                  alt=""
                  draggable={false}
                  style={zoomed ? { objectFit: 'cover' } : undefined}
                />
                {col >= 0 && <div className="color-dot" style={{ background: COLORS[col] }}></div>}
                <button
                  className="compare-remove"
                  title="Remove from comparison"
                  onClick={(e) => { e.stopPropagation(); onRemove(p.id); }}
                >
                  <X size={13} />
                </button>
              </div>
              <div className="compare-cell-footer" onClick={e => e.stopPropagation()}>
                {p.label && <div className="compare-label">{p.label}</div>}
                <div className="stars-selector">
                  {[1,2,3,4,5].map(star => (
                    <span
                      key={star}
                      className={`star-icon ${st >= star ? 'filled' : ''}`}
                      onClick={() => onUpdatePhoto(p.id, { stars: st === star ? 0 : star })}
                    >★</span>
                  ))}
                </div>
                <div className="colors-selector">
                  {COLORS.map((c, i) => (
                    <div
                      key={i}
                      className={`color-choice ${col === i ? 'active' : ''}`}
                      style={{ background: col === i ? c : '#333' }}
                      title={CLABELS[i]}
                      onClick={() => onUpdatePhoto(p.id, { color: col === i ? null : i })}
                    ></div>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
