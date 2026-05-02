import { useState } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  FormGroup,
  FormControlLabel,
  Switch,
  TextField,
  Box,
  Typography,
  Divider,
} from '@material-ui/core';

const useStyles = makeStyles(theme => ({
  dialogPaper: {
    minWidth: '400px',
  },
  section: {
    marginBottom: theme.spacing(3),
  },
  sectionTitle: {
    fontWeight: 600,
    marginBottom: theme.spacing(1.5),
  },
  divider: {
    margin: theme.spacing(2, 0),
  },
}));

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
  onSave?: (settings: any) => void;
}

interface SettingsState {
  soundEnabled: boolean;
  autoScroll: boolean;
  modelName: string;
  temperature: number;
}

export const SettingsPanel = ({
  open,
  onClose,
  onSave,
}: SettingsPanelProps): React.ReactElement => {
  const classes = useStyles();
  const [settings, setSettings] = useState<SettingsState>(() => {
    const saved = localStorage.getItem('chatSettings');
    return saved
      ? JSON.parse(saved)
      : {
          soundEnabled: true,
          autoScroll: true,
          modelName: 'gpt-4',
          temperature: 0.7,
        };
  });

  const handleChange = (key: keyof SettingsState, value: any) => {
    setSettings(prev => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleSave = () => {
    localStorage.setItem('chatSettings', JSON.stringify(settings));
    onSave?.(settings);
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      classes={{ paper: classes.dialogPaper }}
    >
      <DialogTitle>Settings</DialogTitle>
      <DialogContent>
        <Box style={{ paddingTop: 16 }}>
          {/* Appearance Section */}
          <Box className={classes.section}>
            <Typography variant="subtitle2" className={classes.sectionTitle}>
              Appearance
            </Typography>
            <FormGroup>
              <FormControlLabel
                control={
                  <Switch
                    checked={settings.autoScroll}
                    onChange={e =>
                      handleChange('autoScroll', e.target.checked)
                    }
                  />
                }
                label="Auto-scroll to latest message"
              />
            </FormGroup>
          </Box>

          <Divider className={classes.divider} />

          {/* Notifications Section */}
          <Box className={classes.section}>
            <Typography variant="subtitle2" className={classes.sectionTitle}>
              Notifications
            </Typography>
            <FormGroup>
              <FormControlLabel
                control={
                  <Switch
                    checked={settings.soundEnabled}
                    onChange={e =>
                      handleChange('soundEnabled', e.target.checked)
                    }
                  />
                }
                label="Sound notifications"
              />
            </FormGroup>
          </Box>

          <Divider className={classes.divider} />

          {/* Model Settings Section */}
          <Box className={classes.section}>
            <Typography variant="subtitle2" className={classes.sectionTitle}>
              Model Settings
            </Typography>
            <TextField
              select
              fullWidth
              label="Model"
              value={settings.modelName}
              onChange={e => handleChange('modelName', e.target.value)}
              margin="normal"
              SelectProps={{
                native: true,
              }}
            >
              <option value="gpt-3.5">GPT-3.5 Turbo</option>
              <option value="gpt-4">GPT-4</option>
              <option value="gpt-4-turbo">GPT-4 Turbo</option>
              <option value="claude">Claude</option>
            </TextField>
            <TextField
              fullWidth
              type="number"
              label="Temperature"
              value={settings.temperature}
              onChange={e =>
                handleChange('temperature', parseFloat(e.target.value))
              }
              margin="normal"
              inputProps={{ min: 0, max: 1, step: 0.1 }}
              helperText="0 = deterministic, 1 = creative"
            />
          </Box>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} color="primary" variant="contained">
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
};
