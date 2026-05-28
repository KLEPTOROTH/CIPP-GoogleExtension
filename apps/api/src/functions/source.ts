// AGPL §13 — source availability endpoint.
//
// The license requires that any network user of a modified version can
// obtain the corresponding source. This endpoint exposes the exact
// commit and tag of the running build plus the repo URL, so the §13
// obligation is satisfied in a machine- and human-readable way.
//
// The Release Engineer is the named owner of keeping these env vars
// accurate on every deploy; see `.github/workflows/deploy-azure.yml`
// for the stamping step and `docs/agpl-source-availability.md` for
// the contract.

import {
  app,
  type HttpRequest,
  type InvocationContext,
  type HttpResponseInit,
} from '@azure/functions';

export interface SourceManifest {
  commitSha: string;
  tag: string;
  repoUrl: string;
  license: string;
}

export function buildSourceManifest(env: NodeJS.ProcessEnv = process.env): SourceManifest {
  return {
    commitSha: env.SOURCE_COMMIT_SHA ?? 'unknown',
    tag: env.SOURCE_TAG ?? 'unknown',
    repoUrl: env.SOURCE_REPO_URL ?? 'https://github.com/KLEPTOROTH/CIPP-GoogleExtension',
    license: env.SOURCE_LICENSE ?? 'AGPL-3.0',
  };
}

export async function sourceHandler(
  _request: HttpRequest,
  _context: InvocationContext,
): Promise<HttpResponseInit> {
  return {
    status: 200,
    jsonBody: buildSourceManifest(),
    headers: {
      // Short cache — clients may refresh after a deploy; one minute
      // is short enough that the §13 link stays in sync without
      // hammering the Function App.
      'Cache-Control': 'public, max-age=60',
    },
  };
}

app.http('source', {
  route: 'source',
  methods: ['GET'],
  authLevel: 'anonymous', // §13 entitled users must be able to read it without our auth
  handler: sourceHandler,
});
