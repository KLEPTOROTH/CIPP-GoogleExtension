import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import path from 'node:path';
import process from 'node:process';
import nock from 'nock';

export type NockFixture = unknown[];

export type FixtureRedactor = (interaction: Record<string, unknown>) => void;

export interface FixtureHarnessOptions {
  fixturePath: string;
  action: () => Promise<unknown>;
  redactors?: FixtureRedactor[];
}

const MODE = process.env.FIXTURE_MODE === 'record' ? 'record' : 'replay';

const ensureJsonArray = (value: unknown): Record<string, unknown>[] => {
  if (!Array.isArray(value)) {
    throw new Error('fixture must be an array of nock interactions');
  }
  return value as Record<string, unknown>[];
};

const normalizeInteraction = (interaction: Record<string, unknown>): Record<string, unknown> => {
  const headers = (interaction.reqheaders as Record<string, unknown> | undefined) ?? {};
  delete headers.authorization;
  delete headers.Authorization;
  delete headers['x-goog-authuser'];
  delete headers['x-goog-api-client'];
  delete headers['User-Agent'];
  delete headers.date;
  delete headers['Content-Type'];
  interaction.reqheaders = headers;
  if (typeof interaction.path === 'string') {
    interaction.path = interaction.path.replace(
      /([?&])(access_token|token)=([^&]+)/gi,
      '$1$2=<redacted>',
    );
  }
  return interaction;
};

const persistFixture = async (fixturePath: string, interactions: Record<string, unknown>[]) => {
  const normalized = interactions
    .map((entry) => normalizeInteraction(structuredClone(entry)))
    .sort((left, right) => {
      const leftMethod = String(left.method ?? '');
      const rightMethod = String(right.method ?? '');
      const leftPath = String(left.path ?? '');
      const rightPath = String(right.path ?? '');
      const leftStatus = String(left.status ?? '');
      const rightStatus = String(right.status ?? '');
      const leftKey = `${String(left.scope)}|${leftMethod}|${left.status}|${leftPath}`;
      const rightKey = `${String(right.scope)}|${rightMethod}|${rightStatus}|${rightPath}`;
      return leftKey.localeCompare(rightKey);
    });
  await mkdir(dirname(fixturePath), { recursive: true });
  await writeFile(fixturePath, JSON.stringify(normalized, null, 2), 'utf8');
};

const loadFixture = async (fixturePath: string): Promise<Record<string, unknown>[]> => {
  if (!existsSync(fixturePath)) {
    throw new Error(`fixture not found: ${fixturePath}. Record it once with FIXTURE_MODE=record.`);
  }
  const raw = await readFile(fixturePath, 'utf8');
  return ensureJsonArray(JSON.parse(raw));
};

export const redactHeaders = (headerNames: string[]): FixtureRedactor => {
  return (interaction) => {
    const headers = (interaction.reqheaders as Record<string, unknown> | undefined) ?? {};
    for (const header of headerNames) {
      for (const key of Object.keys(headers)) {
        if (key.toLowerCase() === header.toLowerCase()) {
          delete headers[key];
        }
      }
    }
    interaction.reqheaders = headers;
  };
};

export const redactBodyField = (fieldPath: string[]): FixtureRedactor => {
  return (interaction) => {
    let cursor = interaction;
    for (let i = 0; i < fieldPath.length - 1; i += 1) {
      const token = fieldPath[i];
      if (!token || typeof cursor[token] !== 'object' || cursor[token] === null) {
        return;
      }
      cursor = cursor[token] as Record<string, unknown>;
    }
    const last = fieldPath[fieldPath.length - 1];
    if (last && cursor && typeof cursor === 'object' && last in cursor) {
      cursor[last] = '[redacted]';
    }
  };
};

export const withFixturePlayback = async <T>(options: FixtureHarnessOptions): Promise<T> => {
  if (MODE === 'record') {
    nock.recorder.clear();
    nock.recorder.rec({
      output_objects: true,
      dont_print: true,
      enable_reqheaders_recording: true,
    });
    try {
      return (await options.action()) as T;
    } finally {
      const recordings = nock.recorder.play();
      nock.recorder.clear();
      nock.restore();
      const normalized = recordings.map((entry) => {
        let result = entry as Record<string, unknown>;
        for (const redactor of options.redactors ?? []) {
          redactor(result);
        }
        return normalizeInteraction(result);
      });
      await persistFixture(options.fixturePath, normalized);
    }
  }

  const recordings = await loadFixture(options.fixturePath);
  for (const redactor of options.redactors ?? []) {
    recordings.forEach((entry) => redactor(entry));
  }
  nock.define(recordings);
  nock.disableNetConnect();
  try {
    const result = (await options.action()) as T;
    if (!nock.isDone()) {
      throw new Error(
        `fixture replay did not consume all entries from ${path.relative(process.cwd(), options.fixturePath)}`,
      );
    }
    return result;
  } finally {
    nock.cleanAll();
    nock.enableNetConnect();
  }
};
