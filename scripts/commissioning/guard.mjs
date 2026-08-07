import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';

export const ATHAR_CLOUD_PROJECT = 'athar-dev31';
const COMMISSIONING_DIRECTORY = resolve(process.cwd(), '.athar-local', 'commissioning');

export function optionValue(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

export function assertTargetProject(args) {
  const project = optionValue(args, '--project');
  if (project !== ATHAR_CLOUD_PROJECT) {
    throw new Error(`This commissioning tool only accepts --project ${ATHAR_CLOUD_PROJECT}.`);
  }
  return project;
}

export function assertPhaseAProject(args) {
  const project = assertTargetProject(args);
  if (args.includes('--apply')) {
    throw new Error('Cloud apply is prohibited during phase A. Stop at the authorization gate.');
  }
  return project;
}

export function assertExplicitCloudApply(args) {
  const project = assertTargetProject(args);
  if (!args.includes('--apply') || process.env.ATHAR_CONFIRM_PROJECT !== ATHAR_CLOUD_PROJECT) {
    throw new Error(`Cloud apply requires --apply and ATHAR_CONFIRM_PROJECT=${ATHAR_CLOUD_PROJECT}.`);
  }
  return project;
}

export function assertManagedPath(path) {
  const resolved = resolve(path);
  const relation = relative(COMMISSIONING_DIRECTORY, resolved);
  if (relation.startsWith('..') || relation === '') {
    if (resolved !== COMMISSIONING_DIRECTORY) {
      throw new Error('Sensitive commissioning output must stay under .athar-local/commissioning.');
    }
  }
  return resolved;
}

export async function writeCommissioningJson(name, value) {
  if (!/^[a-z0-9][a-z0-9._-]+\.json$/i.test(name)) {
    throw new Error('Commissioning output name is invalid.');
  }
  await mkdir(COMMISSIONING_DIRECTORY, { recursive: true });
  const output = assertManagedPath(resolve(COMMISSIONING_DIRECTORY, name));
  await writeFile(output, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return output;
}

export function digest(value) {
  return createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
}

export function redactedError(response) {
  return {
    status: response.status,
    ok: response.ok,
    code: response.body?.error?.status ?? response.body?.error?.code ?? null
  };
}

export function assertNoSensitiveKeys(value, path = 'manifest') {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoSensitiveKeys(entry, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, entry] of Object.entries(value)) {
    if (/(password|secret|token|apikey|authorization|note)/i.test(key)) {
      throw new Error(`${path}.${key} is prohibited in commissioning manifests.`);
    }
    assertNoSensitiveKeys(entry, `${path}.${key}`);
  }
}
