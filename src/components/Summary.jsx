import React, { useState } from 'react';
import { GalleryGrid } from './GalleryGrid';
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

export function Summary({ photos=[], onUpdatePhoto }) {
  const [sf, setSf] = useState(null);

  const rc = photos.filter(p => parseInt(p.color) === 0).length;
  const vc = photos.filter(p => parseInt(p.color) === 1).length;
  const sel = photos.filter(p => parseInt(p.color) === 2).length;
  const starred = photos.filter(p => parseInt(p.stars) > 0).length;
  const noted = photos.filter(p => p.note && p.note.trim()).length;

  const pills = [
    { label: 'Total', count: photos.length },
    { label: '★ Stars', count: starred },
    { label: '● Select', count: sel },
    { label: 'Reject', count: rc },
    { label: 'Review', count: vc },
    { label: 'Notas', count: noted },
  ];

  const sfPhotos = React.useMemo(() => {
    if (!sf) return [];
    return photos.filter(p => {
      const st = parseInt(p.stars) || 0;
      const col = p.color == null ? -1 : parseInt(p.color);
      if (sf === 's5') return st === 5;
      if (sf === 's4') return st === 4;
      if (sf === 's3') return st === 3;
      if (sf === 's2') return st === 2;
      if (sf === 's1') return st === 1;
      if (sf === 'c0') return col === 0;
      if (sf === 'c1') return col === 1;
      if (sf === 'c2') return col === 2;
      if (sf === 'notes') return !!(p.note && p.note.trim());
      return false;
    });
  }, [photos, sf]);

  return (
    <div style={{ padding: '24px 32px' }}>
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '24px' }}>
        {pills.map(p => (
          <div key={p.label} style={{ background: 'var(--bg-surface-elevated)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '12px 20px', minWidth: '120px' }}>
            <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', letterSpacing: '1px', textTransform: 'uppercase' }}>{p.label}</div>
            <div style={{ fontSize: '24px', fontWeight: 300, color: 'var(--text-primary)', marginTop: '4px' }}>{p.count}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '24px' }}>
         {[5,4,3,2,1].map(stars => {
           const key = `s${stars}`;
           const _count = photos.filter(p => parseInt(p.stars) === stars).length;
           return (
             <button 
               key={key}
               className={`filter-btn ${sf === key ? 'active' : ''}`}
               style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-full)' }}
               onClick={() => setSf(sf === key ? null : key)}
             >
               {'★'.repeat(stars)} ({_count})
             </button>
           )
         })}

         {COLORS.map((c, i) => {
           const key = `c${i}`;
           const _count = photos.filter(p => parseInt(p.color) === i).length;
           return (
             <button 
               key={key}
               className="filter-btn"
               style={{ 
                 border: `1px solid ${sf === key ? c : 'var(--border-color)'}`, 
                 borderRadius: 'var(--radius-full)',
                 background: sf === key ? c : 'transparent',
                 color: sf === key ? '#000' : 'var(--text-secondary)'
               }}
               onClick={() => setSf(sf === key ? null : key)}
             >
               ● {CLABELS[i]} ({_count})
             </button>
           )
         })}

         <button 
           className={`filter-btn ${sf === 'notes' ? 'active' : ''}`}
           style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--radius-full)' }}
           onClick={() => setSf(sf === 'notes' ? null : 'notes')}
         >
           ✏ Notas ({noted})
         </button>

         {sf && (
           <button className="filter-btn" style={{ borderRadius: 'var(--radius-full)', border: '1px solid var(--border-color)' }} onClick={() => setSf(null)}>
             <X size={14} />
           </button>
         )}
      </div>

      {sf === 'notes' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', background: 'var(--bg-base)' }}>
           {sfPhotos.length === 0 && <div style={{ padding: '40px', color: 'var(--text-tertiary)', textAlign: 'center', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '2px' }}>Sin Notas</div>}
           {sfPhotos.map(p => {
             const col = p.color == null ? -1 : parseInt(p.color);
             return (
               <div key={p.id} style={{ display: 'flex', background: 'var(--bg-surface)', borderTop: '1px solid var(--border-color)' }}>
                 <div style={{ width: '160px', flexShrink: 0, position: 'relative' }}>
                    <img src={thumb(p.url, 300)} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} alt="" />
                    {col >= 0 && <div className="color-dot" style={{ background: COLORS[col] }}></div>}
                 </div>
                 <div style={{ padding: '20px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px' }}>{/*stars*/} {'★'.repeat(parseInt(p.stars)||0)}</div>
                    <div style={{ fontSize: '14px', color: 'var(--text-primary)', lineHeight: 1.6 }}>{p.note}</div>
                 </div>
               </div>
             )
           })}
        </div>
      ) : sf ? (
        <GalleryGrid photos={sfPhotos} onUpdatePhoto={onUpdatePhoto} />
      ) : null}

    </div>
  )
}
