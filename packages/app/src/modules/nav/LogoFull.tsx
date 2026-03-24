import { makeStyles } from '@material-ui/core';
import logoUrl from './new-logo.svg';

const useStyles = makeStyles(theme => ({
  logo: {
    height: 100,
    width: 'auto',
    objectFit: 'contain',
    // Semi-transparent background that adapts to theme
    backgroundColor:
      theme.palette.type === 'dark' ? 'rgba(255, 255, 255, 0.05)' : '#fff',
    borderRadius: theme.shape.borderRadius,
    padding: theme.spacing(1),
    // Invert colors in dark mode for better visibility
    filter: theme.palette.type === 'dark' ? 'invert(1)' : 'none',
    // Smooth transition when theme changes
    transition: theme.transitions.create(['background-color', 'filter']),
  },
}));

export const LogoFull = () => {
  const classes = useStyles();

  return <img src={logoUrl} alt="Full Logo" className={classes.logo} />;
};
