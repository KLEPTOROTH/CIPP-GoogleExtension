import Link from 'next/link';
import type { GetStaticProps } from 'next';
import { Box, Button, Container, Paper, Stack, Typography } from '@mui/material';

import { buildSourceManifest, buildSourceUrl, type SourceManifest } from '@/sourceManifest';

interface SourcePageProps {
  sourceManifest: SourceManifest;
}

export const getStaticProps: GetStaticProps<SourcePageProps> = () => ({
  props: {
    sourceManifest: buildSourceManifest(),
  },
});

export default function SourcePage({ sourceManifest }: SourcePageProps) {
  const sourceUrl = buildSourceUrl(sourceManifest);
  const shortCommit = sourceManifest.commitSha.slice(0, 8);

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
            <Typography>
              Source: GitHub @ {sourceManifest.tag} (commit {shortCommit}) -{' '}
              {sourceManifest.license}
            </Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <Button component="a" href={sourceUrl} target="_blank" rel="noreferrer">
                Open repository
              </Button>
              <Button component={Link} href="/license">
                View license
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
