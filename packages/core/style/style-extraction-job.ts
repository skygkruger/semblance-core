// Style Extraction Job — Background job that processes sent emails to build/update the style profile.
// Runs on initial email sync and incrementally on new sent emails.
// Processes in batches to avoid overwhelming the inference runtime.
// CRITICAL: This file is in packages/core/. No network imports.

import type { LLMProvider } from '../llm/types.js';
import type { StyleProfileStore, StyleProfile } from './style-profile.js';
import { createEmptyProfile } from './style-profile.js';
import { extractStyleFromEmails, updateProfileWithNewEmails, type SentEmail } from './style-extractor.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StyleExtractionJobConfig {
  /** The StyleProfileStore for persisting profiles */
  profileStore: StyleProfileStore;
  /** LLM provider for tone analysis */
  llm: LLMProvider;
  /** Model name for LLM calls */
  model: string;
  /** The user's email address (to identify sent emails) */
  userEmail: string;
  /** Batch size for processing (default: 10) */
  batchSize?: number;
  /** Callback for progress updates */
  onProgress?: (progress: ExtractionProgress) => void;
}

export interface ExtractionProgress {
  phase: 'initial' | 'incremental';
  processed: number;
  total: number;
  status: 'running' | 'completed' | 'paused';
  profileId: string | null;
}

export interface SentEmailQuery {
  /** Get sent emails from the indexed email store */
  getSentEmails(userEmail: string, options?: {
    since?: string;
    limit?: number;
    offset?: number;
  }): SentEmail[];
  /** Get the total count of sent emails */
  getSentEmailCount(userEmail: string): number;
}

// ─── Extraction Job ───────────────────────────────────────────────────────────

export class StyleExtractionJob {
  private profileStore: StyleProfileStore;
  private llm: LLMProvider;
  private model: string;
  private userEmail: string;
  private batchSize: number;
  private onProgress: ((progress: ExtractionProgress) => void) | null;
  private isRunning = false;
  private isCancelled = false;
  private currentProfileId: string | null = null;

  constructor(config: StyleExtractionJobConfig) {
    this.profileStore = config.profileStore;
    this.llm = config.llm;
    this.model = config.model;
    this.userEmail = config.userEmail;
    this.batchSize = config.batchSize ?? 10;
    this.onProgress = config.onProgress ?? null;
  }

  /**
   * Run the initial style extraction on all sent emails.
   * Creates a new profile or resumes from where it left off.
   */
  async runInitialExtraction(emailQuery: SentEmailQuery): Promise<StyleProfile | null> {
    if (this.isRunning) return null;
    this.isRunning = true;
    this.isCancelled = false;

    try {
      const totalCount = emailQuery.getSentEmailCount(this.userEmail);
      if (totalCount === 0) {
        this.isRunning = false;
        return null;
      }

      // Check if there's an existing profile to resume from
      let profile = this.profileStore.getActiveProfile();
      let processedCount = profile?.emailsAnalyzed ?? 0;

      if (!profile) {
        profile = this.profileStore.createProfile(createEmptyProfile());
      }
      this.currentProfileId = profile.id;

      // Process in batches from where we left off
      while (processedCount < totalCount && !this.isCancelled) {
        const batch = emailQuery.getSentEmails(this.userEmail, {
          offset: processedCount,
          limit: this.batchSize,
        });

        if (batch.length === 0) break;

        // Extract or update
        if (processedCount === 0) {
          // First batch — full extraction
          profile = await extractStyleFromEmails(batch, this.llm, this.model);
          profile = this.profileStore.updateProfile(this.currentProfileId, profile) ?? profile;
        } else {
          // Subsequent batches — incremental update
          profile = await updateProfileWithNewEmails(profile, batch, this.llm, this.model);
          profile = this.profileStore.updateProfile(this.currentProfileId, profile) ?? profile;
        }

        processedCount += batch.length;

        this.emitProgress({
          phase: 'initial',
          processed: processedCount,
          total: totalCount,
          status: 'running',
          profileId: this.currentProfileId,
        });
      }

      this.emitProgress({
        phase: 'initial',
        processed: processedCount,
        total: totalCount,
        status: this.isCancelled ? 'paused' : 'completed',
        profileId: this.currentProfileId,
      });

      return profile;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Run incremental extraction on newly synced sent emails.
   */
  async runIncrementalUpdate(emailQuery: SentEmailQuery): Promise<StyleProfile | null> {
    if (this.isRunning) return null;
    this.isRunning = true;
    this.isCancelled = false;

    try {
      const profile = this.profileStore.getActiveProfile();
      if (!profile) {
        // No profile yet — run initial extraction instead
        this.isRunning = false;
        return this.runInitialExtraction(emailQuery);
      }

      this.currentProfileId = profile.id;

      // Get new emails since last update
      const newEmails = emailQuery.getSentEmails(this.userEmail, {
        since: profile.lastUpdatedAt,
      });

      if (newEmails.length === 0) {
        this.isRunning = false;
        return profile;
      }

      // Process in batches
      let currentProfile = profile;
      let processed = 0;

      while (processed < newEmails.length && !this.isCancelled) {
        const batch = newEmails.slice(processed, processed + this.batchSize);
        currentProfile = await updateProfileWithNewEmails(currentProfile, batch, this.llm, this.model);
        currentProfile = this.profileStore.updateProfile(this.currentProfileId, currentProfile) ?? currentProfile;
        processed += batch.length;

        this.emitProgress({
          phase: 'incremental',
          processed,
          total: newEmails.length,
          status: 'running',
          profileId: this.currentProfileId,
        });
      }

      this.emitProgress({
        phase: 'incremental',
        processed,
        total: newEmails.length,
        status: this.isCancelled ? 'paused' : 'completed',
        profileId: this.currentProfileId,
      });

      return currentProfile;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Cancel a running extraction.
   */
  cancel(): void {
    this.isCancelled = true;
  }

  /**
   * Check if the job is currently running.
   */
  getIsRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Get the current profile ID being processed.
   */
  getCurrentProfileId(): string | null {
    return this.currentProfileId;
  }

  private emitProgress(progress: ExtractionProgress): void {
    if (this.onProgress) {
      this.onProgress(progress);
    }
  }
}
