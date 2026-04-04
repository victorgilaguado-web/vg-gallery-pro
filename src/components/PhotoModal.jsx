import React, { useState } from 'react';
import { X } from 'lucide-react';

const COLORS = ['#E74C3C', '#F39C12', '#2ECC71'];
const CLABELS = ['Reject', 'Review', 'Select'];

function thumb(url, w=800) {
  if (!url) return '';
  if (url.includes('cloudinary.com')) {
    return url.replace('/upload/', `/upload/w_${w},q_auto,f_auto,dpr_auto/`);
  }
  return url;
}

export function PhotoModal({ photo, onClose, onUpdate }) {
  const [zoomScale, setZoomScale] = useState(1);
  const [zoomPos, setZoomPos] = useState({ x: 50, y: 50 });
  const [note, setNote] = useState(photo.note || '');

  const curColor = photo.color == null ? -1 : parseInt(photo.color);
  const curStars = parseInt(photo.stars) || 0;

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

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-img-area" onClick={e => e.stopPropagation()}>
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
      </div>

      <div className="modal-panel" onClick={e => e.stopPropagation()}>
        
        <div className="panel-section">
          <div className="section-title">{photo.label || 'Details'}</div>
        </div>

        <div className="panel-section">
          <div className="section-title">Estrellas</div>
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
          <div className="section-title">Etiqueta</div>
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
          <div className="section-title">Nota</div>
          <textarea 
            className="note-input" 
            value={note} 
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

        <div className="modal-actions">
           <button className="btn-primary" onClick={handleSave}>Guardar</button>
           <button className="btn-secondary" onClick={onClose}><X size={16} /></button>
        </div>

      </div>
    </div>
  );
}
