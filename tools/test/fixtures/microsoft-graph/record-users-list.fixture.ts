import { withFixturePlayback, redactHeaders } from '../shared/nock-fixture-harness';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import http from 'node:http';
import https from 'node:https';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.resolve(scriptDir, 'users.list.fixture.json');

interface UsersListEnvelope {
  value: Array<{ id: string; displayName?: string; userPrincipalName?: string }>;
  '@odata.nextLink'?: string;
}

const requestJson = async (endpoint: URL, headers: Record<string, string>): Promise<unknown> => {
  const transport = endpoint.protocol === 'http:' ? http : https;
  return new Promise((resolve, reject) => {
    const req = transport.request(
      endpoint,
      {
        method: 'GET',
        headers,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8');
          const status = res.statusCode ?? 0;
          if (status < 200 || status >= 300) {
            reject(new Error(`Graph users.list request failed: ${status} ${body}`));
            return;
          }
          try {
            resolve(JSON.parse(body));
          } catch (error) {
            reject(error);
          }
        });
      },
    );
    req.on('error', reject);
    req.end();
  });
};

const runUsersList = async (): Promise<UsersListEnvelope> => {
  const token = process.env.MS_GRAPH_TOKEN;
  const tenant = process.env.MS_GRAPH_TENANT_ID ?? 'v1.0';
  const base = process.env.MS_GRAPH_BASE_URL ?? 'https://graph.microsoft.com';
  const request = new URL(`${base}/${tenant}/users`);
  request.searchParams.set('$select', 'id,displayName,userPrincipalName');
  request.searchParams.set('$top', process.env.MS_GRAPH_TOP ?? '10');

  return (await requestJson(request, {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    'Content-Type': 'application/json',
  })) as UsersListEnvelope;
};

export const runMicrosoftGraphUsersListFixture = async (): Promise<UsersListEnvelope> => {
  return withFixturePlayback<UsersListEnvelope>({
    fixturePath: FIXTURE_PATH,
    action: runUsersList,
    redactors: [redactHeaders(['authorization', 'x-ms-edge-ref', 'x-client-sku', 'x-client-ver'])],
  });
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  runMicrosoftGraphUsersListFixture().catch((error) => {
    // Keep CLI execution behavior explicit for CI logs.
    console.error(error);
    process.exitCode = 1;
  });
}
