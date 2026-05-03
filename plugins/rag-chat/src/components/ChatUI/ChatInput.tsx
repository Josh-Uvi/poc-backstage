import { useState, useRef } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import {
  Box,
  TextField,
  IconButton,
  Paper,
  InputAdornment,
  Tooltip,
  Chip,
} from '@material-ui/core';
import SendIcon from '@material-ui/icons/Send';
import AttachFileIcon from '@material-ui/icons/AttachFile';
import CloseIcon from '@material-ui/icons/Close';

const useStyles = makeStyles(theme => ({
  inputContainer: {
    padding: theme.spacing(2),
    backgroundColor: theme.palette.background.paper,
    borderTop: `1px solid ${theme.palette.divider}`,
  },
  inputWrapper: {
    display: 'flex',
    gap: theme.spacing(1),
    alignItems: 'flex-end',
  },
  textField: {
    flex: 1,
  },
  sendButton: {
    color: theme.palette.primary.main,
    '&:hover': {
      backgroundColor: theme.palette.action.hover,
    },
    '&:disabled': {
      color: theme.palette.action.disabled,
    },
  },
  attachButton: {
    color: theme.palette.text.secondary,
    marginBottom: theme.spacing(0.5),
  },
  fileChip: {
    marginBottom: theme.spacing(1),
  },
  hiddenInput: {
    display: 'none',
  },
}));

interface ChatInputProps {
  onSendMessage: (message: string) => void;
  onAttachFile?: (file: File) => Promise<void> | void;
  disabled?: boolean;
}

export const ChatInput = ({
  onSendMessage,
  onAttachFile,
  disabled = false,
}: ChatInputProps): React.ReactElement => {
  const classes = useStyles();
  const [input, setInput] = useState('');
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSend = () => {
    if (input.trim()) {
      onSendMessage(input);
      setInput('');
      inputRef.current?.focus();
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAttachedFile(file);
      // Reset so the same file can be re-selected
      e.target.value = '';

      setUploading(true);
      Promise.resolve(onAttachFile?.(file))
        .finally(() => {
          setUploading(false);
          setAttachedFile(null);
        });
    }
  };

  return (
    <Paper className={classes.inputContainer} elevation={0} square>
      {attachedFile && (
        <Chip
          label={uploading ? `Uploading ${attachedFile.name}...` : attachedFile.name}
          onDelete={uploading ? undefined : () => setAttachedFile(null)}
          deleteIcon={uploading ? undefined : <CloseIcon />}
          size="small"
          className={classes.fileChip}
        />
      )}
      <Box className={classes.inputWrapper}>
        <input
          ref={fileInputRef}
          type="file"
          className={classes.hiddenInput}
          onChange={handleFileChange}
          disabled={disabled}
        />
        <Tooltip title="Attach file">
          <span>
            <IconButton
              size="small"
              className={classes.attachButton}
              disabled={disabled}
              onClick={() => fileInputRef.current?.click()}
            >
              <AttachFileIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <TextField
          inputRef={inputRef}
          fullWidth
          multiline
          maxRows={4}
          minRows={1}
          placeholder="Type your message here... (Shift+Enter for new line)"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyPress={handleKeyPress}
          disabled={disabled || uploading}
          className={classes.textField}
          variant="outlined"
          size="small"
          InputProps={{
            endAdornment: (
              <InputAdornment position="end">
                <IconButton
                  onClick={handleSend}
                  disabled={!input.trim() || disabled || uploading}
                  className={classes.sendButton}
                  edge="end"
                  size="small"
                >
                  <SendIcon />
                </IconButton>
              </InputAdornment>
            ),
          }}
        />
      </Box>
    </Paper>
  );
};
