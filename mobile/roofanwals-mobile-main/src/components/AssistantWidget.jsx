import React, { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, FlatList, TextInput,
  KeyboardAvoidingView, Platform, ActivityIndicator, Keyboard, TouchableWithoutFeedback
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import useAssistant from '../hooks/useAssistant';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

export default function AssistantWidget() {
  const { user } = useAuth();
  /* Sits above the tab bar, which now grows with the bottom inset. */
  const insets = useSafeAreaInsets();
  const fabBottom = 80 + Math.max(insets.bottom, 10);
  const [open, setOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const flatListRef = useRef(null);
  const assistant = useAssistant({ active: open });
  const { colors } = useTheme();

  // If the user is not authenticated, completely hide the widget
  if (!user) {
    return null;
  }

  const handleSend = () => {
    if (assistant.input.trim()) {
      assistant.send(assistant.input);
      Keyboard.dismiss();
    }
  };

  const renderMessage = ({ item }) => {
    const isUser = item.role === 'user';
    return (
      <View style={[styles.msgWrapper, isUser ? styles.msgWrapperUser : styles.msgWrapperBot]}>
        {!isUser && (
          <View style={styles.botAvatar}>
            <Feather name="zap" size={12} color="#4F46E5" />
          </View>
        )}
        <View style={[styles.msgBubble, isUser ? styles.msgUser : styles.msgBot, !item.sent && styles.msgPending]}>
          <Text style={[styles.msgText, isUser ? styles.msgTextUser : styles.msgTextBot]}>
            {item.content}
          </Text>
          {item.steps && item.steps.length > 0 && (
            <View style={styles.stepsContainer}>
              {item.steps.map((step, idx) => (
                <View key={idx} style={styles.stepRow}>
                  <Text style={styles.stepNum}>{idx + 1}.</Text>
                  <Text style={styles.stepText}>{step.text}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </View>
    );
  };

  return (
    <>
      {!open && (
        <TouchableOpacity 
          style={[styles.fab, { bottom: fabBottom }]} 
          activeOpacity={0.8}
          onPress={() => setOpen(true)}
        >
          <Feather name="message-circle" size={24} color="#FFF" />
        </TouchableOpacity>
      )}

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <SafeAreaView style={styles.modalSafeArea}>
          <KeyboardAvoidingView 
            style={styles.modalContainer} 
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            {/* Header */}
            <View style={styles.header}>
              <View style={styles.headerLeft}>
                <View style={styles.iconCircle}>
                  <Feather name="zap" size={16} color="#4F46E5" />
                </View>
                <View>
                  <Text style={styles.headerTitle}>NexorCRM Assistant</Text>
                  <Text style={styles.headerSubtitle}>
                    {assistant.thinking ? 'typing...' : 'Ask me how anything here works'}
                  </Text>
                </View>
              </View>
              <View style={styles.headerRight}>
                <TouchableOpacity 
                  style={styles.iconBtn} 
                  onPress={() => {
                    setShowHistory(!showHistory);
                    assistant.refreshConversations();
                  }}
                >
                  <Feather name="message-circle" size={18} color="#64748B" />
                </TouchableOpacity>
                <TouchableOpacity 
                  style={styles.iconBtn} 
                  onPress={() => {
                    assistant.startNew();
                    setShowHistory(false);
                  }}
                >
                  <Feather name="plus" size={18} color="#64748B" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.iconBtn} onPress={() => setOpen(false)}>
                  <Feather name="x" size={18} color="#64748B" />
                </TouchableOpacity>
              </View>
            </View>

            {/* Content Area */}
            <View style={styles.body}>
              {showHistory ? (
                <FlatList
                  data={assistant.conversations}
                  keyExtractor={item => item.id}
                  ListEmptyComponent={<Text style={styles.emptyText}>No past conversations yet.</Text>}
                  contentContainerStyle={{ padding: 16 }}
                  renderItem={({ item }) => (
                    <TouchableOpacity 
                      style={[styles.historyItem, item.id === assistant.conversationId && styles.historyItemActive]}
                      onPress={() => {
                        assistant.openConversation(item.id);
                        setShowHistory(false);
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.historyTitle} numberOfLines={1}>{item.title || 'Conversation'}</Text>
                        <Text style={styles.historyPreview} numberOfLines={1}>{item.preview || 'No messages'}</Text>
                      </View>
                      <TouchableOpacity 
                        style={styles.historyDelBtn}
                        onPress={() => assistant.removeConversation(item.id)}
                      >
                        <Feather name="trash-2" size={16} color="#EF4444" />
                      </TouchableOpacity>
                    </TouchableOpacity>
                  )}
                />
              ) : (
                <FlatList
                  data={assistant.messages}
                  keyExtractor={item => item.id}
                  renderItem={renderMessage}
                  contentContainerStyle={styles.chatList}
                  inverted={false}
                  ref={flatListRef}
                  onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
                  ListEmptyComponent={
                    <View style={styles.welcomeWrap}>
                      <View style={styles.bigIconCircle}>
                        <Feather name="zap" size={24} color="#4F46E5" />
                      </View>
                      <Text style={styles.welcomeTitle}>Ask me about NexorCRM</Text>
                      <Text style={styles.welcomeText}>
                        I know how this CRM works — creating leads, duplicates, statuses, site visits, notifications, users and the rest. I only answer questions about this application.
                      </Text>
                      <View style={styles.suggestionsWrap}>
                        {[
                          "How do I create a lead?",
                          "How are duplicate leads handled?",
                          "Who does a new lead get assigned to?",
                          "How do I change a lead status?",
                          "How do I import leads from a spreadsheet?",
                          "What notifications does the CRM send?"
                        ].map((sug, idx) => (
                          <TouchableOpacity 
                            key={idx} 
                            style={styles.suggestionPill}
                            onPress={() => assistant.send(sug)}
                          >
                            <Text style={styles.suggestionText}>{sug}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  }
                />
              )}
            </View>

            {/* Error Area */}
            {!!assistant.error && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{assistant.error}</Text>
              </View>
            )}

            {/* Input Area */}
            <View style={styles.inputArea}>
              <TextInput
                style={styles.input}
                placeholder="Ask a question..."
                placeholderTextColor="#94A3B8"
                value={assistant.input}
                onChangeText={assistant.setInput}
                onSubmitEditing={handleSend}
                editable={!assistant.thinking}
              />
              <TouchableOpacity 
                style={[styles.sendBtn, (!assistant.input.trim() || assistant.thinking) && styles.sendBtnDisabled]}
                onPress={handleSend}
                disabled={!assistant.input.trim() || assistant.thinking}
              >
                {assistant.thinking ? (
                  <ActivityIndicator size="small" color="#64748B" />
                ) : (
                  <Feather name="send" size={16} color="#64748B" />
                )}
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    bottom: 90,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#4F46E5', // Brand color
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 6,
    zIndex: 9999,
  },
  modalSafeArea: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: '#F8FAFC',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    height: '85%',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0F172A',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#64748B',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconBtn: {
    padding: 8,
  },
  body: {
    flex: 1,
  },
  chatList: {
    padding: 16,
    paddingBottom: 32,
  },
  welcomeWrap: {
    alignItems: 'center',
    marginTop: 40,
    paddingHorizontal: 24,
  },
  bigIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  welcomeTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 8,
  },
  welcomeText: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  suggestionsWrap: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: 12,
  },
  suggestionPill: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#FFF',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  suggestionText: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '500',
  },
  msgWrapper: {
    flexDirection: 'row',
    marginBottom: 16,
    alignItems: 'flex-end',
  },
  msgWrapperUser: {
    justifyContent: 'flex-end',
  },
  msgWrapperBot: {
    justifyContent: 'flex-start',
  },
  botAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  msgBubble: {
    maxWidth: '80%',
    padding: 12,
    borderRadius: 12,
  },
  msgUser: {
    backgroundColor: '#EEF2FF',
    borderBottomRightRadius: 4,
  },
  msgBot: {
    backgroundColor: '#FFF',
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  msgPending: {
    opacity: 0.7,
  },
  msgText: {
    fontSize: 14,
    lineHeight: 20,
  },
  msgTextUser: {
    color: '#3730A3', // Darker purple text
  },
  msgTextBot: {
    color: '#334155',
  },
  stepsContainer: {
    marginTop: 12,
    gap: 8,
  },
  stepRow: {
    flexDirection: 'row',
    gap: 8,
  },
  stepNum: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4F46E5',
    width: 16,
  },
  stepText: {
    fontSize: 13,
    color: '#475569',
    flex: 1,
  },
  inputArea: {
    flexDirection: 'row',
    padding: 12,
    paddingBottom: Platform.OS === 'ios' ? 24 : 12,
    backgroundColor: '#FFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    alignItems: 'center',
    gap: 8,
  },
  input: {
    flex: 1,
    height: 40,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 20,
    paddingHorizontal: 16,
    color: '#0F172A',
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    opacity: 0.5,
  },
  errorBox: {
    padding: 12,
    backgroundColor: '#FEF2F2',
    borderTopWidth: 1,
    borderTopColor: '#FCA5A5',
  },
  errorText: {
    color: '#DC2626',
    fontSize: 13,
    textAlign: 'center',
  },
  
  // History list
  historyItem: {
    padding: 16,
    backgroundColor: '#FFF',
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    flexDirection: 'row',
    alignItems: 'center',
  },
  historyItemActive: {
    borderColor: '#4F46E5',
    backgroundColor: '#F5F3FF',
  },
  historyTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0F172A',
    marginBottom: 4,
  },
  historyPreview: {
    fontSize: 13,
    color: '#64748B',
  },
  historyDelBtn: {
    padding: 8,
  },
  emptyText: {
    textAlign: 'center',
    color: '#64748B',
    marginTop: 32,
  }
});
