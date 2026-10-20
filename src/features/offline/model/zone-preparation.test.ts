import { describe, expect, it } from 'vitest';
import { assetReadiness, fingerprint, prepareZoneData, verifyZoneData, type PreparationQuery, type PreparedDocument } from './zone-preparation';
import { WORKSPACE_STATUS_IDS } from '../../../domain/workspace/status-ids';

const identity = { projectId: 'test', workspaceId: 'main', userId: 'member', zoneId: 'zone' };
const data: Record<string, PreparedDocument[]> = {
  'members:member': [{ id: 'member', data: { active: true, displayName: 'Membre' } }],
  zones: [{ id: 'zone', data: { name: 'Zone' } }],
  statuses: WORKSPACE_STATUS_IDS.map(id => ({ id, data: { active: true } })),
  'buildings:zone': [{ id: 'building', data: {} }],
  'doors:building': [{ id: 'door', data: { active: true, foyer: 'famille', revision: 1 } }, { id: 'archived', data: { active: false } }],
  'visits:door': [{ id: 'visit', data: { authorId: 'member', note: 'note privée' } }]
};
const read = async (scope: PreparationQuery) => data[`${scope.collection}${scope.id || scope.value ? `:${scope.id ?? scope.value}` : ''}`] ?? [];
const signal = () => new AbortController().signal;

describe('zone preparation contract', () => {
  it('downloads histories, distinguishes archived doors and produces only opaque receipts', async () => {
    const receipt = await prepareZoneData(identity, read, signal(), () => undefined);
    expect(receipt).toMatchObject({ buildingCount: 1, doorCount: 1, schema: 1 });
    expect(receipt.queries.map(item => item.query.collection)).toContain('visits');
    expect(JSON.stringify(receipt)).not.toMatch(/famille|foyer|note privée/);
    expect(await verifyZoneData(receipt, read, signal())).toBe(true);
  });
  it('detects a missing cached document and a changed door, without accepting a partial count', async () => {
    const receipt = await prepareZoneData(identity, read, signal(), () => undefined);
    expect(await verifyZoneData(receipt, async query => query.collection === 'doors' ? [] : read(query), signal())).toBe(false);
    expect(await verifyZoneData(receipt, async query => query.collection === 'doors' ? [{ id: 'door', data: { active: true, revision: 2 } }, { id: 'archived', data: { active: false } }] : read(query), signal())).toBe(false);
  });
  it('allows a server-verified empty zone but refuses an unverified empty receipt', async () => {
    const receipt = await prepareZoneData(identity, async query => query.collection === 'buildings' ? [] : read(query), signal(), () => undefined);
    expect(receipt.buildingCount).toBe(0);
    expect(await verifyZoneData({ ...receipt, queries: [] }, read, signal())).toBe(false);
  });
  it('stops on cancellation, an inactive membership or a failed server read', async () => {
    const abort = new AbortController();
    abort.abort();
    await expect(prepareZoneData(identity, read, abort.signal, () => undefined)).rejects.toThrow();
    await expect(prepareZoneData(identity, async query => query.collection === 'members' ? [] : read(query), signal(), () => undefined)).rejects.toThrow('accès');
    await expect(prepareZoneData(identity, async () => { throw new Error('permission-denied'); }, signal(), () => undefined)).rejects.toThrow('permission-denied');
  });
  it('refuses a preparation above the document budget', async () => {
    await expect(prepareZoneData(identity, async query => query.collection === 'buildings' ? Array.from({ length: 10_001 }, (_, index) => ({ id: String(index), data: {} })) : read(query), signal(), () => undefined)).rejects.toThrow('capacité');
  });
  it('refuses readiness when a canonical status is missing or inactive', async () => {
    await expect(prepareZoneData(identity, async query => query.collection === 'statuses' ? [{ id: 'retry', data: { active: true } }] : read(query), signal(), () => undefined)).rejects.toThrow('statuts terrain est incomplète');
  });
  it('has stable fingerprints irrespective of document and field order', async () => {
    expect(await fingerprint([{ id: '2', data: { b: 1, a: 2 } }, { id: '1', data: {} }])).toBe(await fingerprint([{ id: '1', data: {} }, { id: '2', data: { a: 2, b: 1 } }]));
  });
  it('does not declare a demo, uncovered region or missing lazy chunk fully ready', () => {
    const bbox = { west: 1, south: 2, east: 3, north: 4 };
    const assets = { version: 'v', shell: true, fonts: true, archives: { '/app/fixtures/toulouse.pmtiles': { ...bbox, bytes: 127 }, '/app/fixtures/batiments-carmes.pmtiles': { ...bbox, bytes: 127 } } };
    expect(assetReadiness(assets, bbox, '/app/').complete).toBe(false);
    const full = { ...assets, archives: { ...assets.archives, '/app/tiles/batiments-31.pmtiles': { ...bbox, bytes: 127 } } };
    expect(assetReadiness(full, bbox, '/app/').complete).toBe(true);
    expect(assetReadiness({ ...full, shell: false }, bbox, '/app/').complete).toBe(false);
    expect(assetReadiness(full, { ...bbox, west: 0 }, '/app/').complete).toBe(false);
  });
});
