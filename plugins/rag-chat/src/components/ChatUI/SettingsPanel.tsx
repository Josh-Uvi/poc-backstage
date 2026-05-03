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
  Chip,
  IconButton,
  MenuItem,
} from '@material-ui/core';
import AddIcon from '@material-ui/icons/Add';
import DeleteIcon from '@material-ui/icons/Delete';
import { RagChatModel, RagChatSource } from './types';

const USER_MODELS_KEY = 'ragChat.userModels';
const USER_SOURCES_KEY = 'ragChat.userSources';

const PROVIDERS: RagChatModel['provider'][] = ['openai', 'anthropic', 'google', 'custom'];
const SOURCE_TYPES: RagChatSource['type'][] = ['catalog', 'techdocs', 'custom'];

const useStyles = makeStyles(theme => ({
  dialogPaper: {
    minWidth: '480px',
    maxHeight: '90vh',
  },
  section: {
    marginBottom: theme.spacing(3),
  },
  sectionTitle: {
    fontWeight: 600,
    marginBottom: theme.spacing(1),
  },
  divider: {
    margin: theme.spacing(2, 0),
  },
  sourceChips: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: theme.spacing(1),
    marginTop: theme.spacing(1),
  },
  addForm: {
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: theme.shape.borderRadius,
    padding: theme.spacing(2),
    marginTop: theme.spacing(1.5),
    backgroundColor: theme.palette.background.default,
  },
  addFormTitle: {
    fontWeight: 500,
    marginBottom: theme.spacing(1),
    fontSize: '0.85rem',
  },
  formRow: {
    display: 'flex',
    gap: theme.spacing(1),
    alignItems: 'flex-start',
  },
  userItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: theme.spacing(0.5, 1),
    borderRadius: theme.shape.borderRadius,
    border: `1px solid ${theme.palette.divider}`,
    marginBottom: theme.spacing(0.5),
  },
  userItemLabel: {
    fontSize: '0.85rem',
  },
  hint: {
    color: theme.palette.text.secondary,
    fontSize: '0.78rem',
    marginBottom: theme.spacing(1),
  },
}));

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
  onSave?: (settings: SettingsState) => void;
  configModels: RagChatModel[];
  configSources: RagChatSource[];
  canAdmin?: boolean;
}

export interface SettingsState {
  soundEnabled: boolean;
  autoScroll: boolean;
  modelId: string;
  temperature: number;
  activeSourceIds: string[];
}

const loadUserModels = (): RagChatModel[] => {
  try { return JSON.parse(localStorage.getItem(USER_MODELS_KEY) ?? '[]'); }
  catch { return []; }
};

const loadUserSources = (): RagChatSource[] => {
  try { return JSON.parse(localStorage.getItem(USER_SOURCES_KEY) ?? '[]'); }
  catch { return []; }
};

const emptyModel = (): Omit<RagChatModel, 'id' | 'userDefined'> => ({
  name: '', provider: 'openai', apiBaseUrl: '', apiToken: '',
});

const emptySource = (): Omit<RagChatSource, 'id' | 'userDefined'> => ({
  name: '', type: 'custom', description: '',
});

