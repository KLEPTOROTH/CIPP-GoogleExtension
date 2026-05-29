import Link from 'next/link';
import { Box, Button, Container, Paper, Stack, Typography } from '@mui/material';

const licenseUrl = 'https://github.com/KLEPTOROTH/CIPP-GoogleExtension/blob/main/LICENSE';

export default function LicensePage() {
  return (
    <Container maxWidth="sm">
      <Box sx={{ my: 4 }}>
        <Paper sx={{ p: 3 }}>
          <Stack spacing={2}>
            <Typography variant="h4" component="h1">
              License
            </Typography>
            <Typography>
              CIPP-GoogleExtension is offered under the GNU Affero General Public License
              version 3.0.
            </Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <Button component="a" href={licenseUrl} target="_blank" rel="noreferrer">
                Read AGPL-3.0
              </Button>
              <Button component={Link} href="/source">
                Source code
              </Button>
              <Button component={Link} href="/">
                Home
              </Button>
            </Stack>
          </Stack>
        </Paper>
      </Box>
    </Container>
  );
}
