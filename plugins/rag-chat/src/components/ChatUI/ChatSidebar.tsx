import { useState, useMemo, Fragment, KeyboardEvent } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import {
  Box,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  IconButton,
  Typography,
  Divider,
  Tooltip,
  Paper,
  Input,
  TextField,
  InputAdornment,
} from '@material-ui/core';
import ChatIcon from '@material-ui/icons/Chat';
import DeleteIcon from '@material-ui/icons/Delete';
import AddIcon from '@material-ui/icons/Add';
import SearchIcon from '@material-ui/icons/Search';
import ClearIcon from '@material-ui/icons/Clear';
import ChevronLeftIcon from '@material-ui/icons/ChevronLeft';
import ChevronRightIcon from '@material-ui/icons/ChevronRight';
import SettingsIcon from '@material-ui/icons/Settings';
import { Conversation } from './types';

const useStyles = makeStyles(theme => ({
  sidebarContainer: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: theme.palette.background.paper,
    borderRight: `1px solid ${theme.palette.divider}`,
  },
  header: {
    padding: theme.spacing(2),
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottom: `1px solid ${theme.palette.divider}`,
  },
  headerCollapsed: {
    padding: theme.spacing(2, 1),
    flexDirection: 'column',
    gap: theme.spacing(1),
  },
  headerTitle: {
    fontWeight: 700,
    fontSize: '0.9rem',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: theme.palette.text.secondary,
  },
  newChatButton: {
    backgroundColor: theme.palette.primary.main,
    color: theme.palette.primary.contrastText,
    '&:hover': {
      backgroundColor: theme.palette.primary.dark,
    },
  },
  searchContainer: {
    padding: theme.spacing(1.5, 2),
  },
  searchContainerCollapsed: {
    display: 'none',
  },
  conversationList: {
    flex: 1,
    overflowY: 'auto',
    padding: theme.spacing(1),
    '&::-webkit-scrollbar': {
      width: '4px',
    },
    '&::-webkit-scrollbar-track': {
      background: 'transparent',
    },
    '&::-webkit-scrollbar-thumb': {
      background: theme.palette.divider,
      borderRadius: '2px',
    },
  },
  listItem: {
    borderRadius: theme.shape.borderRadius,
    marginBottom: theme.spacing(0.5),
    padding: theme.spacing(1, 1.5),
    transition: 'all 0.2s ease',
    '&:hover': {
      backgroundColor: theme.palette.action.hover,
    },
  },
  listItemCollapsed: {
    padding: theme.spacing(1),
    justifyContent: 'center',
  },
  activeListItem: {
    backgroundColor: `${theme.palette.primary.main}15 !important`,
    color: theme.palette.primary.main,
    '& $listItemIcon': {
      color: theme.palette.primary.main,
    },
  },
  activeListItemCollapsed: {
    backgroundColor: `${theme.palette.primary.main}15 !important`,
  },
  listItemIcon: {
    minWidth: 40,
    color: theme.palette.text.secondary,
  },
  listItemIconCollapsed: {
    minWidth: 0,
  },
  listItemText: {
    margin: 0,
  },
  listItemTextCollapsed: {
    display: 'none',
  },
  listItemTextPrimary: {
    fontSize: '0.875rem',
    fontWeight: 500,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  deleteButton: {
    opacity: 0,
    transition: 'opacity 0.2s ease',
    padding: 4,
  },
  deleteButtonCollapsed: {
    display: 'none',
  },
  listItemHover: {
    '&:hover $deleteButton': {
      opacity: 1,
    },
  },
  footer: {
    padding: theme.spacing(1),
    borderTop: `1px solid ${theme.palette.divider}`,
    display: 'flex',
    justifyContent: 'center',
  },
  footerCollapsed: {
    padding: theme.spacing(1, 0),
  },
  emptyState: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing(4),
    textAlign: 'center',
    color: theme.palette.text.hint,
  },
  emptyStateCollapsed: {
    display: 'none',
  },
  emptyIcon: {
    fontSize: '2rem',
    marginBottom: theme.spacing(1),
    opacity: 0.5,
  },
  settingsButton: {
    color: theme.palette.text.secondary,
  },
}));

interface ChatSidebarProps {
  conversations: Conversation[];
  currentConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onNewConversation: () => void;
  onDeleteConversation: (id: string) => void;
  onOpenSettings: () => void;
  onRenameConversation: (id: string, newTitle: string) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

export const ChatSidebar = ({
  conversations,
  currentConversationId,
  onSelectConversation,
  onNewConversation,
  onDeleteConversation,
  onOpenSettings,
  onRenameConversation,
  isCollapsed,
  onToggleCollapse,
}: ChatSidebarProps): React.ReactElement => {
  const classes = useStyles();
  const [searchQuery, setSearchQuery] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renamingValue, setRenamingValue] = useState('');

  const filteredConversations = useMemo(() => {
    return conversations.filter(conv =>
      conv.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      conv.messages.some(m => m.content.toLowerCase().includes(searchQuery.toLowerCase()))
    );
  }, [conversations, searchQuery]);

