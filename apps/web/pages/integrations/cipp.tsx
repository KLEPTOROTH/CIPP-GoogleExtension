import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Container,
  Divider,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';

type IntegrationStatus = 'connected' | 'degraded' | 'disconnected' | 'validating';

interface IntegrationState {
  status: IntegrationStatus;
  baseUrl?: string;
  secretRef?: string;
  customerCount?: number;
  lastValidatedAt?: string;
  lastImportedAt?: string;
  lastErrorCode?: string;
}

interface ActionResult {
  ok: boolean;
  message: string;
  state?: IntegrationState;
}

export default function CippIntegrationPage() {
  const [baseUrl, setBaseUrl] = useState('');
  const [secretRef, setSecretRef] = useState('');
  const [state, setState] = useState<IntegrationState>({ status: 'disconnected' });
  const [result, setResult] = useState<ActionResult | undefined>();
  const [busy, setBusy] = useState(false);

  async function submit(action: 'validate' | 'connect' | 'reconnect' | 'disconnect' | 'import') {
    setBusy(true);
    setResult(undefined);
    try {
      const response = await fetch(`/api/v1/integrations/cipp/${pathFor(action)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body:
          action === 'disconnect' || action === 'import'
            ? undefined
            : JSON.stringify({ baseUrl, secretRef }),
      });
      const body = (await response.json()) as {
        validation?: { ok: boolean; error?: { code: string; message: string } };
        state?: IntegrationState;
        error?: { code: string; message: string };
        importSummary?: { imported: number; repaired: number };
        summary?: { imported: number; repaired: number };
      };
      const nextState = body.state;
      if (nextState) {
        setState(nextState);
      }
      const summary = body.importSummary ?? body.summary;
      setResult({
        ok: response.ok,
        state: nextState,
        message: response.ok
          ? successMessage(action, summary)
          : body.validation?.error?.message ?? body.error?.message ?? 'CIPP request failed.',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Container maxWidth="md">
      <Box sx={{ py: 4 }}>
        <Stack spacing={3}>
          <Box>
            <Typography variant="h4" component="h1">
              CIPP integration
            </Typography>
            <Typography color="text.secondary">
              Configure the backend connection and customer mirror import.
            </Typography>
          </Box>

          <Paper sx={{ p: 3 }}>
            <Stack spacing={2}>
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography variant="h6">Connection state</Typography>
                <Chip label={state.status} color={chipColor(state.status)} />
              </Stack>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField
                  label="CIPP base URL"
                  value={baseUrl}
                  onChange={(event) => setBaseUrl(event.target.value)}
                  fullWidth
                />
                <TextField
                  label="Credential reference"
                  value={secretRef}
                  onChange={(event) => setSecretRef(event.target.value)}
                  fullWidth
                />
              </Stack>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                <Button disabled={busy} variant="outlined" onClick={() => submit('validate')}>
                  Validate
                </Button>
                <Button disabled={busy} variant="contained" onClick={() => submit('connect')}>
                  Connect
                </Button>
                <Button disabled={busy} variant="outlined" onClick={() => submit('reconnect')}>
                  Reconnect
                </Button>
                <Button disabled={busy} color="warning" onClick={() => submit('disconnect')}>
                  Disconnect
                </Button>
                <Button disabled={busy || state.status !== 'connected'} onClick={() => submit('import')}>
                  Import customers
                </Button>
              </Stack>
              {result ? (
                <Alert severity={result.ok ? 'success' : 'error'}>{result.message}</Alert>
              ) : null}
            </Stack>
          </Paper>

          <Paper sx={{ p: 3 }}>
            <Typography variant="h6">Mirror readiness</Typography>
            <Divider sx={{ my: 2 }} />
            <Stack spacing={1}>
              <Typography>Customers mirrored: {state.customerCount ?? 0}</Typography>
              <Typography>Credential reference: {state.secretRef ?? 'not connected'}</Typography>
              <Typography>Last validated: {state.lastValidatedAt ?? 'never'}</Typography>
              <Typography>Last imported: {state.lastImportedAt ?? 'never'}</Typography>
              <Typography>Last error: {state.lastErrorCode ?? 'none'}</Typography>
            </Stack>
          </Paper>
        </Stack>
      </Box>
    </Container>
  );
}

function pathFor(action: 'validate' | 'connect' | 'reconnect' | 'disconnect' | 'import'): string {
  return action === 'import' ? 'customers/import' : action;
}

function successMessage(
  action: string,
  summary?: { imported: number; repaired: number },
): string {
  if (summary) {
    return `Customer import complete: ${summary.imported} seen, ${summary.repaired} updated.`;
  }
  return `CIPP ${action} completed.`;
}

function chipColor(status: IntegrationStatus): 'success' | 'warning' | 'default' | 'info' {
  if (status === 'connected') {
    return 'success';
  }
  if (status === 'degraded') {
    return 'warning';
  }
  if (status === 'validating') {
    return 'info';
  }
  return 'default';
}
