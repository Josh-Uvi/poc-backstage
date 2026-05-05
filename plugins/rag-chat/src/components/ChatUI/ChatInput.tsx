import { useState, useRef, KeyboardEvent } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import {
  Box,
  TextField,
  IconButton,
  Tooltip,
  CircularProgress,
} from '@material-ui/core';
import SendIcon from '@material-ui/icons/Send';
import AttachFileIcon from '@material-ui/icons/AttachFile';

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
}));

interface ChatInputProps {
  onSendMessage: (content: string) => void;
  onAttachFile?: (file: File) => void;
  disabled?: boolean;
}

export const ChatInput = ({
  onSendMessage,
  onAttachFile,
  disabled,
}: ChatInputProps): React.ReactElement => {
  const classes = useStyles();
  const [input, setInput] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSend = () => {
    if (input.trim() && !disabled && !uploading) {
      onSendMessage(input.trim());
      setInput('');
    }
  };

  const handleKeyPress = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && onAttachFile) {
      setUploading(true);
      try {
        await onAttachFile(file);
      } finally {
        setUploading(false);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    }
  };

  return (
    <Box className={classes.inputContainer}>
      {onAttachFile && (
        <>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            className={classes.hiddenInput}
            accept=".pdf,.txt,.doc,.docx,.md"
          />
          <Tooltip title="Attach knowledge file">
            <IconButton
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled || uploading}
              className={classes.button}
              aria-label="Attach file"
            >
              {uploading ? <CircularProgress size={24} /> : <AttachFileIcon />}
            </IconButton>
          </Tooltip>
        </>
      )}
      <TextField
        fullWidth
        multiline
        maxRows={4}
        placeholder="Type your message here... (Shift+Enter for new line)"
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={handleKeyPress}
        disabled={disabled || uploading}
        className={classes.textField}
        variant="outlined"
        size="small"
        inputProps={{
          'aria-label': 'type your message',
        }}
      />
      <Tooltip title="Send message">
        <IconButton
          onClick={handleSend}
          disabled={!input.trim() || disabled || uploading}
          className={`${classes.button} ${classes.sendButton}`}
          aria-label="Send message"
        >
          <SendIcon />
        </IconButton>
      </Tooltip>
    </Box>
  );
};
