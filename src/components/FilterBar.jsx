import React from 'react';
import { X } from 'lucide-react';

const COLORS = ['#E74C3C', '#F39C12', '#2ECC71'];

export function FilterBar({ S_filt, setFilt, lookPhotos, filteredPhotos }) {
  
  return (
    <div className="filter-bar">
      <div className="filter-group">
        {/* Stars */}
        {[5, 4, 3, 2, 1].map((stars, i) => {
          const key = `s${stars}`;
          const active = S_filt === key;
          return (
             <button 
               key={key} 
               className={`filter-btn ${active ? 'active' : ''}`}
               onClick={() => setFilt(active ? null : key)}
             >
               {'★'.repeat(stars)}
             </button>
          )
        })}

        {/* Colors */}
        {COLORS.map((c, i) => {
          const key = `c${i}`;
          const active = S_filt === key;
          return (
            <button 
              key={key}
              className={`filter-btn ${active ? 'active' : ''}`}
              style={active ? { background: c, color: '#000' } : { color: c }}
              onClick={() => setFilt(active ? null : key)}
            >
               ●
            </button>
          )
        })}

        <button 
          className={`filter-btn ${S_filt === 'notes' ? 'active' : ''}`}
          onClick={() => setFilt(S_filt === 'notes' ? null : 'notes')}
        >
          NOTAS
        </button>

        {S_filt && (
          <button className="filter-btn" onClick={() => setFilt(null)} style={{ color: 'var(--text-secondary)' }}>
            <X size={16} />
          </button>
        )}
      </div>

      <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', letterSpacing: '1px' }}>
        {filteredPhotos.length} / {lookPhotos.length}
      </div>
    </div>
  );
}
