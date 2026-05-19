import { useState, useRef, KeyboardEvent } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import {
  Box,
  TextField,
  IconButton,
  Tooltip,
  Typography,
  Paper,
} from '@material-ui/core';
import SendIcon from '@material-ui/icons/Send';
import AttachFileIcon from '@material-ui/icons/AttachFile';
import CloseIcon from '@material-ui/icons/Close';
import DescriptionIcon from '@material-ui/icons/Description';

const useStyles = makeStyles(theme => ({
  inputContainer: {
    padding: theme.spacing(2),
    borderTop: `1px solid ${theme.palette.divider}`,
    backgroundColor: theme.palette.background.paper,
    display: 'flex',
    gap: theme.spacing(1),
    alignItems: 'flex-end',
  },
  textField: {
    flex: 1,
    '& .MuiOutlinedInput-root': {
      borderRadius: 12,
      backgroundColor: theme.palette.background.default,
      '& fieldset': {
        borderColor: theme.palette.divider,
      },
    },
  },
  button: {
    borderRadius: 8,
    padding: theme.spacing(1),
  },
  sendButton: {
    backgroundColor: theme.palette.primary.main,
    color: theme.palette.primary.contrastText,
    '&:hover': {
      backgroundColor: theme.palette.primary.dark,
    },
    '&.Mui-disabled': {
      backgroundColor: theme.palette.action.disabledBackground,
      color: theme.palette.action.disabled,
    },
  },
  hiddenInput: {
    display: 'none',
  },
  previewContainer: {
    display: 'flex',
    gap: theme.spacing(1),
    overflowX: 'auto',
    marginBottom: theme.spacing(1.5),
    paddingBottom: theme.spacing(0.5),
  },
  previewCard: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: theme.spacing(1),
    padding: theme.spacing(1),
    borderRadius: 8,
    border: `1px solid ${theme.palette.divider}`,
    backgroundColor: theme.palette.background.default,
    minWidth: 200,
    maxWidth: 240,
    position: 'relative',
    flexShrink: 0,
  },
  previewIcon: {
    color: theme.palette.text.secondary,
    marginTop: 2,
  },
  previewContent: {
    flex: 1,
    overflow: 'hidden',
  },
  previewTitle: {
    fontWeight: 600,
    fontSize: '0.8rem',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  previewText: {
    fontSize: '0.7rem',
    color: theme.palette.text.secondary,
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
    marginTop: 2,
    lineHeight: 1.2,
  },
  removeButton: {
    padding: 2,
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: theme.palette.background.paper,
    border: `1px solid ${theme.palette.divider}`,
    '&:hover': {
      backgroundColor: theme.palette.action.hover,
    },
  },
}));

interface ChatInputProps {
  onSendMessage: (content: string, files: File[]) => void;
  disabled?: boolean;
}

export interface PendingFile {
  id: string;
  file: File;
  preview: string;
}

export const ChatInput = ({
  onSendMessage,
  disabled,
}: ChatInputProps): React.ReactElement => {
  const classes = useStyles();
  const [input, setInput] = useState('');
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSend = () => {
    if ((input.trim() || pendingFiles.length > 0) && !disabled) {
      onSendMessage(input.trim(), pendingFiles.map(pf => pf.file));
      setInput('');
      setPendingFiles([]);
    }
  };

  const handleKeyPress = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        setPendingFiles(prev => [
          ...prev,
          {
            id: `file_${Date.now()}`,
            file,
            preview: text.trim().slice(0, 150) + (text.length > 150 ? '...' : ''),
          },
        ]);
      };
      // For binary files, the preview will be meaningless, but we restrict to TXT/MD/CSV in the accept attribute
      reader.readAsText(file);

      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemoveFile = (id: string) => {
    setPendingFiles(prev => prev.filter(pf => pf.id !== id));
  };

  return (
    <Box className={classes.inputContainer}>
      <Box style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {pendingFiles.length > 0 && (
          <Box className={classes.previewContainer}>
            {pendingFiles.map(pf => (
              <Paper key={pf.id} className={classes.previewCard} elevation={0}>
                <DescriptionIcon className={classes.previewIcon} fontSize="small" />
                <Box className={classes.previewContent}>
                  <Typography className={classes.previewTitle} title={pf.file.name}>
                    {pf.file.name}
                  </Typography>
                  <Typography className={classes.previewText}>
                    {pf.preview}
                  </Typography>
                </Box>
                <IconButton
                  size="small"
                  className={classes.removeButton}
                  onClick={() => handleRemoveFile(pf.id)}
                  disabled={disabled}
                >
                  <CloseIcon fontSize="inherit" />
                </IconButton>
              </Paper>
            ))}
          </Box>
        )}
        <Box style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            className={classes.hiddenInput}
            accept=".txt,.md,.csv,.json"
          />
          <Tooltip title="Attach document">
            <span>
              <IconButton
                onClick={() => fileInputRef.current?.click()}
                disabled={disabled}
                className={classes.button}
                aria-label="Attach file"
              >
                <AttachFileIcon />
              </IconButton>
            </span>
          </Tooltip>
          <TextField
            fullWidth
            multiline
            maxRows={4}
            placeholder="Type your message here... (Shift+Enter for new line)"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyPress}
            disabled={disabled}
            className={classes.textField}
            variant="outlined"
            size="small"
            inputProps={{
              'aria-label': 'type your message',
            }}
          />
          <Tooltip title="Send message">
            <span>
              <IconButton
                onClick={handleSend}
                disabled={(!input.trim() && pendingFiles.length === 0) || disabled}
                className={`${classes.button} ${classes.sendButton}`}
                aria-label="Send message"
              >
                <SendIcon />
              </IconButton>
            </span>
          </Tooltip>
        </Box>
      </Box>
    </Box>
  );
};
