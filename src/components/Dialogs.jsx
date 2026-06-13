import React, { useState, useEffect } from 'react';

// Diálogos propios basados en promesas para sustituir alert/confirm/prompt nativos.
// Renderiza <DialogHost/> una vez (en Admin) y usa dialogAlert/dialogConfirm/dialogPrompt en cualquier sitio.

let pushDialog = null;

export const dialogAlert = (message, title = 'Notice') =>
  new Promise(resolve => pushDialog ? pushDialog({ type: 'alert', title, message, resolve }) : (window.alert(message), resolve()));

export const dialogConfirm = (message, title = 'Are you sure?', danger = false) =>
  new Promise(resolve => pushDialog ? pushDialog({ type: 'confirm', title, message, danger, resolve }) : resolve(window.confirm(message)));

export const dialogPrompt = (message, defaultValue = '', title = 'Input needed') =>
  new Promise(resolve => pushDialog ? pushDialog({ type: 'prompt', title, message, defaultValue, resolve }) : resolve(window.prompt(message, defaultValue)));

export function DialogHost() {
  const [dlg, setDlg] = useState(null);
  const [value, setValue] = useState('');

  useEffect(() => {
    pushDialog = (d) => { setValue(d.defaultValue || ''); setDlg(d); };
    return () => { pushDialog = null; };
  }, []);

  if (!dlg) return null;

  const close = (result) => {
    dlg.resolve(result);
    setDlg(null);
  };

  const onCancel = () => close(dlg.type === 'confirm' ? false : dlg.type === 'prompt' ? null : undefined);
  const onOk = () => close(dlg.type === 'confirm' ? true : dlg.type === 'prompt' ? value : undefined);

  return (
    <div className="dlg-overlay" onClick={onCancel}>
      <div className="dlg-card" onClick={e => e.stopPropagation()}>
        <h3 className="dlg-title">{dlg.title}</h3>
        <p className="dlg-message">{dlg.message}</p>
        {dlg.type === 'prompt' && (
          <input
            autoFocus
            className="dlg-input"
            value={value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') onOk();
              if (e.key === 'Escape') onCancel();
            }}
          />
        )}
        <div className="dlg-actions">
          {dlg.type !== 'alert' && <button className="dlg-btn" onClick={onCancel}>Cancel</button>}
          <button
            autoFocus={dlg.type !== 'prompt'}
            className={`dlg-btn primary ${dlg.danger ? 'danger' : ''}`}
            onClick={onOk}
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
