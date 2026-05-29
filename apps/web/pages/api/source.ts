import type { NextApiRequest, NextApiResponse } from 'next';

export interface SourceManifest {
  commitSha: string;
  tag: string;
  repoUrl: string;
  license: string;
}

export function buildSourceManifest(env: Partial<NodeJS.ProcessEnv> = process.env): SourceManifest {
  return {
    commitSha: env.SOURCE_COMMIT_SHA ?? 'unknown',
    tag: env.SOURCE_TAG ?? 'unknown',
    repoUrl: env.SOURCE_REPO_URL ?? 'https://github.com/KLEPTOROTH/CIPP-GoogleExtension',
    license: env.SOURCE_LICENSE ?? 'AGPL-3.0',
  };
}

export default function source(_request: NextApiRequest, response: NextApiResponse<SourceManifest>) {
  response.setHeader('Cache-Control', 'public, max-age=60');
  response.status(200).json(buildSourceManifest());
}
