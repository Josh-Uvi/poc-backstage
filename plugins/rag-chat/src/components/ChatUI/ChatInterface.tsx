import { useState, useEffect, useRef } from 'react';
import { useApi, identityApiRef } from '@backstage/core-plugin-api';
import { makeStyles } from '@material-ui/core/styles';
import {
  Box,
  Paper,
  CircularProgress,
  Snackbar,
  IconButton,
  Tooltip,
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
import { Conversation, Message, RagChatModel, RagChatSource } from './types';
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
  const ragChatConfigApi = useApi(ragChatConfigApiRef);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [userProfile, setUserProfile] = useState<{ displayName?: string; picture?: string }>({});
  const [models, setModels] = useState<RagChatModel[]>([]);
  const [sources, setSources] = useState<RagChatSource[]>([]);
  const [activeSettings, setActiveSettings] = useState<SettingsState | null>(null);

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

  const handleSendMessage = async (content: string) => {
    if (!state.currentConversationId) {
      handleNewConversation();
      return;
    }

    // Add user message and set title from first message if still default
    const userMessage: Message = {
      id: `msg_${Date.now()}_user`,
      content,
      sender: 'user',
      timestamp: new Date(),
    };

    setState(prev => ({
      ...prev,
      conversations: prev.conversations.map(conv => {
        if (conv.id !== prev.currentConversationId) return conv;
        const isFirstMessage = conv.messages.length === 0;
        return {
          ...conv,
          title: isFirstMessage
            ? content.trim().slice(0, 40) + (content.trim().length > 40 ? '…' : '')
            : conv.title,
          messages: [...conv.messages, userMessage],
          updatedAt: new Date(),
        };
      }),
      loading: true,
    }));

    // Simulate assistant response
    setTimeout(() => {
      const userDefinedModels: RagChatModel[] = (() => { try { return JSON.parse(localStorage.getItem('ragChat.userModels') ?? '[]'); } catch { return []; } })();
      const userDefinedSources: RagChatSource[] = (() => { try { return JSON.parse(localStorage.getItem('ragChat.userSources') ?? '[]'); } catch { return []; } })();
      const allModels = [...models, ...userDefinedModels];
      const allSources = [...sources, ...userDefinedSources];
      const activeModel = allModels.find(m => m.id === activeSettings?.modelId);
      const activeSources = allSources.filter(s => activeSettings?.activeSourceIds.includes(s.id));
      const assistantMessage: Message = {
        id: `msg_${Date.now()}_assistant`,
        content: generateMockResponse(content, activeModel, activeSources),
        sender: 'assistant',
        timestamp: new Date(),
      };

      setState(prev => ({
        ...prev,
        conversations: prev.conversations.map(conv =>
          conv.id === prev.currentConversationId
            ? {
                ...conv,
                messages: [...conv.messages, assistantMessage],
                updatedAt: new Date(),
              }
            : conv,
        ),
        loading: false,
      }));
    }, 1000);
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
                onAttachFile={file => showSnackbar(`Attached: ${file.name}`, 'info')}
                disabled={state.loading}
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

// Mock response generator
function generateMockResponse(input: string, model?: RagChatModel, sources?: RagChatSource[]): string {
  const modelLabel = model ? `[${model.name}]` : '';
  const sourceLabel = sources?.length ? ` (sources: ${sources.map(s => s.name).join(', ')})` : '';
  const responses = [
    `${modelLabel} That's an interesting question. Let me help you with that.${sourceLabel}`,
    `${modelLabel} I understand what you're asking. Here's what I can help you with: ${input.substring(0, 20)}...${sourceLabel}`,
    `${modelLabel} Great! I'm analyzing your request now.${sourceLabel}`,
    `${modelLabel} Based on your input about "${input.substring(0, 15)}", I can provide insights.${sourceLabel}`,
    `${modelLabel} I see. That's a relevant topic. Let me provide more context.${sourceLabel}`,
  ];
  return responses[Math.floor(Math.random() * responses.length)];
}
