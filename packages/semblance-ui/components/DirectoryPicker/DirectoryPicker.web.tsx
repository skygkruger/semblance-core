import { useTranslation } from 'react-i18next';
import type { DirectoryPickerProps } from './DirectoryPicker.types';
import './DirectoryPicker.css';

export function DirectoryPicker({ directories, onAdd, onRemove, onRescan, className = '' }: DirectoryPickerProps) {
  const { t } = useTranslation();
  return (
    <div className={className}>
      <ul className="dir-picker__list" role="list">
        {directories.map((dir) => (
          <li key={dir.path} className="dir-picker__item">
            <svg className="dir-picker__icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
            </svg>
            <div className="dir-picker__info">
              <p className="dir-picker__path">{dir.path}</p>
              <div className="dir-picker__meta">
                {dir.fileCount !== undefined && (
                  <span className="dir-picker__meta-item">{t('screen.directory.file_count', { count: dir.fileCount })}</span>
                )}
                {dir.lastIndexed && (
                  <span className="dir-picker__meta-item">{t('screen.directory.last_indexed', { time: dir.lastIndexed })}</span>
                )}
              </div>
            </div>
            <div className="dir-picker__actions">
              {onRescan && (
                <button
                  type="button"
                  className="dir-picker__btn dir-picker__btn--rescan"
                  onClick={() => onRescan(dir.path)}
                  aria-label={`Re-scan ${dir.path}`}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                    <path d="M3 3v5h5" />
                    <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                    <path d="M16 16h5v5" />
                  </svg>
                </button>
              )}
              <button
                type="button"
                className="dir-picker__btn dir-picker__btn--remove"
                onClick={() => onRemove(dir.path)}
                aria-label={`Remove ${dir.path}`}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6 6 18" /><path d="m6 6 12 12" />
                </svg>
              </button>
            </div>
          </li>
        ))}
      </ul>
      <button type="button" className="dir-picker__add" onClick={onAdd}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12h14" /><path d="M12 5v14" />
        </svg>
        {t('button.add_folder')}
      </button>
    </div>
  );
}
