import Link from 'next/link';
import {
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';

import { getCustomers, type CustomerSummary } from '@/data/gst12Fixtures';

export default function CustomersPage() {
  const customers: CustomerSummary[] = getCustomers();

  return (
    <TableContainer component={Paper} sx={{ mt: 3, mx: 'auto', maxWidth: 960 }}>
      <Typography variant="h4" sx={{ p: 2 }}>
        Customers
      </Typography>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>Customer Name</TableCell>
            <TableCell>M365 Binding</TableCell>
            <TableCell>Google Binding</TableCell>
            <TableCell>Last Connected</TableCell>
            <TableCell align="right">Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {customers.map((customer) => (
            <TableRow key={customer.id}>
              <TableCell>{customer.name}</TableCell>
              <TableCell>{customer.m365BindingState}</TableCell>
              <TableCell>{customer.googleBindingState}</TableCell>
              <TableCell>{customer.lastConnectedAt}</TableCell>
              <TableCell align="right">
                <Link href={`/customers/${customer.id}/users`}>Open users</Link>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
