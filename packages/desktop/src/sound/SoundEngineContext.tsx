// SoundEngineContext — React context + useSound hook for desktop.
//
// Creates a DesktopSoundEngine instance, initializes on mount with persisted settings,
// syncs settings changes back to the engine.

import { createContext, useContext, useEffect, useRef, useCallback, type ReactNode } from 'react';
import type { SoundId } from '@semblance/core/sound/sound-types';
import type { SoundEngine } from '@semblance/core/sound/sound-types';
import { DesktopSoundEngine } from './desktop-sound-engine';
import { getSoundSettings } from '../ipc/commands';
import { useAppState } from '../state/AppState';

const SoundEngineContext = createContext<SoundEngine | null>(null);

export function SoundEngineProvider({ children }: { children: ReactNode }) {
  const engineRef = useRef<DesktopSoundEngine | null>(null);
  const state = useAppState();

  // Create and initialize engine once on mount
  useEffect(() => {
    const engine = new DesktopSoundEngine();
    engineRef.current = engine;

    getSoundSettings()
      .then((settings) => engine.initialize(settings))
      .catch(() =>
        engine.initialize({
          enabled: true,
          categoryVolumes: { actions: 1.0, system: 1.0, voice: 1.0 },
        }),
      );
  }, []);

  // Sync AppState soundSettings to engine when they change
  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.updateSettings(state.soundSettings);
    }
  }, [state.soundSettings]);

  return (
    <SoundEngineContext.Provider value={engineRef.current}>
      {children}
    </SoundEngineContext.Provider>
  );
}

export function useSound(): { play: (id: SoundId) => void } {
  const engine = useContext(SoundEngineContext);

  const play = useCallback(
    (id: SoundId) => {
      if (engine) {
        engine.play(id);
      }
    },
    [engine],
  );

  return { play };
}