export const SettingsPanel = ({
  open,
  onClose,
  onSave,
  configModels,
  configSources,
  canAdmin = true,
}: SettingsPanelProps): React.ReactElement => {
  const classes = useStyles();

  const [userModels, setUserModels] = useState<RagChatModel[]>(loadUserModels);
  const [userSources, setUserSources] = useState<RagChatSource[]>(loadUserSources);

  const allModels = [...configModels, ...userModels];
  const allSources = [...configSources, ...userSources];

  const [settings, setSettings] = useState<SettingsState>(() => {
    const saved = localStorage.getItem('chatSettings');
    return saved
      ? JSON.parse(saved)
      : {
          soundEnabled: true,
          autoScroll: true,
          modelId: allModels[0]?.id ?? '',
          temperature: 0.7,
          activeSourceIds: allSources.map(s => s.id),
        };
  });

  // Add model form state
  const [showAddModel, setShowAddModel] = useState(false);
  const [newModel, setNewModel] = useState(emptyModel());

  // Add source form state
  const [showAddSource, setShowAddSource] = useState(false);
  const [newSource, setNewSource] = useState(emptySource());

  const handleChange = (key: keyof SettingsState, value: any) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const toggleSource = (id: string) => {
    setSettings(prev => ({
      ...prev,
      activeSourceIds: prev.activeSourceIds.includes(id)
        ? prev.activeSourceIds.filter(s => s !== id)
        : [...prev.activeSourceIds, id],
    }));
  };

  const handleAddModel = () => {
    if (!newModel.name.trim()) return;
    const model: RagChatModel = {
      ...newModel,
      id: `user-model-${Date.now()}`,
      userDefined: true,
    };
    const updated = [...userModels, model];
    setUserModels(updated);
    localStorage.setItem(USER_MODELS_KEY, JSON.stringify(updated));
    // Auto-select if first model overall
    if (allModels.length === 0) {
      setSettings(prev => ({ ...prev, modelId: model.id }));
    }
    setNewModel(emptyModel());
    setShowAddModel(false);
  };

  const handleDeleteModel = (id: string) => {
    const updated = userModels.filter(m => m.id !== id);
    setUserModels(updated);
    localStorage.setItem(USER_MODELS_KEY, JSON.stringify(updated));
    if (settings.modelId === id) {
      setSettings(prev => ({ ...prev, modelId: [...configModels, ...updated][0]?.id ?? '' }));
    }
  };

  const handleAddSource = () => {
    if (!newSource.name.trim()) return;
    const source: RagChatSource = {
      ...newSource,
      id: `user-source-${Date.now()}`,
      userDefined: true,
    };
    const updated = [...userSources, source];
    setUserSources(updated);
    localStorage.setItem(USER_SOURCES_KEY, JSON.stringify(updated));
    setSettings(prev => ({ ...prev, activeSourceIds: [...prev.activeSourceIds, source.id] }));
    setNewSource(emptySource());
    setShowAddSource(false);
  };

  const handleDeleteSource = (id: string) => {
    const updated = userSources.filter(s => s.id !== id);
    setUserSources(updated);
    localStorage.setItem(USER_SOURCES_KEY, JSON.stringify(updated));
    setSettings(prev => ({ ...prev, activeSourceIds: prev.activeSourceIds.filter(s => s !== id) }));
  };

  const handleSave = () => {
    localStorage.setItem('chatSettings', JSON.stringify(settings));
    onSave?.(settings);
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} classes={{ paper: classes.dialogPaper }}>
      <DialogTitle>Settings</DialogTitle>
      <DialogContent>
        <Box style={{ paddingTop: 16 }}>

          {/* Appearance */}
          <Box className={classes.section}>
            <Typography variant="subtitle2" className={classes.sectionTitle}>Appearance</Typography>
            <FormGroup>
              <FormControlLabel
                control={<Switch checked={settings.autoScroll} onChange={e => handleChange('autoScroll', e.target.checked)} />}
                label="Auto-scroll to latest message"
              />
            </FormGroup>
          </Box>

          <Divider className={classes.divider} />

          {/* Notifications */}
          <Box className={classes.section}>
            <Typography variant="subtitle2" className={classes.sectionTitle}>Notifications</Typography>
            <FormGroup>
              <FormControlLabel
                control={<Switch checked={settings.soundEnabled} onChange={e => handleChange('soundEnabled', e.target.checked)} />}
                label="Sound notifications"
              />
            </FormGroup>
          </Box>

          <Divider className={classes.divider} />

          {/* Model */}
          <Box className={classes.section}>
            <Box display="flex" justifyContent="space-between" alignItems="center">
              <Typography variant="subtitle2" className={classes.sectionTitle}>Model</Typography>
              {canAdmin && (
                <Button size="small" startIcon={<AddIcon />} onClick={() => setShowAddModel(v => !v)}>
                  Add model
                </Button>
              )}
            </Box>

            {canAdmin && configModels.length > 0 && (
              <Typography className={classes.hint}>
                Models from app-config.yaml are read-only.
              </Typography>
            )}

            {!canAdmin && (
              <Typography className={classes.hint}>
                Model management requires admin permission.
              </Typography>
            )}

            {allModels.length > 0 ? (
              <>
                <TextField
                  select
                  fullWidth
                  label="Active model"
                  value={settings.modelId}
                  onChange={e => handleChange('modelId', e.target.value)}
                  margin="dense"
                  variant="outlined"
                  size="small"
                >
                  {allModels.map(m => (
                    <MenuItem key={m.id} value={m.id}>
                      {m.name}{m.userDefined ? ' (custom)' : ''}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  fullWidth
                  type="number"
                  label="Temperature"
                  value={settings.temperature}
                  onChange={e => handleChange('temperature', parseFloat(e.target.value))}
                  margin="dense"
                  variant="outlined"
                  size="small"
                  inputProps={{ min: 0, max: 1, step: 0.1 }}
                  helperText="0 = deterministic, 1 = creative"
                />
              </>
            ) : (
              <Typography className={classes.hint}>
                No models configured.
                {canAdmin ? ' Use "Add model" above or configure ragChat.models in app-config.yaml.' : ''}
              </Typography>
            )}

            {/* User-defined models list — admin only */}
            {canAdmin && userModels.length > 0 && (
              <Box mt={1}>
                {userModels.map(m => (
                  <Box key={m.id} className={classes.userItem}>
                    <Typography className={classes.userItemLabel}>
                      {m.name} <span style={{ opacity: 0.6 }}>({m.provider})</span>
                    </Typography>
                    <IconButton size="small" onClick={() => handleDeleteModel(m.id)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Box>
                ))}
              </Box>
            )}

            {/* Add model form — admin only */}
            {canAdmin && showAddModel && (
              <Box className={classes.addForm}>
                <Typography className={classes.addFormTitle}>Add a model</Typography>
                <TextField
                  fullWidth label="Name" placeholder="e.g. GPT-4o"
                  value={newModel.name} onChange={e => setNewModel(p => ({ ...p, name: e.target.value }))}
                  margin="dense" variant="outlined" size="small"
                />
                <TextField
                  select fullWidth label="Provider"
                  value={newModel.provider} onChange={e => setNewModel(p => ({ ...p, provider: e.target.value as RagChatModel['provider'] }))}
                  margin="dense" variant="outlined" size="small"
                >
                  {PROVIDERS.map(p => <MenuItem key={p} value={p}>{p}</MenuItem>)}
                </TextField>
                <TextField
                  fullWidth label="API Base URL" placeholder="https://api.openai.com/v1"
                  value={newModel.apiBaseUrl} onChange={e => setNewModel(p => ({ ...p, apiBaseUrl: e.target.value }))}
                  margin="dense" variant="outlined" size="small"
                />
                <TextField
                  fullWidth label="API Token" type="password" placeholder="sk-..."
                  value={newModel.apiToken} onChange={e => setNewModel(p => ({ ...p, apiToken: e.target.value }))}
                  margin="dense" variant="outlined" size="small"
                  helperText="Stored in browser localStorage only"
                />
                <Box display="flex" justifyContent="flex-end" mt={1} style={{ gap: 8 }}>
                  <Button size="small" onClick={() => { setShowAddModel(false); setNewModel(emptyModel()); }}>Cancel</Button>
                  <Button size="small" variant="contained" color="primary" onClick={handleAddModel} disabled={!newModel.name.trim()}>Add</Button>
                </Box>
              </Box>
            )}
          </Box>

          <Divider className={classes.divider} />

          {/* RAG Sources */}
          <Box className={classes.section}>
            <Box display="flex" justifyContent="space-between" alignItems="center">
              <Typography variant="subtitle2" className={classes.sectionTitle}>RAG Sources</Typography>
              {canAdmin && (
                <Button size="small" startIcon={<AddIcon />} onClick={() => setShowAddSource(v => !v)}>
                  Add source
                </Button>
              )}
            </Box>

            {canAdmin && configSources.length > 0 && (
              <Typography className={classes.hint}>
                Sources from app-config.yaml are read-only.
              </Typography>
            )}

            {!canAdmin && (
              <Typography className={classes.hint}>
                Source management requires admin permission.
              </Typography>
            )}

            {allSources.length > 0 ? (
              <>
                <Typography variant="caption" color="textSecondary">
                  Select which sources the assistant will query
                </Typography>
                <Box className={classes.sourceChips}>
                  {allSources.map(s => (
                    <Chip
                      key={s.id}
                      label={s.userDefined ? `${s.name} (custom)` : s.name}
                      color={settings.activeSourceIds.includes(s.id) ? 'primary' : 'default'}
                      onClick={() => toggleSource(s.id)}
                      onDelete={canAdmin && s.userDefined ? () => handleDeleteSource(s.id) : undefined}
                      title={s.description}
                      size="small"
                    />
                  ))}
                </Box>
              </>
            ) : (
              <Typography className={classes.hint}>
                No sources configured.
                {canAdmin ? ' Use "Add source" above or configure ragChat.sources in app-config.yaml.' : ''}
              </Typography>
            )}

            {/* Add source form — admin only */}
            {canAdmin && showAddSource && (
              <Box className={classes.addForm}>
                <Typography className={classes.addFormTitle}>Add a source</Typography>
                <TextField
                  fullWidth label="Name" placeholder="e.g. My Docs"
                  value={newSource.name} onChange={e => setNewSource(p => ({ ...p, name: e.target.value }))}
                  margin="dense" variant="outlined" size="small"
                />
                <TextField
                  select fullWidth label="Type"
                  value={newSource.type} onChange={e => setNewSource(p => ({ ...p, type: e.target.value as RagChatSource['type'] }))}
                  margin="dense" variant="outlined" size="small"
                >
                  {SOURCE_TYPES.map(t => <MenuItem key={t} value={t}>{t}</MenuItem>)}
                </TextField>
                <TextField
                  fullWidth label="Description" placeholder="Optional description"
                  value={newSource.description} onChange={e => setNewSource(p => ({ ...p, description: e.target.value }))}
                  margin="dense" variant="outlined" size="small"
                />
                <Box display="flex" justifyContent="flex-end" mt={1} style={{ gap: 8 }}>
                  <Button size="small" onClick={() => { setShowAddSource(false); setNewSource(emptySource()); }}>Cancel</Button>
                  <Button size="small" variant="contained" color="primary" onClick={handleAddSource} disabled={!newSource.name.trim()}>Add</Button>
                </Box>
              </Box>
            )}
          </Box>

        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} color="primary" variant="contained">Save</Button>
      </DialogActions>
    </Dialog>
  );
};
