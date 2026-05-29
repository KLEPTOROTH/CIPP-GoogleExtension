export interface SourceManifest {
  commitSha: string;
  tag: string;
  repoUrl: string;
  license: string;
}

export const config = {
  runtime: 'edge',
};

export function buildSourceManifest(env: Partial<NodeJS.ProcessEnv> = process.env): SourceManifest {
  return {
    commitSha: env.SOURCE_COMMIT_SHA ?? 'unknown',
    tag: env.SOURCE_TAG ?? 'unknown',
    repoUrl: env.SOURCE_REPO_URL ?? 'https://github.com/KLEPTOROTH/CIPP-GoogleExtension',
    license: env.SOURCE_LICENSE ?? 'AGPL-3.0',
  };
}

export default function source() {
  return Response.json(buildSourceManifest(), {
    headers: {
      'Cache-Control': 'public, max-age=60',
    },
  });
}
