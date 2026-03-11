// ChatScreen — Conversational interface for mobile.
// Same chat UX as desktop. Wired to the mobile AI runtime via SemblanceProvider.
// Messages flow through the orchestrator with full tool-use capability.
// Includes conversation history panel (slide-up modal) for multi-conversation management.
//
// CRITICAL: No network imports. All inference is local via SemblanceProvider.

import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { ConversationHistoryPanel } from '@semblance/ui';
import type { ConversationHistoryItem as CHPItem } from '@semblance/ui';
import { colors, typography, spacing, radius } from '../theme/tokens.js';
import { useHardwareTier } from '../hooks/useHardwareTier';
import { useVoiceInput } from '../hooks/useVoiceInput';
import { createMobileVoiceAdapter } from '../native/voice-bridge';
import { useSemblance } from '../runtime/SemblanceProvider';
import type { ChatMessage } from '../runtime/SemblanceProvider';

export interface DocumentContext {
  documentId: string;
  fileName: string;
  filePath: string;
  mimeType: string;
}

interface ChatScreenProps {
  onAttachDocument?: () => void;
  onClearDocument?: () => void;
  documentContext?: DocumentContext | null;
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';

  return (
    <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAssistant]}>
      <Text style={[styles.messageText, isUser && styles.messageTextUser]}>
        {message.content}
      </Text>
      {message.actions && message.actions.length > 0 && (
        <View style={styles.actionsContainer}>
          {message.actions.map((action) => (
            <View key={action.id} style={styles.actionBadge}>
              <Text style={styles.actionText}>{action.type}</Text>
            </View>
          ))}
        </View>
      )}
      <Text style={styles.messageTime}>
        {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </Text>
    </View>
  );
}

