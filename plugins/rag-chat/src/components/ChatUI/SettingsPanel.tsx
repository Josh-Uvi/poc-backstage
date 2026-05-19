import { useEffect, useMemo, useState } from 'react';
import { useApi, discoveryApiRef, fetchApiRef } from '@backstage/core-plugin-api';
import { makeStyles } from '@material-ui/core/styles';
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  FormGroup,
  IconButton,
  MenuItem,
  Switch,
  TextField,
  Typography,
} from '@material-ui/core';
import AddIcon from '@material-ui/icons/Add';
import DeleteIcon from '@material-ui/icons/Delete';
import {
  RagChatEmbeddingConfig,
  RagChatModel,
  RagChatProvider,
  RagChatSource,
} from './types';

const USER_SOURCES_KEY = 'ragChat.userSources';
const SOURCE_TYPES: RagChatSource['type'][] = ['catalog', 'techdocs', 'custom'];
const PROVIDERS: RagChatProvider[] = ['openai', 'anthropic', 'google', 'custom'];

const useStyles = makeStyles(theme => ({
  dialogPaper: {
    minWidth: '560px',
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
  inlineLoader: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
    marginTop: theme.spacing(1),
  },
}));

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
  onSave?: (settings: SettingsState) => void;
  initialSettings: SettingsState;
  configModels: RagChatModel[];
  configSources: RagChatSource[];
  configEmbedding?: RagChatEmbeddingConfig;
  canAdmin?: boolean;
}

export interface SettingsState {
  soundEnabled: boolean;
  autoScroll: boolean;
  provider: RagChatProvider;
  modelId: string;
  embeddingModelId: string;
  apiToken?: string;
  apiBaseUrl?: string;
  temperature: number;
  activeSourceIds: string[];
  systemPrompt?: string;
}

interface ModelOption {
  id: string;
  label: string;
}

const loadUserSources = (): RagChatSource[] => {
  try {
    return JSON.parse(localStorage.getItem(USER_SOURCES_KEY) ?? '[]');
  } catch {
    return [];
  }
};

const emptySource = (): Omit<RagChatSource, 'id' | 'userDefined'> => ({
  name: '',
  type: 'custom',
  description: '',
});

const uniqueOptions = (options: ModelOption[]) => {
  const seen = new Set<string>();
  return options.filter(option => {
    if (!option.id || seen.has(option.id)) {
      return false;
    }
    seen.add(option.id);
    return true;
  });
};

