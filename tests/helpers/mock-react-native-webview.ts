// Mock react-native-webview for vitest environment.
// Mobile-only module — not installed in the monorepo root.

import React from 'react';

export const WebView = React.forwardRef(function WebView(
  props: Record<string, unknown>,
  _ref: unknown,
) {
  return React.createElement('webview-mock', {
    testID: (props as { testID?: string }).testID ?? 'webview',
    'data-source': JSON.stringify((props as { source?: unknown }).source ?? {}),
  });
});

export default WebView;
