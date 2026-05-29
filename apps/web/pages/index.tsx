import Link from 'next/link';
import { Box, Button, Container, List, ListItem, Paper, Typography } from '@mui/material';

import { CORE_PACKAGE_NAME } from '@cipp-google/core';

export default function HomePage() {
  return (
    <Container maxWidth="sm">
      <Box sx={{ my: 4 }}>
        <Paper sx={{ p: 3 }}>
          <Typography variant="h4" component="h1" gutterBottom>
            CIPP-GoogleExtension
          </Typography>
          <Typography variant="body1" sx={{ mb: 2 }}>
            Connected to {CORE_PACKAGE_NAME}.
          </Typography>
          <Typography>Quick links</Typography>
          <List>
            <ListItem>
              <Link href="/customers">
                <Button>Customers</Button>
              </Link>
            </ListItem>
            <ListItem>
              <Link href="/audit">
                <Button>Audit</Button>
              </Link>
            </ListItem>
            <ListItem>
              <Link href="/integrations/cipp">
                <Button>CIPP integration</Button>
              </Link>
            </ListItem>
            <ListItem>
              <Button
                component="a"
                href="https://github.com/KLEPTOROTH/CIPP-GoogleExtension"
                target="_blank"
                rel="noreferrer"
              >
                Source code
              </Button>
            </ListItem>
            <ListItem>
              <Link href="/license">
                <Button>License</Button>
              </Link>
            </ListItem>
          </List>
        </Paper>
      </Box>
    </Container>
  );
}
