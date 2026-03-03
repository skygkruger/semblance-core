// SoundEngineContext — React context + useSound hook for mobile.
//
// Creates a MobileSoundEngine instance, initializes on mount.

import React, { createContext, useContext, useEffect, useRef, useCallback, type ReactNode } from 'react';
import type { SoundId, SoundSettings } from '@semblance/core/sound/sound-types';
import type { SoundEngine } from '@semblance/core/sound/sound-types';
import { MobileSoundEngine } from './mobile-sound-engine';

const SoundEngineContext = createContext<SoundEngine | null>(null);

const DEFAULT_SETTINGS: SoundSettings = {
  enabled: true,
  categoryVolumes: { actions: 1.0, system: 1.0, voice: 1.0 },
};

export function SoundEngineProvider({ children }: { children: ReactNode }) {
  const engineRef = useRef<MobileSoundEngine | null>(null);

  useEffect(() => {
    const engine = new MobileSoundEngine();
    engineRef.current = engine;
    engine.initialize(DEFAULT_SETTINGS).catch(() => {});
  }, []);

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
