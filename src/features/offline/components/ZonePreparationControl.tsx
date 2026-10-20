import { useCallback, useEffect, useRef, useState } from 'react';
import type { Zone } from '../../../domain/workspace/models';
import { Dialog } from '../../../design/components';
import { environment } from '../../../app/config/environment';
import { getFirebaseClient } from '../../../infrastructure/firebase/client';
import { isTrustedDevice, setTrustedDevice } from '../../../infrastructure/offline/device-storage';
import { offlineAssets, preparationReader, readPreparation, removePreparation, requirePersistentDevice, writePreparation, type PreparationIdentity } from '../../../infrastructure/offline/zone-preparation';
import { assetReadiness, prepareZoneData, verifyZoneData } from '../model/zone-preparation';

type Report = { title: string; details: readonly string[]; ready: boolean };
const NOT_PREPARED: Report = { title: 'Zone non préparée', details: [], ready: false };

export function ZonePreparationControl({ zone, userId }: { zone: Zone; userId: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [report, setReport] = useState<Report>(NOT_PREPARED);
  const controller = useRef<AbortController | null>(null);
  const preparing = useRef(false);
  const [trusted, setTrusted] = useState(isTrustedDevice);
  const client = getFirebaseClient();
  const zoneGeometry = JSON.stringify(zone.bbox);
  const identity = useRef<PreparationIdentity>({ projectId: client.app.options.projectId!, workspaceId: environment.workspaceId, userId, zoneId: zone.id }).current;

  const check = useCallback(async () => {
    if (preparing.current) return;
    controller.current?.abort();
    const operation = new AbortController();
    controller.current = operation;
    try {
      requirePersistentDevice(client.firestore);
      const receipt = await readPreparation(identity);
      if (!receipt) { if (!operation.signal.aborted) setReport(NOT_PREPARED); return; }
      const assets = await offlineAssets('CHECK_OFFLINE_ASSETS', operation.signal);
      const complete = await verifyZoneData(receipt.data, preparationReader(client.firestore, identity.workspaceId, 'cache', operation.signal), operation.signal);
      const resources = assetReadiness(assets, JSON.parse(zoneGeometry), import.meta.env.BASE_URL);
      if (operation.signal.aborted) return;
      const current = receipt.assetVersion === assets.version;
      setReport({
        ready: complete && current && resources.complete,
        title: complete && current && resources.complete ? 'Zone disponible hors ligne' : 'Préparation à compléter',
        details: [
          ...resources.details,
          complete ? `${receipt.data.buildingCount} bâtiments et ${receipt.data.doorCount} portes en cache` : 'Données modifiées ou manquantes : prépare à nouveau la zone',
          ...(current ? [] : ['Nouvelle version d’Athar : prépare à nouveau la zone']),
          `Données téléchargées le ${new Date(receipt.data.preparedAt).toLocaleString('fr-FR')}`,
          receipt.persistentStorage ? 'Conservation du stockage autorisée' : 'Le navigateur peut libérer le stockage : vérifie avant de partir'
        ]
      });
    } catch (error) {
      if (!operation.signal.aborted) setReport(isTrustedDevice()
        ? { title: 'Préparation à vérifier', details: [error instanceof Error && !('code' in error) ? error.message : 'Les données hors ligne ne sont pas toutes accessibles. Prépare à nouveau cette zone.'], ready: false }
        : NOT_PREPARED);
    }
  }, [client.firestore, identity, zoneGeometry]);

  useEffect(() => {
    let mounted = true;
    queueMicrotask(() => { if (mounted) void check(); });
    const recheck = () => { if (document.visibilityState === 'visible') void check(); };
    window.addEventListener('offline', check);
    document.addEventListener('visibilitychange', recheck);
    return () => {
      mounted = false;
      controller.current?.abort();
      window.removeEventListener('offline', check);
      document.removeEventListener('visibilitychange', recheck);
    };
  }, [check]);

  async function prepare() {
    if (preparing.current) return;
    preparing.current = true;
    controller.current?.abort();
    const operation = new AbortController();
    controller.current = operation;
    setBusy(true);
    setProgress('Vérification du stockage…');
    setReport(NOT_PREPARED);
    const deadline = window.setTimeout(() => {
      if (controller.current !== operation) return;
      operation.abort();
      preparing.current = false;
      setBusy(false);
      setReport({ title: 'Préparation interrompue', details: ['Le téléchargement ou la lecture des données prend trop de temps. Vérifie la connexion puis réessaie.'], ready: false });
    }, 180_000);
    try {
      requirePersistentDevice(client.firestore);
      if (!navigator.onLine) throw new Error('Connecte-toi au réseau pour préparer ou actualiser cette zone.');
      // A stale receipt must never survive a failed refresh as a successful preparation.
      await removePreparation(identity);
      const persistentStorage = await navigator.storage?.persist?.().catch(() => false) ?? false;
      const assets = await offlineAssets('PREPARE_ZONE_ASSETS', operation.signal, setProgress);
      const data = await prepareZoneData(identity, preparationReader(client.firestore, identity.workspaceId, 'server', operation.signal), operation.signal, setProgress);
      setProgress('Vérification des données sur cet appareil…');
      if (!await verifyZoneData(data, preparationReader(client.firestore, identity.workspaceId, 'cache', operation.signal), operation.signal)) {
        throw new Error('Les données téléchargées ne sont pas toutes relisibles sur cet appareil. Réessaie avec du réseau et de l’espace libre.');
      }
      operation.signal.throwIfAborted();
      if (client.auth.currentUser?.uid !== userId) throw new Error('La session a changé. Reconnecte-toi avant de préparer la zone.');
      await writePreparation({ data, assetVersion: assets.version, persistentStorage });
      if (operation.signal.aborted) { await removePreparation(identity); return; }
      preparing.current = false;
      setBusy(false);
      await check();
    } catch (error) {
      if (!operation.signal.aborted) {
        setReport({ title: 'Préparation incomplète', details: [error instanceof Error && !('code' in error) ? error.message : 'Données indisponibles. Vérifie ta connexion et ton accès à l’équipe, puis réessaie.'], ready: false });
      }
    } finally {
      window.clearTimeout(deadline);
      if (controller.current === operation) { preparing.current = false; setBusy(false); }
    }
  }

  function close() {
    if (busy) {
      controller.current?.abort();
      preparing.current = false;
      setBusy(false);
      setReport({ title: 'Préparation interrompue', details: ['Relance la préparation avant de partir hors ligne.'], ready: false });
    }
    setOpen(false);
  }

  return <>
    <button className="terrain-offline-button" type="button" onClick={() => { setOpen(true); if (!busy) void check(); }}>
      {report.ready ? 'Zone hors ligne · vérifier' : 'Préparer hors ligne'}
    </button>
    <Dialog open={open} title={`Préparer ${zone.name} hors ligne`} onClose={close}>
      <p>Conserve l’interface, la carte, les bâtiments, les portes et leurs historiques sur cet appareil. La préparation peut télécharger plusieurs dizaines de Mo.</p>
      {!isTrustedDevice() ? <>
        <label className="trusted-device-control"><input type="checkbox" checked={trusted} onChange={event => setTrusted(event.target.checked)} />Cet appareil est personnel et de confiance</label>
        <p>Les données restent sur cet appareil. L’accès hors ligne nécessite une session déjà ouverte.</p>
      </> : null}
      {trusted && !isTrustedDevice() ? <button className="ds-button ds-button--primary" type="button" onClick={() => { setTrustedDevice(true); window.location.reload(); }}>Activer et recharger Athar</button> : <>
        <div role="status" aria-live="polite" className="offline-preparation-report">
          <strong>{busy ? progress : report.title}</strong>
          {!busy && <ul>{report.details.map(detail => <li key={detail}>{detail}</li>)}</ul>}
        </div>
        <p>Les passages récents des autres appareils nécessitent une nouvelle connexion. Aucune écriture en attente n’est supprimée par cette préparation.</p>
        <button className="ds-button ds-button--primary" disabled={!trusted || busy} type="button" onClick={() => void prepare()}>{busy ? 'Préparation en cours…' : 'Télécharger et vérifier la zone'}</button>
      </>}
      <button className="ds-button ds-button--ghost" type="button" onClick={close}>{busy ? 'Interrompre la préparation' : 'Fermer'}</button>
    </Dialog>
  </>;
}
