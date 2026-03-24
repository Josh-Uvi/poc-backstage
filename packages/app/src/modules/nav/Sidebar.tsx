/* eslint-disable @backstage/no-undeclared-imports */
import {
  Sidebar,
  SidebarDivider,
  SidebarGroup,
  SidebarItem,
  SidebarScrollWrapper,
  SidebarSpace,
} from '@backstage/core-components';
import { compatWrapper } from '@backstage/core-compat-api';
import { NavContentBlueprint } from '@backstage/plugin-app-react';
import { SidebarLogo } from './SidebarLogo';
import MenuIcon from '@material-ui/icons/Menu';
import SearchIcon from '@material-ui/icons/Search';
import { SidebarSearchModal } from '@backstage/plugin-search';

export const SidebarContent = NavContentBlueprint.make({
  params: {
    component: ({ navItems }) => {
      const nav = navItems.withComponent(item => (
        <SidebarItem icon={() => item.icon} to={item.href} text={item.title} />
      ));

      // Take items we want to position explicitly (removes them from nav.rest)
      const homeItem = nav.take('page:home');
      const catalogItem = nav.take('page:catalog');
      const scaffolderItem = nav.take('page:scaffolder');

      // Skip items - hide these from the sidebar
      nav.take('page:search');
      nav.take('page:tech-radar');
      nav.take('page:app-visualizer');
      nav.take('page:graphiql');
      nav.take('page:lighthouse');
      nav.take('page:cost-insights');

      return compatWrapper(
        <Sidebar>
          <SidebarLogo />
          <SidebarGroup label="Search" icon={<SearchIcon />} to="/search">
            <SidebarSearchModal />
          </SidebarGroup>
          <SidebarDivider />
          <SidebarGroup label="Menu" icon={<MenuIcon />}>
            {homeItem}
            {catalogItem}
            {scaffolderItem}
            <SidebarDivider />
            <SidebarScrollWrapper>
              {nav.rest({ sortBy: 'title' })}
            </SidebarScrollWrapper>
          </SidebarGroup>
          <SidebarSpace />
        </Sidebar>,
      );
    },
  },
});
