import { useRouter } from 'next/router';
import Link from 'next/link';
import {
  Box,
  Chip,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';

import { getMergedUsers, getOverallStatus, type MergedUserRow } from '@/data/gst12Fixtures';
import SuspensionStatus from '@/components/SuspensionStatus';

function badgeLabelFor(row: MergedUserRow): string | null {
  if (row.unmatchedOnGoogle && row.unmatchedOnM365) {
    return 'Unmatched both sides';
  }
  if (row.unmatchedOnGoogle) {
    return 'M365-only';
  }
  if (row.unmatchedOnM365) {
    return 'Google-only';
  }
  return null;
}

export default function CustomerUsersPage() {
  const router = useRouter();
  const customerId = Array.isArray(router.query.id) ? router.query.id[0] : router.query.id;

  const rows = customerId ? getMergedUsers(customerId) : [];

  return (
    <Box sx={{ mt: 2 }}>
      <Typography variant="h4" gutterBottom>
        Customer users
      </Typography>
      <Typography variant="subtitle1" sx={{ mb: 2 }}>
        Customer: {customerId ?? 'unknown'}
      </Typography>
      <TableContainer component={Paper} sx={{ maxWidth: 1100 }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Primary email</TableCell>
              <TableCell>License</TableCell>
              <TableCell>M365</TableCell>
              <TableCell>Google</TableCell>
              <TableCell>Last sign-in (M365)</TableCell>
              <TableCell>Last sign-in (Google)</TableCell>
              <TableCell>Mismatch</TableCell>
              <TableCell>Overall</TableCell>
              <TableCell>Action</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row) => {
              const badge = badgeLabelFor(row);
              const overall = getOverallStatus(row);
              return (
                <TableRow key={row.key}>
                  <TableCell>{row.name}</TableCell>
                  <TableCell>{row.primaryEmail}</TableCell>
                  <TableCell>
                    <Chip size="small" color="info" variant="outlined" label={row.licenseInfo} />
                  </TableCell>
                  <TableCell>{row.m365Status}</TableCell>
                  <TableCell>{row.googleStatus}</TableCell>
                  <TableCell>{row.lastSignInM365 ?? 'n/a'}</TableCell>
                  <TableCell>{row.lastSignInGoogle ?? 'n/a'}</TableCell>
                  <TableCell>{badge ? <Chip size="small" label={badge} /> : '—'}</TableCell>
                  <TableCell>
                    <SuspensionStatus status={overall} />
                  </TableCell>
                  <TableCell>
                    <Link href={`/customers/${row.customerId}/users/${row.key}`}>Open</Link>
                  </TableCell>
                </TableRow>
              );
            })}
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10}>No user data for this customer.</TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
