import React, { useState } from 'react';
import { Camera, RefreshCw } from 'lucide-react';

export function Header({ project, photosCount, daysCount, totalStarred, totalSel, onUpdateProject }) {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(project?.name || '');

  const VG_LOGO = 'data:image/svg+xml;base64,...'; // Keeping real logo out for brevity, using lucide for now

  const handleNameSave = () => {
    setIsEditing(false);
    if (name.trim() !== '' && name !== project?.name) {
      onUpdateProject(project.id, { name: name.trim() });
    }
  };

  return (
    <header className="header">
      <div className="header-left">
        <div className="logo-box">
          <img src="/logo.png" alt="VG Studio" style={{ height: '32px', filter: 'invert(1)', opacity: 0.9 }} />
        </div>
        <div className="divider"></div>
        <div className="title-area">
          {isEditing ? (
            <input 
              autoFocus
              className="title-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={handleNameSave}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleNameSave();
                if (e.key === 'Escape') {
                  setName(project?.name || '');
                  setIsEditing(false);
                }
              }}
            />
          ) : (
            <h1 className="project-title" onClick={() => setIsEditing(true)}>
              {project?.name || 'VG Studio Gallery'}
            </h1>
          )}
          <div className="project-meta">
            {photosCount} photos · {daysCount} días
          </div>
        </div>
      </div>

      <div className="header-right">
        <div className="stats">
          <span className="stat-item">★ {totalStarred}</span>
          <span className="stat-item">● {totalSel}</span>
        </div>
        
        {project?.client_logo ? (
          <>
            <div className="divider"></div>
            <img src={project.client_logo} alt="Client" className="client-logo" />
          </>
        ) : null}
      </div>
    </header>
  );
}
