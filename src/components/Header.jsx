import React, { useState } from 'react';
import { Send, User, Check } from 'lucide-react';

export function Header({ project, photosCount, daysCount, totalStarred, totalSel, reviewer, reviewedCount, onChangeReviewer, onSubmitSelection, onUpdateProject }) {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(project?.name || '');
  const [submitState, setSubmitState] = useState(null); // null | 'confirm' | 'sending' | 'done' | 'error'

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

  const doSubmit = async () => {
    setSubmitState('sending');
    const { error } = await onSubmitSelection();
    setSubmitState(error ? 'error' : 'done');
    if (!error) setTimeout(() => setSubmitState(null), 4000);
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
          <button className="submit-btn" onClick={() => setSubmitState('confirm')}>
            <Send size={12} /> Submit selection
          </button>
        )}

        {project?.client_logo ? (
          <>
            <div className="divider"></div>
            <img src={project.client_logo} alt="Client" className="client-logo" />
          </>
        ) : null}
      </div>

      {/* Modal de confirmación de envío */}
      {submitState && (
        <div className="overlay-screen" onClick={() => submitState !== 'sending' && setSubmitState(null)}>
          <div className="overlay-card" onClick={e => e.stopPropagation()}>
            {submitState === 'done' ? (
              <>
                <div className="submit-ok"><Check size={30} /></div>
                <h2 style={{ fontFamily: 'Outfit', fontWeight: 300, marginBottom: 8 }}>Selection sent</h2>
                <p style={{ fontSize: 13, color: '#888', lineHeight: 1.6 }}>The studio has been notified. Thank you, {reviewer}!</p>
              </>
            ) : (
              <>
                <h2 style={{ fontFamily: 'Outfit', fontWeight: 300, marginBottom: 8 }}>Submit your selection?</h2>
                <p style={{ fontSize: 13, color: '#888', marginBottom: 8, lineHeight: 1.6 }}>
                  You've reviewed <b style={{ color: '#fff' }}>{reviewedCount}</b> of {photosCount} photos
                  ({totalSel} selects, {totalStarred} starred).
                </p>
                <p style={{ fontSize: 12, color: '#666', marginBottom: 26 }}>You can keep editing and submit again later.</p>
                {submitState === 'error' && <p style={{ fontSize: 12, color: '#E74C3C', marginBottom: 14 }}>Something went wrong — please try again.</p>}
                <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                  <button className="overlay-btn secondary" onClick={() => setSubmitState(null)}>Cancel</button>
                  <button className="overlay-btn" disabled={submitState === 'sending'} onClick={doSubmit}>
                    {submitState === 'sending' ? 'Sending...' : 'Submit'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
