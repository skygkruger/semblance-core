// Knowledge Graph Screen Styles — React Native StyleSheet for mobile graph view.

import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#3a3a5e',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#E2E4E9',
    fontFamily: 'monospace',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  headerButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#3a3a5e',
    borderRadius: 2,
  },
  headerButtonText: {
    fontSize: 11,
    color: '#E2E4E9',
    fontFamily: 'monospace',
  },
  webviewContainer: {
    flex: 1,
  },
  statsCollapsed: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#3a3a5e',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#E2E4E9',
    fontFamily: 'monospace',
  },
  statLabel: {
    fontSize: 10,
    color: '#6e6a86',
    fontFamily: 'monospace',
  },
  bottomSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(26, 26, 46, 0.95)',
    borderTopWidth: 1,
    borderTopColor: '#3a3a5e',
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    padding: 16,
    maxHeight: 300,
  },
  bottomSheetHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#3a3a5e',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 12,
  },
  nodeTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#E2E4E9',
    fontFamily: 'monospace',
    marginBottom: 4,
  },
  nodeType: {
    fontSize: 11,
    color: '#6e6a86',
    fontFamily: 'monospace',
    marginBottom: 12,
  },
  connectionItem: {
    paddingVertical: 4,
    paddingLeft: 8,
  },
  connectionText: {
    fontSize: 12,
    color: '#E2E4E9',
    fontFamily: 'monospace',
  },
  connectionLabel: {
    fontSize: 10,
    color: '#6e6a86',
    fontFamily: 'monospace',
  },
});
