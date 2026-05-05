import { sidebarConfig, useSidebarOpenState } from '@backstage/core-components';
import { makeStyles } from '@material-ui/core';
import { LogoFull } from './LogoFull';
import { LogoIcon } from './LogoIcon';

const useSidebarLogoStyles = makeStyles({
  root: {
    width: sidebarConfig.drawerWidthClosed,
    height: 3 * sidebarConfig.logoHeight,
    display: 'flex',
    flexFlow: 'row nowrap',
    alignItems: 'center',
    marginBottom: -14,
  },
  link: {
    width: sidebarConfig.drawerWidthClosed,
    marginLeft: 24,
    display: 'flex',
    alignItems: 'center',
    textDecoration: 'none',
  },
});

export const SidebarLogo = () => {
  const classes = useSidebarLogoStyles();
  const { isOpen } = useSidebarOpenState();

  return (
    <div className={classes.root}>
      <a href="/" className={classes.link} aria-label="Home">
        {isOpen ? <LogoFull /> : <LogoIcon />}
      </a>
    </div>
  );
};
