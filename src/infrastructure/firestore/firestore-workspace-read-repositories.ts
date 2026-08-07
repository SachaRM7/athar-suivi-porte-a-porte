import {
  collection,
  documentId,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  getDocsFromServer,
  limit,
  orderBy,
  query,
  startAfter,
  startAt,
  endAt,
  where,
  type DocumentData,
  type QuerySnapshot,
  type Firestore
} from 'firebase/firestore';
import type { Building, Door, Visit } from '../../domain/workspace/models';
import type { WorkspaceReadRepositories } from '../../domain/workspace/repositories';
import { decodeReadCursor, encodeReadCursor, pageSizeFor, responseSizeBytes, throwIfReadAborted, type ReadPage, type ReadRequest } from '../../domain/workspace/read-pagination';
import type { Viewport } from '../../domain/workspace/viewport';
import { viewportGeohashRanges } from '../geography/geohash-viewport';
import {
  fromFirestoreBuilding,
  fromFirestoreDoor,
  fromFirestoreMember,
  fromFirestoreStatus,
  fromFirestoreZone,
  fromFirestoreZoneStats,
  fromFirestoreVisit
} from './workspace-codecs';

const MAX_CONFIG_DOCUMENTS = 250;
const MAX_ZONE_BUILDINGS = 250;
const MAX_ZONE_DOORS = 250;
const MAX_VIEWPORT_DOCUMENTS_PER_RANGE = 120;
const MAX_VISITS_PER_DOOR = 100;

export class ReadLimitExceededError extends Error {
  constructor(readonly scope: string, readonly maximum: number) {
    super(`Firestore read limit exceeded for ${scope}; maximum ${maximum}.`);
    this.name = 'ReadLimitExceededError';
  }
}

export type FirestoreReadOptions = {
  source?: 'server' | 'cache-aware';
};

function boundedDocuments(snapshot: QuerySnapshot<DocumentData>, maximum: number, scope: string) {
  if (snapshot.size > maximum) throw new ReadLimitExceededError(scope, maximum);
  return snapshot.docs;
}

function inside(viewport: Viewport, door: { location: { latitude: number; longitude: number } }): boolean {
  return door.location.latitude >= viewport.south && door.location.latitude <= viewport.north &&
    door.location.longitude >= viewport.west && door.location.longitude <= viewport.east;
}

function sortDoors(doors: readonly Door[]): Door[] {
  return [...doors].sort((left, right) => left.floor - right.floor || left.sortOrder - right.sortOrder || left.label.localeCompare(right.label));
}

function sortVisits(visits: readonly Visit[]): Visit[] {
  return [...visits].sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));
}

function idCursor(request: ReadRequest | undefined, scope: string): string | null {
  const cursor = decodeReadCursor(request?.cursor, scope);
  if (!cursor) return null;
  if (typeof cursor.id !== 'string') throw new Error('Read cursor is invalid.');
  return cursor.id;
}

function pageFromEntries<T extends { id: string }>(items: readonly T[], documentCount: number, size: number, startedAt: number, scope: string, rangeCount = 0, duplicateCount = 0, falsePositiveCount = 0): ReadPage<T> {
  const pageItems = items.slice(0, size);
  return {
    items: pageItems,
    nextCursor: items.length > size && pageItems.length > 0 ? encodeReadCursor(scope, { id: pageItems.at(-1)!.id }) : null,
    metrics: {
      documentsRead: documentCount,
      returnedCount: pageItems.length,
      responseBytes: responseSizeBytes(pageItems),
      rangeCount,
      duplicateCount,
      falsePositiveCount,
      durationMs: Math.round(performance.now() - startedAt)
    }
  };
}

/**
 * Firestore reads stay scoped to configuration, a selected zone, one building,
 * one door, or a geohash viewport. It intentionally exposes no global door list.
 */
