import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { DirectoryPicker, ProgressBar } from '@semblance/ui';
import { startIndexing } from '../ipc/commands';
import { useAppState, useAppDispatch } from '../state/AppState';

export function FilesScreen() {
  const { t } = useTranslation();
  const state = useAppState();
  const dispatch = useAppDispatch();

  const handleAddFolder = useCallback(async () => {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({ directory: true, multiple: false });
      if (selected && typeof selected === 'string') {
        dispatch({ type: 'ADD_DIRECTORY', path: selected });
        await startIndexing([...state.indexedDirectories, selected]);
      }
    } catch {
      // User cancelled or dialog unavailable
    }
  }, [dispatch, state.indexedDirectories]);

  const handleRemove = useCallback((path: string) => {
    dispatch({ type: 'REMOVE_DIRECTORY', path });
  }, [dispatch]);

  const handleRescan = useCallback(async (path: string) => {
    try {
      await startIndexing([path]);
    } catch (err) {
      console.error('[FilesScreen] rescan failed:', err);
    }
  }, []);

  const dirs = state.indexedDirectories.map((path) => ({
    path,
    fileCount: undefined,
    lastIndexed: undefined,
  }));

  const { indexingStatus, knowledgeStats } = state;

  return (
    <div className="settings-screen">
      <div className="settings-header">
        <h1 className="settings-header__title">{t('screen.files.title')}</h1>
      </div>
      <div className="settings-content">
        {/* Indexed Directories */}
        <div className="settings-section-header">{t('screen.files.section_directories')}</div>
        <div className="settings-row settings-row--static">
          {dirs.length === 0 ? (
            <span className="settings-row__label" style={{ color: '#5E6B7C', fontSize: 13 }}>
              {t('screen.files.empty_directories')}
            </span>
          ) : null}
        </div>
        <DirectoryPicker
          directories={dirs}
          onAdd={handleAddFolder}
          onRemove={handleRemove}
          onRescan={handleRescan}
        />

        {/* Indexing Status */}
        <div className="settings-section-header" style={{ marginTop: 24 }}>{t('screen.files.section_indexing')}</div>
        <div className="settings-row settings-row--static">
          {indexingStatus.state === 'idle' || indexingStatus.state === 'complete' ? (
            <span className="settings-row__label" style={{ color: '#8593A4', fontSize: 13 }}>
              {t('screen.files.indexing_up_to_date')}
            </span>
          ) : (
            <div style={{ width: '100%' }}>
              <ProgressBar
                value={indexingStatus.filesScanned}
                max={indexingStatus.filesTotal || 1}
                indeterminate={indexingStatus.state === 'scanning'}
              />
              <span className="settings-row__label" style={{ color: '#8593A4', fontSize: 13, marginTop: 8, display: 'block' }}>
                {indexingStatus.state === 'scanning' && t('screen.files.indexing_scanning')}
                {indexingStatus.state === 'indexing' && t('screen.files.indexing_progress', { scanned: indexingStatus.filesScanned, total: indexingStatus.filesTotal })}
                {indexingStatus.state === 'error' && (
                  <span style={{ color: '#B07A8A' }}>{t('screen.files.indexing_error', { error: indexingStatus.error })}</span>
                )}
              </span>
            </div>
          )}
        </div>

        {/* Knowledge Stats */}
        <div className="settings-section-header" style={{ marginTop: 24 }}>{t('screen.files.section_stats')}</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, padding: '0 16px' }}>
          <div>
            <span style={{ fontSize: 24, fontWeight: 700, color: '#6ECFA3', fontFamily: "'DM Mono', monospace" }}>{knowledgeStats.documentCount}</span>
            <span style={{ display: 'block', fontSize: 11, color: '#5E6B7C', fontFamily: "'DM Mono', monospace", textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 2 }}>{t('screen.files.stat_documents')}</span>
          </div>
          <div>
            <span style={{ fontSize: 24, fontWeight: 700, color: '#6ECFA3', fontFamily: "'DM Mono', monospace" }}>{knowledgeStats.chunkCount}</span>
            <span style={{ display: 'block', fontSize: 11, color: '#5E6B7C', fontFamily: "'DM Mono', monospace", textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 2 }}>{t('screen.files.stat_chunks')}</span>
          </div>
          <div>
            <span style={{ fontSize: 14, fontWeight: 500, color: '#CDD4DB' }}>{(knowledgeStats.indexSizeBytes / (1024 * 1024)).toFixed(1)} MB</span>
            <span style={{ display: 'block', fontSize: 11, color: '#5E6B7C', fontFamily: "'DM Mono', monospace", textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 2 }}>{t('screen.files.stat_index_size')}</span>
          </div>
          <div>
            <span style={{ fontSize: 14, color: '#8593A4' }}>.txt, .md, .pdf, .docx</span>
            <span style={{ display: 'block', fontSize: 11, color: '#5E6B7C', fontFamily: "'DM Mono', monospace", textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 2 }}>{t('screen.files.stat_supported_types')}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
