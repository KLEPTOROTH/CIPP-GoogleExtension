import { resetGst12Fixtures } from '@/data/gst12Fixtures';

export const config = {
  runtime: 'edge',
};

export default function handler(req: Request) {
  if (process.env.NODE_ENV === 'production' && process.env.CI !== 'true') {
    return new Response(null, { status: 404 });
  }

  if (req.method !== 'POST') {
    return Response.json(
      { error: 'METHOD_NOT_ALLOWED' },
      {
        status: 405,
        headers: {
          Allow: 'POST',
        },
      },
    );
  }

  resetGst12Fixtures();
  return new Response(null, { status: 204 });
}
