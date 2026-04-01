import { useState, useEffect } from 'react';
import { SkeletonCard } from '@semblance/ui';
import { getLocationSettings, type LocationSettings } from '../ipc/commands';
import { useAppDispatch } from '../state/AppState';
import { LocationSettingsSection } from '../components/LocationSettingsSection';
import { ContentBracket } from '../components/ContentBracket';
import { GhostSprite } from '../components/GhostSprite';

const DEFAULT_SETTINGS: LocationSettings = {
  enabled: false,
  defaultCity: '',
  weatherEnabled: false,
  commuteEnabled: false,
  remindersEnabled: false,
  retentionDays: 30,
};

export function LocationSettingsScreen() {
  const [isLoading, setIsLoading] = useState(true);
  const dispatch = useAppDispatch();

  useEffect(() => {
    async function loadData() {
      try {
        const saved = await getLocationSettings();
        const settings = { ...DEFAULT_SETTINGS, ...saved };

        // Dispatch loaded data into AppState for the component
        dispatch({
          type: 'SET_LOCATION_SETTINGS',
          settings: {
            enabled: settings.enabled,
            remindersEnabled: settings.remindersEnabled,
            commuteEnabled: settings.commuteEnabled,
            weatherEnabled: settings.weatherEnabled,
            defaultCity: settings.defaultCity,
            retentionDays: settings.retentionDays,
          },
        });
      } catch (err) {
        console.error('[LocationSettingsScreen] load failed:', err);
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, [dispatch]);

  if (isLoading) {
    return (
      <div className="page-scroll">
        <div className="page-layout">
          <ContentBracket>
          <GhostSprite insight="Location data is processed locally. Never transmitted.">
          <SkeletonCard variant="generic" message="Loading location settings" subMessage="Checking location services" showSpinner />
          </GhostSprite>
          </ContentBracket>
        </div>
      </div>
    );
  }

  return (
    <div className="page-scroll">
      <div className="page-layout">
        <ContentBracket>
        <GhostSprite insight="Location data is processed locally. Never transmitted.">
        <LocationSettingsSection />
        </GhostSprite>
        </ContentBracket>
      </div>
    </div>
  );
}
