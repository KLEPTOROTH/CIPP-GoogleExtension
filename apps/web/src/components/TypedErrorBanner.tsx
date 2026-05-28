import { Alert, AlertTitle } from '@mui/material';

interface Props {
  code: string;
  message: string;
  requestId?: string;
}

export default function TypedErrorBanner({ code, message, requestId }: Props) {
  return (
    <Alert severity="error" sx={{ mt: 2 }}>
      <AlertTitle>
        API Error <code>{code}</code>
      </AlertTitle>
      <strong>{message}</strong>
      {requestId ? ` requestId: ${requestId}` : null}
    </Alert>
  );
}
