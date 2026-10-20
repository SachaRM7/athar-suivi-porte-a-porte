const { FieldPath, FieldValue } = require('firebase-admin/firestore');
const { computeWorkspaceStats, hash } = require('./stats-core');
const PAGE_SIZE = 400;
const MAX_DOCUMENTS = 50000;
const MAX_ZONES = 250;

/** A single read-only transaction pins every page to the same database snapshot. */
async function readWorkspaceSnapshot(db, workspaceId, { maxDocuments = MAX_DOCUMENTS, afterPage } = {}) {
  // Pin a server-observed read time: implicit read-only transactions may be stale.
  const anchor = await db.doc(`workspaces/${workspaceId}/statsState/current`).get();
  return db.runTransaction(async tx => {
    let documentsRead = 0;
    let sourceReadTime;
    const root = db.doc(`workspaces/${workspaceId}`);
    async function scan(collection) {
      const all = []; let cursor;
      do {
        let query = collection.orderBy(FieldPath.documentId()).limit(PAGE_SIZE);
        if (cursor) query = query.startAfter(cursor);
        const page = await tx.get(query);
        sourceReadTime ??= page.readTime;
        documentsRead += page.size;
        if (documentsRead > maxDocuments) throw new Error('stats-read-budget-exceeded');
        all.push(...page.docs.map(doc => ({ ...doc.data(), id: doc.id })));
        await afterPage?.(collection.path, all.length);
        if (page.size < PAGE_SIZE) break;
        cursor = page.docs.at(-1);
      } while (true);
      return all;
    }
    const zones = await scan(root.collection('zones'));
    if (zones.length > MAX_ZONES) throw new Error('stats-zone-budget-exceeded');
    const buildings = await scan(root.collection('buildings'));
    const doors = await scan(root.collection('doors'));
    const visits = await scan(root.collection('visits'));
    const catalogues = await scan(root.collection('zoneCatalogues'));
    let catalogueEntries = 0;
    for (const catalogue of catalogues) {
      if (!/^[a-f0-9]{64}$/.test(catalogue.version ?? '')) continue;
      const chunks = await scan(root.collection('zoneCatalogues').doc(catalogue.id).collection('versions').doc(catalogue.version).collection('chunks'));
      catalogue.ids = chunks.flatMap(chunk => Array.isArray(chunk.ids) ? chunk.ids : []);
      catalogueEntries += catalogue.ids.length;
      if (catalogueEntries > 250000) throw new Error('stats-catalogue-budget-exceeded');
    }
    return { zones, buildings, doors, visits, catalogues, sourceReadTime, documentsRead };
  }, { readOnly: true, readTime: anchor.readTime });
}

function compareTime(a, b) {
  return a.seconds - b.seconds || a.nanoseconds - b.nanoseconds;
}

async function publishStats(db, workspaceId, snapshot, projections) {
  const root = db.doc(`workspaces/${workspaceId}`);
  const stateRef = root.collection('statsState').doc('current');
  return db.runTransaction(async tx => {
    const state = await tx.get(stateRef);
    const previous = state.data()?.sourceReadTime;
    const failedReadTime = state.data()?.failedReadTime;
    if (failedReadTime && compareTime(failedReadTime, snapshot.sourceReadTime) >= 0) return false;
    // Neither a delayed trigger nor a slow rebuild can replace a newer generation.
    if (previous && compareTime(previous, snapshot.sourceReadTime) >= 0) return false;
    const old = await tx.get(root.collection('zoneStats'));
    const currentIds = new Set(projections.map(p => p.zoneId));
    if (projections.length + old.docs.filter(entry => !currentIds.has(entry.id)).length + 1 > 500) throw new Error('stats-publish-budget-exceeded');
    const generation = hash([snapshot.sourceReadTime.seconds, snapshot.sourceReadTime.nanoseconds, projections]);
    for (const projection of projections) {
      const { zoneId, ...data } = projection;
      tx.set(root.collection('zoneStats').doc(zoneId), {
        ...data, generation, sourceReadTime: snapshot.sourceReadTime,
        updatedAt: snapshot.sourceReadTime, computedAt: FieldValue.serverTimestamp()
      });
    }
    for (const entry of old.docs) if (!currentIds.has(entry.id)) tx.delete(entry.ref);
    tx.set(stateRef, { generation, sourceReadTime: snapshot.sourceReadTime, computedAt: FieldValue.serverTimestamp(), documentsRead: snapshot.documentsRead, state: 'ready' });
    return true;
  });
}

async function rebuildWorkspaceStats(db, workspaceId, options = {}) {
  const started = (await db.doc(`workspaces/${workspaceId}/statsState/current`).get()).readTime;
  let snapshot;
  try {
    snapshot = await readWorkspaceSnapshot(db, workspaceId, options);
    const projections = computeWorkspaceStats(snapshot);
    if (options.dryRun) return { projections, documentsRead: snapshot.documentsRead, sourceReadTime: snapshot.sourceReadTime };
    const published = await publishStats(db, workspaceId, snapshot, projections);
    return { published, zones: projections.length, invalidZones: projections.filter(p => p.completeness !== 'complete').length, documentsRead: snapshot.documentsRead };
  }
  catch (error) {
    if (!options.dryRun) {
      await db.runTransaction(async tx => {
        const stateRef = db.doc(`workspaces/${workspaceId}/statsState/current`);
        const state = await tx.get(stateRef);
        if (state.data()?.sourceReadTime && compareTime(state.data().sourceReadTime, started) > 0) return;
        const old = await tx.get(db.collection(`workspaces/${workspaceId}/zoneStats`));
        for (const entry of old.docs) tx.update(entry.ref, { schemaVersion: 2, completeness: 'incomplete' });
        tx.set(stateRef, { state: 'failed', failedReadTime: started, lastFailureAt: FieldValue.serverTimestamp(), errorCode: 'reconstruction-failed' }, { merge: true });
      });
    }
    throw error;
  }
}
module.exports = { readWorkspaceSnapshot, publishStats, rebuildWorkspaceStats, compareTime };
