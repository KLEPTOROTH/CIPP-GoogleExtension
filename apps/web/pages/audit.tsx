import { useMemo, useState } from 'react';
import {
  Box,
  Button,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';

import { getAuditLog, type UserAuditRow } from '@/data/gst12Fixtures';

const PAGE_SIZE = 5;

export default function AuditPage() {
  const [customerId, setCustomerId] = useState('');
  const [actor, setActor] = useState('');
  const [target, setTarget] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [cursor, setCursor] = useState(0);

  const { rows, nextCursor } = useMemo<{ rows: UserAuditRow[]; nextCursor?: number }>(() => {
    return getAuditLog({
      customerId: customerId || undefined,
      actor: actor || undefined,
      target: target || undefined,
      from: from || undefined,
      to: to || undefined,
      cursor,
      limit: PAGE_SIZE,
    });
  }, [actor, cursor, customerId, from, target, to]);

  return (
    <Box sx={{ mt: 2, maxWidth: 1100 }}>
      <Typography variant="h4" gutterBottom>
        Audit Log
      </Typography>

      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: 'repeat(4, 1fr)', mb: 2 }}>
        <TextField
          size="small"
          label="Customer"
          value={customerId}
          onChange={(event) => {
            setCursor(0);
            setCustomerId(event.target.value);
          }}
        />
        <TextField
          size="small"
          label="Actor"
          value={actor}
          onChange={(event) => {
            setCursor(0);
            setActor(event.target.value);
          }}
        />
        <TextField
          size="small"
          label="Target"
          value={target}
          onChange={(event) => {
            setCursor(0);
            setTarget(event.target.value);
          }}
        />
        <TextField
          size="small"
          label="From ISO"
          value={from}
          onChange={(event) => {
            setCursor(0);
            setFrom(event.target.value);
          }}
        />
        <TextField
          size="small"
          label="To ISO"
          value={to}
          onChange={(event) => {
            setCursor(0);
            setTo(event.target.value);
          }}
        />
      </Box>

      <TableContainer component={Paper}>
        <Table aria-label="Audit log">
          <TableHead>
            <TableRow>
              <TableCell>Timestamp</TableCell>
              <TableCell>Customer</TableCell>
              <TableCell>Actor</TableCell>
              <TableCell>Target</TableCell>
              <TableCell>Action</TableCell>
              <TableCell>Outcome</TableCell>
              <TableCell>Reason</TableCell>
            </TableRow>
          </TableHead>
        <TableBody>
            {rows.map((row, index) => (
              <TableRow
                key={row.id}
                tabIndex={0}
                sx={{ cursor: 'default' }}
                aria-label={`audit row ${index + 1}`}
              >
                <TableCell>{row.timestamp}</TableCell>
                <TableCell>{row.customerId}</TableCell>
                <TableCell>{row.actor}</TableCell>
                <TableCell>{row.target}</TableCell>
                <TableCell>{row.action}</TableCell>
                <TableCell>{row.outcome}</TableCell>
                <TableCell>{row.reason ?? '—'}</TableCell>
              </TableRow>
            ))}
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7}>No audit rows match the selected filters.</TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </TableContainer>

      <Box sx={{ mt: 2 }}>
        <Button
          variant="outlined"
          disabled={cursor === 0}
          onClick={() => {
            setCursor(Math.max(0, cursor - PAGE_SIZE));
          }}
          aria-label="Previous audit page"
          sx={{ mr: 1 }}
        >
          Previous
        </Button>
        <Button
          variant="contained"
          disabled={nextCursor === undefined}
          onClick={() => {
            if (nextCursor !== undefined) {
              setCursor(nextCursor);
            }
          }}
          aria-label="Next audit page"
        >
          Next
        </Button>
      </Box>
    </Box>
  );
}
