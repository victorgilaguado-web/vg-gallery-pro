import React, { useState } from 'react';
import { User, Check, Loader } from 'lucide-react';

export function Header({ project, photosCount, daysCount, totalStarred, totalSel, reviewer, reviewedCount, sendState, onChangeReviewer, onUpdateProject }) {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(project?.name || '');

  const handleNameSave = () => {
    setIsEditing(false);
    if (name.trim() !== '' && name !== project?.name) {
      onUpdateProject(project.id, { name: name.trim() });
    }
  };

  const handleChangeReviewer = () => {
    const next = window.prompt('Switch reviewer — your current marks stay saved under your name. New name:', reviewer || '');
    if (next && next.trim()) onChangeReviewer(next);
  };

  return (
    <header className="header">
      <div className="header-left">
        <div className="logo-box">
          <img src="/logo.png" alt="VG Studio" style={{ height: '80px', filter: 'invert(1)', opacity: 0.9 }} />
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
            {photosCount} photos · {daysCount} days
          </div>
        </div>
      </div>

      <div className="header-right">
        {reviewer && (
          <div className="reviewer-chip" onClick={handleChangeReviewer} title="Click to switch reviewer">
            <User size={12} />
            <span>{reviewer}</span>
            <span className="reviewer-progress">{reviewedCount}/{photosCount} reviewed</span>
          </div>
        )}

        <div className="stats">
          <span className="stat-item">★ {totalStarred}</span>
          <span className="stat-item">● {totalSel}</span>
        </div>

        {reviewer && (
          <div className={`autosave-chip ${sendState === 'saving' ? 'saving' : sendState === 'sent' ? 'sent' : ''}`}
               title="Your selection is sent to the studio automatically — no button needed.">
            {sendState === 'saving' ? (
              <><Loader size={12} className="spin" /> Saving…</>
            ) : sendState === 'sent' ? (
              <><Check size={12} /> Sent to studio</>
            ) : (
              <>Auto-saves to studio</>
            )}
          </div>
        )}

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
