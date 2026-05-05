import React from 'react';
import { makeStyles } from '@material-ui/core/styles';
import {
  Box,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Divider,
  IconButton,
  Paper,
  Typography,
  Tooltip,
} from '@material-ui/core';
import DeleteIcon from '@material-ui/icons/Delete';
import AddIcon from '@material-ui/icons/Add';
import ChatIcon from '@material-ui/icons/Chat';
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
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottom: `1px solid ${theme.palette.divider}`,
  },
  headerTitle: {
    fontWeight: 600,
  },
  newChatButton: {
    color: theme.palette.primary.main,
  },
  conversationList: {
    flex: 1,
    overflowY: 'auto',
    padding: theme.spacing(1),
    '&::-webkit-scrollbar': {
      width: '6px',
    },
    '&::-webkit-scrollbar-track': {
      background: 'transparent',
    },
    '&::-webkit-scrollbar-thumb': {
      background: theme.palette.divider,
      borderRadius: '3px',
    },
  },
  listItem: {
    marginBottom: theme.spacing(0.5),
    borderRadius: theme.spacing(1),
    transition: 'all 0.2s ease',
    '&:hover': {
      backgroundColor: theme.palette.action.hover,
    },
  },
  activeListItem: {
    backgroundColor: theme.palette.action.selected,
    '&:hover': {
      backgroundColor: theme.palette.action.selected,
    },
  },
  listItemText: {
    '& .MuiListItemText-primary': {
      fontSize: '0.9rem',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    },
    '& .MuiListItemText-secondary': {
      fontSize: '0.75rem',
    },
  },
  deleteButton: {
    visibility: 'hidden',
  },
  listItemHover: {
    '&:hover $deleteButton': {
      visibility: 'visible',
    },
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing(3),
    textAlign: 'center',
    color: theme.palette.text.secondary,
  },
  emptyIcon: {
    fontSize: '3rem',
    marginBottom: theme.spacing(1),
    opacity: 0.3,
  },
}));

interface ChatSidebarProps {
  conversations: Conversation[];
  currentConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onNewConversation: () => void;
  onDeleteConversation: (id: string) => void;
}

export const ChatSidebar = ({
  conversations,
  currentConversationId,
  onSelectConversation,
  onNewConversation,
  onDeleteConversation,
}: ChatSidebarProps): React.ReactElement => {
  const classes = useStyles();

  const formatDate = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - new Date(date).getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return new Date(date).toLocaleDateString();
  };

  return (
    <Paper className={classes.sidebarContainer} elevation={0} square>
      <Box className={classes.header}>
        <Typography variant="h6" className={classes.headerTitle}>
          Conversations
        </Typography>
        <Tooltip title="New conversation">
          <IconButton
            size="small"
            onClick={onNewConversation}
            className={classes.newChatButton}
          >
            <AddIcon />
          </IconButton>
        </Tooltip>
      </Box>

      {conversations.length === 0 ? (
        <Box className={classes.emptyState}>
          <ChatIcon className={classes.emptyIcon} />
          <Typography variant="body2">No conversations yet</Typography>
          <Typography variant="caption">
            Start a new conversation to begin
          </Typography>
        </Box>
      ) : (
        <List className={classes.conversationList} dense>
          {conversations.map((conv, index) => (
            <React.Fragment key={conv.id}>
              <ListItem
                button
                onClick={() => onSelectConversation(conv.id)}
                className={`${classes.listItem} ${
                  classes.listItemHover
                } ${
                  currentConversationId === conv.id ? classes.activeListItem : ''
                }`}
              >
                <ListItemIcon>
                  <ChatIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText
                  primary={conv.title}
                  secondary={formatDate(conv.updatedAt)}
                  className={classes.listItemText}
                />
                <Tooltip title="Delete conversation">
                  <IconButton
                    edge="end"
                    size="small"
                    className={classes.deleteButton}
                    onClick={e => {
                      e.stopPropagation();
                      onDeleteConversation(conv.id);
                    }}
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </ListItem>
              {index < conversations.length - 1 && (
                <Divider variant="inset" component="li" />
              )}
            </React.Fragment>
          ))}
        </List>
      )}
    </Paper>
  );
};
