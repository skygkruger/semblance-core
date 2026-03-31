import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Card, Button, Input, StatusIndicator, SkeletonCard } from '@semblance/ui';
import { WireframeSpinner } from '@semblance/ui/components/WireframeSpinner/WireframeSpinner';
import {
  listContacts,
  getContactStats,
  getUpcomingBirthdays,
  getContact,
  searchContacts,
  createContact,
  updateContact,
  deleteContact,
  importContacts,
  getContactEmailHistory,
  getContactCalendarHistory,
  getFrequencyAlerts,
} from '../ipc/commands';

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

interface EmailInteraction {
  message_id: string;
  subject: string;
  from: string;
  from_name: string;
  snippet: string;
  received_at: string;
  priority: string;
}

interface CalendarInteraction {
  uid: string;
  title: string;
  start_time: string;
  end_time: string;
  attendees: string;
}

interface FrequencyAlert {
  contactId: string;
  displayName: string;
  lastContactDate: string;
  previousFrequency: string;
  currentFrequency: string;
  trend: string;
}

type SortField = 'display_name' | 'last_contact_date' | 'interaction_count';
type RelationshipFilter = 'all' | 'colleague' | 'client' | 'vendor' | 'friend' | 'family' | 'acquaintance' | 'unknown';

const RELATIONSHIP_TYPES = ['colleague', 'client', 'vendor', 'friend', 'family', 'acquaintance', 'unknown'] as const;

// ─── Helpers ────────────────────────────────────────────────────────────────