  const formatDate = (date: Date | string) => {
    const d = new Date(date);
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const handleStartRename = (conv: Conversation) => {
    setRenamingId(conv.id);
    setRenamingValue(conv.title);
  };

  const handleSaveRename = () => {
    if (renamingId && renamingValue.trim()) {
      onRenameConversation(renamingId, renamingValue.trim());
    }
    setRenamingId(null);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveRename();
    } else if (e.key === 'Escape') {
      setRenamingId(null);
    }
  };

  return (
    <Paper className={classes.sidebarContainer} elevation={0} square>
      <Box className={`${classes.header} ${isCollapsed ? classes.headerCollapsed : ''}`}>
        {!isCollapsed && (
          <Typography variant="h6" className={classes.headerTitle}>
            Conversations
          </Typography>
        )}
        <Box style={{ display: 'flex', gap: 4, flexDirection: isCollapsed ? 'column' : 'row' }}>
          <Tooltip title="New conversation">
            <IconButton
              size="small"
              onClick={onNewConversation}
              className={classes.newChatButton}
              aria-label="New conversation"
            >
              <AddIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Settings">
            <IconButton
              size="small"
              className={classes.settingsButton}
              onClick={onOpenSettings}
              aria-label="Settings"
            >
              <SettingsIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {conversations.length > 0 && !isCollapsed && (
        <Box className={classes.searchContainer}>
          <TextField
            fullWidth
            size="small"
            variant="outlined"
            placeholder="Search chats..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            inputProps={{
              'aria-label': 'Search conversations',
            }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" style={{ opacity: 0.5 }} />
                </InputAdornment>
              ),
              endAdornment: searchQuery && (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={() => setSearchQuery('')} aria-label="Clear search">
                    <ClearIcon fontSize="small" />
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />
        </Box>
      )}

      {conversations.length === 0 && (
        <Box className={`${classes.emptyState} ${isCollapsed ? classes.emptyStateCollapsed : ''}`}>
          <ChatIcon className={classes.emptyIcon} />
          <Typography variant="body2">No conversations yet</Typography>
          <Typography variant="caption">
            Start a new conversation to begin
          </Typography>
        </Box>
      )}
      
      {conversations.length > 0 && filteredConversations.length === 0 && (
        <Box className={`${classes.emptyState} ${isCollapsed ? classes.emptyStateCollapsed : ''}`}>
          <SearchIcon className={classes.emptyIcon} />
          <Typography variant="body2">No matches found</Typography>
          <Typography variant="caption">
            Try a different search term
          </Typography>
        </Box>
      )}

      {conversations.length > 0 && filteredConversations.length > 0 && (
        <List className={classes.conversationList} dense>
          {filteredConversations.map((conv, index) => (
            <Fragment key={conv.id}>
              <ListItem
                button
                onClick={() => onSelectConversation(conv.id)}
                className={`${classes.listItem} ${classes.listItemHover} ${
                  isCollapsed ? classes.listItemCollapsed : ''
                } ${currentConversationId === conv.id ? classes.activeListItem : ''} ${
                  currentConversationId === conv.id && isCollapsed ? classes.activeListItemCollapsed : ''
                }`}
                aria-label={`Conversation: ${conv.title}`}
              >
                <ListItemIcon className={`${classes.listItemIcon} ${isCollapsed ? classes.listItemIconCollapsed : ''}`}>
                  <ChatIcon fontSize="small" />
                </ListItemIcon>
                {renamingId === conv.id ? (
                  <Input
                    inputRef={input => input?.focus()}
                    fullWidth
                    value={renamingValue}
                    onChange={e => setRenamingValue(e.target.value)}
                    onBlur={handleSaveRename}
                    onKeyDown={handleKeyDown}
                    onClick={e => e.stopPropagation()}
                    className={classes.listItemText}
                    inputProps={{
                      'aria-label': 'Rename conversation',
                    }}
                  />
                ) : (
                  <ListItemText
                    primary={conv.title}
                    secondary={formatDate(conv.updatedAt)}
                    className={`${classes.listItemText} ${isCollapsed ? classes.listItemTextCollapsed : ''}`}
                    primaryTypographyProps={{ className: classes.listItemTextPrimary }}
                    onDoubleClick={() => handleStartRename(conv)}
                  />
                )}
                {!isCollapsed && (
                  <Tooltip title="Delete conversation">
                    <IconButton
                      edge="end"
                      size="small"
                      className={classes.deleteButton}
                      aria-label={`Delete conversation: ${conv.title}`}
                      onClick={e => {
                        e.stopPropagation();
                        onDeleteConversation(conv.id);
                      }}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                )}
              </ListItem>
              {index < filteredConversations.length - 1 && !isCollapsed && (
                <Divider variant="inset" component="li" />
              )}
            </Fragment>
          ))}
        </List>
      )}

      <Box className={`${classes.footer} ${isCollapsed ? classes.footerCollapsed : ''}`}>
        <Tooltip title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}>
          <IconButton size="small" onClick={onToggleCollapse} aria-label="Toggle sidebar">
            {isCollapsed ? <ChevronRightIcon /> : <ChevronLeftIcon />}
          </IconButton>
        </Tooltip>
      </Box>
    </Paper>
  );
};
