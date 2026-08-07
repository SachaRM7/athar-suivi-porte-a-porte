import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, getDocs, orderBy, query, setDoc, startAt, endAt, writeBatch } from 'firebase/firestore';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { generateToulouseDoors, viewportGeohashRanges } from '../../src/infrastructure/geography/geohash-viewport';

const projectId = 'athar-local';
const workspace = 'workspaces/main';
const viewport = { north: 43.616, south: 43.596, east: 1.454, west: 1.426 };
const rules = readFileSync(join(process.cwd(), 'firestore.rules'), 'utf8');
let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({ projectId, firestore: { host: '127.0.0.1', port: 8180, rules } });
  const doors = generateToulouseDoors(10_000);
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, `${workspace}/members/member-geo`), { role: 'member', active: true });
    for (let offset = 0; offset < doors.length; offset += 500) {
      const batch = writeBatch(db);
      for (const door of doors.slice(offset, offset + 500)) {
        batch.set(doc(db, `${workspace}/doors/${door.id}`), door);
      }
      await batch.commit();
    }
  });
}, 60_000);

afterAll(async () => {
  await testEnv.cleanup();
});

describe('geohash viewport against Firestore Emulator', () => {
  it('returns the measured candidate budget without duplicates or false negatives', async () => {
    const db = testEnv.authenticatedContext('member-geo').firestore();
    const ranges = viewportGeohashRanges(viewport);
    const snapshots = await Promise.all(ranges.map(([start, end]) => getDocs(query(
      collection(db, `${workspace}/doors`),
      orderBy('geohash'),
      startAt(start),
      endAt(end)
    ))));
    const rawDocuments = snapshots.flatMap((snapshot) => snapshot.docs);
    const uniqueDocuments = [...new Map(rawDocuments.map((document) => [document.id, document])).values()];
    const matched = uniqueDocuments.filter((document) => {
      const data = document.data();
      return data.latitude >= viewport.south && data.latitude <= viewport.north &&
        data.longitude >= viewport.west && data.longitude <= viewport.east;
    });

    console.log('Geohash viewport metrics', { ranges: ranges.length, rawDocuments: rawDocuments.length, uniqueDocuments: uniqueDocuments.length, matched: matched.length, falsePositives: uniqueDocuments.length - matched.length });
    expect(ranges).toHaveLength(20);
    expect(rawDocuments.length).toBeGreaterThanOrEqual(uniqueDocuments.length);
    expect(matched).toHaveLength(504);
  }, 60_000);
});
