import { lazy, Suspense, useMemo, useState, type CSSProperties, type ReactElement } from 'react';
import { AppLink } from '../../app/routes/router';
import { layoutDoorsAtBuilding } from '../buildings/model/door-layout';
import type { DoorStatusId } from '../../domain/doors/contracts';
import { IndexedDbOutbox } from '../../infrastructure/outbox/indexeddb-outbox';
import { MemoryDoorGateway, SyncLab } from '../../domain/sync/sync-service';

const OfflineMap = lazy(async () => import('../map/components/OfflineMap'));

const statuses: Array<{ id: DoorStatusId; label: string; color: string }> = [
  { id: 'unvisited', label: 'Pas encore fait', color: '#8B948F' },
  { id: 'retry', label: 'Absent', color: '#C87A0A' },
  { id: 'contacted', label: 'Contact établi', color: '#1F7A5A' },
  { id: 'do-not-return', label: 'Ne pas déranger', color: '#A93B2E' }
];

const sampleDoors = [
  { id: 'd1', floor: 0, label: '01' },
  { id: 'd2', floor: 0, label: '02' },
  { id: 'd3', floor: 1, label: '11' },
  { id: 'd4', floor: 1, label: '12' }
];

export function TechnicalLab(): ReactElement {
  const [online, setOnline] = useState(true);
  const [selectedStatus, setSelectedStatus] = useState<DoorStatusId>('unvisited');
  const [message, setMessage] = useState('Aucun changement en attente');
  const layout = useMemo(() => layoutDoorsAtBuilding(sampleDoors), []);
  const gateway = useMemo(
    () => new MemoryDoorGateway([{ id: 'd1', currentStatusId: 'unvisited', revision: 1, lastVisitId: null, lastVisitAt: null }]),
    []
  );
  const outbox = useMemo(() => new IndexedDbOutbox('prototype-user'), []);
  const sync = useMemo(() => new SyncLab(gateway, outbox, 'prototype-user'), [gateway, outbox]);

  async function recordProof(statusId: DoorStatusId): Promise<void> {
    setSelectedStatus(statusId);
    gateway.setOnline(online);
    await sync.queueStatus(gateway.read('d1'), statusId);
    await sync.flush();
    const entry = (await outbox.all())[0];
    setMessage(entry?.state === 'conflict' ? 'Conflit detecte' : entry?.state === 'rejected' ? 'Ecriture rejetee' : entry ? 'Changement en attente' : 'Synchronise');
  }

  async function synchronizeProof(): Promise<void> {
    gateway.setOnline(online);
    await sync.flush();
    setMessage((await outbox.all()).length === 0 ? 'Synchronise' : 'Changement en attente');
  }

  return (
    <main className="lab-shell">
      <header className="lab-header">
        <div>
          <p className="eyebrow">Athar / socle V1</p>
          <h1>Socle technique</h1>
          <p className="header-note">Route technique de regression. Aucun parcours terrain ou pilotage n'est expose ici.</p>
        </div>
        <div className="lab-header-actions">
          <AppLink className="primary-action" href="/technical-map">Ouvrir le parcours carte</AppLink>
          <button className={online ? 'connection online' : 'connection offline'} onClick={() => setOnline((value) => !value)} type="button">
            {online ? 'Reseau disponible' : 'Mode hors ligne'}
          </button>
        </div>
      </header>

      <section className="lab-grid" aria-label="Fondations techniques">
        <article className="map-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Carte differee</p>
              <h2>Couverture Toulouse preparee</h2>
            </div>
            <span className="badge">PMTiles local</span>
          </div>
          <Suspense fallback={<div className="map map-loading" aria-label="Chargement de la carte" />}>
            <OfflineMap />
          </Suspense>
          <p className="panel-note">MapLibre n'est charge qu'avec cette fonctionnalite. Le paquet local reste servi par la PWA hors ligne.</p>
        </article>

        <article className="door-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Modele de representation</p>
              <h2>Un point, quatre logements</h2>
            </div>
            <span className="badge">Batiment</span>
          </div>
          <div className="door-stage" aria-label="Logements repartis autour du point batiment">
            <span className="building-anchor" aria-hidden="true" />
            {layout.map((door) => (
              <span className="door-dot" key={door.id} style={{ transform: `translate(calc(-50% + ${door.x}px), calc(-50% + ${door.y}px))` }} title={`Etage ${door.floor}, porte ${door.label}`}>
                {door.label}
              </span>
            ))}
          </div>
          <p className="panel-note">Preuve de lisibilite uniquement: aucun ecran logement ou passage n'est encore construit.</p>
        </article>

        <article className="sync-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Regression hors ligne</p>
              <h2>Outbox partitionnee</h2>
            </div>
            <span className="sync-message" aria-live="polite">{message}</span>
          </div>
          <div className="status-actions">
            {statuses.map((status) => (
              <button className={selectedStatus === status.id ? 'status active' : 'status'} key={status.id} onClick={() => void recordProof(status.id)} style={{ '--status-color': status.color } as CSSProperties} type="button">
                {status.label}
              </button>
            ))}
          </div>
          <button className="sync-button" onClick={() => void synchronizeProof()} type="button">Synchroniser maintenant</button>
          <p className="panel-note">La preuve locale est conservee par utilisateur; les regles et rejets sont verifies contre les emulateurs.</p>
        </article>
      </section>
    </main>
  );
}
