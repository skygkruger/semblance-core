// Location module barrel export.

export { LocationStore } from './location-store.js';
export { LocationPermissionManager } from './location-permission.js';
export {
  reduceCoordinatePrecision,
  maskLocationForAudit,
  isValidCoordinate,
  distanceMeters,
} from './location-privacy.js';
export { ProximityEngine } from './proximity-engine.js';
export type { ProximityMatch } from './proximity-engine.js';
export { GeocodingService } from './geocoding-service.js';
export { parseLocationReminder } from './location-reminder-parser.js';
export { isVirtualMeeting } from './virtual-meeting-detector.js';
export { CommuteAnalyzer } from './commute-analyzer.js';
export type { CommuteInsight } from './commute-analyzer.js';
export { LocationInsightTracker } from './location-insight-tracker.js';
