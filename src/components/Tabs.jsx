import React, { useState } from 'react';

export function Tabs({ days, activeDay, activeLook, onTabChange }) {
  return (
    <div className="tabs-container">
      <button 
        className={`tab-btn ${activeLook === 'moodboard' && !activeDay ? 'active' : ''}`}
        onClick={() => onTabChange(null, 'moodboard')}
      >
        <span>Moodboard</span>
      </button>

      {days.map((d) => (
        <button 
          key={d.id}
          className={`tab-btn ${activeDay === d.id ? 'active' : ''}`}
          onClick={() => {
            const firstLook = d.looks?.[0]?.id || null;
            onTabChange(d.id, firstLook);
          }}
        >
          <span>{d.name}</span>
          <span className="tab-sub">{d.looks?.length || 0} looks</span>
        </button>
      ))}

      <button 
        className={`tab-btn ${activeLook === 'summary' && !activeDay ? 'active' : ''}`}
        style={{ marginLeft: 'auto' }}
        onClick={() => onTabChange(null, 'summary')}
      >
        <span>Summary</span>
      </button>
    </div>
  );
}

export function LooksTabs({ looks, activeLook, onChange }) {
  if (!looks || looks.length === 0) return null;
  return (
    <div className="tabs-container secondary-tabs">
      {looks.map(l => (
        <button 
          key={l.id}
          className={`tab-btn ${activeLook === l.id ? 'active' : ''}`}
          onClick={() => onChange(l.id)}
        >
          <span>{l.name}</span>
        </button>
      ))}
    </div>
  );
}
