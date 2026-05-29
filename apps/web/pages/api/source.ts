import { buildSourceManifest } from '@/sourceManifest';

export const config = {
  runtime: 'edge',
};

export { buildSourceManifest };

export default function source() {
  return Response.json(buildSourceManifest(), {
    headers: {
      'Cache-Control': 'public, max-age=60',
    },
  });
}
