import { Button, Chip, Stack, Typography } from '@mui/material';

import type { SuspensionState } from '@/data/gst12Fixtures';

interface Props {
  status: SuspensionState;
  onRetryGoogle?: () => void;
  onRetryM365?: () => void;
}

const chipColorForStatus = (status: SuspensionState): 'success' | 'warning' | 'error' | 'default' => {
  if (status === 'Active') {
    return 'success';
  }
  if (status === 'Suspended') {
    return 'default';
  }
  if (status === 'Inconsistent') {
    return 'warning';
  }
  return 'error';
};

export default function SuspensionStatus({ status, onRetryGoogle, onRetryM365 }: Props) {
  return (
    <Stack spacing={1} alignItems="flex-start">
      <Chip label={status} color={chipColorForStatus(status)} />
      {status === 'Inconsistent' ? (
        <Stack direction="row" spacing={1}>
          {onRetryGoogle ? (
            <Button
              size="small"
              variant="outlined"
              color="warning"
              onClick={onRetryGoogle}
              aria-label="Retry Google sync"
            >
              Retry Google
            </Button>
          ) : null}
          {onRetryM365 ? (
            <Button
              size="small"
              variant="outlined"
              color="warning"
              onClick={onRetryM365}
              aria-label="Retry M365 sync"
            >
              Retry M365
            </Button>
          ) : null}
          {!onRetryGoogle && !onRetryM365 ? (
            <Typography variant="caption" color="warning.main">
              Retry actions are unavailable for this row.
            </Typography>
          ) : null}
        </Stack>
      ) : null}
    </Stack>
  );
}
