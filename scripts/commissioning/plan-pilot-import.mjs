import { resolve } from 'node:path';
import { assertPhaseAProject, optionValue, writeCommissioningJson } from './guard.mjs';
import { readPilotManifest, validatePilotManifest } from './pilot-manifest.mjs';

const args = process.argv.slice(2);
const projectId = assertPhaseAProject(args);
const manifestPath = optionValue(args, '--manifest');
if (!manifestPath) throw new Error('Provide --manifest <path> for a dry-run import plan.');

const manifest = await readPilotManifest(resolve(manifestPath));
const summary = validatePilotManifest(manifest);
const plan = {
  kind: 'athar-pilot-import-plan',
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  projectId,
  workspaceId: manifest.workspaceId,
  mode: 'dry-run',
  summary,
  writes: {
    statuses: manifest.statuses.length,
    zones: 1,
    buildings: summary.buildingCount,
    doors: summary.doorCount,
    zoneStats: 1,
    visits: 0
  },
  refusalRules: ['unknown collection', 'door revision above zero', 'more than 25 buildings', 'more than 250 doors']
};

const output = await writeCommissioningJson(`pilot-import-plan-${Date.now()}.json`, plan);
console.log(JSON.stringify({ projectId, mode: plan.mode, output, writes: plan.writes }, null, 2));
