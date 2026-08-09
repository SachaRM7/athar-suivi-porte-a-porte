import {
  assertStructureDiffIsUnambiguous,
  buildBuildingStructureDiff,
  type BuildingStructureDiff,
  type DoorStructureTarget
} from '../../domain/workspace/building-structure';
import type { Building, Door, DoorFoyer } from '../../domain/workspace/models';
import type { FirestoreRestAuth } from './firestore-rest-auth';

type RestValue = {
  stringValue?: string;
  integerValue?: string;
  booleanValue?: boolean;
  nullValue?: null;
  timestampValue?: string;
  geoPointValue?: { latitude: number; longitude: number };
};

type RestDocument = {
  name: string;
  fields?: Record<string, RestValue>;
  updateTime?: string;
};

type RestErrorBody = { error?: { message?: string; status?: string } };

export type FirestoreRestStructureAuth = FirestoreRestAuth;

export type ApplyRestBuildingStructureInput = {
  workspaceId: string;
  buildingId: string;
  expectedStructureRevision: number;
  targets: readonly DoorStructureTarget[];
  authorId: string;
  createDoorId(): string;
};

function field(document: RestDocument, name: string): RestValue {
  const value = document.fields?.[name];
  if (!value) throw new Error(`Firestore REST document is missing ${name}.`);
  return value;
}

function stringField(document: RestDocument, name: string): string {
  const value = field(document, name).stringValue;
  if (typeof value !== 'string') throw new Error(`Firestore REST field ${name} must be a string.`);
  return value;
}

function integerField(document: RestDocument, name: string): number {
  const value = Number(field(document, name).integerValue);
  if (!Number.isInteger(value)) throw new Error(`Firestore REST field ${name} must be an integer.`);
  return value;
}

function booleanField(document: RestDocument, name: string): boolean {
  const value = field(document, name).booleanValue;
  if (typeof value !== 'boolean') throw new Error(`Firestore REST field ${name} must be a boolean.`);
  return value;
}

function pointField(document: RestDocument, name: string): { latitude: number; longitude: number } {
  const value = field(document, name).geoPointValue;
  if (!value || typeof value.latitude !== 'number' || typeof value.longitude !== 'number') {
    throw new Error(`Firestore REST field ${name} must be a geopoint.`);
  }
  return value;
}

function documentId(document: RestDocument): string {
  const id = document.name.split('/').at(-1);
  if (!id) throw new Error('Firestore REST document has no identifier.');
  return id;
}

function decodeBuilding(document: RestDocument): Building {
  return {
    id: documentId(document),
    addressLabel: stringField(document, 'addressLabel'),
    location: pointField(document, 'location'),
    geohash: stringField(document, 'geohash'),
    zoneId: stringField(document, 'zoneId'),
    createdBy: stringField(document, 'createdBy'),
    structureRevision: integerField(document, 'structureRevision')
  };
}

function decodeDoor(document: RestDocument): Door {
  const lastVisitIdValue = field(document, 'lastVisitId');
  const lastVisitId = typeof lastVisitIdValue.stringValue === 'string' ? lastVisitIdValue.stringValue : null;
  const foyerValue = document.fields?.foyer?.stringValue;
  const foyer: DoorFoyer = ['femme', 'homme', 'couple', 'famille'].includes(foyerValue ?? '') ? foyerValue as DoorFoyer : null;
  return {
    id: documentId(document),
    buildingId: stringField(document, 'buildingId'),
    zoneId: stringField(document, 'zoneId'),
    location: pointField(document, 'location'),
    geohash: stringField(document, 'geohash'),
    floor: integerField(document, 'floor'),
    label: stringField(document, 'label'),
    sortOrder: integerField(document, 'sortOrder'),
    active: booleanField(document, 'active'),
    currentStatusId: stringField(document, 'currentStatusId'),
    revision: integerField(document, 'revision'),
    lastVisitId,
    lastVisitAt: lastVisitId ? document.fields?.lastVisitAt?.timestampValue ?? null : null,
    createdBy: stringField(document, 'createdBy'),
    foyer,
    sisters: document.fields?.aConfierAuxSoeurs?.booleanValue === true
  };
}

function stringValue(value: string): RestValue {
  return { stringValue: value };
}

function integerValue(value: number): RestValue {
  return { integerValue: String(value) };
}

function mutableDoorFields(fields: { floor: number; label: string; sortOrder: number; active: boolean }): Record<string, RestValue> {
  return {
    floor: integerValue(fields.floor),
    label: stringValue(fields.label),
    sortOrder: integerValue(fields.sortOrder),
    active: { booleanValue: fields.active }
  };
}

