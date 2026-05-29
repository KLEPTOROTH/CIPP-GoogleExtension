import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Box, Button, Container, Paper, Stack, Typography } from '@mui/material';

interface SourceManifest {
  commitSha: string;
  tag: string;
  repoUrl: string;
  license: string;
}

const isKnownValue = (value: string | undefined) => Boolean(value && value !== 'unknown');

export function buildSourceUrl(manifest: SourceManifest): string {
  const repoUrl = manifest.repoUrl.replace(/\/$/, '');
  if (isKnownValue(manifest.tag) && manifest.tag !== 'untagged') {
    return `${repoUrl}/tree/${manifest.tag}`;
  }

  if (isKnownValue(manifest.commitSha)) {
    return `${repoUrl}/commit/${manifest.commitSha}`;
  }

  return repoUrl;
}

export default function SourcePage() {
  const [sourceManifest, setSourceManifest] = useState<SourceManifest | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadSourceManifest() {
      try {
        const response = await fetch('/api/source');
        if (!response.ok) {
          throw new Error(`Source manifest request failed: ${response.status}`);
        }
        const manifest = (await response.json()) as SourceManifest;
        if (isMounted) {
          setSourceManifest(manifest);
        }
      } catch {
        if (isMounted) {
          setLoadFailed(true);
        }
      }
    }

    void loadSourceManifest();

    return () => {
      isMounted = false;
    };
  }, []);

  const sourceUrl = sourceManifest ? buildSourceUrl(sourceManifest) : undefined;
  const shortCommit = sourceManifest?.commitSha.slice(0, 8);

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
            {sourceManifest ? (
              <Typography>
                Source: GitHub @ {sourceManifest.tag} (commit {shortCommit}) -{' '}
                {sourceManifest.license}
              </Typography>
            ) : null}
            {loadFailed ? (
              <Typography color="error">Source manifest unavailable.</Typography>
            ) : null}
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <Button
                component="a"
                href={sourceUrl}
                target="_blank"
                rel="noreferrer"
                disabled={!sourceUrl}
              >
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
