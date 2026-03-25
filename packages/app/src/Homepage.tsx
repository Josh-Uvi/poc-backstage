import { makeStyles, Typography, Paper } from '@material-ui/core';
import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import ListItemIcon from '@material-ui/core/ListItemIcon';
import ListItemText from '@material-ui/core/ListItemText';
import CheckCircleOutlineIcon from '@material-ui/icons/CheckCircleOutline';
import { Content, Header, Page } from '@backstage/core-components';

const useStyles = makeStyles(theme => ({
  root: {
    height: '100%',
    padding: theme.spacing(3),
    overflow: 'auto',
  },
  image: {
    width: '100%',
    height: 'auto',
    borderRadius: theme.shape.borderRadius,
    marginBottom: theme.spacing(2),
    marginTop: theme.spacing(1),
  },
  title: {
    marginBottom: theme.spacing(2),
    fontWeight: 600,
    color: theme.palette.primary.main,
  },
  subtitle: {
    marginTop: theme.spacing(2),
    marginBottom: theme.spacing(1),
    fontWeight: 500,
    color: theme.palette.text.primary,
  },
  description: {
    marginBottom: theme.spacing(2),
    lineHeight: 1.6,
    color: theme.palette.text.secondary,
  },
  listItem: {
    alignItems: 'flex-start',
    padding: theme.spacing(1, 0),
  },
  listItemIcon: {
    minWidth: 36,
    color: theme.palette.primary.main,
    marginTop: 4,
  },
  listItemText: {
    '& .MuiListItemText-primary': {
      lineHeight: 1.6,
      color: theme.palette.text.secondary,
    },
  },
  highlight: {
    fontWeight: 500,
    color: theme.palette.text.primary,
  },
}));

const DigitalBackboneContent = () => {
  const classes = useStyles();

  return (
    <Paper className={classes.root} elevation={0}>
      <Typography variant="h5" className={classes.title}>
        What is the Digital Backbone?
      </Typography>

      <Typography variant="body1" className={classes.description}>
        The Digital Backbone is a tool to integrate various Howden business
        systems, using a common view of data. This allows many different systems
        to share data between them in a consistent way. And systems can
        integrate with Digital Backbone just once, and can then communicate with
        any other system on the backbone.
      </Typography>

      {/* <img
        src="/home.png"
        alt="Digital Backbone Prog - Home"
        className={classes.image}
        width={50}
        height={20}
      /> */}

      <Typography variant="h6" className={classes.subtitle}>
        What does this mean for my business?
      </Typography>

      <Typography
        variant="body1"
        className={classes.description}
        style={{ marginBottom: 8 }}
      >
        Using the Digital Backbone allows data to flow between business systems,
        creating efficient, seamless experiences for your users.
      </Typography>

      <List dense disablePadding>
        <ListItem className={classes.listItem}>
          <ListItemIcon className={classes.listItemIcon}>
            <CheckCircleOutlineIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText
            className={classes.listItemText}
            primary={
              <span>
                Data automatically flows between systems in real time, avoiding
                data being out-of-date or incomplete, and manual{' '}
                <span className={classes.highlight}>"swivel chair"</span>{' '}
                re-entry and data quality work.
              </span>
            }
          />
        </ListItem>
        <ListItem className={classes.listItem}>
          <ListItemIcon className={classes.listItemIcon}>
            <CheckCircleOutlineIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText
            className={classes.listItemText}
            primary={
              <span>
                Swapping out tools requires much lower integration time and
                money, avoids vendor lock-in and allows business to choose{' '}
                <span className={classes.highlight}>best-of-breed</span> for
                their region and specialty.
              </span>
            }
          />
        </ListItem>
      </List>

      <Typography variant="h6" className={classes.subtitle}>
        What can it do for me today?
      </Typography>

      <Typography variant="body1" className={classes.description}>
        Here are some examples of how DBB are we planning empower Howden workers
        this year:
      </Typography>

      <List dense disablePadding>
        <ListItem className={classes.listItem}>
          <ListItemIcon className={classes.listItemIcon}>
            <CheckCircleOutlineIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText
            className={classes.listItemText}
            primary="Details of a sales opportunities closed in Howden Client automatically appear in your PAS as soon as it is closed."
          />
        </ListItem>
        <ListItem className={classes.listItem}>
          <ListItemIcon className={classes.listItemIcon}>
            <CheckCircleOutlineIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText
            className={classes.listItemText}
            primary="New commercial parties are mastered in Realto automatically, enriched with data from Moodies."
          />
        </ListItem>
        <ListItem className={classes.listItem}>
          <ListItemIcon className={classes.listItemIcon}>
            <CheckCircleOutlineIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText
            className={classes.listItemText}
            primary="Daily ledger data flows from PASes into financial systems, such as Unit 4, for daily validation and monthly general ledger postings."
          />
        </ListItem>
      </List>

      <Typography variant="h6" className={classes.subtitle}>
        How does it work?
      </Typography>

      <Typography variant="body1" className={classes.description}>
        The Digital Backbone passes messages between systems, using a common:
      </Typography>

      <List dense disablePadding>
        <ListItem className={classes.listItem}>
          <ListItemIcon className={classes.listItemIcon}>
            <CheckCircleOutlineIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText
            className={classes.listItemText}
            primary={
              <span>
                A system interface extracts data from a source system. Many
                systems, like Salesforce or Service Now, come with system
                interfaces built in.
              </span>
            }
          />
        </ListItem>
        <ListItem className={classes.listItem}>
          <ListItemIcon className={classes.listItemIcon}>
            <CheckCircleOutlineIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText
            className={classes.listItemText}
            primary={
              <span>
                An adapter translates data from the system's schema to a
                canonical data model. This shared model allows disparate systems
                to communicate with each other in a consistent way.
              </span>
            }
          />
        </ListItem>
        <ListItem className={classes.listItem}>
          <ListItemIcon className={classes.listItemIcon}>
            <CheckCircleOutlineIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText
            className={classes.listItemText}
            primary="Data can then flow between multiple systems. New systems can come and go, without any additional integration."
          />
        </ListItem>
      </List>

      {/* <Typography variant="h6" className={classes.subtitle}>
        Get Started with Digital Backbone
      </Typography>

      <img
        src="/get-started.png"
        alt="Get Started with Digital Backbone"
        className={classes.image}
      /> */}
    </Paper>
  );
};

export const HomePage = () => {
  return (
    <Page themeId="home">
      <Header
        title="Digital Backbone"
        subtitle="Allows data to flow between business systems, creating seamless experiences for users."
      />
      <Content>
        <DigitalBackboneContent />
      </Content>
    </Page>
  );
};
