import { useState, useEffect, useRef } from 'react';
import { useApi, identityApiRef, discoveryApiRef, fetchApiRef } from '@backstage/core-plugin-api';
import { makeStyles } from '@material-ui/core/styles';
import {
  Box,
  Paper,
  CircularProgress,
  Snackbar,
  IconButton,
  Tooltip,
  Chip,
} from '@material-ui/core';
import { Alert } from '@material-ui/lab';
import {
  Page,
  Header,
  Content,
} from '@backstage/core-components';
import SettingsIcon from '@material-ui/icons/Settings';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';
import { ChatSidebar } from './ChatSidebar';
import { SettingsPanel, SettingsState } from './SettingsPanel';
import {
  Conversation,
  Message,
  RagChatModel,
  RagChatSource,
  UploadedSourceRef,
} from './types';
import { ragChatConfigApiRef } from '../../api';

const useStyles = makeStyles(theme => ({
  root: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  content: {
    flex: 1,
    display: 'flex',
    overflow: 'hidden',
    minHeight: 0,
  },
  sidebarContainer: {
    width: '300px',
    borderRight: `1px solid ${theme.palette.divider}`,
    [theme.breakpoints.down('sm')]: {
      width: '250px',
    },
  },
  mainContainer: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    backgroundColor: theme.palette.background.default,
  },
  chatContainer: {
    flex: 1,
    overflowY: 'auto',
    padding: theme.spacing(2),
    display: 'flex',
    flexDirection: 'column',
    '&::-webkit-scrollbar': {
      width: '8px',
    },
    '&::-webkit-scrollbar-track': {
      background: 'transparent',
    },
    '&::-webkit-scrollbar-thumb': {
      background: theme.palette.divider,
      borderRadius: '4px',
    },
  },
  messagesWrapper: {
    display: 'flex',
    flexDirection: 'column',
    marginTop: 'auto',
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    textAlign: 'center',
    opacity: 0.6,
  },
  header: {
    backgroundColor: theme.palette.background.paper,
    borderBottom: `1px solid ${theme.palette.divider}`,
    padding: theme.spacing(2),
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontWeight: 600,
  },
  settingsButton: {
    color: theme.palette.text.secondary,
  },
  loadingContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing(2),
  },
  sourceRefs: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: theme.spacing(1),
    padding: theme.spacing(0, 2, 1),
    borderBottom: `1px solid ${theme.palette.divider}`,
    backgroundColor: theme.palette.background.paper,
  },
}));

interface ChatUIState {
  conversations: Conversation[];
  currentConversationId: string | null;
  showSettings: boolean;
  loading: boolean;
  snackbar: {
    open: boolean;
    message: string;
    severity: 'success' | 'error' | 'info' | 'warning';
  };
}