export function createFirestoreWorkspaceReadRepositories(db: Firestore, workspaceId: string, options: FirestoreReadOptions = {}): WorkspaceReadRepositories {
  const workspace = `workspaces/${workspaceId}`;
  const path = (collectionName: string) => collection(db, `${workspace}/${collectionName}`);
  const readDoc = options.source === 'cache-aware' ? getDoc : getDocFromServer;
  const readDocs = options.source === 'cache-aware' ? getDocs : getDocsFromServer;

  async function readBuilding(id: string): Promise<Building | null> {
    const snapshot = await readDoc(doc(db, `${workspace}/buildings/${id}`));
    return snapshot.exists() ? fromFirestoreBuilding(snapshot.id, snapshot.data()) : null;
  }

  async function readDoor(id: string): Promise<Door | null> {
    const snapshot = await readDoc(doc(db, `${workspace}/doors/${id}`));
    return snapshot.exists() ? fromFirestoreDoor(snapshot.id, snapshot.data()) : null;
  }

  return {
    members: {
      async listActive() {
        const snapshots = await readDocs(query(path('members'), where('active', '==', true), limit(MAX_CONFIG_DOCUMENTS + 1)));
        return boundedDocuments(snapshots, MAX_CONFIG_DOCUMENTS, 'active members').map((entry) => fromFirestoreMember(entry.id, entry.data()));
      },
      async get(id) {
        const snapshot = await readDoc(doc(db, `${workspace}/members/${id}`));
        return snapshot.exists() ? fromFirestoreMember(snapshot.id, snapshot.data()) : null;
      }
    },
    statuses: {
      async list() {
        const snapshots = await readDocs(query(path('statuses'), limit(MAX_CONFIG_DOCUMENTS + 1)));
        return boundedDocuments(snapshots, MAX_CONFIG_DOCUMENTS, 'statuses')
          .map((entry) => fromFirestoreStatus(entry.id, entry.data()))
          .sort((left, right) => left.order - right.order);
      }
    },
    zones: {
      async list() {
        const snapshots = await readDocs(query(path('zones'), limit(MAX_CONFIG_DOCUMENTS + 1)));
        return boundedDocuments(snapshots, MAX_CONFIG_DOCUMENTS, 'zones')
          .map((entry) => fromFirestoreZone(entry.id, entry.data()))
          .sort((left, right) => left.name.localeCompare(right.name));
      },
      async getStats(zoneId) {
        const snapshot = await readDoc(doc(db, `${workspace}/zoneStats/${zoneId}`));
        return snapshot.exists() ? fromFirestoreZoneStats(snapshot.id, snapshot.data()) : null;
      }
    },
    buildings: {
      get: readBuilding,
      async listByZone(zoneId) {
        const snapshots = await readDocs(query(path('buildings'), where('zoneId', '==', zoneId), limit(MAX_ZONE_BUILDINGS + 1)));
        return boundedDocuments(snapshots, MAX_ZONE_BUILDINGS, `buildings in zone ${zoneId}`)
          .map((entry) => fromFirestoreBuilding(entry.id, entry.data()))
          .sort((left, right) => left.addressLabel.localeCompare(right.addressLabel));
      },
      async listPageByZone(zoneId, request) {
        throwIfReadAborted(request?.signal);
        const startedAt = performance.now();
        const size = pageSizeFor(request);
        const scope = `buildings:zone:${zoneId}`;
        const after = idCursor(request, scope);
        const snapshots = await readDocs(after
          ? query(path('buildings'), where('zoneId', '==', zoneId), orderBy(documentId()), startAfter(after), limit(size + 1))
          : query(path('buildings'), where('zoneId', '==', zoneId), orderBy(documentId()), limit(size + 1)));
        throwIfReadAborted(request?.signal);
        return pageFromEntries(snapshots.docs.map((entry) => fromFirestoreBuilding(entry.id, entry.data())), snapshots.size, size, startedAt, scope);
      },
      async listByViewport(viewport, request) {
        throwIfReadAborted(request?.signal);
        const batches = await Promise.all(viewportGeohashRanges(viewport).map(([start, end]) =>
          readDocs(query(path('buildings'), orderBy('geohash'), startAt(start), endAt(end), limit(MAX_VIEWPORT_DOCUMENTS_PER_RANGE + 1)))
        ));
        const unique = new Map<string, Building>();
        for (const [index, batch] of batches.entries()) {
          for (const entry of boundedDocuments(batch, MAX_VIEWPORT_DOCUMENTS_PER_RANGE, `buildings viewport range ${index}`)) {
            const building = fromFirestoreBuilding(entry.id, entry.data());
            if (inside(viewport, building)) unique.set(building.id, building);
          }
        }
        throwIfReadAborted(request?.signal);
        return [...unique.values()];
      },
      async listPageByViewport(viewport, request) {
        throwIfReadAborted(request?.signal);
        const startedAt = performance.now();
        const size = pageSizeFor(request);
        const scope = `buildings:viewport:${viewport.north}:${viewport.south}:${viewport.east}:${viewport.west}`;
        const cursor = decodeReadCursor(request?.cursor, scope);
        const ranges = viewportGeohashRanges(viewport);
        const rangeIndex = cursor?.rangeIndex ?? 0;
        if (!Number.isInteger(rangeIndex) || typeof rangeIndex !== 'number' || rangeIndex < 0 || rangeIndex >= ranges.length) throw new Error('Read cursor is invalid.');
        const afterGeohash = cursor?.geohash;
        const afterId = cursor?.id;
        if ((afterGeohash !== undefined && typeof afterGeohash !== 'string') || (afterId !== undefined && typeof afterId !== 'string')) throw new Error('Read cursor is invalid.');
        const [start, end] = ranges[rangeIndex];
        const snapshots = await readDocs(afterGeohash && afterId
          ? query(path('buildings'), orderBy('geohash'), orderBy(documentId()), startAfter(afterGeohash, afterId), endAt(end), limit(size + 1))
          : query(path('buildings'), orderBy('geohash'), orderBy(documentId()), startAt(start), endAt(end), limit(size + 1)));
        throwIfReadAborted(request?.signal);
        const candidates = snapshots.docs.map((entry) => fromFirestoreBuilding(entry.id, entry.data()));
        const consumedCandidates = candidates.slice(0, size);
        const items = consumedCandidates.filter((building) => inside(viewport, building));
        const last = snapshots.docs.at(Math.min(snapshots.docs.length, size) - 1);
        const nextCursor = snapshots.size > size && last
          ? encodeReadCursor(scope, { rangeIndex, geohash: String(last.get('geohash')), id: last.id })
          : rangeIndex + 1 < ranges.length ? encodeReadCursor(scope, { rangeIndex: rangeIndex + 1 }) : null;
        return { items, nextCursor, metrics: { documentsRead: snapshots.size, returnedCount: items.length, responseBytes: responseSizeBytes(items), rangeCount: 1, duplicateCount: 0, falsePositiveCount: consumedCandidates.length - items.length, durationMs: Math.round(performance.now() - startedAt) } };
      }
    },
    doors: {
      get: readDoor,
      async listByViewport(viewport, request) {
        throwIfReadAborted(request?.signal);
        const batches = await Promise.all(viewportGeohashRanges(viewport).map(([start, end]) =>
          readDocs(query(path('doors'), orderBy('geohash'), startAt(start), endAt(end), limit(MAX_VIEWPORT_DOCUMENTS_PER_RANGE + 1)))
        ));
        const unique = new Map<string, Door>();
        for (const [index, batch] of batches.entries()) {
          for (const entry of boundedDocuments(batch, MAX_VIEWPORT_DOCUMENTS_PER_RANGE, `doors viewport range ${index}`)) {
            const door = fromFirestoreDoor(entry.id, entry.data());
            if (inside(viewport, door)) unique.set(door.id, door);
          }
        }
        throwIfReadAborted(request?.signal);
        return sortDoors([...unique.values()]);
      },
      async listPageByViewport(viewport, request) {
        throwIfReadAborted(request?.signal);
        const startedAt = performance.now();
        const size = pageSizeFor(request);
        const scope = `doors:viewport:${viewport.north}:${viewport.south}:${viewport.east}:${viewport.west}`;
        const cursor = decodeReadCursor(request?.cursor, scope);
        const ranges = viewportGeohashRanges(viewport);
        const rangeIndex = cursor?.rangeIndex ?? 0;
        if (!Number.isInteger(rangeIndex) || typeof rangeIndex !== 'number' || rangeIndex < 0 || rangeIndex >= ranges.length) throw new Error('Read cursor is invalid.');
        const afterGeohash = cursor?.geohash;
        const afterId = cursor?.id;
        if ((afterGeohash !== undefined && typeof afterGeohash !== 'string') || (afterId !== undefined && typeof afterId !== 'string')) throw new Error('Read cursor is invalid.');
        const [start, end] = ranges[rangeIndex];
        const snapshots = await readDocs(afterGeohash && afterId
          ? query(path('doors'), orderBy('geohash'), orderBy(documentId()), startAfter(afterGeohash, afterId), endAt(end), limit(size + 1))
          : query(path('doors'), orderBy('geohash'), orderBy(documentId()), startAt(start), endAt(end), limit(size + 1)));
        throwIfReadAborted(request?.signal);
        const candidates = snapshots.docs.map((entry) => fromFirestoreDoor(entry.id, entry.data()));
        const consumedCandidates = candidates.slice(0, size);
        const visible = consumedCandidates.filter((door) => inside(viewport, door));
        const items = sortDoors(visible);
        const last = snapshots.docs.at(Math.min(snapshots.docs.length, size) - 1);
        const nextCursor = snapshots.size > size && last
          ? encodeReadCursor(scope, { rangeIndex, geohash: String(last.get('geohash')), id: last.id })
          : rangeIndex + 1 < ranges.length ? encodeReadCursor(scope, { rangeIndex: rangeIndex + 1 }) : null;
        return { items, nextCursor, metrics: { documentsRead: snapshots.size, returnedCount: items.length, responseBytes: responseSizeBytes(items), rangeCount: 1, duplicateCount: 0, falsePositiveCount: consumedCandidates.length - visible.length, durationMs: Math.round(performance.now() - startedAt) } };
      },
      async listByBuilding(buildingId) {
        const snapshots = await readDocs(query(path('doors'), where('buildingId', '==', buildingId), limit(MAX_ZONE_DOORS + 1)));
        return sortDoors(boundedDocuments(snapshots, MAX_ZONE_DOORS, `doors in building ${buildingId}`).map((entry) => fromFirestoreDoor(entry.id, entry.data())).filter((door) => door.active));
      },
      async listPageByBuilding(buildingId, request) {
        throwIfReadAborted(request?.signal);
        const startedAt = performance.now();
        const size = pageSizeFor(request);
        const scope = `doors:building:${buildingId}`;
        const after = idCursor(request, scope);
        const snapshots = await readDocs(after
          ? query(path('doors'), where('buildingId', '==', buildingId), orderBy(documentId()), startAfter(after), limit(size + 1))
          : query(path('doors'), where('buildingId', '==', buildingId), orderBy(documentId()), limit(size + 1)));
        throwIfReadAborted(request?.signal);
        const consumed = snapshots.docs.slice(0, size).map((entry) => fromFirestoreDoor(entry.id, entry.data()));
        const pageItems = consumed.filter((door) => door.active);
        return {
          items: sortDoors(pageItems),
          nextCursor: snapshots.size > size ? encodeReadCursor(scope, { id: snapshots.docs[size - 1].id }) : null,
          metrics: { documentsRead: snapshots.size, returnedCount: pageItems.length, responseBytes: responseSizeBytes(pageItems), rangeCount: 0, duplicateCount: 0, falsePositiveCount: 0, durationMs: Math.round(performance.now() - startedAt) }
        };
      },
      async listStructureByBuilding(buildingId) {
        const snapshots = await readDocs(query(path('doors'), where('buildingId', '==', buildingId), limit(MAX_ZONE_DOORS + 1)));
        return sortDoors(boundedDocuments(snapshots, MAX_ZONE_DOORS, `door structure in building ${buildingId}`).map((entry) => fromFirestoreDoor(entry.id, entry.data())));
      }
    },
    visits: {
      async listByDoor(doorId) {
        const snapshots = await readDocs(query(path('visits'), where('doorId', '==', doorId), limit(MAX_VISITS_PER_DOOR + 1)));
        return sortVisits(boundedDocuments(snapshots, MAX_VISITS_PER_DOOR, `visits for door ${doorId}`).map((entry) => fromFirestoreVisit(entry.id, entry.data())));
      },
      async listPageByDoor(doorId, request) {
        throwIfReadAborted(request?.signal);
        const startedAt = performance.now();
        const size = pageSizeFor(request);
        const scope = `visits:door:${doorId}`;
        const after = idCursor(request, scope);
        const snapshots = await readDocs(after
          ? query(path('visits'), where('doorId', '==', doorId), orderBy(documentId()), startAfter(after), limit(size + 1))
          : query(path('visits'), where('doorId', '==', doorId), orderBy(documentId()), limit(size + 1)));
        throwIfReadAborted(request?.signal);
        return pageFromEntries(snapshots.docs.map((entry) => fromFirestoreVisit(entry.id, entry.data())), snapshots.size, size, startedAt, scope);
      }
    }
  };
}
