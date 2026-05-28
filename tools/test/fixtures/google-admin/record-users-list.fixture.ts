import { OAuth2Client } from 'google-auth-library';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import http from 'node:http';
import https from 'node:https';

import { withFixturePlayback, redactHeaders } from '../shared/nock-fixture-harness';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.resolve(scriptDir, 'users.list.fixture.json');

interface UsersListEnvelope {
  users: Array<{ id: string; primaryEmail: string }>;
  nextPageToken?: string;
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
            reject(new Error(`Google Admin users.list request failed: ${status} ${body}`));
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

const buildAuthClient = (): OAuth2Client => {
  const clientId = process.env.GOOGLE_CLIENT_ID ?? 'sandbox-client-id';
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET ?? 'sandbox-client-secret';
  const redirectUri = process.env.GOOGLE_AUTH_REDIRECT_URI ?? 'http://localhost';
  const client = new OAuth2Client(clientId, clientSecret, redirectUri);

  const token = process.env.GOOGLE_TEST_ACCESS_TOKEN ?? process.env.GOOGLE_ACCESS_TOKEN ?? 'fixture-token';
  const isReplayMode = process.env.FIXTURE_MODE !== 'record';
  const useFixtureToken = process.env.GOOGLE_AUTH_TEST_MODE === 'true' || isReplayMode;
  if (useFixtureToken || token) {
    client.setCredentials({ access_token: token });
  }

  return client;
};

const runUsersList = async (): Promise<UsersListEnvelope> => {
  const client = buildAuthClient();
  const headers = await client.getRequestHeaders();
  const base = process.env.GOOGLE_ADMIN_BASE_URL ?? 'https://admin.googleapis.com';
  const customer = process.env.GOOGLE_CUSTOMER_ID ?? 'my_customer';

  const endpoint = new URL(`${base}/admin/directory/v1/users`);
  endpoint.searchParams.set('customer', customer);
  endpoint.searchParams.set('maxResults', process.env.GOOGLE_ADMIN_MAX_RESULTS ?? '50');

  const payload = await requestJson(endpoint, {
    ...(headers as Record<string, string>),
    'Content-Type': 'application/json',
    Accept: 'application/json',
  });
  if (!payload || typeof payload !== 'object') {
    throw new Error('expected JSON payload from Google Admin users.list');
  }
  return payload as UsersListEnvelope;
};

export const runGoogleAdminUsersListFixture = async (): Promise<UsersListEnvelope> => {
  return withFixturePlayback<UsersListEnvelope>({
    fixturePath: FIXTURE_PATH,
    action: runUsersList,
    redactors: [redactHeaders(['authorization', 'x-goog-authuser', 'x-goog-api-client'])],
  });
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  runGoogleAdminUsersListFixture().catch((error) => {
    // Keep CLI execution behavior explicit for CI logs.
    console.error(error);
    process.exitCode = 1;
  });
}
