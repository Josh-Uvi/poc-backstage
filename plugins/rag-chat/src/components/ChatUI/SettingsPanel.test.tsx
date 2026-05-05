
import { screen } from '@testing-library/react';
import { SettingsPanel } from './SettingsPanel';
import { TestApiProvider } from '@backstage/test-utils';
import { discoveryApiRef, fetchApiRef } from '@backstage/core-plugin-api';

const mockDiscoveryApi = {
  getBaseUrl: jest.fn().mockResolvedValue('http://localhost:7007/api/rag-chat'),
};

const mockFetchApi = {
  fetch: jest.fn(),
};

import { renderInTestApp } from '@backstage/frontend-test-utils';

const renderSettingsPanel = async (canAdmin: boolean) => {
  return renderInTestApp(
    <TestApiProvider apis={[[discoveryApiRef, mockDiscoveryApi], [fetchApiRef, mockFetchApi]]}>
      <SettingsPanel
        open
        onClose={jest.fn()}
        onSave={jest.fn()}
        initialSettings={{
          soundEnabled: true,
          autoScroll: true,
          provider: 'openai',
          modelId: 'gpt-4',
          embeddingModelId: 'text-embedding-ada-002',
          temperature: 0.7,
          activeSourceIds: [],
        }}
        configModels={[]}
        configSources={[]}
        canAdmin={canAdmin}
      />
    </TestApiProvider>
  );
};

describe('SettingsPanel', () => {
  it('should show "Add source" button when canAdmin is true', async () => {
    await renderSettingsPanel(true);
    expect(await screen.findByText('Add source')).toBeInTheDocument();
  });

  it('should not show "Add source" button when canAdmin is false', async () => {
    await renderSettingsPanel(false);
    expect(await screen.findByText('Source management requires admin permission.')).toBeInTheDocument();
    expect(screen.queryByText('Add source')).not.toBeInTheDocument();
  });
});
