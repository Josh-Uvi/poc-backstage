import { createApp } from '@backstage/frontend-defaults';
import catalogPlugin from '@backstage/plugin-catalog/alpha';
import techRadarPlugin from '@backstage-community/plugin-tech-radar/alpha';
import { navModule } from './modules/nav';
import { githubAuthApiRef } from '@backstage/core-plugin-api';
import { SignInPageBlueprint } from '@backstage/plugin-app-react';
import { SignInPage } from '@backstage/core-components';
import {
  createApiFactory,
  createFrontendModule,
} from '@backstage/frontend-plugin-api';
import { techRadarApiRef } from '@backstage-community/plugin-tech-radar';
import { ExampleTechRadarClient } from './TechRadar';
import { customHomePageLayout } from './Homepage';

const signInPage = SignInPageBlueprint.make({
  params: {
    loader: async () => props =>
      (
        <SignInPage
          {...props}
          providers={[
            'guest',
            {
              id: 'github-auth-provider',
              title: 'GitHub',
              message: 'Sign in using GitHub',
              apiRef: githubAuthApiRef,
            },
          ]}
        />
      ),
  },
});

export default createApp({
  features: [
    catalogPlugin,
    techRadarPlugin,
    navModule,
    createFrontendModule({
      pluginId: 'app',
      extensions: [signInPage],
    }),
    createFrontendModule({
      pluginId: 'tech-radar',
      extensions: [
        techRadarPlugin.getExtension('api:tech-radar').override({
          params: defineParams =>
            defineParams(
              createApiFactory(techRadarApiRef, new ExampleTechRadarClient()),
            ),
        }),
      ],
    }),
    createFrontendModule({
      pluginId: 'home',
      extensions: [customHomePageLayout],
    }),
  ],
});
