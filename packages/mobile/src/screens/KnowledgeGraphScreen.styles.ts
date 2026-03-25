// Knowledge Graph Screen Styles — React Native StyleSheet for mobile graph view.
// Design tokens from Design Bible: bg #0B0E11, text #EEF1F4, secondary #A8B4C0/#8593A4,
// borders rgba(255,255,255,0.09), cards #111518, elevated #171B1F.
// Fonts: DM Sans for body, DM Mono for metadata only.

import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B0E11',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.09)',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#EEF1F4',
    fontFamily: 'DM Sans',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  headerButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.09)',
    borderRadius: 8,
  },
  headerButtonText: {
    fontSize: 11,
    color: '#A8B4C0',
    fontFamily: 'DM Mono',
  },
  graphContainer: {
    flex: 1,
    backgroundColor: '#0B0E11',
  },
  statsCollapsed: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.09)',
    backgroundColor: '#111518',
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
    color: '#EEF1F4',
    fontFamily: 'DM Sans',
  },
  statLabel: {
    fontSize: 10,
    color: '#8593A4',
    fontFamily: 'DM Mono',
  },
  bottomSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(17, 21, 24, 0.95)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.09)',
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    padding: 16,
    maxHeight: 300,
  },
  bottomSheetHandle: {
    width: 40,
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.09)',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 12,
  },
  nodeTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#EEF1F4',
    fontFamily: 'DM Sans',
    marginBottom: 4,
  },
  nodeType: {
    fontSize: 11,
    color: '#8593A4',
    fontFamily: 'DM Mono',
    marginBottom: 12,
  },
  connectionItem: {
    paddingVertical: 4,
    paddingLeft: 8,
  },
  connectionText: {
    fontSize: 12,
    color: '#A8B4C0',
    fontFamily: 'DM Sans',
  },
  connectionLabel: {
    fontSize: 10,
    color: '#8593A4',
    fontFamily: 'DM Mono',
  },
});
