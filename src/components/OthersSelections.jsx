import React from 'react';
import { X, Users } from 'lucide-react';

function thumb(url, w=600) {
  if (!url) return '';
  if (url.includes('cloudinary.com')) {
    return url.replace('/upload/', `/upload/w_${w},q_auto,f_auto,dpr_auto/`);
  }
  return url;
}

// Vista de "lo que han seleccionado los demás revisores": agrupado por persona,
// ordenado. Solo lectura.
export function OthersSelections({ groups, loading, onClose }) {
  return (
    <div className="overlay-screen" style={{ alignItems: 'stretch', justifyContent: 'flex-start' }} onClick={onClose}>
      <div className="others-panel" onClick={e => e.stopPropagation()}>
        <div className="others-header">
          <Users size={18} />
          <h2>What others selected</h2>
          <button className="btn-secondary" onClick={onClose} style={{ marginLeft: 'auto' }}><X size={16} /></button>
        </div>

        {loading ? (
          <p className="others-empty">Loading…</p>
        ) : !groups || groups.length === 0 ? (
          <p className="others-empty">No one else has marked any photo as <b>Select</b> yet.</p>
        ) : (
          <div className="others-body">
            {groups.map(g => (
              <div key={g.reviewer} className="others-group">
                <div className="others-group-head">
                  <span className="others-avatar">{g.reviewer.charAt(0).toUpperCase()}</span>
                  <span className="others-name">{g.reviewer}</span>
                  <span className="others-count">{g.photos.length} selected</span>
                </div>
                <div className="others-grid">
                  {g.photos.map(p => (
                    <div key={p.id} className="others-thumb" title={p.label || ''}>
                      <img src={thumb(p.thumb_url || p.url, 500)} alt="" loading="lazy" />
                      {(parseInt(p._stars) || 0) > 0 && <span className="others-stars">{p._stars}★</span>}
                      {p.label && <div className="others-label">{p.label}</div>}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
