import React, { useState } from 'react';
import { PhotoModal } from './PhotoModal';

const COLORS = ['#E74C3C', '#F39C12', '#3498DB', '#2ECC71'];

function thumb(url, w=800) {
  if (!url) return '';
  if (url.includes('cloudinary.com')) {
    return url.replace('/upload/', `/upload/w_${w},q_auto,f_auto,dpr_auto/`);
  }
  return url;
}

export function GalleryGrid({ photos, onUpdatePhoto, gridCols }) {
  const [selPhotoId, setSelPhotoId] = useState(null);
  
  const selPhoto = selPhotoId ? photos.find(p => p.id === selPhotoId) : null;

  if (!photos || photos.length === 0) {
    return <div style={{ textAlign: 'center', padding: '48px', fontSize: '11px', color: '#555', letterSpacing: '2px', textTransform: 'uppercase' }}>Sin fotos</div>;
  }

  return (
    <div className="gallery-container">
      <div className="grid-layout" style={{ columnCount: gridCols }}>
        {photos.map(p => {
          const col = p.color == null ? -1 : parseInt(p.color);
          const st = parseInt(p.stars) || 0;

          return (
            <div key={p.id} className="photo-card" onClick={() => setSelPhotoId(p.id)}>
              <div className="img-wrap">
                {p.url && <img src={thumb(p.url, 1000)} alt="" />}
                {col >= 0 && <div className="color-dot" style={{ background: COLORS[col] }}></div>}
                {st > 0 && <div className="star-badge">{st}★</div>}
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

      {selPhoto && (
        <PhotoModal 
          photo={selPhoto} 
          allPhotos={photos}
          onNavigate={(p) => setSelPhotoId(p.id)}
          onClose={() => setSelPhotoId(null)} 
          onUpdate={onUpdatePhoto} 
        />
      )}
    </div>
  );
}
