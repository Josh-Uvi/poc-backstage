import { HomePageLayoutBlueprint } from '@backstage/plugin-home-react/alpha';
import { CustomHomepageGrid } from '@backstage/plugin-home';
import { Content, Header, Page } from '@backstage/core-components';
import { Fragment } from 'react';

export const customHomePageLayout = HomePageLayoutBlueprint.make({
  params: {
    loader: async () =>
      function MyHomePageLayout({ widgets }) {
        return (
          <Page themeId="home">
            <Header title="Welcome" />
            <Content>
              <CustomHomepageGrid>
                {widgets.map((widget, index) => (
                  <Fragment key={widget.name ?? index}>
                    {widget.component}
                  </Fragment>
                ))}
              </CustomHomepageGrid>
            </Content>
          </Page>
        );
      },
  },
});
