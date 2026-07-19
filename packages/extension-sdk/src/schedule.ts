/**
 * Schedule contract — cron-like triggers declared in manifest.schedules.
 */

export interface ExtensionScheduleSpecV1 {
  /** Must appear in manifest.schedules. */
  scheduleId: string;
  /** Cron expression (runner validates against declared permissions). */
  cron: string;
  /** IANA timezone or 'local'. */
  timezone?: string;
  description?: string;
}

export type ExtensionScheduleHandlerV1 = () => Promise<void> | void;

export interface ExtensionScheduleRegistrationV1 {
  spec: ExtensionScheduleSpecV1;
  handler: ExtensionScheduleHandlerV1;
}

export interface ExtensionScheduleClient {
  register(registration: ExtensionScheduleRegistrationV1): Promise<string>;
  cancel(scheduleId: string): Promise<void>;
  listActive(): Promise<readonly string[]>;
}
