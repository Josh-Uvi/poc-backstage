import { makeStyles } from '@material-ui/core/styles';
import { Box, Typography, Avatar } from '@material-ui/core';
import { Message } from './types';

const useStyles = makeStyles(theme => ({
  messageContainer: {
    display: 'flex',
    marginBottom: theme.spacing(2),
    alignItems: 'flex-start',
    gap: theme.spacing(1.5),
  },
  userMessage: {
    flexDirection: 'row-reverse',
  },
  avatar: {
    width: 32,
    height: 32,
    fontSize: '0.85rem',
    flexShrink: 0,
  },
  userAvatar: {
    backgroundColor: theme.palette.primary.main,
    color: theme.palette.primary.contrastText,
  },
  assistantAvatar: {
    backgroundColor: theme.palette.secondary.main,
    color: theme.palette.secondary.contrastText,
  },
  bubble: {
    padding: theme.spacing(1.25, 2),
    borderRadius: 18,
    wordBreak: 'break-word',
    lineHeight: 1.5,
    boxShadow: theme.shadows[1],
  },
  userBubble: {
    backgroundColor: theme.palette.primary.main,
    color: theme.palette.primary.contrastText,
    borderBottomRightRadius: 4,
  },
  assistantBubble: {
    backgroundColor: theme.palette.background.paper,
    color: theme.palette.text.primary,
    border: `1px solid ${theme.palette.divider}`,
    borderBottomLeftRadius: 4,
  },
  timestamp: {
    fontSize: '0.7rem',
    marginTop: theme.spacing(0.5),
    color: theme.palette.text.hint,
  },
  timestampUser: {
    textAlign: 'right',
  },
}));

interface ChatMessageProps {
  message: Message;
  userProfile?: { displayName?: string; picture?: string };
}

export const ChatMessage = ({ message, userProfile }: ChatMessageProps): React.ReactElement => {
  const classes = useStyles();
  const isUser = message.sender === 'user';

  const userInitials = userProfile?.displayName
    ? userProfile.displayName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : '?';

  return (
    <Box className={`${classes.messageContainer} ${isUser ? classes.userMessage : ''}`}>
      <Avatar
        className={`${classes.avatar} ${isUser ? classes.userAvatar : classes.assistantAvatar}`}
        src={isUser ? userProfile?.picture : undefined}
      >
        {isUser ? userInitials : 'AI'}
      </Avatar>
      <Box style={{ maxWidth: '72%' }}>
        <Box className={`${classes.bubble} ${isUser ? classes.userBubble : classes.assistantBubble}`}>
          <Typography variant="body2">{message.content}</Typography>
        </Box>
        <Typography
          variant="caption"
          className={`${classes.timestamp} ${isUser ? classes.timestampUser : ''}`}
          display="block"
        >
          {new Date(message.timestamp).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </Typography>
      </Box>
    </Box>
  );
};