function createdDoorFields(door: Door): Record<string, RestValue> {
  return {
    buildingId: stringValue(door.buildingId),
    zoneId: stringValue(door.zoneId),
    location: { geoPointValue: door.location },
    geohash: stringValue(door.geohash),
    floor: integerValue(door.floor),
    label: stringValue(door.label),
    sortOrder: integerValue(door.sortOrder),
    active: { booleanValue: door.active },
    currentStatusId: stringValue(door.currentStatusId),
    revision: integerValue(door.revision),
    lastVisitId: { nullValue: null },
    lastVisitAt: { nullValue: null },
    createdBy: stringValue(door.createdBy),
    foyer: { nullValue: null },
    aConfierAuxSoeurs: { booleanValue: door.sisters }
  };
}

async function readJson(response: Response): Promise<unknown> {
  const body = await response.json().catch(() => null) as RestErrorBody | null;
  if (response.ok) return body;
  const error = new Error(body?.error?.message ?? `Firestore REST request failed with HTTP ${response.status}.`) as Error & { code?: string };
  error.code = body?.error?.status?.toLowerCase().replaceAll('_', '-') ?? `http-${response.status}`;
  throw error;
}

export async function applyBuildingStructureWithRest(
  auth: FirestoreRestStructureAuth,
  input: ApplyRestBuildingStructureInput
): Promise<BuildingStructureDiff> {
  if (!auth.projectId) throw new Error('Firebase project ID is required for this structure change.');
  const token = await auth.getIdToken();
  if (!token) {
    const error = new Error('Firebase authentication is required for this structure change.') as Error & { code?: string };
    error.code = 'unauthenticated';
    throw error;
  }
  const project = encodeURIComponent(auth.projectId);
  const workspace = encodeURIComponent(input.workspaceId);
  const buildingId = encodeURIComponent(input.buildingId);
  const databaseName = `projects/${auth.projectId}/databases/(default)`;
  const documentsRoot = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents`;
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const buildingResponse = await fetch(`${documentsRoot}/workspaces/${workspace}/buildings/${buildingId}`, { headers });
  const buildingDocument = await readJson(buildingResponse) as RestDocument;
  const building = decodeBuilding(buildingDocument);
  if (building.structureRevision !== input.expectedStructureRevision) {
    const error = new Error('The building structure changed on another device.') as Error & { code?: string };
    error.code = 'failed-precondition';
    throw error;
  }

  const doorsResponse = await fetch(`${documentsRoot}/workspaces/${workspace}:runQuery`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: 'doors' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'buildingId' },
            op: 'EQUAL',
            value: { stringValue: building.id }
          }
        }
      }
    })
  });
  const doorRows = await readJson(doorsResponse) as Array<{ document?: RestDocument }>;
  const doors = doorRows.flatMap((row) => row.document ? [decodeDoor(row.document)] : []);
  const diff = buildBuildingStructureDiff({
    building,
    doors,
    targets: input.targets,
    authorId: input.authorId,
    createDoorId: input.createDoorId
  });
  assertStructureDiffIsUnambiguous(diff);
  if (diff.building.structureRevision === building.structureRevision) return diff;

  const buildingName = `${databaseName}/documents/workspaces/${input.workspaceId}/buildings/${input.buildingId}`;
  const doorName = (doorId: string) => `${databaseName}/documents/workspaces/${input.workspaceId}/doors/${doorId}`;
  const writes = [
    {
      update: { name: buildingName, fields: { structureRevision: integerValue(diff.building.structureRevision) } },
      updateMask: { fieldPaths: ['structureRevision'] },
      updateTransforms: [{ fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }],
      ...(buildingDocument.updateTime ? { currentDocument: { updateTime: buildingDocument.updateTime } } : {})
    },
    ...diff.created.map((door) => ({
      update: { name: doorName(door.id), fields: createdDoorFields(door) },
      updateTransforms: [{ fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }],
      currentDocument: { exists: false }
    })),
    ...diff.updated.map(({ doorId: id, ...fields }) => ({
      update: { name: doorName(id), fields: mutableDoorFields(fields) },
      updateMask: { fieldPaths: ['floor', 'label', 'sortOrder', 'active'] },
      updateTransforms: [{ fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }],
      currentDocument: { exists: true }
    })),
    ...diff.archivedDoorIds.map((id) => ({
      update: { name: doorName(id), fields: { active: { booleanValue: false } } },
      updateMask: { fieldPaths: ['active'] },
      updateTransforms: [{ fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }],
      currentDocument: { exists: true }
    }))
  ];
  if (writes.length > 450) throw new Error('The structure diff exceeds the safe Firestore mutation limit.');
  const commitResponse = await fetch(`https://firestore.googleapis.com/v1/${databaseName}/documents:commit`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ writes })
  });
  await readJson(commitResponse);
  return diff;
}
