import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Card, Button } from '@semblance/ui';
import { listContacts, getContactStats, getUpcomingBirthdays, getContact, searchContacts } from '../ipc/commands';

// ─── Types ──────────────────────────────────────────────────────────────────

interface ContactSummary {
  id: string;
  displayName: string;
  organization: string;
  relationshipType: string;
  lastContactDate: string | null;
  interactionCount: number;
  birthday: string;
  emails: string[];
}

interface ContactDetail extends ContactSummary {
  givenName: string;
  familyName: string;
  phones: string[];
  jobTitle: string;
  communicationFrequency: {
    emailsPerWeek: number;
    meetingsPerMonth: number;
    trend: string;
  } | null;
  tags: string[];
}

interface ContactStats {
  totalContacts: number;
  byRelationshipType: Record<string, number>;
  withBirthday: number;
  withOrganization: number;
}

interface BirthdayInfo {
  contactId: string;
  displayName: string;
  birthday: string;
  daysUntil: number;
  isToday: boolean;
}

type SortField = 'display_name' | 'last_contact_date' | 'interaction_count';
type RelationshipFilter = 'all' | 'colleague' | 'client' | 'vendor' | 'friend' | 'family' | 'acquaintance' | 'unknown';

// ─── Helpers ────────────────────────────────────────────────────────────────

function getRelationshipBadgeColor(type: string): string {
  switch (type) {
    case 'colleague': return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300';
    case 'client': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
    case 'vendor': return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300';
    case 'friend': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
    case 'family': return 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300';
    case 'acquaintance': return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
    default: return 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';
  }
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .map(p => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function FrequencyDots({ count }: { count: number }) {
  const maxDots = 5;
  const filled = Math.min(count, maxDots);
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: maxDots }).map((_, i) => (
        <div
          key={i}
          className={`w-1.5 h-1.5 rounded-full ${
            i < filled
              ? 'bg-semblance-primary'
              : 'bg-semblance-text-muted/20 dark:bg-semblance-text-muted-dark/20'
          }`}
        />
      ))}
    </div>
  );
}

function formatLastContact(date: string | null, t: TFunction): string {
  if (!date) return t('time.never');
  const d = new Date(date);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return t('time.today');
  if (diffDays === 1) return t('time.yesterday');
  if (diffDays < 7) return t('time.days_ago', { count: diffDays });
  if (diffDays < 30) return t('time.weeks_ago', { count: Math.floor(diffDays / 7) });
  return t('time.months_ago', { count: Math.floor(diffDays / 30) });
}

// ─── Component ──────────────────────────────────────────────────────────────

