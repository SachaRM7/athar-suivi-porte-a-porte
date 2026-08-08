import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactElement } from 'react';
import type { Outbox } from '../../../domain/sync/outbox';
import type { Building, Door, Status } from '../../../domain/workspace/models';
import type { DoorStructureTarget } from '../../../domain/workspace/building-structure';
import { buildBuildingStructureDiff, normalizeDoorLabel, type StructureAmbiguity } from '../../../domain/workspace/building-structure';
import type { WorkspaceRepositories } from '../../../domain/workspace/repositories';
import { floorLabel, floorProgress, overallProgress, compareDoorsForFloor } from '../model/building-detail';
import { recordLocalVisit, recordLocalVisits } from '../../visits/model/record-local-visit';
import { markDoorForSisters } from '../../visits/model/mark-door-for-sisters';
import type { DoorMarkerOutbox } from '../../../domain/sync/door-marker-outbox';
import type { FieldVisitSync } from '../../visits/model/use-field-visit-sync';
import { isTrustedDevice, setTrustedDevice } from '../../../infrastructure/offline/device-storage';

type BuildingVisitSheetProps = {
  authorId: string;
  building: Building | null;
  canEditStructure: boolean;
  outbox: Outbox;
  /** File dédiée du marqueur « à confier aux sœurs » : elle ne transporte aucun passage. */
  markers: DoorMarkerOutbox;
  repositories: WorkspaceRepositories;
  sync?: FieldVisitSync;
  /**
   * Matérialise le document Firestore d'un bâtiment détecté mais jamais visité.
   * Appelé au tout dernier moment : tant que personne ne décrit la structure,
   * une emprise grise ne doit produire aucune écriture (cf. `02-DATA-MODEL.md`).
   */
  ensureBuildingExists?(): Promise<void>;
  onBuildingChange(building: Building): void;
  onClose(): void;
};

type ManualTarget = DoorStructureTarget;

function byId(statuses: readonly Status[]): ReadonlyMap<string, Status> {
  return new Map(statuses.map((status) => [status.id, status]));
}