export const SettingsPanel = ({
  open,
  onClose,
  onSave,
  initialSettings,
  configModels,
  configSources,
  configEmbedding,
  canAdmin = true,
}: SettingsPanelProps): React.ReactElement => {
  const classes = useStyles();
  const discoveryApi = useApi(discoveryApiRef);
  const fetchApi = useApi(fetchApiRef);
  const resolvedInitialSettings = useMemo<SettingsState>(() => {
    const initial = initialSettings as Partial<SettingsState> | undefined;
    const configuredModel = configModels.find(model => model.id === initial?.modelId);
    const defaultProvider =
      configuredModel?.provider ??
      configEmbedding?.provider ??
      configModels[0]?.provider ??
      initial?.provider ??
      'openai';
    const providerModels = configModels.filter(
      model => model.provider === defaultProvider,
    );
    const defaultModelId =
      providerModels.find(model => model.id === initial?.modelId)?.id ??
      providerModels[0]?.id ??
      configModels[0]?.id ??
      initial?.modelId ??
      '';
    const defaultEmbeddingModelId =
      (configEmbedding?.provider === defaultProvider ? configEmbedding?.model : undefined) ??
      initial?.embeddingModelId ??
      configEmbedding?.model ??
      '';

    return {
      soundEnabled: initial?.soundEnabled ?? true,
      autoScroll: initial?.autoScroll ?? true,
      provider: defaultProvider,
      modelId: defaultModelId,
      embeddingModelId: defaultEmbeddingModelId,
      apiToken: initial?.apiToken ?? '',
      apiBaseUrl: initial?.apiBaseUrl ?? '',
      temperature: initial?.temperature ?? 0.7,
      activeSourceIds: initial?.activeSourceIds ?? configSources.map(source => source.id),
      systemPrompt: initial?.systemPrompt ?? '',
    };
  }, [configEmbedding, configModels, configSources, initialSettings]);
  const [userSources, setUserSources] = useState<RagChatSource[]>(loadUserSources);
  const [settings, setSettings] = useState<SettingsState>(resolvedInitialSettings);
  const [showAddSource, setShowAddSource] = useState(false);
  const [newSource, setNewSource] = useState(emptySource());

  useEffect(() => {
    if (open) {
      setSettings(resolvedInitialSettings);
    }
  }, [open, resolvedInitialSettings]);

  const provider = settings.provider;

  const selectableSources = userSources;
  const chatOptions = useMemo(() => uniqueOptions([
    ...configModels
      .filter(model => model.provider === provider)
      .map(model => ({ id: model.id, label: model.name || model.id })),
    ...(settings.modelId
      ? [{ id: settings.modelId, label: settings.modelId }]
      : []),
  ]), [configModels, provider, settings.modelId]);

  const embeddingOptions = useMemo(() => uniqueOptions([
    ...(configEmbedding?.provider === provider && configEmbedding.model
      ? [{ id: configEmbedding.model, label: configEmbedding.model }]
      : []),
    ...(settings.embeddingModelId
      ? [{ id: settings.embeddingModelId, label: settings.embeddingModelId }]
      : []),
  ]), [configEmbedding, provider, settings.embeddingModelId]);

  const handleChange = <K extends keyof SettingsState>(
    key: K,
    value: SettingsState[K],
  ) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const toggleSource = (id: string) => {
    setSettings(prev => ({
      ...prev,
      activeSourceIds: prev.activeSourceIds.includes(id)
        ? prev.activeSourceIds.filter(sourceId => sourceId !== id)
        : [...prev.activeSourceIds, id],
    }));
  };

  const handleProviderChange = (nextProvider: RagChatProvider) => {
    const nextModelId =
      configModels.find(model => model.provider === nextProvider)?.id ?? settings.modelId;
    const nextEmbeddingModelId =
      (configEmbedding?.provider === nextProvider ? configEmbedding.model : undefined) ??
      settings.embeddingModelId;

    setSettings(prev => ({
      ...prev,
      provider: nextProvider,
      modelId: nextModelId,
      embeddingModelId: nextEmbeddingModelId,
      apiBaseUrl: nextProvider === 'custom' ? prev.apiBaseUrl ?? '' : undefined,
    }));
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
    setSettings(prev => ({
      ...prev,
      activeSourceIds: [...prev.activeSourceIds, source.id],
    }));
    setNewSource(emptySource());
    setShowAddSource(false);
  };

  const handleDeleteSource = (id: string) => {
    const updated = userSources.filter(source => source.id !== id);
    setUserSources(updated);
    localStorage.setItem(USER_SOURCES_KEY, JSON.stringify(updated));
    setSettings(prev => ({
      ...prev,
      activeSourceIds: prev.activeSourceIds.filter(sourceId => sourceId !== id),
    }));
  };

  const handleSave = async () => {
    // If user provided a token, save it securely to the backend
    if (settings.apiToken) {
      try {
        const baseUrl = await discoveryApi.getBaseUrl('rag-chat');
        await fetchApi.fetch(`${baseUrl}/credentials`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            modelId: settings.modelId || 'default',
            apiToken: settings.apiToken,
            apiBaseUrl: settings.apiBaseUrl,
          }),
        });
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Failed to save credentials to backend', error);
      }
    }

    // Strip sensitive fields before persisting to localStorage
    const { apiToken: _, apiBaseUrl: __, ...persistentSettings } = settings;
    localStorage.setItem('chatSettings', JSON.stringify(persistentSettings));

    // Notify parent with sanitized settings
    onSave?.(persistentSettings as SettingsState);
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} classes={{ paper: classes.dialogPaper }}>
      <DialogTitle>Settings</DialogTitle>
      <DialogContent>
        <Box style={{ paddingTop: 16 }}>
          <Box className={classes.section}>
            <Typography variant="subtitle2" className={classes.sectionTitle}>
              Appearance
            </Typography>
            <FormGroup>
              <FormControlLabel
                control={
                  <Switch
                    checked={settings.autoScroll}
                    onChange={e => handleChange('autoScroll', e.target.checked)}
                  />
                }
                label="Auto-scroll to latest message"
              />
            </FormGroup>
          </Box>

          <Divider className={classes.divider} />

          <Box className={classes.section}>
            <Typography variant="subtitle2" className={classes.sectionTitle}>
              Notifications
            </Typography>
            <FormGroup>
              <FormControlLabel
                control={
                  <Switch
                    checked={settings.soundEnabled}
                    onChange={e => handleChange('soundEnabled', e.target.checked)}
                  />
                }
                label="Sound notifications"
              />
            </FormGroup>
          </Box>

          <Divider className={classes.divider} />

          <Box className={classes.section}>
            <Typography variant="subtitle2" className={classes.sectionTitle}>
              Model and Embedding Configuration
            </Typography>

            <TextField
              select
              fullWidth
              label="Provider"
              value={provider}
              onChange={e => handleProviderChange(e.target.value as RagChatProvider)}
              margin="dense"
              variant="outlined"
              size="small"
            >
              {PROVIDERS.map(value => (
                <MenuItem key={value} value={value}>
                  {value}
                </MenuItem>
              ))}
            </TextField>

            {provider === 'custom' && (
              <TextField
                fullWidth
                label="API Base URL"
                placeholder="https://your-provider.example.com/v1"
                value={settings.apiBaseUrl ?? ''}
                onChange={e => handleChange('apiBaseUrl', e.target.value)}
                margin="dense"
                variant="outlined"
                size="small"
              />
            )}

            <TextField
              select
              fullWidth
              label="Chat model"
              value={settings.modelId}
              onChange={e => handleChange('modelId', e.target.value)}
              margin="dense"
              variant="outlined"
              size="small"
              disabled={!chatOptions.length}
              helperText={
                chatOptions.length
                  ? undefined
                  : 'No chat models available for the selected provider.'
              }
            >
              {chatOptions.length ? (
                chatOptions.map(option => (
                  <MenuItem key={option.id} value={option.id}>
                    {option.label}
                  </MenuItem>
                ))
              ) : (
                <MenuItem value="" disabled>
                  No models available
                </MenuItem>
              )}
            </TextField>

            <TextField
              select
              fullWidth
              label="Embedding model"
              value={settings.embeddingModelId}
              onChange={e => handleChange('embeddingModelId', e.target.value)}
              margin="dense"
              variant="outlined"
              size="small"
              disabled={!embeddingOptions.length}
              helperText={
                embeddingOptions.length
                  ? undefined
                  : 'No embedding models available for the selected provider.'
              }
            >
              {embeddingOptions.length ? (
                embeddingOptions.map(option => (
                  <MenuItem key={option.id} value={option.id}>
                    {option.label}
                  </MenuItem>
                ))
              ) : (
                <MenuItem value="" disabled>
                  No models available
                </MenuItem>
              )}
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



            {configModels.length > 0 && (
              <>
                <Typography className={classes.hint}>
                  App-config models are shown below as read-only references.
                </Typography>
                <Box className={classes.sourceChips}>
                  {configModels.map(model => (
                    <Chip
                      key={`readonly-model-${model.id}`}
                      label={`${model.name} (${model.provider})`}
                      size="small"
                      disabled
                    />
                  ))}
                </Box>
              </>
            )}
          </Box>

          <Divider className={classes.divider} />

          {canAdmin && (
            <>
              <Box className={classes.section}>
                <Typography variant="subtitle2" className={classes.sectionTitle}>
                  System Instructions
                </Typography>
                <TextField
                  fullWidth
                  multiline
                  minRows={3}
                  maxRows={8}
                  label="Custom System Prompt (Optional)"
                  placeholder="You are a helpful Backstage assistant..."
                  value={settings.systemPrompt ?? ''}
                  onChange={e => handleChange('systemPrompt', e.target.value)}
                  margin="dense"
                  variant="outlined"
                  size="small"
                  helperText="Override the default persona. Retrieval instructions will be automatically appended."
                />
              </Box>
              <Divider className={classes.divider} />
            </>
          )}

          <Box className={classes.section}>
            <Box display="flex" justifyContent="space-between" alignItems="center">
              <Typography variant="subtitle2" className={classes.sectionTitle}>
                RAG Sources
              </Typography>
              {canAdmin && (
                <Button
                  size="small"
                  startIcon={<AddIcon />}
                  onClick={() => setShowAddSource(v => !v)}
                >
                  Add source
                </Button>
              )}
            </Box>

            <Typography variant="caption" color="textSecondary">
              Select which sources the assistant will query.
            </Typography>
            {selectableSources.length > 0 ? (
              <Box className={classes.sourceChips}>
                {selectableSources.map(source => (
                  <Chip
                    key={source.id}
                    label={source.userDefined ? `${source.name} (custom)` : source.name}
                    color={settings.activeSourceIds.includes(source.id) ? 'primary' : 'default'}
                    onClick={() => toggleSource(source.id)}
                    onDelete={
                      canAdmin && source.userDefined
                        ? () => handleDeleteSource(source.id)
                        : undefined
                    }
                    title={source.description}
                    size="small"
                  />
                ))}
              </Box>
            ) : (
              <Typography className={classes.hint}>
                No user-defined sources yet. Use &quot;Add source&quot; to add one.
              </Typography>
            )}

            {configSources.length > 0 && (
              <>
                <Typography className={classes.hint}>
                  App-config sources are also displayed below as disabled references.
                </Typography>
                <Box className={classes.sourceChips}>
                  {configSources.map(source => (
                    <Chip
                      key={`readonly-source-${source.id}`}
                      label={source.name}
                      title={source.description}
                      size="small"
                      color={settings.activeSourceIds.includes(source.id) ? 'primary' : 'default'}
                      disabled
                    />
                  ))}
                </Box>
              </>
            )}

            {!canAdmin && (
              <Typography className={classes.hint}>
                Source management requires admin permission.
              </Typography>
            )}

            {canAdmin && userSources.length > 0 && (
              <Box mt={1}>
                {userSources.map(source => (
                  <Box key={source.id} className={classes.userItem}>
                    <Typography className={classes.userItemLabel}>
                      {source.name}{' '}
                      <span style={{ opacity: 0.6 }}>({source.type})</span>
                    </Typography>
                    <IconButton
                      size="small"
                      onClick={() => handleDeleteSource(source.id)}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Box>
                ))}
              </Box>
            )}

            {canAdmin && showAddSource && (
              <Box className={classes.addForm}>
                <Typography className={classes.addFormTitle}>Add a source</Typography>
                <TextField
                  fullWidth
                  label="Name"
                  placeholder="e.g. My Docs"
                  value={newSource.name}
                  onChange={e =>
                    setNewSource(prev => ({ ...prev, name: e.target.value }))
                  }
                  margin="dense"
                  variant="outlined"
                  size="small"
                />
                <TextField
                  select
                  fullWidth
                  label="Type"
                  value={newSource.type}
                  onChange={e =>
                    setNewSource(prev => ({
                      ...prev,
                      type: e.target.value as RagChatSource['type'],
                    }))
                  }
                  margin="dense"
                  variant="outlined"
                  size="small"
                >
                  {SOURCE_TYPES.map(type => (
                    <MenuItem key={type} value={type}>
                      {type}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  fullWidth
                  label="Description"
                  placeholder="Optional description"
                  value={newSource.description}
                  onChange={e =>
                    setNewSource(prev => ({
                      ...prev,
                      description: e.target.value,
                    }))
                  }
                  margin="dense"
                  variant="outlined"
                  size="small"
                />
                <Box display="flex" justifyContent="flex-end" mt={1} style={{ gap: 8 }}>
                  <Button
                    size="small"
                    onClick={() => {
                      setShowAddSource(false);
                      setNewSource(emptySource());
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="small"
                    variant="contained"
                    color="primary"
                    onClick={handleAddSource}
                    disabled={!newSource.name.trim()}
                  >
                    Add
                  </Button>
                </Box>
              </Box>
            )}
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