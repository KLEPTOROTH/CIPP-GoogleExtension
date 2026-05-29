import type { NextApiRequest, NextApiResponse } from 'next';

import { resetGst12Fixtures } from '@/data/gst12Fixtures';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (process.env.NODE_ENV === 'production' && process.env.CI !== 'true') {
    res.status(404).end();
    return;
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
    return;
  }

  resetGst12Fixtures();
  res.status(204).end();
}