export function RelationshipsScreen() {
  const { t } = useTranslation();
  const [contacts, setContacts] = useState<ContactSummary[]>([]);
  const [stats, setStats] = useState<ContactStats | null>(null);
  const [birthdays, setBirthdays] = useState<BirthdayInfo[]>([]);
  const [selectedContact, setSelectedContact] = useState<ContactDetail | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('display_name');
  const [filterType, setFilterType] = useState<RelationshipFilter>('all');
  const [loading, setLoading] = useState(true);

  const loadContacts = useCallback(async () => {
    try {
      const result = await listContacts(500, sortField === 'display_name' ? 'name' : sortField === 'last_contact_date' ? 'lastInteraction' : 'strength');
      setContacts((result.contacts ?? []) as unknown as ContactSummary[]);
    } catch {
      setContacts([]);
    }
  }, [sortField]);

  const loadStats = useCallback(async () => {
    try {
      const result = await getContactStats();
      setStats(result as unknown as ContactStats);
    } catch {
      // ignore
    }
  }, []);

  const loadBirthdays = useCallback(async () => {
    try {
      const result = await getUpcomingBirthdays();
      setBirthdays((result.birthdays ?? []) as unknown as BirthdayInfo[]);
    } catch {
      setBirthdays([]);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([loadContacts(), loadStats(), loadBirthdays()]).finally(() => setLoading(false));
  }, [loadContacts, loadStats, loadBirthdays]);

  const handleSelectContact = useCallback(async (id: string) => {
    try {
      const result = await getContact(id);
      setSelectedContact(result as unknown as ContactDetail);
    } catch {
      // ignore
    }
  }, []);

  const handleSearch = useCallback(async (query: string) => {
    setSearchQuery(query);
    if (!query.trim()) {
      loadContacts();
      return;
    }
    try {
      const result = await searchContacts(query, 100);
      setContacts((result.contacts ?? []) as unknown as ContactSummary[]);
    } catch {
      // ignore
    }
  }, [loadContacts]);

  const filteredContacts = filterType === 'all'
    ? contacts
    : contacts.filter(c => c.relationshipType === filterType);

  return (
    <div className="flex h-full">
      {/* Left panel — contact list */}
      <div className="w-80 border-r border-semblance-border dark:border-semblance-border-dark flex flex-col">
        {/* Stats bar */}
        {stats && (
          <div className="px-4 py-3 border-b border-semblance-border dark:border-semblance-border-dark">
            <div className="flex items-center gap-4 text-xs text-semblance-text-secondary dark:text-semblance-text-secondary-dark">
              <span>{t('screen.relationships.contacts_count', { count: stats.totalContacts })}</span>
              <span>{t('screen.relationships.active_count', { count: Object.values(stats.byRelationshipType).reduce((a, b) => a + b, 0) - (stats.byRelationshipType['unknown'] ?? 0) })}</span>
              {birthdays.length > 0 && <span>{t('screen.relationships.birthdays_count', { count: birthdays.length })}</span>}
            </div>
          </div>
        )}

        {/* Search + filters */}
        <div className="px-4 py-3 space-y-2 border-b border-semblance-border dark:border-semblance-border-dark">
          <input
            type="text"
            placeholder={t('placeholder.search_contacts')}
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            className="w-full px-3 py-1.5 text-sm rounded-md border border-semblance-border dark:border-semblance-border-dark bg-semblance-surface dark:bg-semblance-surface-dark text-semblance-text dark:text-semblance-text-dark focus:outline-none focus:ring-1 focus:ring-semblance-primary"
          />
          <div className="flex gap-2">
            <select
              value={sortField}
              onChange={(e) => setSortField(e.target.value as SortField)}
              className="text-xs px-2 py-1 rounded border border-semblance-border dark:border-semblance-border-dark bg-semblance-surface dark:bg-semblance-surface-dark text-semblance-text-secondary dark:text-semblance-text-secondary-dark"
            >
              <option value="display_name">{t('screen.relationships.sort_name')}</option>
              <option value="last_contact_date">{t('screen.relationships.sort_last_contact')}</option>
              <option value="interaction_count">{t('screen.relationships.sort_frequency')}</option>
            </select>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as RelationshipFilter)}
              className="text-xs px-2 py-1 rounded border border-semblance-border dark:border-semblance-border-dark bg-semblance-surface dark:bg-semblance-surface-dark text-semblance-text-secondary dark:text-semblance-text-secondary-dark"
            >
              <option value="all">{t('screen.relationships.filter_all')}</option>
              <option value="colleague">{t('screen.relationships.filter_colleague')}</option>
              <option value="client">{t('screen.relationships.filter_client')}</option>
              <option value="vendor">{t('screen.relationships.filter_vendor')}</option>
              <option value="friend">{t('screen.relationships.filter_friend')}</option>
              <option value="family">{t('screen.relationships.filter_family')}</option>
              <option value="acquaintance">{t('screen.relationships.filter_acquaintance')}</option>
            </select>
          </div>
        </div>

        {/* Contact list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-4 text-center text-semblance-text-muted dark:text-semblance-text-muted-dark text-sm">
              {t('screen.relationships.loading')}
            </div>
          ) : filteredContacts.length === 0 ? (
            <div className="p-4 text-center text-semblance-text-muted dark:text-semblance-text-muted-dark text-sm">
              {t('screen.relationships.empty')}
            </div>
          ) : (
            filteredContacts.map(contact => (
              <button
                key={contact.id}
                type="button"
                onClick={() => handleSelectContact(contact.id)}
                className={`w-full text-left px-4 py-3 border-b border-semblance-border/50 dark:border-semblance-border-dark/50 hover:bg-semblance-surface-2 dark:hover:bg-semblance-surface-2-dark transition-colors ${
                  selectedContact?.id === contact.id ? 'bg-semblance-primary-subtle dark:bg-semblance-primary-subtle-dark' : ''
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-semblance-surface-2 dark:bg-semblance-surface-2-dark flex items-center justify-center text-xs font-medium text-semblance-text-secondary dark:text-semblance-text-secondary-dark">
                    {getInitials(contact.displayName)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-semblance-text dark:text-semblance-text-dark truncate">
                        {contact.displayName}
                      </span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${getRelationshipBadgeColor(contact.relationshipType)}`}>
                        {contact.relationshipType}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      {contact.organization && (
                        <span className="text-xs text-semblance-text-muted dark:text-semblance-text-muted-dark truncate">
                          {contact.organization}
                        </span>
                      )}
                      <span className="text-xs text-semblance-text-muted dark:text-semblance-text-muted-dark">
                        {formatLastContact(contact.lastContactDate, t)}
                      </span>
                    </div>
                  </div>
                  <FrequencyDots count={Math.min(Math.ceil(contact.interactionCount / 5), 5)} />
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Right panel — detail */}
      <div className="flex-1 overflow-y-auto p-6">
        {selectedContact ? (
          <div className="max-w-2xl space-y-6">
            {/* Header */}
            <div className="flex items-start gap-4">
              <div className="w-16 h-16 rounded-full bg-semblance-surface-2 dark:bg-semblance-surface-2-dark flex items-center justify-center text-xl font-medium text-semblance-text-secondary dark:text-semblance-text-secondary-dark">
                {getInitials(selectedContact.displayName)}
              </div>
              <div>
                <h2 className="text-xl font-semibold text-semblance-text dark:text-semblance-text-dark">
                  {selectedContact.displayName}
                </h2>
                {selectedContact.jobTitle && (
                  <p className="text-sm text-semblance-text-secondary dark:text-semblance-text-secondary-dark">
                    {selectedContact.jobTitle}{selectedContact.organization ? ` ${t('screen.relationships.at_org', { org: selectedContact.organization })}` : ''}
                  </p>
                )}
                <span className={`inline-block mt-1 text-xs px-2 py-0.5 rounded-full font-medium ${getRelationshipBadgeColor(selectedContact.relationshipType)}`}>
                  {selectedContact.relationshipType}
                </span>
              </div>
            </div>

            {/* Contact info */}
            <Card>
              <div className="p-4 space-y-3">
                <h3 className="text-sm font-medium text-semblance-text dark:text-semblance-text-dark">{t('screen.relationships.section_info')}</h3>
                {selectedContact.emails.length > 0 && (
                  <div>
                    <span className="text-xs text-semblance-text-muted dark:text-semblance-text-muted-dark">{t('screen.relationships.label_email')}</span>
                    {selectedContact.emails.map(e => (
                      <p key={e} className="text-sm text-semblance-text dark:text-semblance-text-dark">{e}</p>
                    ))}
                  </div>
                )}
                {selectedContact.phones.length > 0 && (
                  <div>
                    <span className="text-xs text-semblance-text-muted dark:text-semblance-text-muted-dark">{t('screen.relationships.label_phone')}</span>
                    {selectedContact.phones.map(p => (
                      <p key={p} className="text-sm text-semblance-text dark:text-semblance-text-dark">{p}</p>
                    ))}
                  </div>
                )}
                {selectedContact.birthday && (
                  <div>
                    <span className="text-xs text-semblance-text-muted dark:text-semblance-text-muted-dark">{t('screen.relationships.label_birthday')}</span>
                    <p className="text-sm text-semblance-text dark:text-semblance-text-dark">{selectedContact.birthday}</p>
                  </div>
                )}
              </div>
            </Card>

            {/* Communication frequency */}
            {selectedContact.communicationFrequency && (
              <Card>
                <div className="p-4 space-y-3">
                  <h3 className="text-sm font-medium text-semblance-text dark:text-semblance-text-dark">{t('screen.relationships.section_communication')}</h3>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <span className="text-xs text-semblance-text-muted dark:text-semblance-text-muted-dark">{t('screen.relationships.label_emails_week')}</span>
                      <p className="text-lg font-semibold text-semblance-text dark:text-semblance-text-dark">
                        {selectedContact.communicationFrequency.emailsPerWeek}
                      </p>
                    </div>
                    <div>
                      <span className="text-xs text-semblance-text-muted dark:text-semblance-text-muted-dark">{t('screen.relationships.label_meetings_month')}</span>
                      <p className="text-lg font-semibold text-semblance-text dark:text-semblance-text-dark">
                        {selectedContact.communicationFrequency.meetingsPerMonth}
                      </p>
                    </div>
                    <div>
                      <span className="text-xs text-semblance-text-muted dark:text-semblance-text-muted-dark">{t('screen.relationships.label_trend')}</span>
                      <p className="text-lg font-semibold text-semblance-text dark:text-semblance-text-dark capitalize">
                        {selectedContact.communicationFrequency.trend}
                      </p>
                    </div>
                  </div>
                </div>
              </Card>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-semblance-text-muted dark:text-semblance-text-muted-dark">
            {t('screen.relationships.empty_detail')}
          </div>
        )}
      </div>
    </div>
  );
}
