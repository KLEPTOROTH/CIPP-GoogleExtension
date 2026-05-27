import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';

import { CORE_PACKAGE_NAME } from '@cipp-google/core';

export default function HomePage() {
  return (
    <Container maxWidth="sm">
      <Box sx={{ my: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          CIPP-GoogleExtension
        </Typography>
        <Typography variant="body1">
          Hello from the Phase 0 scaffolding. Linked to {CORE_PACKAGE_NAME}.
        </Typography>
      </Box>
    </Container>
  );
}
