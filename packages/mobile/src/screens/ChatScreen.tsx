// ChatScreen — Conversational interface for mobile.
// Same chat UX as desktop, adapted for mobile keyboard and touch.
// Data wired to Core's orchestrator in Commit 8.

import React, { useState, useRef, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { colors, typography, spacing, radius } from '../theme/tokens.js';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  /** Optional routing indicator (e.g., "Processing on MacBook Pro...") */
  routedTo?: string;
}

export interface DocumentContext {
  documentId: string;
  fileName: string;
  filePath: string;
  mimeType: string;
}

interface ChatScreenProps {
  messages?: ChatMessage[];
  onSend?: (text: string) => void;
  onAttachDocument?: () => void;
  onClearDocument?: () => void;
  documentContext?: DocumentContext | null;
  isProcessing?: boolean;
  deviceName?: string;
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';

  return (
    <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAssistant]}>
      {message.routedTo && (
        <Text style={styles.routedIndicator}>Processing on {message.routedTo}...</Text>
      )}
      <Text style={[styles.messageText, isUser && styles.messageTextUser]}>
        {message.content}
      </Text>
      <Text style={styles.messageTime}>{message.timestamp}</Text>
    </View>
  );
}

export function ChatScreen({ messages = [], onSend, onAttachDocument, onClearDocument, documentContext, isProcessing = false }: ChatScreenProps) {
  const [input, setInput] = useState('');
  const flatListRef = useRef<FlatList>(null);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text) return;
    onSend?.(text);
    setInput('');
  }, [input, onSend]);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={90}
    >
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
            accessibilityLabel="Clear document context"
          >
            <Text style={styles.documentClearText}>X</Text>
          </TouchableOpacity>
        </View>
      )}

      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={msg => msg.id}
        renderItem={({ item }) => <MessageBubble message={item} />}
        contentContainerStyle={styles.messageList}
        inverted={false}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Ask anything</Text>
            <Text style={styles.emptyText}>
              Semblance processes your request locally on your device.
            </Text>
          </View>
        }
      />

      {isProcessing && (
        <View style={styles.typingIndicator}>
          <Text style={styles.typingText}>Thinking...</Text>
        </View>
      )}

      <View style={styles.inputBar}>
        {onAttachDocument && (
          <TouchableOpacity
            onPress={onAttachDocument}
            style={styles.attachButton}
            accessibilityRole="button"
            accessibilityLabel="Attach document"
          >
            <Text style={styles.attachButtonText}>+</Text>
          </TouchableOpacity>
        )}
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="Awaiting direction"
          placeholderTextColor={colors.textTertiary}
          multiline
          maxLength={4000}
          returnKeyType="send"
          onSubmitEditing={handleSend}
          blurOnSubmit={false}
        />
        <TouchableOpacity
          style={[styles.sendButton, !input.trim() && styles.sendButtonDisabled]}
          onPress={handleSend}
          disabled={!input.trim() || isProcessing}
          accessibilityRole="button"
          accessibilityLabel="Send message"
        >
          <Text style={styles.sendButtonText}>Send</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgDark,
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
  routedIndicator: {
    fontFamily: typography.fontMono,
    fontSize: typography.size.xs,
    color: colors.accent,
    marginBottom: spacing.xs,
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
});
