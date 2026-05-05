import { makeStyles } from '@material-ui/core/styles';
import {
  Box,
  Typography,
  Avatar,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from '@material-ui/core';
import ExpandMoreIcon from '@material-ui/icons/ExpandMore';
import DescriptionIcon from '@material-ui/icons/Description';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { materialDark } from 'react-syntax-highlighter/dist/cjs/styles/prism';
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
  cursor: {
    display: 'inline-block',
    width: 2,
    height: '1em',
    backgroundColor: 'currentColor',
    marginLeft: 2,
    verticalAlign: 'text-bottom',
    animation: '$blink 1s step-end infinite',
  },
  markdown: {
    '& p': { margin: 0 },
    '& p + p': { marginTop: theme.spacing(1) },
    '& pre': { margin: theme.spacing(1, 0), borderRadius: 4, overflow: 'hidden' },
    '& code': { fontFamily: 'monospace' },
    '& ul, & ol': { paddingLeft: theme.spacing(2), margin: theme.spacing(1, 0) },
    '& a': { color: theme.palette.primary.main },
  },
  citationsContainer: {
    marginTop: theme.spacing(1),
    width: '100%',
  },
  citationCard: {
    backgroundColor: theme.palette.background.paper,
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: `${theme.shape.borderRadius}px !important`,
    marginBottom: theme.spacing(0.5),
    '&:before': {
      display: 'none',
    },
    boxShadow: 'none',
  },
  citationHeader: {
    minHeight: 'auto !important',
    padding: theme.spacing(0.5, 1.5),
    '& .MuiAccordionSummary-content': {
      margin: '8px 0 !important',
      display: 'flex',
      alignItems: 'center',
      gap: theme.spacing(1),
    },
  },
  citationTitle: {
    fontSize: '0.75rem',
    fontWeight: 600,
    color: theme.palette.text.secondary,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  citationContent: {
    padding: theme.spacing(1, 1.5),
    fontSize: '0.75rem',
    fontStyle: 'italic',
    color: theme.palette.text.secondary,
    backgroundColor: 'rgba(0, 0, 0, 0.02)',
    borderTop: `1px solid ${theme.palette.divider}`,
    whiteSpace: 'pre-wrap',
  },
  '@keyframes blink': {
    '0%, 100%': { opacity: 1 },
    '50%': { opacity: 0 },
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
          <Typography variant="body2" component="div" className={classes.markdown}>
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                code({ node, inline, className, children, ...props }) {
                  const match = /language-(\w+)/.exec(className || '');
                  return !inline && match ? (
                    <SyntaxHighlighter
                      style={materialDark as any}
                      language={match[1]}
                      PreTag="div"
                      {...props}
                    >
                      {String(children).replace(/\n$/, '')}
                    </SyntaxHighlighter>
                  ) : (
                    <code className={className} {...props}>
                      {children}
                    </code>
                  );
                },
              }}
            >
              {message.content}
            </ReactMarkdown>
            {message.streaming && <span className={classes.cursor} />}
          </Typography>
        </Box>

        {/* Citations */}
        {!isUser && message.citations && message.citations.length > 0 && (
          <Box className={classes.citationsContainer}>
            {message.citations.map((citation, index) => (
              <Accordion key={index} className={classes.citationCard}>
                <AccordionSummary
                  expandIcon={<ExpandMoreIcon fontSize="small" />}
                  className={classes.citationHeader}
                >
                  <DescriptionIcon fontSize="inherit" color="action" />
                  <Typography className={classes.citationTitle}>
                    Source {index + 1}: {citation.metadata.title || citation.metadata.ref || citation.metadata.sourceId}
                  </Typography>
                </AccordionSummary>
                <AccordionDetails className={classes.citationContent}>
                  {citation.text}
                </AccordionDetails>
              </Accordion>
            ))}
          </Box>
        )}

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