function getRelationshipBadgeStyle(type: string): { background: string; color: string } {
  switch (type) {
    case 'family': return { background: 'rgba(176, 122, 138, 0.15)', color: '#B07A8A' };
    case 'friend': return { background: 'rgba(110, 207, 163, 0.15)', color: '#6ECFA3' };
    case 'colleague': return { background: 'rgba(176, 154, 138, 0.15)', color: '#B09A8A' };
    case 'client': return { background: 'rgba(168, 180, 192, 0.15)', color: '#A8B4C0' };
    case 'vendor': return { background: 'rgba(94, 107, 124, 0.15)', color: '#5E6B7C' };
    default: return { background: 'rgba(94, 107, 124, 0.15)', color: '#5E6B7C' };
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

function FrequencyIndicator({ count }: { count: number }) {
  const status = count >= 4 ? 'success' : count >= 2 ? 'accent' : count >= 1 ? 'attention' : 'muted';
  return <StatusIndicator status={status} pulse={count >= 4} />;
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

function formatDateTime(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) +
      ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  } catch {
    return dateStr;
  }
}

// ─── Add Contact Form ───────────────────────────────────────────────────────

function AddContactForm({ onSave, onCancel }: {
  onSave: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [organization, setOrganization] = useState('');
  const [relationshipType, setRelationshipType] = useState('unknown');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    if (!name.trim()) {
      setError(t('screen.relationships.error_name_required', 'Name is required'));
      return;
    }
    setSaving(true);
    setError('');
    try {
      await createContact({
        displayName: name.trim(),
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        organization: organization.trim() || undefined,
        relationshipType,
      });
      onSave();
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="surface-slate px-4 py-3 space-y-2">
      <h3 style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, fontWeight: 400, color: '#B8C0C8', letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>
        {t('screen.relationships.add_contact', 'Add Contact')}
      </h3>
      <Input
        type="text"
        placeholder={t('screen.relationships.placeholder_name', 'Name *')}
        value={name}
        onChange={(e) => setName(e.target.value)}
        error={!!error && !name.trim()}
        autoFocus
      />
      <Input
        type="email"
        placeholder={t('screen.relationships.placeholder_email', 'Email')}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <Input
        type="tel"
        placeholder={t('screen.relationships.placeholder_phone', 'Phone')}
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
      />
      <Input
        type="text"
        placeholder={t('screen.relationships.placeholder_org', 'Organization')}
        value={organization}
        onChange={(e) => setOrganization(e.target.value)}
      />
      <select
        value={relationshipType}
        onChange={(e) => setRelationshipType(e.target.value)}
        style={{ width: '100%', padding: '6px 12px', fontFamily: "'DM Mono', monospace", fontSize: 12, borderRadius: 6, border: '1px solid rgba(255,255,255,0.06)', background: '#111518', color: '#A8B4C0', letterSpacing: '0.04em', outline: 'none' }}
      >
        {RELATIONSHIP_TYPES.map(rt => (
          <option key={rt} value={rt}>{rt.charAt(0).toUpperCase() + rt.slice(1)}</option>
        ))}
      </select>
      {error && <p className="text-xs" style={{ color: '#B07A8A' }}>{error}</p>}
      <div className="flex gap-2">
        <Button variant="solid" size="sm" onClick={handleSave} disabled={saving} className="flex-1">
          {saving ? t('screen.relationships.saving', 'Saving...') : t('screen.relationships.save', 'Save')}
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel} className="flex-1">
          {t('screen.relationships.cancel', 'Cancel')}
        </Button>
      </div>
    </div>
  );
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
  const [showAddForm, setShowAddForm] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editFields, setEditFields] = useState<Record<string, string>>({});
  const [emailHistory, setEmailHistory] = useState<EmailInteraction[]>([]);
  const [calendarHistory, setCalendarHistory] = useState<CalendarInteraction[]>([]);
  const [frequencyAlerts, setFrequencyAlerts] = useState<FrequencyAlert[]>([]);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  // FIX 5: Search debounce
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const loadContacts = useCallback(async () => {
    try {
      // FIX 1: Send db column names directly — no more broken mapping
      const result = await listContacts(500, sortField);
      setContacts((result.contacts ?? []) as unknown as ContactSummary[]);
    } catch (err) {
      console.error('[RelationshipsScreen] loadContacts failed:', err);
      setContacts([]);
    }
  }, [sortField]);

  const loadStats = useCallback(async () => {
    try {
      const result = await getContactStats();
      setStats(result as unknown as ContactStats);
    } catch (err) {
      console.error('[RelationshipsScreen] loadStats failed:', err);
    }
  }, []);

  const loadBirthdays = useCallback(async () => {
    try {
      const result = await getUpcomingBirthdays();
      setBirthdays((result.birthdays ?? []) as unknown as BirthdayInfo[]);
    } catch (err) {
      console.error('[RelationshipsScreen] loadBirthdays failed:', err);
      setBirthdays([]);
    }
  }, []);

  // FIX 4: Load frequency alerts on mount
  const loadFrequencyAlerts = useCallback(async () => {
    try {
      const result = await getFrequencyAlerts();
      setFrequencyAlerts((result.alerts ?? []) as unknown as FrequencyAlert[]);
    } catch {
      // Frequency monitor may not be initialized — not critical
      setFrequencyAlerts([]);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([loadContacts(), loadStats(), loadBirthdays(), loadFrequencyAlerts()]).finally(() => setLoading(false));
  }, [loadContacts, loadStats, loadBirthdays, loadFrequencyAlerts]);

  // FIX 3: Load communication history when contact is selected
  const loadCommunicationHistory = useCallback(async (contact: ContactDetail) => {
    const email = (contact.emails ?? [])[0];
    if (!email) {
      setEmailHistory([]);
      setCalendarHistory([]);
      return;
    }
    try {
      const [emails, events] = await Promise.all([
        getContactEmailHistory(email),
        getContactCalendarHistory(email),
      ]);
      setEmailHistory((emails ?? []) as EmailInteraction[]);
      setCalendarHistory((events ?? []) as CalendarInteraction[]);
    } catch {
      setEmailHistory([]);
      setCalendarHistory([]);
    }
  }, []);

  const handleSelectContact = useCallback(async (id: string) => {
    setEditMode(false);
    setDeleteConfirm(false);
    try {
      const result = await getContact(id);
      const detail = result as unknown as ContactDetail;
      setSelectedContact(detail);
      loadCommunicationHistory(detail);
    } catch (err) {
      console.error('[RelationshipsScreen] loadContact failed:', err);
    }
  }, [loadCommunicationHistory]);

  // FIX 5: Debounced search
  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value);
    clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      if (value.trim()) {
        searchContacts(value, 100)
          .then(result => setContacts((result.contacts ?? []) as unknown as ContactSummary[]))
          .catch(() => {});
      } else {
        listContacts(500, sortField)
          .then(result => setContacts((result.contacts ?? []) as unknown as ContactSummary[]))
          .catch(() => {});
      }
    }, 300);
  }, [sortField]);

  // Cleanup debounce timeout
  useEffect(() => () => clearTimeout(searchTimeoutRef.current), []);

  const handleAddSaved = useCallback(() => {
    setShowAddForm(false);
    loadContacts();
    loadStats();
  }, [loadContacts, loadStats]);

  // FIX 2: Edit mode
  const startEdit = useCallback(() => {
    if (!selectedContact) return;
    setEditFields({
      displayName: selectedContact.displayName ?? '',
      givenName: selectedContact.givenName ?? '',
      familyName: selectedContact.familyName ?? '',
      email: (selectedContact.emails ?? [])[0] ?? '',
      phone: (selectedContact.phones ?? [])[0] ?? '',
      organization: selectedContact.organization ?? '',
      jobTitle: selectedContact.jobTitle ?? '',
      birthday: selectedContact.birthday ?? '',
      relationshipType: selectedContact.relationshipType ?? 'unknown',
    });
    setEditMode(true);
  }, [selectedContact]);

  const handleSaveEdit = useCallback(async () => {
    if (!selectedContact) return;
    try {
      await updateContact(selectedContact.id, {
        displayName: editFields.displayName || undefined,
        emails: editFields.email ? [editFields.email] : undefined,
        phones: editFields.phone ? [editFields.phone] : undefined,
        organization: editFields.organization || undefined,
        jobTitle: editFields.jobTitle || undefined,
        birthday: editFields.birthday || undefined,
        relationshipType: editFields.relationshipType || undefined,
      });
      setEditMode(false);
      // Reload the contact detail and list
      handleSelectContact(selectedContact.id);
      loadContacts();
    } catch (err) {
      console.error('[RelationshipsScreen] update failed:', err);
    }
  }, [selectedContact, editFields, handleSelectContact, loadContacts]);

  // FIX 2: Delete contact
  const handleDelete = useCallback(async () => {
    if (!selectedContact) return;
    try {
      await deleteContact(selectedContact.id);
      setSelectedContact(null);
      setDeleteConfirm(false);
      loadContacts();
      loadStats();
    } catch (err) {
      console.error('[RelationshipsScreen] delete failed:', err);
    }
  }, [selectedContact, loadContacts, loadStats]);

  // FIX 2: Import VCF/CSV
  const handleImport = useCallback(async () => {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const filePath = await open({
        multiple: false,
        title: t('screen.relationships.import_title', 'Import Contacts'),
        filters: [
          { name: 'Contacts', extensions: ['vcf', 'vcard', 'csv'] },
        ],
      });
      if (!filePath) return;
      const path = typeof filePath === 'string' ? filePath : (filePath as unknown as { path: string }).path;
      if (!path) return;
      const result = await importContacts(path);
      if (result.success) {
        loadContacts();
        loadStats();
      } else {
        console.error('[RelationshipsScreen] import error:', result.error);
      }
    } catch (err) {
      console.error('[RelationshipsScreen] import failed:', err);
    }
  }, [t, loadContacts, loadStats]);

  const filteredContacts = filterType === 'all'
    ? contacts
    : contacts.filter(c => c.relationshipType === filterType);

  return (
    <div className="flex h-full">
      {/* Left panel -- contact list */}
      <div className="surface-opal opal-wireframe" style={{
        width: 300, display: 'flex', flexDirection: 'column', flexShrink: 0,
        padding: '16px 8px',
        overflow: 'hidden',
      }}>
        {/* Page heading */}
        <div style={{ padding: '4px 12px 8px', textAlign: 'center' }}>
          <h1 className="page-title" style={{ fontSize: 20 }}>
            {t('screen.relationships.title', 'Relationships')}
          </h1>
          {stats && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 10, fontFamily: "'DM Mono', monospace", fontSize: 11, color: '#5E6B7C', letterSpacing: '0.08em', textTransform: 'uppercase', marginTop: 4 }}>
              <span>{t('screen.relationships.contacts_count', { count: stats.totalContacts })}</span>
              <span>{t('screen.relationships.active_count', { count: Object.values(stats.byRelationshipType ?? {}).reduce((a, b) => a + b, 0) - ((stats.byRelationshipType ?? {})['unknown'] ?? 0) })}</span>
              {birthdays.length > 0 && <span>{t('screen.relationships.birthdays_count', { count: birthdays.length })}</span>}
            </div>
          )}
        </div>

        {/* Search + filters + actions */}
        <div style={{ padding: '0 12px 12px', display: 'flex', flexDirection: 'column', gap: 8, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
          <Input
            placeholder={t('placeholder.search_contacts')}
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
          />
          <div style={{ display: 'flex', gap: 6 }}>
            <select
              value={sortField}
              onChange={(e) => setSortField(e.target.value as SortField)}
              style={{
                flex: 1, fontSize: 11, padding: '5px 8px', borderRadius: 6,
                border: '1px solid rgba(255,255,255,0.09)', background: 'linear-gradient(160deg, #1E2227, #111518)',
                color: '#A8B4C0', fontFamily: "'DM Mono', monospace",
                letterSpacing: '0.04em', outline: 'none', cursor: 'pointer',
              }}
            >
              <option value="display_name">{t('screen.relationships.sort_name')}</option>
              <option value="last_contact_date">{t('screen.relationships.sort_last_contact')}</option>
              <option value="interaction_count">{t('screen.relationships.sort_frequency')}</option>
            </select>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as RelationshipFilter)}
              style={{
                flex: 1, fontSize: 11, padding: '5px 8px', borderRadius: 6,
                border: '1px solid rgba(255,255,255,0.09)', background: 'linear-gradient(160deg, #1E2227, #111518)',
                color: '#A8B4C0', fontFamily: "'DM Mono', monospace",
                letterSpacing: '0.04em', outline: 'none', cursor: 'pointer',
              }}
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
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="surface-slate"
              onClick={() => setShowAddForm(!showAddForm)}
              title="Add Contact"
              style={{
                flex: 1, padding: '5px 8px',
                color: '#A8B4C0', fontFamily: "'DM Mono', monospace", fontSize: 13,
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >+</button>
            <button
              type="button"
              className="surface-slate"
              onClick={handleImport}
              title="Import"
              style={{
                flex: 1, padding: '5px 8px',
                color: '#A8B4C0', fontFamily: "'DM Mono', monospace", fontSize: 13,
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >&#8593;</button>
          </div>
        </div>

        {/* Add contact form */}
        {showAddForm && (
          <AddContactForm
            onSave={handleAddSaved}
            onCancel={() => setShowAddForm(false)}
          />
        )}

        {/* Frequency alerts banner */}
        {frequencyAlerts.length > 0 && (
          <div style={{ padding: '8px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(176, 154, 138, 0.08)' }}>
            <p style={{ fontSize: 11, color: '#B09A8A', fontFamily: "'DM Mono', monospace", margin: 0, letterSpacing: '0.04em' }}>
              {t('screen.relationships.frequency_alert_count', { count: frequencyAlerts.length, defaultValue: '{{count}} contacts need attention' })}
            </p>
          </div>
        )}

        {/* Contact list */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          {loading ? (
            <div style={{ padding: 16 }}>
              <SkeletonCard variant="generic" message="Loading relationships" subMessage="Retrieving your contacts and communication patterns" showSpinner />
            </div>
          ) : filteredContacts.length === 0 ? (
            <div style={{ height: '64vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#A8B4C0', fontSize: 12, fontFamily: "'DM Mono', monospace", letterSpacing: '0.04em' }}>
              {t('screen.relationships.empty')}
            </div>
          ) : (
            filteredContacts.map(contact => (
                <button
                  key={contact.id}
                  type="button"
                  onClick={() => handleSelectContact(contact.id)}
                  style={{
                    width: '100%', textAlign: 'left', padding: '10px 16px',
                    background: selectedContact?.id === contact.id ? 'rgba(110, 207, 163, 0.06)' : 'transparent',
                    border: 'none', borderBottom: '1px solid rgba(255,255,255,0.04)',
                    cursor: 'pointer', transition: 'background 150ms ease',
                  }}
                  onMouseEnter={(e) => { if (selectedContact?.id !== contact.id) (e.currentTarget.style.background = 'rgba(255,255,255,0.03)'); }}
                  onMouseLeave={(e) => { if (selectedContact?.id !== contact.id) (e.currentTarget.style.background = 'transparent'); }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#282E36', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 500, color: '#5E6B7C', flexShrink: 0 }}>
                      {getInitials(contact.displayName)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 12, fontWeight: 400, color: '#EEF1F4', fontFamily: "'DM Mono', monospace", letterSpacing: '0.04em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {contact.displayName}
                        </span>
                        <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, fontWeight: 500, ...getRelationshipBadgeStyle(contact.relationshipType) }}>
                          {contact.relationshipType}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                        {contact.organization && (
                          <span style={{ fontSize: 11, color: '#5E6B7C', fontFamily: "'DM Mono', monospace", letterSpacing: '0.04em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {contact.organization}
                          </span>
                        )}
                        <span style={{ fontSize: 11, color: '#5E6B7C', fontFamily: "'DM Mono', monospace" }}>
                          {formatLastContact(contact.lastContactDate, t)}
                        </span>
                      </div>
                    </div>
                    <FrequencyIndicator count={Math.min(Math.ceil(contact.interactionCount / 5), 5)} />
                  </div>
                </button>
            ))
          )}
        </div>
      </div>

      {/* Right panel -- detail */}
      <div className="flex-1 overflow-y-auto p-6">
        {selectedContact ? (
          <div className="max-w-2xl space-y-6">
            {/* Header */}
            <div className="flex items-start gap-4">
              <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#1E2227', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'DM Mono', monospace", fontSize: 18, fontWeight: 400, color: '#5E6B7C' }}>
                {getInitials(selectedContact.displayName)}
              </div>
              <div className="flex-1">
                <h2 style={{ fontFamily: "'DM Mono', monospace", fontSize: 18, fontWeight: 400, color: '#EEF1F4', letterSpacing: '0.04em' }}>
                  {selectedContact.displayName}
                </h2>
                {selectedContact.jobTitle && (
                  <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: '#A8B4C0', letterSpacing: '0.04em' }}>
                    {selectedContact.jobTitle}{selectedContact.organization ? ` ${t('screen.relationships.at_org', { org: selectedContact.organization })}` : ''}
                  </p>
                )}
                <span className="inline-block mt-1 text-xs px-2 py-0.5 rounded-full font-medium" style={getRelationshipBadgeStyle(selectedContact.relationshipType)}>
                  {selectedContact.relationshipType}
                </span>
              </div>
              {/* FIX 2: Edit + Delete buttons */}
              <div className="flex gap-2">
                {!editMode && (
                  <Button variant="ghost" size="sm" onClick={startEdit}>
                    {t('screen.relationships.edit', 'Edit')}
                  </Button>
                )}
                {!deleteConfirm ? (
                  <Button variant="destructive" size="sm" onClick={() => setDeleteConfirm(true)}>
                    {t('screen.relationships.delete', 'Delete')}
                  </Button>
                ) : (
                  <div className="flex gap-1">
                    <Button variant="destructive" size="sm" onClick={handleDelete}>
                      {t('screen.relationships.confirm_delete', 'Confirm')}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setDeleteConfirm(false)}>
                      {t('screen.relationships.cancel', 'Cancel')}
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {/* Contact info -- view or edit mode */}
            <Card>
              <div className="p-4 space-y-3">
                <h3 style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, fontWeight: 400, color: '#B8C0C8', letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>{t('screen.relationships.section_info')}</h3>
                {editMode ? (
                  <div className="space-y-2">
                    <div>
                      <label style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: '#5E6B7C', letterSpacing: '0.04em' }}>{t('screen.relationships.label_name', 'Name')}</label>
                      <Input
                        type="text"
                        value={editFields.displayName ?? ''}
                        onChange={(e) => setEditFields(f => ({ ...f, displayName: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: '#5E6B7C', letterSpacing: '0.04em' }}>{t('screen.relationships.label_email')}</label>
                      <Input
                        type="email"
                        value={editFields.email ?? ''}
                        onChange={(e) => setEditFields(f => ({ ...f, email: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: '#5E6B7C', letterSpacing: '0.04em' }}>{t('screen.relationships.label_phone')}</label>
                      <Input
                        type="tel"
                        value={editFields.phone ?? ''}
                        onChange={(e) => setEditFields(f => ({ ...f, phone: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: '#5E6B7C', letterSpacing: '0.04em' }}>{t('screen.relationships.label_organization', 'Organization')}</label>
                      <Input
                        type="text"
                        value={editFields.organization ?? ''}
                        onChange={(e) => setEditFields(f => ({ ...f, organization: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: '#5E6B7C', letterSpacing: '0.04em' }}>{t('screen.relationships.label_job_title', 'Job Title')}</label>
                      <Input
                        type="text"
                        value={editFields.jobTitle ?? ''}
                        onChange={(e) => setEditFields(f => ({ ...f, jobTitle: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: '#5E6B7C', letterSpacing: '0.04em' }}>{t('screen.relationships.label_birthday')}</label>
                      <Input
                        type="date"
                        value={editFields.birthday ?? ''}
                        onChange={(e) => setEditFields(f => ({ ...f, birthday: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: '#5E6B7C', letterSpacing: '0.04em' }}>{t('screen.relationships.label_relationship_type', 'Relationship Type')}</label>
                      <select
                        value={editFields.relationshipType ?? 'unknown'}
                        onChange={(e) => setEditFields(f => ({ ...f, relationshipType: e.target.value }))}
                        style={{ width: '100%', padding: '6px 12px', fontFamily: "'DM Mono', monospace", fontSize: 12, borderRadius: 6, border: '1px solid rgba(255,255,255,0.06)', background: '#111518', color: '#A8B4C0', letterSpacing: '0.04em', outline: 'none' }}
                      >
                        {RELATIONSHIP_TYPES.map(rt => (
                          <option key={rt} value={rt}>{rt.charAt(0).toUpperCase() + rt.slice(1)}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <Button variant="solid" size="sm" onClick={handleSaveEdit}>
                        {t('screen.relationships.save', 'Save')}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setEditMode(false)}>
                        {t('screen.relationships.cancel', 'Cancel')}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    {(selectedContact.emails ?? []).length > 0 && (
                      <div>
                        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: '#5E6B7C', letterSpacing: '0.04em' }}>{t('screen.relationships.label_email')}</span>
                        {(selectedContact.emails ?? []).map(e => (
                          <p key={e} style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: '#EEF1F4', letterSpacing: '0.04em' }}>{e}</p>
                        ))}
                      </div>
                    )}
                    {(selectedContact.phones ?? []).length > 0 && (
                      <div>
                        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: '#5E6B7C', letterSpacing: '0.04em' }}>{t('screen.relationships.label_phone')}</span>
                        {(selectedContact.phones ?? []).map(p => (
                          <p key={p} style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: '#EEF1F4', letterSpacing: '0.04em' }}>{p}</p>
                        ))}
                      </div>
                    )}
                    {selectedContact.birthday && (
                      <div>
                        <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: '#5E6B7C', letterSpacing: '0.04em' }}>{t('screen.relationships.label_birthday')}</span>
                        <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: '#EEF1F4', letterSpacing: '0.04em' }}>{selectedContact.birthday}</p>
                      </div>
                    )}
                  </>
                )}
              </div>
            </Card>

            {/* Communication frequency */}
            {selectedContact.communicationFrequency && (
              <Card>
                <div className="p-4 space-y-3">
                  <h3 style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, fontWeight: 400, color: '#B8C0C8', letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>{t('screen.relationships.section_communication')}</h3>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: '#5E6B7C', letterSpacing: '0.04em' }}>{t('screen.relationships.label_emails_week')}</span>
                      <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 18, fontWeight: 400, color: '#EEF1F4' }}>
                        {selectedContact.communicationFrequency.emailsPerWeek}
                      </p>
                    </div>
                    <div>
                      <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: '#5E6B7C', letterSpacing: '0.04em' }}>{t('screen.relationships.label_meetings_month')}</span>
                      <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 18, fontWeight: 400, color: '#EEF1F4' }}>
                        {selectedContact.communicationFrequency.meetingsPerMonth}
                      </p>
                    </div>
                    <div>
                      <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: '#5E6B7C', letterSpacing: '0.04em' }}>{t('screen.relationships.label_trend')}</span>
                      <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 18, fontWeight: 400, color: '#EEF1F4', textTransform: 'capitalize' as const }}>
                        {selectedContact.communicationFrequency.trend}
                      </p>
                    </div>
                  </div>
                </div>
              </Card>
            )}

            {/* FIX 3: Recent Interactions */}
            {(emailHistory.length > 0 || calendarHistory.length > 0) && (
              <Card>
                <div className="p-4 space-y-3">
                  <h3 style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, fontWeight: 400, color: '#B8C0C8', letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>
                    {t('screen.relationships.section_interactions', 'Recent Interactions')}
                  </h3>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {/* Merge and sort chronologically */}
                    {[
                      ...emailHistory.map(e => ({
                        type: 'email' as const,
                        date: e.received_at,
                        title: e.subject || '(No subject)',
                        detail: e.snippet ?? '',
                        from: e.from_name || e.from,
                      })),
                      ...calendarHistory.map(e => ({
                        type: 'calendar' as const,
                        date: e.start_time,
                        title: e.title || '(Untitled event)',
                        detail: e.end_time ? `${formatDateTime(e.start_time)} - ${formatDateTime(e.end_time)}` : formatDateTime(e.start_time),
                        from: '',
                      })),
                    ]
                      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                      .slice(0, 20)
                      .map((item, i) => (
                        <div
                          key={`${item.type}-${i}`}
                          className="flex gap-3 py-2 border-b border-semblance-border/30 dark:border-semblance-border-dark/30 last:border-b-0"
                        >
                          <div
                            className="w-6 h-6 rounded flex items-center justify-center text-[10px] font-medium flex-shrink-0 mt-0.5"
                            style={{
                              background: item.type === 'email' ? 'rgba(110, 207, 163, 0.12)' : 'rgba(168, 180, 192, 0.12)',
                              color: item.type === 'email' ? '#6ECFA3' : '#A8B4C0',
                            }}
                          >
                            {item.type === 'email' ? '@' : '#'}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: '#EEF1F4', letterSpacing: '0.04em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {item.title}
                            </p>
                            {item.detail && (
                              <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: '#5E6B7C', letterSpacing: '0.04em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>
                                {item.detail}
                              </p>
                            )}
                            <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: '#5E6B7C', letterSpacing: '0.04em', marginTop: 2 }}>
                              {formatDateTime(item.date)}
                              {item.from ? ` -- ${item.from}` : ''}
                            </p>
                          </div>
                        </div>
                      ))
                    }
                  </div>
                </div>
              </Card>
            )}

            {/* FIX 4: Frequency alerts for this contact */}
            {frequencyAlerts.filter(a => a.contactId === selectedContact.id).map(alert => (
              <Card key={alert.contactId}>
                <div className="p-4" style={{ background: 'rgba(176, 154, 138, 0.06)' }}>
                  <p className="text-sm" style={{ color: '#B09A8A' }}>
                    {t('screen.relationships.frequency_alert_detail', {
                      name: alert.displayName,
                      date: formatLastContact(alert.lastContactDate, t),
                      defaultValue: "You haven't been in touch with {{name}} recently. Last contact: {{date}}.",
                    })}
                  </p>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 16 }}>
            <WireframeSpinner size={100} />
            <span style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: 11,
              color: '#A8B4C0',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
            }}>
              {t('screen.relationships.empty_detail', 'Select a contact')}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
