export interface ToolStepCardProps {
  toolName: string;
  displayName: string;
  status: 'pending' | 'active' | 'complete' | 'error';
  summary?: string;
  duration?: number;
  className?: string;
}

/** Map internal tool IDs to human-readable past-tense labels. */
export const TOOL_DISPLAY_NAMES: Record<string, string> = {
  fetch_inbox: 'Checked inbox',
  search_emails: 'Searched emails',
  send_email: 'Sent email',
  draft_email: 'Drafted email',
  archive_email: 'Archived email',
  categorize_email: 'Categorized email',
  fetch_calendar: 'Checked calendar',
  create_calendar_event: 'Created event',
  update_calendar_event: 'Updated event',
  detect_calendar_conflicts: 'Checked conflicts',
  search_files: 'Searched files',
  list_indexed_documents: 'Listed documents',
  read_document: 'Read document',
  search_web: 'Searched the web',
  deep_search_web: 'Deep web search',
  fetch_url: 'Fetched page',
  search_contacts: 'Searched contacts',
  add_contact: 'Added contact',
  fetch_transactions: 'Fetched transactions',
  log_health_entry: 'Logged health data',
  get_health_summary: 'Checked health',
  create_reminder: 'Created reminder',
  list_reminders: 'Listed reminders',
  get_weather: 'Checked weather',
  search_cloud_files: 'Searched cloud files',
  list_cloud_files: 'Listed cloud files',
};

/** Get a display name for a tool, falling back to a formatted version of the ID. */
export function getToolDisplayName(toolName: string): string {
  if (TOOL_DISPLAY_NAMES[toolName]) return TOOL_DISPLAY_NAMES[toolName];
  // Format: "search_emails" → "Search emails"
  return toolName.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase());
}
