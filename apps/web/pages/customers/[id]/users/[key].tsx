import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import type { GetStaticPaths, GetStaticProps } from 'next';
import { Box, Card, CardContent, Divider, Stack, Typography } from '@mui/material';

import {
  getCustomers,
  getMergedUsers,
  getOverallStatus,
  getUser,
  performUnifiedAction,
  retryUserSide,
  type ActionOutcome,
  type ActionFailure,
  type ActionVerb,
  type MergedUserRow,
} from '@/data/gst12Fixtures';
import SuspensionStatus from '@/components/SuspensionStatus';
import UnifiedSuspendButton from '@/components/UnifiedSuspendButton';
import TypedErrorBanner from '@/components/TypedErrorBanner';

interface CustomerUserPageProps {
  customerId: string;
  userKey: string;
}

export const getStaticPaths: GetStaticPaths = () => ({
  paths: getCustomers().flatMap((customer) =>
    getMergedUsers(customer.id).map((user) => ({
      params: { id: customer.id, key: user.key },
    })),
  ),
  fallback: false,
});

export const getStaticProps: GetStaticProps<CustomerUserPageProps> = ({ params }) => {
  const customerId = Array.isArray(params?.id) ? params.id[0] : params?.id;
  const userKey = Array.isArray(params?.key) ? params.key[0] : params?.key;

  if (!customerId || !userKey || !getUser(customerId, userKey)) {
    return { notFound: true };
  }

  return {
    props: {
      customerId,
      userKey,
    },
  };
};

export default function CustomerUserPage({ customerId, userKey }: CustomerUserPageProps) {
  const router = useRouter();

  const [status, setStatus] = useState<ActionOutcome>('success-both');
  const [cachedUser, setCachedUser] = useState<MergedUserRow | undefined>(() =>
    getUser(customerId, userKey),
  );
  const [error, setError] = useState<ActionFailure | null>(null);

  useEffect(() => {
    if (!customerId || !userKey) {
      setCachedUser(undefined);
      return;
    }

    setCachedUser(getUser(customerId, userKey));
  }, [customerId, userKey]);

  const user = cachedUser;

  if (!user) {
    return <Typography>User not found.</Typography>;
  }

  const overall = getOverallStatus(user);
  const action: ActionVerb = overall === 'Active' ? 'suspend' : 'resume';

  function run(actionVerb: ActionVerb): void {
    if (!customerId || !userKey) {
      return;
    }

    const result = performUnifiedAction(customerId, userKey, actionVerb);
    setStatus(result.outcome);
    setCachedUser(result.user);
    router.replace(router.asPath).catch(() => undefined);
    setError(result.error ?? null);
    if (result.error) {
      setStatus('failure-both');
    }
  }

  function retry(side: 'm365' | 'google'): void {
    if (!customerId || !userKey) {
      return;
    }

    const result = retryUserSide(customerId, userKey, side);
    setStatus(result.outcome);
    setCachedUser(result.user);
    setError(result.error ?? null);
    router.replace(router.asPath).catch(() => undefined);
    if (result.error) {
      setStatus('failure-both');
    }
  }

  return (
    <Card variant="outlined" sx={{ mt: 3, maxWidth: 820 }}>
      <CardContent>
        <Typography variant="h4">User Detail</Typography>
        <Typography color="text.secondary">{user.name}</Typography>
        <Typography>{user.primaryEmail}</Typography>

        <Divider sx={{ my: 2 }} />

        <Stack spacing={2}>
          <Box aria-live="polite">
            <Typography fontWeight="bold">Overall status</Typography>
            <SuspensionStatus
              status={overall}
              onRetryGoogle={() => retry('google')}
              onRetryM365={() => retry('m365')}
            />
          </Box>

          <Typography>
            M365: {user.m365Status} &nbsp; Google: {user.googleStatus}
          </Typography>
          <Typography variant="body2">Customer: {user.customerId}</Typography>
          <Typography variant="body2">Key: {user.key}</Typography>
          <Typography variant="body2">License: {user.licenseInfo}</Typography>

          <Box>
            <UnifiedSuspendButton
              action={action}
              outcome={status}
              disabled={overall === 'Inconsistent'}
              onClick={() => run(action)}
            />
          </Box>

          {error ? (
            <TypedErrorBanner
              code={error.code}
              message={error.message}
              requestId={error.requestId}
            />
          ) : null}
        </Stack>
      </CardContent>
    </Card>
  );
}
