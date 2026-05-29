import Link from 'next/link';
import { Box, Button, Container, Paper, Stack, Typography } from '@mui/material';

const sourceUrl = 'https://github.com/KLEPTOROTH/CIPP-GoogleExtension';

export default function SourcePage() {
  return (
    <Container maxWidth="sm">
      <Box sx={{ my: 4 }}>
        <Paper sx={{ p: 3 }}>
          <Stack spacing={2}>
            <Typography variant="h4" component="h1">
              Source code
            </Typography>
            <Typography>
              The CIPP-GoogleExtension demo source is available under the AGPL-3.0 license.
            </Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <Button component="a" href={sourceUrl} target="_blank" rel="noreferrer">
                Open repository
              </Button>
              <Link href="/license">
                <Button>View license</Button>
              </Link>
              <Link href="/">
                <Button>Home</Button>
              </Link>
            </Stack>
          </Stack>
        </Paper>
      </Box>
    </Container>
  );
}