export function ChatScreen({ onAttachDocument, onClearDocument, documentContext }: ChatScreenProps) {
  const { t } = useTranslation();
  const { t: tAgent } = useTranslation('agent');
  const [input, setInput] = useState('');
  const [historySearch, setHistorySearch] = useState('');
  const flatListRef = useRef<FlatList>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // AI runtime
  const semblance = useSemblance();

  // Voice hardware capability gate — use MOBILE voice adapter
  const { voiceCapable } = useHardwareTier();
  const voiceAdapter = useMemo(
    () => createMobileVoiceAdapter(Platform.OS === 'ios' ? 'ios' : 'android'),
    [],
  );
  const voice = useVoiceInput(voiceAdapter);
  const showVoice = voiceCapable && voice.voiceEnabled;

  // Map SemblanceProvider conversations to ConversationHistoryPanel format
  const historyItems: CHPItem[] = useMemo(
    () =>
      semblance.conversations.map((c) => ({
        id: c.id,
        title: c.title,
        autoTitle: c.autoTitle,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        pinned: c.pinned,
        turnCount: c.turnCount,
        lastMessagePreview: c.lastMessagePreview,
      })),
    [semblance.conversations],
  );

  // Auto-scroll on new messages
  useEffect(() => {
    if (semblance.messages.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [semblance.messages.length]);

  // Handle voice transcription -> auto-fill input
  useEffect(() => {
    if (voice.lastTranscription && voice.lastTranscription.trim()) {
      setInput(voice.lastTranscription);
    }
  }, [voice.lastTranscription]);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || semblance.isProcessing) return;
    setInput('');
    semblance.sendMessage(text);
  }, [input, semblance]);

  // ─── Conversation History Handlers ─────────────────────────────────────────

  const handleHistorySelect = useCallback(
    (id: string) => {
      semblance.switchConversation(id);
      semblance.toggleHistoryPanel();
    },
    [semblance],
  );

  const handleHistoryNew = useCallback(() => {
    semblance.createConversation();
    semblance.toggleHistoryPanel();
  }, [semblance]);

  const handleHistoryDelete = useCallback(
    (id: string) => {
      semblance.deleteConversation(id);
    },
    [semblance],
  );

  const handleHistoryPin = useCallback(
    (id: string) => {
      semblance.pinConversation(id);
    },
    [semblance],
  );

  const handleHistoryUnpin = useCallback(
    (id: string) => {
      semblance.unpinConversation(id);
    },
    [semblance],
  );

  const handleHistoryRename = useCallback(
    (id: string, title: string) => {
      semblance.renameConversation(id, title);
    },
    [semblance],
  );

  const handleHistorySearchChange = useCallback(
    (query: string) => {
      setHistorySearch(query);
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
      searchDebounceRef.current = setTimeout(() => {
        semblance.searchConversations(query);
      }, 300);
    },
    [semblance],
  );

  const handleHistoryClose = useCallback(() => {
    setHistorySearch('');
    semblance.refreshConversations();
    semblance.toggleHistoryPanel();
  }, [semblance]);

  // Show initialization screen while runtime loads
  if (semblance.initializing) {
    return (
      <View style={styles.initContainer}>
        <ActivityIndicator size="large" color="#6ECFA3" />
        <Text style={styles.initTitle}>{t('screen.chat.starting', { defaultValue: 'Starting Semblance' })}</Text>
        <Text style={styles.initProgress}>{semblance.progressLabel}</Text>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${semblance.progress}%` }]} />
        </View>
        <Text style={styles.initSubtext}>{t('screen.chat.local_processing', { defaultValue: 'All processing happens on your device' })}</Text>
      </View>
    );
  }

  // Show error state if runtime failed
  if (semblance.error && !semblance.ready) {
    return (
      <View style={styles.initContainer}>
        <Text style={styles.errorTitle}>{t('screen.chat.setup_required', { defaultValue: 'Setup Required' })}</Text>
        <Text style={styles.errorText}>{semblance.error}</Text>
        <Text style={styles.initSubtext}>
          {t('screen.chat.model_required', { defaultValue: 'Semblance needs a local AI model to work. Connect to Wi-Fi to download one.' })}
        </Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={90}
    >
      {/* Top bar with history toggle and new chat */}
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={semblance.toggleHistoryPanel}
          style={styles.topBarButton}
          accessibilityRole="button"
          accessibilityLabel={t('screen.chat.history', { defaultValue: 'Conversation history' })}
        >
          <Text style={styles.topBarButtonText}>{t('screen.chat.history_icon', { defaultValue: 'H' })}</Text>
        </TouchableOpacity>
        <Text style={styles.topBarTitle} numberOfLines={1}>
          {t('screen.chat.title', { defaultValue: 'Chat' })}
        </Text>
        <TouchableOpacity
          onPress={handleHistoryNew}
          style={styles.topBarButton}
          accessibilityRole="button"
          accessibilityLabel={t('screen.chat.new_chat', { defaultValue: 'New chat' })}
        >
          <Text style={styles.topBarNewText}>+</Text>
        </TouchableOpacity>
      </View>

      {/* Document context banner */}
      {documentContext && (
        <View style={styles.documentBanner}>
          <Text style={styles.documentIcon}>&#128196;</Text>
          <Text style={styles.documentFileName} numberOfLines={1}>
            {documentContext.fileName}
          </Text>
          <TouchableOpacity
            onPress={onClearDocument}
            style={styles.documentClearButton}
            accessibilityRole="button"
            accessibilityLabel={t('a11y.clear_document_context')}
          >
            <Text style={styles.documentClearText}>X</Text>
          </TouchableOpacity>
        </View>
      )}

      <FlatList
        ref={flatListRef}
        data={semblance.messages}
        keyExtractor={msg => msg.id}
        renderItem={({ item }) => <MessageBubble message={item} />}
        contentContainerStyle={styles.messageList}
        inverted={false}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>{t('screen.chat.ask_anything_short', { defaultValue: 'Ask anything' })}</Text>
            <Text style={styles.emptyText}>
              {t('screen.chat.local_device_processing', { defaultValue: 'Semblance processes your request locally on your device.' })}
            </Text>
            {semblance.deviceInfo && (
              <Text style={styles.emptyDevice}>
                {semblance.deviceInfo.deviceName} ({semblance.deviceInfo.totalMemMb}MB RAM)
              </Text>
            )}
          </View>
        }
      />

      {semblance.isProcessing && (
        <View style={styles.typingIndicator}>
          <Text style={styles.typingText}>{t('screen.chat.thinking_dots', { defaultValue: 'Thinking...' })}</Text>
        </View>
      )}

      <View style={styles.inputBar}>
        {onAttachDocument && (
          <TouchableOpacity
            onPress={onAttachDocument}
            style={styles.attachButton}
            accessibilityRole="button"
            accessibilityLabel={tAgent('input.attach_document', { defaultValue: 'Attach document' })}
          >
            <Text style={styles.attachButtonText}>+</Text>
          </TouchableOpacity>
        )}
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder={
            semblance.ready
              ? tAgent('input.placeholder_default', { defaultValue: 'Message Semblance...' })
              : t('screen.chat.model_loading', { defaultValue: 'AI model loading...' })
          }
          placeholderTextColor={colors.textTertiary}
          multiline
          maxLength={4000}
          returnKeyType="send"
          onSubmitEditing={handleSend}
          blurOnSubmit={false}
          editable={!semblance.isProcessing}
        />
        {showVoice && (
          <TouchableOpacity
            style={styles.voiceButton}
            onPress={voice.voiceState === 'listening' ? voice.onVoiceStop : voice.onVoiceStart}
            accessibilityRole="button"
            accessibilityLabel={
              voice.voiceState === 'listening'
                ? t('screen.chat.voice_stop', { defaultValue: 'Stop listening' })
                : t('screen.chat.voice_start', { defaultValue: 'Start voice input' })
            }
            testID="voice-mic-button"
          >
            <Text style={[styles.voiceButtonText, voice.voiceState === 'listening' && styles.voiceButtonActive]}>
              {voice.voiceState === 'listening' ? '||' : 'M'}
            </Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.sendButton, (!input.trim() || semblance.isProcessing) && styles.sendButtonDisabled]}
          onPress={handleSend}
          disabled={!input.trim() || semblance.isProcessing}
          accessibilityRole="button"
          accessibilityLabel={tAgent('input.send_message', { defaultValue: 'Send message' })}
        >
          <Text style={styles.sendButtonText}>{t('button.send', { defaultValue: 'Send' })}</Text>
        </TouchableOpacity>
      </View>

      {/* Conversation History Modal */}
      <ConversationHistoryPanel
        items={historyItems}
        activeId={semblance.conversationId}
        open={semblance.historyPanelOpen}
        searchQuery={historySearch}
        onSearchChange={handleHistorySearchChange}
        onSelect={handleHistorySelect}
        onNew={handleHistoryNew}
        onPin={handleHistoryPin}
        onUnpin={handleHistoryUnpin}
        onRename={handleHistoryRename}
        onDelete={handleHistoryDelete}
        onClose={handleHistoryClose}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgDark,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderDark,
    backgroundColor: colors.surface1Dark,
  },
  topBarButton: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: colors.surface2Dark,
    justifyContent: 'center',
    alignItems: 'center',
  },
  topBarButtonText: {
    fontFamily: typography.fontMono,
    fontSize: typography.size.base,
    color: colors.textSecondaryDark,
  },
  topBarTitle: {
    flex: 1,
    fontFamily: typography.fontDisplay,
    fontSize: typography.size.lg,
    color: colors.textPrimaryDark,
    textAlign: 'center',
    marginHorizontal: spacing.sm,
  },
  topBarNewText: {
    fontFamily: typography.fontMono,
    fontSize: typography.size.xl,
    color: colors.primary,
    lineHeight: typography.size.xl * 1.1,
  },
  initContainer: {
    flex: 1,
    backgroundColor: colors.bgDark,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  initTitle: {
    fontFamily: typography.fontDisplay,
    fontSize: typography.size.xl,
    color: colors.textPrimaryDark,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  initProgress: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.sm,
    color: colors.textSecondaryDark,
    marginBottom: spacing.lg,
  },
  progressBar: {
    width: '80%',
    height: 4,
    backgroundColor: colors.surface2Dark,
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: spacing.lg,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#6ECFA3',
    borderRadius: 2,
  },
  initSubtext: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.xs,
    color: colors.textTertiary,
    textAlign: 'center',
  },
  errorTitle: {
    fontFamily: typography.fontDisplay,
    fontSize: typography.size.xl,
    color: '#B07A8A',
    marginBottom: spacing.md,
  },
  errorText: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.sm,
    color: colors.textSecondaryDark,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  messageList: {
    padding: spacing.base,
    paddingBottom: spacing.xl,
  },
  bubble: {
    maxWidth: '85%',
    padding: spacing.md,
    borderRadius: radius.lg,
    marginBottom: spacing.sm,
  },
  bubbleUser: {
    backgroundColor: colors.primary,
    alignSelf: 'flex-end',
    borderBottomRightRadius: radius.sm,
  },
  bubbleAssistant: {
    backgroundColor: colors.surface1Dark,
    alignSelf: 'flex-start',
    borderBottomLeftRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderDark,
  },
  messageText: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.base,
    color: colors.textPrimaryDark,
    lineHeight: typography.size.base * typography.lineHeight.normal,
  },
  messageTextUser: {
    color: '#FFFFFF',
  },
  messageTime: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.xs,
    color: colors.textTertiary,
    marginTop: spacing.xs,
    alignSelf: 'flex-end',
  },
  actionsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: spacing.xs,
  },
  actionBadge: {
    backgroundColor: 'rgba(110,207,163,0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  actionText: {
    fontFamily: typography.fontMono,
    fontSize: 10,
    color: '#6ECFA3',
  },
  typingIndicator: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
  },
  typingText: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.sm,
    color: colors.textTertiary,
    fontStyle: 'italic',
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: spacing.md,
    paddingBottom: spacing.base,
    borderTopWidth: 1,
    borderTopColor: colors.borderDark,
    backgroundColor: colors.surface1Dark,
  },
  input: {
    flex: 1,
    fontFamily: typography.fontBody,
    fontSize: typography.size.base,
    color: colors.textPrimaryDark,
    backgroundColor: colors.surface2Dark,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: colors.borderDark,
  },
  sendButton: {
    marginLeft: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.4,
  },
  sendButtonText: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold,
    color: '#FFFFFF',
  },
  documentBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface1Dark,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderDark,
  },
  documentIcon: {
    fontSize: typography.size.base,
    marginRight: spacing.sm,
  },
  documentFileName: {
    flex: 1,
    fontFamily: typography.fontBody,
    fontSize: typography.size.sm,
    color: colors.textSecondaryDark,
  },
  documentClearButton: {
    padding: spacing.xs,
    borderRadius: radius.sm,
  },
  documentClearText: {
    fontFamily: typography.fontMono,
    fontSize: typography.size.sm,
    color: colors.textTertiary,
  },
  attachButton: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: colors.surface2Dark,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.sm,
  },
  attachButtonText: {
    fontFamily: typography.fontMono,
    fontSize: typography.size.lg,
    color: colors.textSecondaryDark,
    lineHeight: typography.size.lg * 1.1,
  },
  voiceButton: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: colors.surface2Dark,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.sm,
  },
  voiceButtonText: {
    fontFamily: typography.fontMono,
    fontSize: typography.size.base,
    color: colors.textSecondaryDark,
  },
  voiceButtonActive: {
    color: colors.primary,
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 160,
  },
  emptyTitle: {
    fontFamily: typography.fontDisplay,
    fontSize: typography.size.xl,
    color: colors.textPrimaryDark,
    marginBottom: spacing.sm,
  },
  emptyText: {
    fontFamily: typography.fontBody,
    fontSize: typography.size.base,
    color: colors.textSecondaryDark,
    textAlign: 'center',
    maxWidth: 280,
  },
  emptyDevice: {
    fontFamily: typography.fontMono,
    fontSize: typography.size.xs,
    color: colors.textTertiary,
    marginTop: spacing.md,
  },
});
