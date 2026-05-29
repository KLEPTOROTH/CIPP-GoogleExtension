export interface SourceManifest {
  commitSha: string;
  tag: string;
  repoUrl: string;
  license: string;
}

const isKnownValue = (value: string | undefined) => Boolean(value && value !== 'unknown');

export function buildSourceManifest(env: Partial<NodeJS.ProcessEnv> = process.env): SourceManifest {
  return {
    commitSha: env.SOURCE_COMMIT_SHA || 'unknown',
    tag: env.SOURCE_TAG || 'unknown',
    repoUrl: env.SOURCE_REPO_URL || 'https://github.com/KLEPTOROTH/CIPP-GoogleExtension',
    license: env.SOURCE_LICENSE || 'AGPL-3.0',
  };
}

export function buildSourceUrl(manifest: SourceManifest): string {
  const repoUrl = manifest.repoUrl.replace(/\/$/, '');
  if (isKnownValue(manifest.tag) && manifest.tag !== 'untagged') {
    return `${repoUrl}/tree/${manifest.tag}`;
  }

  if (isKnownValue(manifest.commitSha)) {
    return `${repoUrl}/commit/${manifest.commitSha}`;
  }

  return repoUrl;
}