function statusForeground(color: string): string {
  const match = /^#([0-9a-f]{6})$/i.exec(color);
  if (!match) return '#17211e';
  const value = Number.parseInt(match[1], 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  return red * .299 + green * .587 + blue * .114 < 145 ? '#fffdf6' : '#17211e';
}

function parseManualTargets(value: string): ManualTarget[] {
  return value.split('\n').flatMap((line, index): ManualTarget[] => {
    const [floor, label, identity] = line.split('|').map((part) => part.trim());
    if (!line.trim()) return [];
    if (!label || !Number.isInteger(Number(floor))) throw new Error(`Ligne ${index + 1}: etage et libelle obligatoires.`);
    if (identity === 'new:') throw new Error(`Ligne ${index + 1}: le nouvel ID est obligatoire apres new:.`);
    return [{
      floor: Number(floor),
      label,
      ...(identity?.startsWith('new:') ? { newDoorId: identity.slice(4) } : identity ? { existingDoorId: identity } : {}),
      sortOrder: index
    }];
  });
}

function manualTargetLine(target: DoorStructureTarget): string {
  const identity = target.newDoorId ? `new:${target.newDoorId}` : target.existingDoorId ?? '';
  return `${target.floor} | ${target.label} | ${identity}`;
}

export function BuildingVisitSheet({ authorId, building, canEditStructure, outbox, markers, repositories, sync, ensureBuildingExists, onBuildingChange, onClose }: BuildingVisitSheetProps): ReactElement | null {
  const [doors, setDoors] = useState<readonly Door[]>([]);
  const [structureDoors, setStructureDoors] = useState<readonly Door[]>([]);
  const [statuses, setStatuses] = useState<readonly Status[]>([]);
  const [floor, setFloor] = useState(0);
  const [selectedDoorId, setSelectedDoorId] = useState<string | null>(null);
  const [openPaletteDoorId, setOpenPaletteDoorId] = useState<string | null>(null);
  const [showPassageNote, setShowPassageNote] = useState(false);
  const [foyer, setFoyer] = useState<'femme' | 'homme' | 'couple' | 'famille' | null>(null);
  const [sisters, setSisters] = useState(false);
  const [autoSisters, setAutoSisters] = useState(false);
  const [doorVisits, setDoorVisits] = useState<readonly { id: string; statusId: string; authorId: string; occurredAt: string; note: string }[]>([]);
  const [note, setNote] = useState('');
  const [pendingCount, setPendingCount] = useState(0);
  const [message, setMessage] = useState('A jour localement.');
  const [trustedDevice, setTrustedDeviceState] = useState(isTrustedDevice);
  const [structureMode, setStructureMode] = useState<'quick-floor' | 'manage' | null>(null);
  const [quickDoorCount, setQuickDoorCount] = useState('4');
  const [quickFirstLabel, setQuickFirstLabel] = useState('101');
  const [floorCount, setFloorCount] = useState('2');
  const [doorsPerFloor, setDoorsPerFloor] = useState('4');
  const [manualPlan, setManualPlan] = useState('');
  const [showManual, setShowManual] = useState(false);
  const [numbering, setNumbering] = useState<'floor' | 'hundreds' | 'serial'>('floor');
  const [editing, setEditing] = useState(false);
  const [confirmDeletion, setConfirmDeletion] = useState<string | null>(null);
  const [ambiguities, setAmbiguities] = useState<readonly StructureAmbiguity[]>([]);

  const refresh = useCallback(async () => {
    if (!building) return;
    const [nextDoors, allStructureDoors, nextStatuses, entries] = await Promise.all([
      repositories.doors.listByBuilding(building.id),
      canEditStructure ? repositories.doors.listStructureByBuilding(building.id) : Promise.resolve([]),
      repositories.statuses.list(),
      outbox.all()
    ]);
    const sorted = [...nextDoors].sort((left, right) => left.floor - right.floor || compareDoorsForFloor(left, right));
    setDoors(sorted);
    setStructureDoors([...allStructureDoors].sort((left, right) => left.floor - right.floor || compareDoorsForFloor(left, right)));
    setStatuses(nextStatuses.filter((status) => status.active));
    setPendingCount(entries.filter((entry) => entry.state === 'pending').length);
    setFloor((current) => sorted.some((door) => door.floor === current) ? current : (floorProgress(sorted)[0]?.floor ?? 0));
  }, [building, canEditStructure, outbox, repositories]);

  useEffect(() => {
    queueMicrotask(() => {
      void refresh().catch((error) => {
        setDoors([]);
        setStructureDoors([]);
        setMessage(error instanceof Error ? error.message : 'Donnees du batiment indisponibles.');
      });
    });
  }, [refresh]);

  useEffect(() => {
    if (!sync?.reconciledDoors.length) return;
    const snapshots = new Map(sync.reconciledDoors.map((door) => [door.id, door]));
    const applySnapshots = (values: readonly Door[]) => values.map((door) => {
      const snapshot = snapshots.get(door.id);
      return snapshot ? {
        ...door,
        currentStatusId: snapshot.currentStatusId,
        revision: snapshot.revision,
        lastVisitId: snapshot.lastVisitId
      } : door;
    });
    queueMicrotask(() => {
      setDoors(applySnapshots);
      setStructureDoors(applySnapshots);
    });
  }, [sync?.reconciledDoors]);

  const statusesById = useMemo(() => byId(statuses), [statuses]);
  const floors = useMemo(() => floorProgress(doors), [doors]);
  const total = useMemo(() => overallProgress(doors), [doors]);
  const structurePreview = useMemo(() => {
    const levels = Math.max(1, Number(floorCount) + 1);
    const count = Math.max(1, Number(doorsPerFloor));
    return Array.from({ length: levels }, (_, floorIndex) => Array.from({ length: count }, (_, index) => {
      if (numbering === 'serial') return String(floorIndex * count + index + 1);
      if (numbering === 'hundreds') return String((floorIndex + 1) * 100 + index + 1);
      return `${floorIndex}${index + 1}`.padStart(2, '0');
    }));
  }, [floorCount, doorsPerFloor, numbering]);
  const paletteDoor = doors.find((door) => door.id === openPaletteDoorId) ?? null;
  const selectedEntry = sync?.entries.find((entry) => entry.doorId === selectedDoorId && entry.state !== 'pending')
    ?? sync?.entries.find((entry) => entry.state !== 'pending')
    ?? sync?.entries.find((entry) => entry.doorId === selectedDoorId && entry.state === 'pending');
  const pendingEntries = sync?.entries.filter((entry) => entry.state === 'pending').length ?? pendingCount;
  const syncLabel = !sync ? `${pendingCount} attente(s)`
    : !sync.online ? 'Hors ligne'
      : selectedEntry?.state === 'conflict' ? 'Conflit a resoudre'
        : selectedEntry?.state === 'rejected' ? 'Ecriture rejetee'
          : pendingEntries > 0 ? `${pendingEntries} changement(s) en attente`
            : 'A jour';

  if (!building) return null;
  const openedBuilding = building;

  async function record(door: Door, statusId: string): Promise<boolean> {
    try {
      const result = await recordLocalVisit(repositories, outbox, { authorId, doorId: door.id, statusId, note });
      setNote('');
      setMessage(`Porte ${door.label}: passage ${result.visit.id.slice(0, 8)} cree, revision ${result.door.revision}.`);
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Passage local refuse.');
      return false;
    }
  }

  async function applyStatus(door: Door, statusId: string): Promise<void> {
    if (await record(door, statusId)) {
      setSelectedDoorId(door.id);
      setOpenPaletteDoorId(null);
      await refresh();
      await sync?.synchronize();
    }
  }

  async function openDoor(door: Door): Promise<void> {
    setSelectedDoorId(door.id);
    setOpenPaletteDoorId(door.id);
    setShowPassageNote(false);
    setSisters(door.sisters);
    setAutoSisters(false);
    setFoyer(null);
    setDoorVisits(await repositories.visits.listByDoor(door.id));
  }

  /** Bascule le marqueur seul : aucun passage n'est créé, la révision ne bouge pas. */
  async function toggleSisters(door: Door, next: boolean, automatic: boolean): Promise<void> {
    setSisters(next);
    setAutoSisters(automatic);
    try {
      await markDoorForSisters(repositories, markers, { doorId: door.id, sisters: next, authorId });
      await refresh();
      await sync?.synchronize();
    } catch (error) {
      setSisters(!next);
      setAutoSisters(false);
      setMessage(error instanceof Error ? error.message : 'Le marqueur n a pas pu etre enregistre.');
    }
  }

  async function savePassage(door: Door, statusId: string): Promise<void> {
    await applyStatus(door, statusId);
    setDoorVisits(await repositories.visits.listByDoor(door.id));
  }

  function chooseFoyer(door: Door, value: typeof foyer): void {
    setFoyer(value);
    // « Femme seule » arme le marqueur d'office ; il reste désactivable d'un geste.
    if (value === 'femme' && !sisters) void toggleSisters(door, true, true);
    else setAutoSisters(false);
  }

  async function markFloorAway(scope: readonly Door[]): Promise<void> {
    const awayStatus = statuses.find((status) => status.id === 'retry' && status.active);
    const targets = scope.filter((door) => door.currentStatusId === 'unvisited');
    if (!awayStatus || targets.length === 0) return;
    try {
      const results = await recordLocalVisits(repositories, outbox, {
        authorId,
        doorIds: targets.map((door) => door.id),
        statusId: awayStatus.id,
        note: ''
      });
      await refresh();
      await sync?.synchronize();
      setMessage(`${results.length} passage(s) « Absent » enregistres pour cet etage.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Les passages groupes ont echoue.');
    }
  }

  async function applyStructure(targets: readonly DoorStructureTarget[]): Promise<void> {
    await ensureBuildingExists?.();
    let previewId = 0;
    const preview = buildBuildingStructureDiff({
      building: openedBuilding,
      doors: structureDoors,
      targets,
      authorId,
      createDoorId: () => `preview-door-${previewId++}`
    });
    if (preview.ambiguities.length > 0) {
      setAmbiguities(preview.ambiguities);
      setMessage('Des renommages sont ambigus: choisissez la porte historique a conserver.');
      return;
    }
    const affectedDoorIds = new Set([...preview.updated.map((update) => update.doorId), ...preview.archivedDoorIds]);
    const entries = await outbox.all();
    if (entries.some((entry) => affectedDoorIds.has(entry.doorId))) {
      setMessage('Structure bloquee: synchronisez ou resolvez les passages locaux des portes concernees.');
      return;
    }
    const diff = await repositories.applyBuildingStructure({
      buildingId: openedBuilding.id,
      expectedStructureRevision: openedBuilding.structureRevision,
      targets,
      authorId,
      createDoorId: () => `door-${crypto.randomUUID()}`
    });
    onBuildingChange(diff.building);
    setAmbiguities([]);
    setMessage(`Structure enregistree: ${diff.created.length} ajoutee(s), ${diff.updated.length} ajustee(s), ${diff.archivedDoorIds.length} archivee(s).`);
    await refresh();
  }

  async function removeDoor(door: Door): Promise<void> {
    if (door.lastVisitId && confirmDeletion !== door.id) {
      setConfirmDeletion(door.id);
      return;
    }
    await applyStructure(doors.filter((candidate) => candidate.id !== door.id).map((candidate) => ({ floor: candidate.floor, label: candidate.label, sortOrder: candidate.sortOrder, existingDoorId: candidate.id })));
    setConfirmDeletion(null);
  }

  async function runStructure(buildTargets: () => readonly DoorStructureTarget[]): Promise<void> {
    try {
      await applyStructure(buildTargets());
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Modification de structure refusee.');
    }
  }

  async function addDoorsToCurrentFloor(): Promise<void> {
    const count = Number(quickDoorCount);
    const first = Number(quickFirstLabel);
    if (!Number.isInteger(count) || count < 1 || count > 50 || !Number.isInteger(first) || first < 0) {
      setMessage('Indiquez entre 1 et 50 portes et un premier numero valide.');
      return;
    }
    const existing = structureDoors.filter((door) => door.active).map((door) => ({
      floor: door.floor,
      label: door.label,
      sortOrder: door.sortOrder,
      existingDoorId: door.id
    }));
    const labels = new Set(existing.filter((target) => target.floor === floor).map((target) => normalizeDoorLabel(target.label)));
    const additions = Array.from({ length: count }, (_, index) => {
      const label = String(first + index);
      if (labels.has(normalizeDoorLabel(label))) throw new Error(`La porte ${label} existe deja a cet etage.`);
      labels.add(normalizeDoorLabel(label));
      return { floor, label, sortOrder: structureDoors.length + index, newDoorId: `door-${crypto.randomUUID()}` };
    });
    try {
      await applyStructure([...existing, ...additions]);
      setStructureMode(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Ajout des portes refuse.');
    }
  }

  function resolveAmbiguity(ambiguity: StructureAmbiguity, doorId: string): void {
    const lines = parseManualTargets(manualPlan).map((target) => (
      target.floor === ambiguity.target.floor && normalizeDoorLabel(target.label) === normalizeDoorLabel(ambiguity.target.label)
        ? manualTargetLine({ ...target, existingDoorId: doorId, newDoorId: undefined })
        : manualTargetLine(target)
    ));
    setManualPlan(lines.join('\n'));
    setAmbiguities((current) => current.filter((candidate) => candidate !== ambiguity));
  }

  return (
    <div className="building-detail-layer">
      <button aria-label="Fermer le detail du batiment" className="building-detail-backdrop" onClick={onClose} type="button" />
      <aside aria-label="Detail du batiment" aria-modal="true" className="building-sheet" role="dialog">
        <header className="building-sheet-toolbar">
          <button aria-label="Fermer le batiment" className="building-toolbar-action" onClick={onClose} type="button">X</button>
          <strong>Athar</strong>
          {canEditStructure ? <button aria-label="Configurer le batiment" className="building-toolbar-action" onClick={() => setStructureMode('manage')} type="button">...</button> : <span />}
        </header>

        <section className="building-identity">
          <button className="building-zone-back" onClick={onClose} type="button">‹ Retour à la zone</button>
          <h2>{building.addressLabel}</h2>
          {doors.length > 0 && <p className="building-structure-summary">{floors.length} niveau{floors.length > 1 ? 'x' : ''} · {total.doorCount} portes</p>}
          {canEditStructure && <div className="building-header-actions"><button className="secondary-action" onClick={() => setEditing((current) => !current)} type="button">{editing ? 'Terminer' : 'Modifier'}</button><button className="secondary-action" onClick={() => setStructureMode('manage')} type="button">Structure</button></div>}
          {doors.length > 0 && <>
          <div className="building-progress-row">
            <span aria-hidden="true" className="building-progress-track"><i style={{ width: `${total.ratio * 100}%` }} /></span>
            <span className="building-progress-count">{total.treatedCount} / {total.doorCount}</span>
          </div>
          <p aria-live="polite" className="building-sync-state">{syncLabel}</p>
          </>}
        </section>

        {doors.length === 0 ? <section className="building-empty-state" aria-label="Bâtiment non décrit"><span aria-hidden="true">⌂</span><h3>Bâtiment non décrit</h3><p>Aucun étage ni porte enregistré. Décris la structure une fois — tout le suivi viendra s'y accrocher.</p>{canEditStructure && <div><button className="primary-action" onClick={() => setStructureMode('manage')} type="button">Décrire le bâtiment</button><button className="text-button" onClick={() => void runStructure(() => [{ floor: 0, label: '01', sortOrder: 0, newDoorId: `door-${crypto.randomUUID()}` }])} type="button">C'est un pavillon — une seule porte</button></div>}</section> : <section className="building-cut" aria-label="Coupe verticale du bâtiment">
          {floors.slice().reverse().map((item) => {
            const levelDoors = doors.filter((door) => door.floor === item.floor).sort(compareDoorsForFloor);
            return <section className="building-floor" key={item.floor}>
              <div className="building-floor-label"><span>{floorLabel(item.floor)}</span></div>
              <div className="building-floor-content">
                <header className="building-floor-heading"><span>{item.doorCount} porte{item.doorCount > 1 ? 's' : ''}</span><span>{item.treatedCount}/{item.doorCount} · {item.treatedCount === item.doorCount ? 'terminé' : <button onClick={() => void markFloorAway(levelDoors)} type="button">tout marquer absent</button>}</span></header>
                <div className="door-grid" aria-label={`Portes ${floorLabel(item.floor)}`}>
              {levelDoors.map((door) => {
                const status = statusesById.get(door.currentStatusId);
                const open = openPaletteDoorId === door.id;
                const statusColor = status?.color ?? '#8C9494';
                return <div className="door-card" key={door.id}>
                  <button aria-expanded={open} aria-label={`Porte ${door.label}, ${status?.label ?? door.currentStatusId}`} className="door-row" onClick={() => void openDoor(door)} style={{ '--status-color': statusColor, '--status-foreground': statusForeground(statusColor) } as CSSProperties} type="button"><span className="door-row-label">{door.label}</span><span aria-hidden="true" className="door-state-dot" /><span className="door-row-status">{status?.label ?? door.currentStatusId}</span></button>
                  {editing && <button className="door-delete" onClick={() => void removeDoor(door)} type="button">{confirmDeletion === door.id ? 'Supprimer l’historique ? ✓' : '×'}</button>}
                </div>;
              })}
              {canEditStructure && <button aria-label={`Ajouter des portes au ${floorLabel(item.floor)}`} className="door-add" onClick={() => { setFloor(item.floor); setQuickFirstLabel(String((Math.max(0, ...levelDoors.map((door) => Number(door.label) || 0))) + 1)); setStructureMode('quick-floor'); }} type="button"><b aria-hidden="true">+</b><span>Ajouter</span></button>}
                </div>
              </div>
            </section>;
          })}
          <div className="building-ground"><span>Rue · entrée principale</span></div>
        </section>}

        {sync && selectedEntry?.state === 'conflict' && selectedEntry.conflict && <section className="sync-resolution" aria-label="Resolution du conflit"><p className="eyebrow">Conflit a resoudre</p><p>Serveur : statut {selectedEntry.conflict.currentStatusId}, revision {selectedEntry.conflict.revision}.</p><div className="sync-resolution-actions"><button className="primary-action" disabled={sync.syncing} onClick={() => void sync.reapplyConflict(selectedEntry.commandId)} type="button">Reappliquer</button><button className="secondary-action" disabled={sync.syncing} onClick={() => void sync.abandonConflict(selectedEntry.commandId)} type="button">Abandonner la chaine</button></div></section>}
        {sync && selectedEntry?.state === 'rejected' && <p className="sync-rejection" role="status">Ecriture rejetee : {selectedEntry.rejection}. Elle ne peut pas etre reappliquee comme un conflit.</p>}
        {sync && <div className="sync-controls"><button className="secondary-action" disabled={!sync.online || sync.syncing} onClick={() => void sync.synchronize()} type="button">Synchroniser</button><label className="trusted-device-control"><input checked={trustedDevice} onChange={(event) => { const trusted = event.target.checked; setTrustedDeviceState(trusted); setTrustedDevice(trusted); window.location.reload(); }} type="checkbox" />Appareil de confiance</label></div>}
        <p className="workspace-map-message" role="status">{message}</p>

        {paletteDoor && <div className="door-status-layer">
          <button aria-label="Fermer le choix de statut" className="door-status-backdrop" onClick={() => setOpenPaletteDoorId(null)} type="button" />
          <section aria-label={`Fiche de la porte ${paletteDoor.label}`} className="door-status-sheet door-detail-sheet" role="dialog">
            <button className="door-detail-back" onClick={() => setOpenPaletteDoorId(null)} type="button">‹ {building.addressLabel}</button>
            <h3>Porte {paletteDoor.label} · {floorLabel(paletteDoor.floor)}</h3>
            <p className="door-detail-subline">Dernier passage {doorVisits[0] ? new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' }).format(new Date(doorVisits[0].occurredAt)) : 'jamais'}</p>
            <p className="eyebrow">Résultat du passage</p>
            <div className="status-palette"><button className="status-swatch" onClick={() => void savePassage(paletteDoor, 'contacted')} type="button"><span aria-hidden="true" /><b>Contact établi</b></button><button className="status-swatch" onClick={() => void savePassage(paletteDoor, 'retry')} type="button"><span aria-hidden="true" /><b>Absent</b></button><button className="status-swatch" onClick={() => void savePassage(paletteDoor, 'do-not-return')} type="button"><span aria-hidden="true" /><b>Ne pas déranger</b></button><button className="status-swatch linked-result" onClick={() => void savePassage(paletteDoor, 'contacted')} type="button"><span aria-hidden="true" /><b>Attaché à l'effort — plus à revisiter</b></button><button className="status-swatch locked-result" onClick={() => void savePassage(paletteDoor, 'retry')} type="button"><span aria-hidden="true" /><b>Accès bloqué (interphone / code)</b></button></div>
            <p className="eyebrow">Composition du foyer</p>
            <div className="foyer-chips">{([{ value: 'femme', label: 'Femme seule' }, { value: 'homme', label: 'Homme seul' }, { value: 'couple', label: 'Couple' }, { value: 'famille', label: 'Famille' }, { value: null, label: 'Non renseigné' }] as const).map((choice) => <button aria-pressed={foyer === choice.value} key={choice.label} onClick={() => chooseFoyer(paletteDoor, choice.value)} type="button">{choice.label}</button>)}</div>
            <button aria-pressed={sisters} className="sisters-toggle" onClick={() => void toggleSisters(paletteDoor, !sisters, false)} type="button"><strong>À confier aux sœurs</strong><span>Le prochain passage sera fait par les sœurs.</span></button>
            {autoSisters && <p className="sisters-auto">Activé automatiquement — tu peux le désactiver.</p>}
            <p className="eyebrow">Historique des passages</p>
            <ol className="door-history">{doorVisits.length === 0 ? <li>Aucun passage enregistré.</li> : doorVisits.map((visit) => <li key={visit.id}><strong>{new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(visit.occurredAt))}</strong><span>{visit.authorId}{visit.note ? ` — ${visit.note}` : ''}</span></li>)}</ol>
            <button aria-expanded={showPassageNote} className="passage-note-toggle" onClick={() => setShowPassageNote((current) => !current)} type="button">+ note courte</button>
            {showPassageNote && <label className="passage-note-field">Note du passage<textarea aria-label={`Note pour porte ${paletteDoor.label}`} maxLength={280} onChange={(event) => setNote(event.target.value)} rows={2} value={note} /></label>}
            <p className="privacy-note">La composition et ce marqueur ne sont visibles que dans cette fiche.</p>
          </section>
        </div>}

        {structureMode && <div className="structure-sheet-layer">
          <button aria-label="Fermer la configuration" className="structure-sheet-backdrop" onClick={() => setStructureMode(null)} type="button" />
          <section aria-label={structureMode === 'quick-floor' ? 'Ajouter des portes' : 'Configurer le batiment'} className="structure-sheet" role="dialog">
            <header><div><p className="eyebrow">{structureMode === 'quick-floor' ? floorLabel(floor) : 'Structure'}</p><h3>{structureMode === 'quick-floor' ? 'Ajouter des portes' : 'Configurer le batiment'}</h3></div><button aria-label="Fermer la configuration" className="icon-action" onClick={() => setStructureMode(null)} type="button">X</button></header>
            {structureMode === 'quick-floor' ? <>
              <p className="structure-sheet-lead">Creez les portes de cet etage en une fois. Elles commencent en Pas visite.</p>
              <div className="quick-door-fields"><label>Combien<input aria-label="Nombre de portes a ajouter" min="1" max="50" onChange={(event) => setQuickDoorCount(event.target.value)} type="number" value={quickDoorCount} /></label><label>Premier numero<input aria-label="Premier numero de porte" min="0" onChange={(event) => setQuickFirstLabel(event.target.value)} type="number" value={quickFirstLabel} /></label></div>
              <button className="primary-action" onClick={() => void addDoorsToCurrentFloor()} type="button">Generer les portes</button>
            </> : <div className="structure-panel">
              <div className="structure-fields"><label>Étages au-dessus du rez-de-chaussée<input min="0" onChange={(event) => setFloorCount(event.target.value)} type="number" value={floorCount} /><em>étages · RDC compris = {Math.max(1, Number(floorCount) + 1)} niveaux</em></label><label>Portes par étage<input min="1" onChange={(event) => setDoorsPerFloor(event.target.value)} type="number" value={doorsPerFloor} /><em>modifiable étage par étage</em></label></div>
              <div className="numbering-options" aria-label="Numérotation"><button aria-pressed={numbering === 'floor'} onClick={() => setNumbering('floor')} type="button">01, 02 · 11, 12</button><button aria-pressed={numbering === 'hundreds'} onClick={() => setNumbering('hundreds')} type="button">101, 102 · 201</button><button aria-pressed={numbering === 'serial'} onClick={() => setNumbering('serial')} type="button">1 à {structurePreview.flat().length}, en suite</button></div>
              <section className="structure-preview" aria-label="Aperçu vivant"><p className="eyebrow">Aperçu</p>{structurePreview.slice().reverse().map((labels, reverseIndex) => { const floorNumber = structurePreview.length - reverseIndex - 1; return <div key={floorNumber}><strong>{floorLabel(floorNumber)}</strong>{labels.map((label) => <span key={label}>{label}</span>)}</div>; })}<small>Rue · entrée principale</small></section>
              <button className="primary-action" onClick={() => void runStructure(() => structurePreview.flatMap((labels, floorIndex) => labels.map((label, index) => ({ floor: floorIndex, label, sortOrder: floorIndex * labels.length + index, newDoorId: `door-${crypto.randomUUID()}` }))))} type="button">Créer {structurePreview.flat().length} portes</button>
              <button className="text-button" onClick={() => { if (!showManual) setManualPlan(structureDoors.filter((door) => door.active).map((door) => `${door.floor} | ${door.label} | ${door.id}`).join('\n')); setShowManual((current) => !current); }} type="button">Ajustement manuel</button>
              {showManual && <><label className="manual-plan-label">Plan manuel (etage | porte | ID ou new:ID)<textarea aria-label="Plan manuel de portes" onChange={(event) => setManualPlan(event.target.value)} rows={5} value={manualPlan} /></label><button className="secondary-action" onClick={() => void runStructure(() => parseManualTargets(manualPlan))} type="button">Appliquer le plan manuel</button></>}
              {ambiguities.length > 0 && <section className="structure-ambiguities" aria-label="Renommages ambigus"><p>Choisir la porte historique:</p>{ambiguities.map((ambiguity) => <div key={`${ambiguity.target.floor}-${ambiguity.target.label}`}><strong>{floorLabel(ambiguity.target.floor)} / {ambiguity.target.label}</strong>{ambiguity.candidateDoorIds.map((doorId) => <button className="secondary-action" key={doorId} onClick={() => resolveAmbiguity(ambiguity, doorId)} type="button">Conserver {doorId}</button>)}</div>)}</section>}
              <div className="archived-doors"><p className="eyebrow">Archivees</p>{structureDoors.filter((door) => !door.active).length === 0 ? <span>Aucune</span> : structureDoors.filter((door) => !door.active).map((door) => <span key={door.id}>{floorLabel(door.floor)} / {door.label} - rev. {door.revision}</span>)}</div>
            </div>}
          </section>
        </div>}
      </aside>
    </div>
  );
}
