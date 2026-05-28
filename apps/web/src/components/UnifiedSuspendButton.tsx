import { Button } from '@mui/material';

import type { ActionOutcome, ActionVerb } from '@/data/gst12Fixtures';

interface Props {
  action: ActionVerb;
  outcome: ActionOutcome;
  disabled?: boolean;
  inFlight?: boolean;
  onClick: () => void;
}

const outcomeLabel = (outcome: ActionOutcome, action: ActionVerb): string => {
  const verb = action === 'suspend' ? 'Suspend' : 'Resume';
  if (outcome === 'failure-both') {
    return `${verb} in both systems — failed`;
  }
  if (outcome === 'partial') {
    return `${verb} in both systems — retry needed`;
  }
  return `${verb} in both systems`;
};

const outcomeColor = (outcome: ActionOutcome): 'primary' | 'warning' | 'error' => {
  if (outcome === 'success-both') {
    return 'primary';
  }
  if (outcome === 'partial') {
    return 'warning';
  }
  return 'error';
};

export default function UnifiedSuspendButton({ action, outcome, disabled, inFlight, onClick }: Props) {
  return (
    <Button
      color={outcomeColor(outcome)}
      variant="contained"
      onClick={onClick}
      disabled={disabled || inFlight}
      aria-label={outcomeLabel(outcome, action)}
    >
      {outcomeLabel(outcome, action)}
    </Button>
  );
}
