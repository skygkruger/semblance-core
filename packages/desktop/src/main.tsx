import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { App } from './App';
import './i18n/config';

// Fonts — bundled locally via fontsource. No CDN requests.
import '@fontsource-variable/dm-sans';
import '@fontsource-variable/fraunces';
import '@fontsource/dm-mono/300.css';
import '@fontsource/dm-mono/400.css';
import '@fontsource/dm-mono/500.css';
import '@fontsource-variable/josefin-sans';

// Design System tokens — MUST load before any component CSS
import '@semblance/ui/tokens/tokens.css';
import '@semblance/ui/tokens/fonts.css';
import '@semblance/ui/tokens/opal.css';
import '@semblance/ui/tokens/surfaces.css';

import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>,
);