export const ChatInterface = (): React.ReactElement => {
  const classes = useStyles();
  const identityApi = useApi(identityApiRef);
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const ragChatConfigApi = useApi(ragChatConfigApiRef);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [userProfile, setUserProfile] = useState<{ displayName?: string; picture?: string }>({});
  const [models, setModels] = useState<RagChatModel[]>([]);
  const [sources, setSources] = useState<RagChatSource[]>([]);
  const [activeSettings, setActiveSettings] = useState<SettingsState | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    identityApi.getProfileInfo().then(profile => setUserProfile(profile));
  }, [identityApi]);

  useEffect(() => {
    const config = ragChatConfigApi.getConfig();
    setModels(config.models);
    setSources(config.sources);
    // Load persisted settings or initialise from config defaults
    const saved = localStorage.getItem('chatSettings');
    if (saved) {
      setActiveSettings(JSON.parse(saved));
    } else {
      setActiveSettings({
        soundEnabled: true,
        autoScroll: true,
        modelId: config.defaultModelId ?? config.models[0]?.id ?? '',
        temperature: 0.7,
        activeSourceIds: config.defaultSourceIds ?? config.sources.map(s => s.id),
      });
    }
  }, [ragChatConfigApi]);
  const [state, setState] = useState<ChatUIState>(() => {
    const saved = localStorage.getItem('chatState');
    return saved
      ? JSON.parse(saved)
      : {
          conversations: [],
          currentConversationId: null,
          showSettings: false,
          loading: false,
          snackbar: {
            open: false,
            message: '',
            severity: 'info' as const,
          },
        };
  });

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [state.conversations, state.currentConversationId]);

  // Save state to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('chatState', JSON.stringify(state));
  }, [state]);

  const showSnackbar = (
    message: string,
    severity: 'success' | 'error' | 'info' | 'warning' = 'info',
  ) => {
    setState(prev => ({
      ...prev,
      snackbar: {
        open: true,
        message,
        severity,
      },
    }));
  };

  const currentConversation = state.conversations.find(
    c => c.id === state.currentConversationId,
  );

  const handleNewConversation = () => {
    const newConversation: Conversation = {
      id: `conv_${Date.now()}`,
      title: 'New Conversation',
      messages: [],
      sourceRefs: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    setState(prev => ({
      ...prev,
      conversations: [newConversation, ...prev.conversations],
      currentConversationId: newConversation.id,
    }));

    showSnackbar('New conversation created', 'success');
  };

  const ensureConversation = async (fallbackTitle: string): Promise<string> => {
    let conversation = state.conversations.find(c => c.id === state.currentConversationId);

    if (!conversation) {
      conversation = {
        id: `conv_${Date.now()}`,
        title: fallbackTitle,
        messages: [],
        sourceRefs: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      setState(prev => ({
        ...prev,
        conversations: [conversation!, ...prev.conversations],
        currentConversationId: conversation!.id,
      }));
    }

    const baseUrl = await discoveryApi.getBaseUrl('rag-chat');
    const response = await fetchApi.fetch(`${baseUrl}/conversations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: conversation.id,
        title: conversation.title || fallbackTitle,
        messages: conversation.messages.map(message => ({
          id: message.id,
          role: message.sender,
          content: message.content,
          timestamp: new Date(message.timestamp).toISOString(),
        })),
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to persist conversation: ${response.status}`);
    }

    return conversation.id;
  };

  const handleAttachFile = async (file: File) => {
    setUploading(true);

    try {
      const conversationId = await ensureConversation('New Conversation');
      const baseUrl = await discoveryApi.getBaseUrl('rag-chat');
      const formData = new FormData();
      formData.append('file', file);
      formData.append('conversationId', conversationId);

      const response = await fetchApi.fetch(`${baseUrl}/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.status}`);
      }

      const data = await response.json();
      const source: UploadedSourceRef = {
        ...data.source,
        createdAt: new Date(data.source.createdAt),
      };

      setState(prev => ({
        ...prev,
        conversations: prev.conversations.map(conv =>
          conv.id !== conversationId
            ? conv
            : {
                ...conv,
                sourceRefs: [...(conv.sourceRefs ?? []), source],
                updatedAt: new Date(),
              },
        ),
      }));

      showSnackbar(`Uploaded ${file.name}`, 'success');
    } catch (e: any) {
      showSnackbar(e?.message ?? `Failed to upload ${file.name}`, 'error');
      throw e;
    } finally {
      setUploading(false);
    }
  };

  const handleSendMessage = async (content: string) => {
    const initialConversation = state.conversations.find(
      c => c.id === state.currentConversationId,
    );
    const convId = await ensureConversation(
      initialConversation?.messages.length
        ? initialConversation.title
        : content.trim().slice(0, 40) + (content.trim().length > 40 ? '\u2026' : ''),
    );

    const userMessage: Message = {
      id: `msg_${Date.now()}_user`,
      content,
      sender: 'user',
      timestamp: new Date(),
    };

    const assistantMessageId = `msg_${Date.now()}_assistant`;
    const assistantPlaceholder: Message = {
      id: assistantMessageId,
      content: '',
      sender: 'assistant',
      timestamp: new Date(),
      streaming: true,
    };

    setState(prev => ({
      ...prev,
      conversations: prev.conversations.map(conv => {
        if (conv.id !== convId) return conv;
        const isFirstMessage = conv.messages.length === 0;
        return {
          ...conv,
          title: isFirstMessage
            ? content.trim().slice(0, 40) + (content.trim().length > 40 ? '\u2026' : '')
            : conv.title,
          messages: [...conv.messages, userMessage, assistantPlaceholder],
          updatedAt: new Date(),
        };
      }),
      loading: true,
    }));

    try {
      const baseUrl = await discoveryApi.getBaseUrl('rag-chat');
      const abort = new AbortController();
      abortRef.current = abort;

      const response = await fetchApi.fetch(`${baseUrl}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: content,
          modelId: activeSettings?.modelId ?? '',
          sourceIds: activeSettings?.activeSourceIds ?? [],
          conversationId: convId,
          temperature: activeSettings?.temperature ?? 0.7,
        }),
        signal: abort.signal,
      });

      if (!response.ok || !response.body) {
        throw new Error(`Request failed: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      let chunk = await reader.read();
      while (!chunk.done) {
        const { value } = chunk;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const event = JSON.parse(line.slice(6));

          if (event.type === 'token') {
            setState(prev => ({
              ...prev,
              conversations: prev.conversations.map(conv =>
                conv.id !== convId ? conv : {
                  ...conv,
                  messages: conv.messages.map(msg =>
                    msg.id !== assistantMessageId ? msg : {
                      ...msg,
                      content: msg.content + event.token,
                    },
                  ),
                },
              ),
            }));
          } else if (event.type === 'done') {
            setState(prev => ({
              ...prev,
              loading: false,
              conversations: prev.conversations.map(conv =>
                conv.id !== convId ? conv : {
                  ...conv,
                  messages: conv.messages.map(msg =>
                    msg.id !== assistantMessageId ? msg : { ...msg, streaming: false },
                  ),
                },
              ),
            }));
          } else if (event.type === 'error') {
            throw new Error(event.error);
          }
        }

        chunk = await reader.read();
      }
    } catch (e: any) {
      if (e?.name === 'AbortError') return;
      showSnackbar(e?.message ?? 'Failed to get response', 'error');
      // Remove the placeholder on error
      setState(prev => ({
        ...prev,
        loading: false,
        conversations: prev.conversations.map(conv =>
          conv.id !== convId ? conv : {
            ...conv,
            messages: conv.messages.filter(msg => msg.id !== assistantMessageId),
          },
        ),
      }));
    }
  };

  const handleSelectConversation = (id: string) => {
    setState(prev => ({
      ...prev,
      currentConversationId: id,
    }));
  };

  const handleDeleteConversation = (id: string) => {
    setState(prev => ({
      ...prev,
      conversations: prev.conversations.filter(c => c.id !== id),
      currentConversationId:
        prev.currentConversationId === id ? null : prev.currentConversationId,
    }));
    showSnackbar('Conversation deleted', 'info');
  };

  const handleSettingsClose = () => {
    setState(prev => ({
      ...prev,
      showSettings: false,
    }));
  };

  const handleCloseSnackbar = () => {
    setState(prev => ({
      ...prev,
      snackbar: {
        ...prev.snackbar,
        open: false,
      },
    }));
  };

  return (
    <Page themeId="tool">
      <Header title="RAG Chat" subtitle="AI-Powered Conversation Assistant" />
      <Content>
        <Box className={classes.root}>
          <Box className={classes.content}>
            {/* Sidebar */}
            <Paper className={classes.sidebarContainer} elevation={0} square>
              <ChatSidebar
                conversations={state.conversations}
                currentConversationId={state.currentConversationId}
                onSelectConversation={handleSelectConversation}
                onNewConversation={handleNewConversation}
                onDeleteConversation={handleDeleteConversation}
              />
            </Paper>

            {/* Main Chat Area */}
            <Box className={classes.mainContainer}>
              {/* Chat Header */}
              <Box className={classes.header}>
                <h2 className={classes.headerTitle}>
                  {currentConversation
                    ? currentConversation.title
                    : 'Start a conversation'}
                </h2>
                <Tooltip title="Settings">
                  <IconButton
                    size="small"
                    className={classes.settingsButton}
                    onClick={() =>
                      setState(prev => ({
                        ...prev,
                        showSettings: true,
                      }))
                    }
                  >
                    <SettingsIcon />
                  </IconButton>
                </Tooltip>
              </Box>

              {/* Chat Messages */}
              {!!currentConversation?.sourceRefs?.length && (
                <Box className={classes.sourceRefs}>
                  {currentConversation.sourceRefs.map(source => (
                    <Chip
                      key={source.id}
                      size="small"
                      label={source.fileName}
                      title={source.sourceId}
                    />
                  ))}
                </Box>
              )}
              <Box className={classes.chatContainer}>
                {!currentConversation || currentConversation.messages.length === 0 ? (
                  <Box className={classes.emptyState}>
                    <h3>Welcome to RAG Chat</h3>
                    <p>
                      {!currentConversation
                        ? 'Start a new conversation to begin'
                        : 'No messages yet. Type something to get started!'}
                    </p>
                  </Box>
                ) : (
                  <Box className={classes.messagesWrapper}>
                    {currentConversation.messages.map(msg => (
                      <ChatMessage key={msg.id} message={msg} userProfile={userProfile} />
                    ))}
                    {state.loading && (
                      <Box className={classes.loadingContainer}>
                        <CircularProgress size={24} />
                      </Box>
                    )}
                    <div ref={chatEndRef} />
                  </Box>
                )}
              </Box>

              {/* Chat Input */}
              <ChatInput
                onSendMessage={handleSendMessage}
                onAttachFile={handleAttachFile}
                disabled={state.loading || uploading}
              />
            </Box>
          </Box>
        </Box>

        {/* Settings Dialog */}
        <SettingsPanel
          open={state.showSettings}
          onClose={handleSettingsClose}
          onSave={settings => setActiveSettings(settings)}
          configModels={models}
          configSources={sources}
        />

        {/* Snackbar */}
        <Snackbar
          open={state.snackbar.open}
          autoHideDuration={3000}
          onClose={handleCloseSnackbar}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        >
          <Alert
            onClose={handleCloseSnackbar}
            severity={state.snackbar.severity}
          >
            {state.snackbar.message}
          </Alert>
        </Snackbar>
      </Content>
    </Page>
  );
};

