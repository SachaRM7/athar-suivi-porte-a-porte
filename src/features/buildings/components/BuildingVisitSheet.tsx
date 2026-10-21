import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactElement } from 'react';
import type { Outbox } from '../../../domain/sync/outbox';
import type { Building, Door, DoorFoyer, Status, Visit } from '../../../domain/workspace/models';
import type { DoorStructureTarget } from '../../../domain/workspace/building-structure';
import { buildBuildingStructureDiff, normalizeDoorLabel, type StructureAmbiguity } from '../../../domain/workspace/building-structure';
import type { WorkspaceRepositories } from '../../../domain/workspace/repositories';
import { floorLabel, floorProgress, isFloorComplete, overallProgress, compareDoorsForFloor } from '../model/building-detail';
import { recordLocalVisit, recordLocalVisits } from '../../visits/model/record-local-visit';
import { markDoorForSisters, updateDoorProfile } from '../../visits/model/mark-door-for-sisters';
import type { DoorMarkerOutbox } from '../../../domain/sync/door-marker-outbox';
import type { FieldVisitSync } from '../../visits/model/use-field-visit-sync';
import { isTrustedDevice, setTrustedDevice } from '../../../infrastructure/offline/device-storage';
import { CADASTRAL_SUGGESTION_NOTICE, type CadastralSuggestion } from '../model/cadastral-structure';
import { buildingStaleness } from '../model/building-staleness';
import { hasPlaceholderAddress, MAX_ADDRESS_LENGTH, normalizeAddressLabel } from '../model/building-address';
import { planStructureFromPreview, structurePlanLabel } from '../model/structure-plan';
import { doorsForGroupedAbsence, requiresDoNotDisturbConfirmation } from '../../../domain/workspace/follow-up';
import { Stepper } from '../../../design/components';
import { firestoreWriteErrorMessage } from '../../../infrastructure/firebase/firestore-errors';
import { localWriteErrorMessage } from '../../visits/model/field-sync-status';

import { useModalFocus } from '../../../design/hooks/use-modal-focus';
import { readTask, readSession, mapLimited } from '../../../shared/async/read-task';

const REJECTION_MESSAGES: Readonly<Record<string, string>> = {
  'inactive-member': 'ce compte n’est plus actif',
  'author-mismatch': 'il a été saisi sous un autre compte',
  'invalid-intent': 'le statut ou la porte ne sont plus valides',
  security: 'les règles de sécurité l’ont refusé'
};

type BuildingVisitSheetProps = {
  authorId: string;
  building: Building | null;
  canEditStructure: boolean;
  canDeleteVisitedDoors: boolean;
  outbox: Outbox;
  /** File dédiée du marqueur « à confier aux sœurs » : elle ne transporte aucun passage. */
  markers: DoorMarkerOutbox;
  repositories: WorkspaceRepositories;
  /**
   * Attributs cadastraux de l'emprise. Ils pré-remplissent les steppers du dialogue de
   * structure et rien d'autre : aucune porte n'est créée sans validation humaine.
   */
  structureSuggestion?: CadastralSuggestion | null;
  sync?: FieldVisitSync;
  /**
   * Matérialise le document Firestore d'un bâtiment détecté mais jamais visité.
   * Appelé au tout dernier moment : tant que personne ne décrit la structure,
   * une emprise grise ne doit produire aucune écriture (cf. `02-DATA-MODEL.md`).
   */
  ensureBuildingExists?(): Promise<void>;
  onBuildingChange(building: Building): void;
  /** Vrai si ce compte peut saisir l'adresse : avant la création du document, ou en coordinateur. */
  canRenameBuilding?: boolean;
  onRenameBuilding?(addressLabel: string): Promise<void>;
  /** Le bâtiment n'a plus de document : la carte et la liste doivent le laisser retomber en gris. */
  onBuildingDelete?(building: Building): void;
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

/** Résultats proposés dans la fiche porte. Libellés du vocabulaire figé, explication en sous-ligne. */
const RESULT_CHOICES: readonly { statusId: string; label: string; className: string; hint?: string }[] = [
  { statusId: 'contacted', label: 'Contact établi', className: 'open-result' },
  { statusId: 'retry', label: 'Absent', className: 'away-result' },
  { statusId: 'linked', label: "Attaché à l'effort", className: 'linked-result', hint: 'sort du suivi' },
  { statusId: 'do-not-return', label: 'Ne pas déranger', className: 'dnd-result', hint: 'sort du suivi' },
  { statusId: 'locked', label: 'Accès bloqué (interphone / code)', className: 'locked-result' }
];

/** « Contact établi · dernier passage il y a 3 j », ou « Jamais visitée ». */
function doorSubline(door: Door, statusLabel: string | undefined): string {
  if (!door.lastVisitId) return 'Jamais visitée';
  const staleness = buildingStaleness(door.lastVisitAt, new Date(), true);
  const when = staleness.days === null ? 'date du dernier passage inconnue' : `dernier passage ${staleness.label}`;
  return `${statusLabel ?? 'Statut indisponible'} · ${when}`;
}

/** Un choix de porte historique se fait sur ce que le frère voit : numéro, étage, statut. */
function ambiguityChoiceLabel(door: Door | undefined, statuses: ReadonlyMap<string, Status>): string {
  if (!door) return 'Conserver cette porte';
  return `Conserver la porte ${door.label} (${floorLabel(door.floor)}, ${statuses.get(door.currentStatusId)?.label ?? 'statut indisponible'}${door.active ? '' : ', archivée'})`;
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

export function BuildingVisitSheet({ authorId, building, canEditStructure, canDeleteVisitedDoors, outbox, markers, repositories, structureSuggestion = null, sync, ensureBuildingExists, onBuildingChange, canRenameBuilding = false, onRenameBuilding, onBuildingDelete, onClose }: BuildingVisitSheetProps): ReactElement | null {
  const [doors, setDoors] = useState<readonly Door[]>([]);
  const [structureDoors, setStructureDoors] = useState<readonly Door[]>([]);
  const [statuses, setStatuses] = useState<readonly Status[]>([]);
  const [floor, setFloor] = useState(0);
  const [selectedDoorId, setSelectedDoorId] = useState<string | null>(null);
  const [openPaletteDoorId, setOpenPaletteDoorId] = useState<string | null>(null);
  const [showPassageNote, setShowPassageNote] = useState(false);
  const [foyer, setFoyer] = useState<DoorFoyer>(null);
  const [sisters, setSisters] = useState(false);
  const [autoSisters, setAutoSisters] = useState(false);
  const [doorVisits, setDoorVisits] = useState<readonly (Visit & { authorName: string })[]>([]);
  const [historyLimit, setHistoryLimit] = useState(25);
  const [note, setNote] = useState('');
  const [pendingCount, setPendingCount] = useState(0);
  const [message, setMessage] = useState('Choisis une porte pour enregistrer un passage.');
  const [trustedDevice, setTrustedDeviceState] = useState(isTrustedDevice);
  const [structureMode, setStructureMode] = useState<'quick-floor' | 'manage' | null>(null);
  const [quickDoorCount, setQuickDoorCount] = useState('4');
  const [quickFirstLabel, setQuickFirstLabel] = useState('101');
  /**
   * `null` signifie « personne n'a encore touché aux réglages » : les steppers reflètent
   * alors la suggestion cadastrale, ou les valeurs par défaut quand elle manque. Le brouillon
   * est dérivé au rendu plutôt que recopié par un effet, et porte le bâtiment auquel il
   * appartient pour qu'ouvrir un autre immeuble reparte de sa propre suggestion.
   */
  const [structureDraft, setStructureDraft] = useState<{ buildingId: string; floorCount: string; doorsPerFloor: string } | null>(null);
  const [structureLoadedBuildingId, setStructureLoadedBuildingId] = useState<string | null>(null);
  const [manualPlan, setManualPlan] = useState('');
  const [showManual, setShowManual] = useState(false);
  const [numbering, setNumbering] = useState<'floor' | 'hundreds' | 'serial'>('floor');
  const [editing, setEditing] = useState(false);
  const [confirmDeletion, setConfirmDeletion] = useState<string | null>(null);
  const [confirmFloorDeletion, setConfirmFloorDeletion] = useState<number | null>(null);
  /** Étage dont l'absence groupée attend confirmation : le geste écrit plusieurs passages d'un coup. */
  const [confirmFloorAbsence, setConfirmFloorAbsence] = useState<number | null>(null);
  const [confirmStructureReset, setConfirmStructureReset] = useState(false);
  /** Un plan qui archive des portes demande un second geste explicite. */
  const [confirmStructureArchive, setConfirmStructureArchive] = useState(false);
  /** Brouillon d'adresse, rattaché au bâtiment pour ne jamais fuir vers un autre. */
  const [addressDraft, setAddressDraft] = useState<{ buildingId: string; value: string } | null>(null);
  const [addressPending, setAddressPending] = useState(false);
  const [addressMessage, setAddressMessage] = useState('');
  const [ambiguities, setAmbiguities] = useState<readonly StructureAmbiguity[]>([]);
  const [structureMessage, setStructureMessage] = useState('');
  const [structurePending, setStructurePending] = useState(false);
  /** Correction d'un « Ne pas déranger » en attente de confirmation. */
  const [dndCorrection, setDndCorrection] = useState<{ doorId: string; statusId: string } | null>(null);
  const loadRequest = useRef(0);
  const historyRequest = useRef(0);
  const savingPassage = useRef(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [historyState, setHistoryState] = useState<'loading' | 'ready' | 'error'>('ready');

  const refresh = useCallback(async () => {
    if (!building) return;
    const request = ++loadRequest.current;
    setStructureLoadedBuildingId(null);
    setLoadError(false);
    setConfirmStructureReset(false);
    const [nextDoors, allStructureDoors, nextStatuses, entries] = await readTask(Promise.all([
      repositories.doors.listByBuilding(building.id),
      canEditStructure ? repositories.doors.listStructureByBuilding(building.id) : Promise.resolve([]),
      repositories.statuses.list(),
      // Une file locale IndexedDB indisponible ne doit jamais masquer la structure
      // qui vient du serveur. Le compteur repasse temporairement à zéro.
      outbox.all().catch(() => [])
    ]), undefined, 30_000);
    if (request !== loadRequest.current) return;
    const sorted = [...nextDoors].sort((left, right) => left.floor - right.floor || compareDoorsForFloor(left, right));
    setDoors(sorted);
    setStructureDoors([...allStructureDoors].sort((left, right) => left.floor - right.floor || compareDoorsForFloor(left, right)));
    setStructureLoadedBuildingId(building.id);
    setStatuses(nextStatuses.filter((status) => status.active));
    setPendingCount(entries.filter((entry) => entry.state === 'pending').length);
    setFloor((current) => sorted.some((door) => door.floor === current) ? current : (floorProgress(sorted)[0]?.floor ?? 0));
  }, [building, canEditStructure, outbox, repositories]);

  useEffect(() => {
    let active = true;
    const loadSequence = loadRequest;
    const historySequence = historyRequest;
    queueMicrotask(() => {
      if (!active) return;
      void refresh().catch((error) => {
        if (!active) return;
        setDoors([]);
        setStructureDoors([]);
        setLoadError(true);
        setMessage('Données du bâtiment indisponibles. Vérifie la connexion ou la préparation hors ligne, puis réessaie.');
        void error;
      });
    });
    return () => { active = false; loadSequence.current++; historySequence.current++; };
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

  /**
   * Pré-remplissage des steppers depuis le cadastre. Il pose des valeurs de départ et
   * s'arrête là : le bouton « Créer N portes » reste le seul geste qui écrit.
   */
  const openedBuildingId = building?.id ?? null;
  const draft = structureDraft?.buildingId === openedBuildingId ? structureDraft : null;
  const describedStructure = useMemo(() => {
    const activeStructureDoors = structureDoors.filter((door) => door.active);
    const activeDoors = activeStructureDoors.length > 0 ? activeStructureDoors : doors.filter((door) => door.active);
    const floorCounts = new Map<number, number>();
    for (const door of activeDoors) floorCounts.set(door.floor, (floorCounts.get(door.floor) ?? 0) + 1);
    return {
      present: activeDoors.length > 0,
      floorsAboveGround: activeDoors.reduce((highest, door) => Math.max(highest, door.floor), 0),
      doorsPerFloor: Math.max(1, ...floorCounts.values())
    };
  }, [doors, structureDoors]);
  const hasDescribedStructure = describedStructure.present;
  const applicableStructureSuggestion = structureLoadedBuildingId === openedBuildingId && !hasDescribedStructure ? structureSuggestion : null;
  const initialFloorCount = hasDescribedStructure
    ? String(describedStructure.floorsAboveGround)
    : String(applicableStructureSuggestion?.floorsAboveGround ?? 2);
  const initialDoorsPerFloor = hasDescribedStructure
    ? String(describedStructure.doorsPerFloor)
    : String(applicableStructureSuggestion?.doorsPerFloor ?? 4);
  const floorCount = draft?.floorCount ?? initialFloorCount;
  const doorsPerFloor = draft?.doorsPerFloor ?? initialDoorsPerFloor;
  // La mention disparaît dès que quelqu'un ajuste un réglage : ce n'est plus le cadastre.
  const showsCadastralNotice = applicableStructureSuggestion !== null && draft === null;
  const editStructureDraft = (changes: Partial<{ floorCount: string; doorsPerFloor: string }>) => {
    setStructureDraft({ buildingId: openedBuildingId ?? '', floorCount, doorsPerFloor, ...changes });
    setConfirmStructureArchive(false);
  };

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
  // Identifiants provisoires : ce plan sert à annoncer l'effet du bouton, pas à écrire.
  const structurePlan = useMemo(() => {
    let previewId = 0;
    return planStructureFromPreview(structurePreview, structureDoors, () => `preview-door-${previewId++}`);
  }, [structurePreview, structureDoors]);
  const paletteDoor = structureLoadedBuildingId === building?.id ? doors.find((door) => door.id === openPaletteDoorId) ?? null : null;
  const selectedEntry = sync?.entries.find((entry) => doors.some(door => door.id === entry.doorId) && entry.doorId === selectedDoorId && entry.state !== 'pending')
    ?? sync?.entries.find((entry) => doors.some(door => door.id === entry.doorId) && entry.state !== 'pending')
    ?? sync?.entries.find((entry) => doors.some(door => door.id === entry.doorId) && entry.doorId === selectedDoorId && entry.state === 'pending');
  const pendingEntries = sync?.entries.filter((entry) => entry.state === 'pending').length ?? pendingCount;
  const syncLabel = !sync ? (pendingEntries > 0 ? `${pendingEntries} changement${pendingEntries > 1 ? 's' : ''} en attente` : 'À jour') : sync.status.label;
  const syncDetail = sync?.status.detail ?? null;

  const loadDoorVisits = useCallback(async (doorId: string): Promise<readonly (Visit & { authorName: string })[]> => {
    return readSession(async signal => {
      const visits = await readTask(repositories.visits.listByDoor(doorId), signal);
      const authorIds = [...new Set(visits.map((visit) => visit.authorId))];
      const authors = await mapLimited(authorIds, 4, signal, (id) => readTask(repositories.members.get(id), signal, 5_000).catch(() => null));
      const names = new Map(authorIds.map((id, index) => [id, authors[index]?.displayName ?? 'Membre de l’équipe']));
      return [...visits]
        .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
        .map((visit) => ({ ...visit, authorName: names.get(visit.authorId) ?? 'Membre de l’équipe' }));
    });
  }, [repositories]);

  const buildingPanel = useRef<HTMLElement>(null);
  const doorPanel = useRef<HTMLElement>(null);
  const structurePanel = useRef<HTMLElement>(null);
  useModalFocus(buildingPanel, building !== null, onClose);
  useModalFocus(doorPanel, paletteDoor !== null, () => setOpenPaletteDoorId(null));
  useModalFocus(structurePanel, building !== null && structureMode !== null, () => setStructureMode(null));

  if (!building) return null;
  const openedBuilding = building;

  async function record(door: Door, statusId: string): Promise<boolean> {
    try {
      await recordLocalVisit(repositories, outbox, { authorId, doorId: door.id, statusId, note });
      setNote('');
      // Enregistré sur l'appareil, pas encore confirmé : l'état de synchronisation le dira.
      setMessage(`Porte ${door.label} : passage enregistré sur l’appareil.`);
      sync?.reportLocalSave(door.id);
      return true;
    } catch (error) {
      setMessage(localWriteErrorMessage(error));
      sync?.reportLocalSave(door.id, error);
      return false;
    }
  }

  async function applyStatus(door: Door, statusId: string): Promise<void> {
    if (savingPassage.current) return;
    savingPassage.current = true;
    setSaving(true);
    try {
      if (await record(door, statusId)) {
        setSelectedDoorId(door.id);
        setOpenPaletteDoorId(null);
        await sync?.refresh();
        await refresh().catch(() => setLoadError(true));
        void sync?.synchronize();
      }
    } finally {
      savingPassage.current = false;
      setSaving(false);
    }
  }

  async function openDoor(door: Door): Promise<void> {
    const request = ++historyRequest.current;
    setSelectedDoorId(door.id);
    setOpenPaletteDoorId(door.id);
    setDndCorrection(null);
    setShowPassageNote(false);
    setSisters(door.sisters);
    setAutoSisters(false);
    setFoyer(door.foyer);
    setDoorVisits([]);
    setHistoryLimit(25);
    setHistoryState('loading');
    setNote('');
    try {
      const visits = await loadDoorVisits(door.id);
      if (request === historyRequest.current) { setDoorVisits(visits); setHistoryState('ready'); }
    } catch {
      if (request === historyRequest.current) setHistoryState('error');
    }
  }

  /**
   * Le profil enregistré (durable sur l'appareil) rejoint aussitôt la coupe : sans cela, la
   * tuile perdait l'anneau rose et la fiche rouverte montrait l'ancienne composition.
   */
  function showDoorProfile(updated: Door): void {
    const apply = (values: readonly Door[]) => values.map((candidate) => candidate.id === updated.id
      ? { ...candidate, foyer: updated.foyer, sisters: updated.sisters }
      : candidate);
    setDoors(apply);
    setStructureDoors(apply);
  }

  /** Bascule le marqueur seul : aucun passage n'est créé, la révision ne bouge pas. */
  async function toggleSisters(door: Door, next: boolean, automatic: boolean): Promise<void> {
    setSisters(next);
    setAutoSisters(automatic);
    try {
      showDoorProfile(await markDoorForSisters(repositories, markers, { doorId: door.id, sisters: next, authorId }));
      await sync?.synchronize();
    } catch (error) {
      setSisters(!next);
      setAutoSisters(false);
      await refresh().catch(() => undefined);
      setMessage(localWriteErrorMessage(error).replace('Le passage n’a pas été enregistré', 'Le marqueur n’a pas été enregistré'));
    }
  }

  async function savePassage(door: Door, statusId: string): Promise<void> {
    // Corriger un « Ne pas déranger » est une opération explicite : on la fait confirmer.
    // Elle ajoute un passage, l'ancien reste daté et signé dans l'historique.
    const confirmed = dndCorrection?.doorId === door.id && dndCorrection.statusId === statusId;
    if (requiresDoNotDisturbConfirmation(door, statusId) && !confirmed) {
      setDndCorrection({ doorId: door.id, statusId });
      return;
    }
    setDndCorrection(null);
    await applyStatus(door, statusId);
  }

  async function chooseFoyer(door: Door, value: DoorFoyer): Promise<void> {
    const previousFoyer = foyer;
    const previousSisters = sisters;
    const nextSisters = value === 'femme' ? true : sisters;
    setFoyer(value);
    // « Femme seule » arme le marqueur d'office ; il reste désactivable d'un geste.
    setSisters(nextSisters);
    setAutoSisters(value === 'femme' && !sisters);
    try {
      showDoorProfile(await updateDoorProfile(repositories, markers, { doorId: door.id, foyer: value, sisters: nextSisters, authorId }));
      await sync?.synchronize();
    } catch (error) {
      setFoyer(previousFoyer);
      setSisters(previousSisters);
      setAutoSisters(false);
      await refresh().catch(() => undefined);
      setMessage(localWriteErrorMessage(error).replace('Le passage n’a pas été enregistré', 'La composition du foyer n’a pas été enregistrée'));
    }
  }

  async function markFloorAway(scope: readonly Door[]): Promise<void> {
    const awayStatus = statuses.find((status) => status.id === 'retry' && status.active);
    // Règle centrale : jamais une porte sortie du suivi, jamais une porte déjà visitée.
    const targets = doorsForGroupedAbsence(scope);
    if (!awayStatus || targets.length === 0 || savingPassage.current) return;
    savingPassage.current = true;
    setSaving(true);
    try {
      const results = await recordLocalVisits(repositories, outbox, {
        authorId,
        doorIds: targets.map((door) => door.id),
        statusId: awayStatus.id,
        note: ''
      });
      await refresh().catch(() => setLoadError(true));
      await sync?.refresh();
      void sync?.synchronize();
      setMessage(`${results.length} porte${results.length > 1 ? 's' : ''} de l’étage marquée${results.length > 1 ? 's' : ''} « Absent » sur l’appareil.`);
      for (const door of targets) sync?.reportLocalSave(door.id);
    } catch (error) {
      // Groupe atomique : en cas d'échec, aucune porte n'a été marquée.
      setMessage(`${localWriteErrorMessage(error)} Aucune porte de l’étage n’a été marquée.`);
      sync?.reportLocalSave(targets[0].id, error);
    } finally {
      savingPassage.current = false;
      setSaving(false);
    }
  }

  function openStructure(mode: 'quick-floor' | 'manage'): void {
    setStructureMessage('');
    setConfirmStructureArchive(false);
    setStructureMode(mode);
  }

  function reportStructure(messageText: string): void {
    setMessage(messageText);
    setStructureMessage(messageText);
  }

  async function applyStructure(targets: readonly DoorStructureTarget[]): Promise<boolean> {
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
      reportStructure('Des renommages sont ambigus : choisis la porte historique à conserver.');
      return false;
    }
    const affectedDoorIds = new Set([...preview.updated.map((update) => update.doorId), ...preview.archivedDoorIds]);
    if (affectedDoorIds.size > 0) {
      const entries = await outbox.all();
      if (entries.some((entry) => affectedDoorIds.has(entry.doorId))) {
        reportStructure('Structure bloquée : synchronise ou résous les passages locaux des portes concernées.');
        return false;
      }
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
    const updates = new Map(diff.updated.map((update) => [update.doorId, update]));
    const archived = new Set(diff.archivedDoorIds);
    const nextStructureDoors = [
      ...structureDoors.map((door) => updates.has(door.id)
        ? { ...door, ...updates.get(door.id)! }
        : archived.has(door.id) ? { ...door, active: false } : door),
      ...diff.created
    ].sort((left, right) => left.floor - right.floor || compareDoorsForFloor(left, right));
    setStructureDoors(nextStructureDoors);
    setDoors(nextStructureDoors.filter((door) => door.active));
    reportStructure(`Structure enregistrée : ${diff.created.length} ajoutée(s), ${diff.updated.length} ajustée(s), ${diff.archivedDoorIds.length} archivée(s).`);
    // La réponse du commit suffit pour rendre la coupe immédiatement. Une relecture
    // locale défaillante ne transforme pas une écriture serveur réussie en faux échec.
    await refresh().catch(() => undefined);
    return true;
  }

  async function removeDoor(door: Door): Promise<void> {
    if (door.lastVisitId && !canDeleteVisitedDoors) {
      setMessage('Seul le coordinateur peut supprimer une porte avec un historique.');
      return;
    }
    if (door.lastVisitId && confirmDeletion !== door.id) {
      setConfirmDeletion(door.id);
      return;
    }
    await applyStructure(doors.filter((candidate) => candidate.id !== door.id).map((candidate) => ({ floor: candidate.floor, label: candidate.label, sortOrder: candidate.sortOrder, existingDoorId: candidate.id })));
    setConfirmDeletion(null);
  }

  async function removeFloor(floorNumber: number): Promise<void> {
    const floorDoors = doors.filter((door) => door.floor === floorNumber);
    if (floorDoors.some((door) => door.lastVisitId) && !canDeleteVisitedDoors) {
      setMessage('Seul le coordinateur peut supprimer un étage qui contient un historique.');
      return;
    }
    if (floorDoors.some((door) => door.lastVisitId) && confirmFloorDeletion !== floorNumber) {
      setConfirmFloorDeletion(floorNumber);
      return;
    }
    await applyStructure(doors.filter((door) => door.floor !== floorNumber).map((door) => ({
      floor: door.floor,
      label: door.label,
      sortOrder: door.sortOrder,
      existingDoorId: door.id
    })));
    setConfirmFloorDeletion(null);
  }

  /**
   * Deux gestes derrière une seule corbeille, dans l'ordre où on les veut sur le terrain :
   * tant qu'il reste des portes, on vide la structure (les passages restent, `passages` est
   * append-only) ; une fois le bâtiment vierge, on retire son document Firestore et l'emprise
   * redevient une forme grise du fond de carte (principe 7). Réservé au coordinateur.
   */
  async function resetStructure(): Promise<void> {
    if (!canDeleteVisitedDoors) {
      setMessage('Seul le coordinateur peut supprimer la structure d’un bâtiment.');
      return;
    }
    if (!confirmStructureReset) {
      setConfirmStructureReset(true);
      return;
    }
    setConfirmStructureReset(false);
    if (doors.length === 0) {
      setStructurePending(true);
      try {
        await repositories.buildings.delete(openedBuilding.id);
        onBuildingDelete?.(openedBuilding);
        onClose();
      } catch (error) {
        setMessage(firestoreWriteErrorMessage(error, 'Le bâtiment ne peut pas être retiré. Réessaie, puis vérifie les droits Firebase si le problème continue.'));
      } finally {
        setStructurePending(false);
      }
      return;
    }
    if (await runStructure(() => [])) {
      setEditing(false);
      setConfirmDeletion(null);
      setConfirmFloorDeletion(null);
      reportStructure('Structure supprimée : le bâtiment repart vierge. Les passages déjà enregistrés restent dans l’historique.');
    }
  }

  function openFloorCreation(floorNumber: number): void {
    const defaultCount = Math.max(1, Number(doorsPerFloor) || 1);
    const firstLabel = numbering === 'hundreds' ? (floorNumber + 1) * 100 + 1
      : numbering === 'serial' ? doors.length + 1
        : floorNumber * 10 + 1;
    setFloor(floorNumber);
    setQuickDoorCount(String(defaultCount));
    setQuickFirstLabel(String(firstLabel).padStart(numbering === 'floor' ? 2 : 1, '0'));
    openStructure('quick-floor');
  }

  async function runStructure(buildTargets: () => readonly DoorStructureTarget[]): Promise<boolean> {
    if (structurePending) return false;
    setStructurePending(true);
    setStructureMessage('Enregistrement de la structure en cours…');
    try {
      return await applyStructure(buildTargets());
    } catch (error) {
      reportStructure(firestoreWriteErrorMessage(error, 'La structure ne peut pas être enregistrée. Réessaie, puis vérifie les droits Firebase si le problème continue.'));
      return false;
    } finally {
      setStructurePending(false);
    }
  }

  async function addDoorsToCurrentFloor(): Promise<void> {
    const count = Number(quickDoorCount);
    const first = Number(quickFirstLabel);
    if (!Number.isInteger(count) || count < 1 || count > 50 || !Number.isInteger(first) || first < 0) {
      reportStructure('Indique entre 1 et 50 portes et un premier numéro valide.');
      return;
    }
    const existing = structureDoors.filter((door) => door.active).map((door) => ({
      floor: door.floor,
      label: door.label,
      sortOrder: door.sortOrder,
      existingDoorId: door.id
    }));
    try {
      const labels = new Set(existing.filter((target) => target.floor === floor).map((target) => normalizeDoorLabel(target.label)));
      const additions = Array.from({ length: count }, (_, index) => {
        const label = String(first + index);
        if (labels.has(normalizeDoorLabel(label))) throw new Error(`La porte ${label} existe déjà à cet étage.`);
        labels.add(normalizeDoorLabel(label));
        return { floor, label, sortOrder: structureDoors.length + index, newDoorId: `door-${crypto.randomUUID()}` };
      });
      if (await runStructure(() => [...existing, ...additions])) setStructureMode(null);
    } catch (error) {
      reportStructure(error instanceof Error ? error.message : 'Les portes ne peuvent pas être ajoutées.');
    }
  }

  function chooseNumbering(next: typeof numbering): void {
    setNumbering(next);
    setConfirmStructureArchive(false);
  }

  async function applyStructurePlan(): Promise<void> {
    const archivesVisitedDoors = structurePlan.archived.some((door) => door.lastVisitId);
    if (archivesVisitedDoors && !canDeleteVisitedDoors) {
      reportStructure('Ce réglage retirerait des portes déjà visitées : seul le coordinateur peut le faire. Pour ajouter des portes ou un étage, augmente les réglages ou utilise « Modifier ».');
      return;
    }
    if (structurePlan.archived.length > 0 && !confirmStructureArchive) {
      setConfirmStructureArchive(true);
      return;
    }
    setConfirmStructureArchive(false);
    await runStructure(() => planStructureFromPreview(structurePreview, structureDoors, () => `door-${crypto.randomUUID()}`).targets);
  }

  async function saveAddress(): Promise<void> {
    if (!addressDraft || !onRenameBuilding || addressPending) return;
    const label = normalizeAddressLabel(addressDraft.value);
    if (!label) {
      setAddressMessage('Saisis une adresse, par exemple « 12 rue des Filatiers ».');
      return;
    }
    setAddressPending(true);
    setAddressMessage('');
    try {
      await onRenameBuilding(label);
      setAddressDraft(null);
      setMessage(doors.length === 0 ? 'Adresse retenue : elle sera enregistrée avec la structure du bâtiment.' : 'Adresse enregistrée.');
    } catch (error) {
      setAddressMessage(firestoreWriteErrorMessage(error, 'L’adresse n’a pas été enregistrée. Vérifie la connexion puis réessaie.'));
    } finally {
      setAddressPending(false);
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
      <button aria-label="Fermer le detail du batiment" tabIndex={-1} aria-hidden="true" className="building-detail-backdrop" onClick={onClose} type="button" />
      <aside aria-label="Detail du batiment" className={`building-sheet${paletteDoor ? ' building-sheet--door-detail' : ''}`} role="dialog" aria-modal="true" tabIndex={-1} ref={buildingPanel}>
        <section className="building-identity">
          <button className="building-zone-back" onClick={onClose} type="button">‹ Retour à la zone</button>
          {addressDraft?.buildingId === building.id ? <form className="building-address-form" onSubmit={(event) => { event.preventDefault(); void saveAddress(); }}>
            <label>Adresse du bâtiment<input autoFocus maxLength={MAX_ADDRESS_LENGTH} onChange={(event) => setAddressDraft({ buildingId: building.id, value: event.target.value })} placeholder="12 rue des Filatiers" value={addressDraft.value} /></label>
            <span className="building-address-actions"><button className="primary-action" disabled={addressPending} type="submit">{addressPending ? 'Enregistrement…' : 'Enregistrer l’adresse'}</button><button className="text-button" disabled={addressPending} onClick={() => { setAddressDraft(null); setAddressMessage(''); }} type="button">Annuler</button></span>
            {addressMessage && <p className="building-address-error" role="alert">{addressMessage}</p>}
          </form> : <>
            <h2>{building.addressLabel}</h2>
            {hasPlaceholderAddress(building)
              ? <p className="building-address-missing">{canRenameBuilding && onRenameBuilding
                ? <>Adresse à saisir : c’est elle qui permet de retrouver ce bâtiment dans la liste. <button className="text-button" onClick={() => { setAddressDraft({ buildingId: building.id, value: '' }); setAddressMessage(''); }} type="button">Saisir l’adresse</button></>
                : 'Adresse à compléter par un coordinateur.'}</p>
              : canRenameBuilding && onRenameBuilding && <button className="text-button building-address-edit" onClick={() => { setAddressDraft({ buildingId: building.id, value: building.addressLabel }); setAddressMessage(''); }} type="button">Modifier l’adresse</button>}
          </>}
          <div className="building-meta-row">
            {doors.length > 0 && <p className="building-structure-summary">{floors.length} niveau{floors.length > 1 ? 'x' : ''} · {total.doorCount} portes</p>}
            {canEditStructure && <div className="building-header-actions"><button className="secondary-action" onClick={() => { setEditing((current) => !current); setConfirmDeletion(null); setConfirmFloorDeletion(null); }} type="button">{editing ? 'Terminer' : 'Modifier'}</button><button aria-label="Configurer le batiment" className="secondary-action" onClick={() => openStructure('manage')} type="button">Structure</button>{canDeleteVisitedDoors && <button aria-label={doors.length > 0 ? 'Supprimer la structure du bâtiment' : 'Retirer le bâtiment'} className="structure-reset" disabled={structurePending} onClick={() => void resetStructure()} title={doors.length > 0 ? 'Supprimer la structure' : 'Retirer le bâtiment'} type="button"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 7h16" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" /><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></svg></button>}</div>}
          </div>
          {confirmStructureReset && <div className="structure-reset-confirm" role="alert">
            <b>{doors.length > 0 ? 'Supprimer la structure et repartir vierge ?' : 'Retirer ce bâtiment du suivi ?'}</b>
            <span>{doors.length > 0
              ? `Les ${total.doorCount} portes sont retirées du bâtiment. Les passages déjà enregistrés restent dans l’historique.`
              : 'Son enregistrement disparaît et son emprise redevient « Pas encore fait » sur la carte. Le fond de carte n’est pas modifié.'}</span>
            <span className="structure-reset-actions"><button onClick={() => void resetStructure()} type="button">{doors.length > 0 ? 'Oui, tout retirer' : 'Oui, retirer'}</button><button onClick={() => setConfirmStructureReset(false)} type="button">Non</button></span>
          </div>}
          {doors.length > 0 && <>
          <div className="building-progress-row">
            <span aria-hidden="true" className="building-progress-track"><i style={{ width: `${total.ratio * 100}%` }} /></span>
            <span className="building-progress-count">{total.treatedCount} / {total.doorCount}</span>
          </div>
          <p aria-live="polite" className="building-sync-state" data-phase={sync?.status.phase}>{syncLabel}</p>
          {syncDetail && <p className="building-sync-detail">{syncDetail}</p>}
          </>}
        </section>

        {structureLoadedBuildingId !== building.id ? <section className="building-empty-state" role="status"><h3>{loadError ? 'Bâtiment indisponible' : 'Chargement du bâtiment…'}</h3>{loadError && <button type="button" onClick={() => void refresh().catch(() => setLoadError(true))}>Réessayer</button>}</section> : doors.length === 0 ? <section className="building-empty-state" aria-label="Bâtiment non décrit"><span aria-hidden="true">⌂</span><h3>Bâtiment non décrit</h3><p>Aucun étage ni porte enregistré. Décris la structure une fois — tout le suivi viendra s'y accrocher.</p>{canEditStructure && <div><button className="primary-action" onClick={() => openStructure('manage')} type="button">Décrire le bâtiment</button><button className="text-button" disabled={structurePending} onClick={() => void runStructure(() => [{ floor: 0, label: '01', sortOrder: 0, newDoorId: `door-${crypto.randomUUID()}` }])} type="button">{structurePending ? 'Enregistrement…' : "C'est un pavillon — une seule porte"}</button></div>}</section> : <section className={`building-cut${editing ? ' building-cut--editing' : ''}`} aria-label="Coupe verticale du bâtiment">
          {editing && <button className="building-add-floor" onClick={() => openFloorCreation(Math.max(...floors.map((item) => item.floor)) + 1)} type="button">+ Ajouter un étage au-dessus</button>}
          {floors.slice().reverse().map((item) => {
            const levelDoors = doors.filter((door) => door.floor === item.floor).sort(compareDoorsForFloor);
            return <section className="building-floor" key={item.floor}>
              <div className="building-floor-label"><span>{floorLabel(item.floor)}</span></div>
              <div className="building-floor-content">
                <header className="building-floor-heading">
                  <span>{item.doorCount} porte{item.doorCount > 1 ? 's' : ''}</span>
                  {editing ? <span className="building-floor-edit-actions">
                    <button onClick={() => openFloorCreation(item.floor)} type="button">+ porte</button>
                    {confirmFloorDeletion === item.floor ? <span className="floor-delete-confirm"><b>Supprimer l’étage et son historique ?</b><button aria-label={`Confirmer la suppression du ${floorLabel(item.floor)}`} onClick={() => void removeFloor(item.floor)} type="button">Oui</button><button aria-label={`Annuler la suppression du ${floorLabel(item.floor)}`} onClick={() => setConfirmFloorDeletion(null)} type="button">Non</button></span> : <button className="floor-delete" onClick={() => void removeFloor(item.floor)} type="button">supprimer l’étage</button>}
                  </span> : <span>{item.treatedCount}/{item.doorCount} visitée{item.treatedCount > 1 ? 's' : ''} · {item.firstVisitCount > 0
                    ? <button aria-expanded={confirmFloorAbsence === item.floor} disabled={saving} onClick={() => setConfirmFloorAbsence((current) => current === item.floor ? null : item.floor)} type="button">Marquer {item.firstVisitCount} porte{item.firstVisitCount > 1 ? 's' : ''} absente{item.firstVisitCount > 1 ? 's' : ''}</button>
                    : isFloorComplete(item) ? <strong className="building-floor-complete">terminé</strong>
                      : <span className="building-floor-revisit">{item.toRevisitCount} à revoir</span>}</span>}
                </header>
                {!editing && confirmFloorAbsence === item.floor && item.firstVisitCount > 0 && <div className="floor-absence-confirm" role="alert">
                  <b>Enregistrer « Absent » pour {doorsForGroupedAbsence(levelDoors).map((door) => door.label).join(', ')} ?</b>
                  <span>Seules les portes jamais visitées de l’étage sont marquées. Les autres ne changent pas.</span>
                  <span className="floor-absence-actions"><button disabled={saving} onClick={() => { setConfirmFloorAbsence(null); void markFloorAway(levelDoors); }} type="button">Oui, marquer</button><button onClick={() => setConfirmFloorAbsence(null)} type="button">Non</button></span>
                </div>}
                <div className="door-grid" aria-label={`Portes ${floorLabel(item.floor)}`}>
              {levelDoors.map((door) => {
                const status = statusesById.get(door.currentStatusId);
                const open = openPaletteDoorId === door.id;
                const statusColor = status?.color ?? '#8C9494';
                const confirmsHistoryDeletion = confirmDeletion === door.id;
                return <div className={`door-card${confirmsHistoryDeletion ? ' door-card--confirm' : ''}`} key={door.id}>
                  {confirmsHistoryDeletion ? <div className="door-delete-confirm" role="alert"><b>Supprimer l’historique ?</b><span><button aria-label={`Confirmer la suppression de la porte ${door.label}`} onClick={() => void removeDoor(door)} type="button">Oui</button><button aria-label={`Annuler la suppression de la porte ${door.label}`} onClick={() => setConfirmDeletion(null)} type="button">Non</button></span></div> : <><button aria-expanded={open} aria-label={`Porte ${door.label}, ${status?.label ?? 'Statut indisponible'}`} className={`door-row${door.sisters ? ' door-row--sisters' : ''}`} onClick={() => void openDoor(door)} style={{ '--status-color': statusColor, '--status-foreground': statusForeground(statusColor) } as CSSProperties} type="button"><span className="door-row-label">{door.label}</span><span aria-hidden="true" className="door-state-dot" /><span className="door-row-status">{status?.label ?? 'Statut indisponible'}</span></button>{editing && <button aria-label={`Supprimer la porte ${door.label}`} className="door-delete" onClick={() => void removeDoor(door)} type="button">×</button>}</>}
                </div>;
              })}
              {canEditStructure && !editing && <button aria-label={`Ajouter des portes au ${floorLabel(item.floor)}`} className="door-add" onClick={() => { setFloor(item.floor); setQuickFirstLabel(String((Math.max(0, ...levelDoors.map((door) => Number(door.label) || 0))) + 1)); openStructure('quick-floor'); }} type="button"><b aria-hidden="true">+</b><span>Ajouter</span></button>}
                </div>
              </div>
            </section>;
          })}
          <div className="building-ground"><span>Rue · entrée principale</span></div>
        </section>}

        {editing && <div className="building-edit-bar"><p><strong>Modification de la structure</strong><span>Les portes visitées gardent leur historique sauf suppression confirmée.</span></p><button onClick={() => { setEditing(false); setConfirmDeletion(null); setConfirmFloorDeletion(null); }} type="button">Terminé</button></div>}

        {sync && selectedEntry?.state === 'conflict' && selectedEntry.conflict && <section className="sync-resolution" aria-label="Resolution du conflit"><p className="eyebrow">Conflit à résoudre</p><p>Un autre frère a marqué cette porte entre-temps : elle est maintenant « {statusesById.get(selectedEntry.conflict.currentStatusId)?.label ?? 'statut inconnu'} » sur le serveur. Ton passage est conservé sur l’appareil.</p><div className="sync-resolution-actions"><button className="primary-action" disabled={sync.syncing} onClick={() => void sync.reapplyConflict(selectedEntry.commandId)} type="button">Réappliquer mon passage</button><button className="secondary-action" disabled={sync.syncing} onClick={() => void sync.abandonConflict(selectedEntry.commandId)} type="button">Garder la version du serveur</button></div></section>}
        {sync && selectedEntry?.state === 'rejected' && <p className="sync-rejection" role="status">Passage refusé par le serveur : {REJECTION_MESSAGES[selectedEntry.rejection ?? ''] ?? 'raison inconnue'}. Il reste sur l’appareil, rien n’est effacé.</p>}
        {sync && <div className="sync-controls"><button className="secondary-action" disabled={!sync.online || sync.syncing} onClick={() => void sync.synchronize()} type="button">Synchroniser</button><label className="trusted-device-control"><input checked={trustedDevice} onChange={(event) => { const trusted = event.target.checked; setTrustedDeviceState(trusted); setTrustedDevice(trusted); window.location.reload(); }} type="checkbox" />Appareil de confiance</label></div>}
        <p className="workspace-map-message" role="status">{message}</p>

        {paletteDoor && <div className="door-status-layer">
          <button aria-label="Fermer le choix de statut" className="door-status-backdrop" onClick={() => setOpenPaletteDoorId(null)} type="button" />
          <section aria-label={`Fiche de la porte ${paletteDoor.label}`} className="door-status-sheet door-detail-sheet" role="dialog" aria-modal="true" tabIndex={-1} ref={doorPanel}>
            <button className="door-detail-back" onClick={() => setOpenPaletteDoorId(null)} type="button">‹ {building.addressLabel}</button>
            <h3>Porte {paletteDoor.label} · {floorLabel(paletteDoor.floor)}</h3>
            <p className="door-detail-subline">{doorSubline(paletteDoor, statusesById.get(paletteDoor.currentStatusId)?.label)}</p>
            <p className="eyebrow">Résultat du passage</p>
            {/* La note part avec le résultat : elle s'écrit avant, car toucher un résultat ferme la fiche. */}
            {showPassageNote
              ? <label className="passage-note-field">Note jointe au passage<textarea aria-label={`Note pour porte ${paletteDoor.label}`} autoFocus maxLength={280} onChange={(event) => setNote(event.target.value)} placeholder="Écris la note, puis touche le résultat" rows={2} value={note} /></label>
              : <button aria-expanded={false} className="passage-note-toggle" onClick={() => setShowPassageNote(true)} type="button">+ note pour ce passage</button>}
            <div className="status-palette">{RESULT_CHOICES.map((choice) => {
              const current = paletteDoor.lastVisitId !== null && paletteDoor.currentStatusId === choice.statusId;
              return <button aria-pressed={current} className={`status-swatch ${choice.className}`} disabled={saving || !statusesById.get(choice.statusId)?.active} key={choice.statusId} onClick={() => void savePassage(paletteDoor, choice.statusId)} type="button"><span aria-hidden="true" /><b>{choice.label}</b>{(choice.hint || current) && <small aria-hidden="true">{current ? 'résultat actuel' : choice.hint}</small>}</button>;
            })}</div>
            {dndCorrection?.doorId === paletteDoor.id && <div className="dnd-correction" role="alert">
              <b>Cette personne a demandé à ne plus être dérangée.</b>
              <span>Enregistrer « {statusesById.get(dndCorrection.statusId)?.label ?? 'Statut indisponible'} » à la place ? Le passage « Ne pas déranger » reste dans l’historique.</span>
              <span className="dnd-correction-actions"><button onClick={() => void savePassage(paletteDoor, dndCorrection.statusId)} type="button">Oui, corriger</button><button onClick={() => setDndCorrection(null)} type="button">Annuler</button></span>
            </div>}
            <p className="eyebrow">Composition du foyer</p>
            <div className="foyer-chips">{([{ value: 'femme', label: 'Femme seule' }, { value: 'homme', label: 'Homme seul' }, { value: 'couple', label: 'Couple' }, { value: 'famille', label: 'Famille' }, { value: null, label: 'Non renseigné' }] as const).map((choice) => <button aria-pressed={foyer === choice.value} key={choice.label} onClick={() => void chooseFoyer(paletteDoor, choice.value)} type="button">{choice.label}</button>)}</div>
            <button aria-pressed={sisters} className="sisters-toggle" onClick={() => void toggleSisters(paletteDoor, !sisters, false)} type="button"><span className="sisters-toggle-copy"><strong>À confier aux sœurs</strong><span>Le prochain passage sera fait par les sœurs.</span></span><i aria-hidden="true" className="sisters-toggle-control" /></button>
            {autoSisters && <p className="sisters-auto">Activé automatiquement — tu peux le désactiver.</p>}
            <p className="eyebrow">Historique des passages</p>
            <ol className="door-history">{historyState !== 'ready' ? <li className="door-history-empty">{historyState === 'loading' ? 'Chargement de l’historique…' : 'Historique indisponible. Les passages conservés n’ont pas été effacés.'}</li> : doorVisits.length === 0 ? <li className="door-history-empty">Aucun passage enregistré.</li> : doorVisits.slice(0, historyLimit).map((visit) => { const status = statusesById.get(visit.statusId); return <li key={visit.id} style={{ '--history-status': status?.color ?? 'var(--st-todo)' } as CSSProperties}><i aria-hidden="true" className="door-history-dot" /><span className="door-history-body"><strong>{new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(visit.occurredAt))} · {buildingStaleness(visit.occurredAt).label}</strong><span>{visit.authorName} — {status?.label ?? 'Statut indisponible'}{visit.note ? ` · « ${visit.note} »` : ''}</span></span></li>; })}</ol>
            {historyState === 'error' && <button type="button" onClick={() => void openDoor(paletteDoor)}>Réessayer l’historique</button>}
            {historyState === 'ready' && historyLimit < doorVisits.length && <button type="button" onClick={() => setHistoryLimit(limit => limit + 25)}>Afficher les passages précédents ({doorVisits.length - historyLimit})</button>}
            <p className="privacy-note">La composition et ce marqueur ne sont visibles que dans cette fiche.</p>
          </section>
        </div>}

        {structureMode && <div className="structure-sheet-layer">
          <button aria-label="Fermer la configuration" tabIndex={-1} aria-hidden="true" className="structure-sheet-backdrop" onClick={() => setStructureMode(null)} type="button" />
          <section aria-label={structureMode === 'quick-floor' ? 'Ajouter des portes' : 'Configurer le batiment'} className="structure-sheet" role="dialog" aria-modal="true" tabIndex={-1} ref={structurePanel}>
            <header><div><p className="eyebrow">{structureMode === 'quick-floor' ? floorLabel(floor) : building.addressLabel}</p><h3>{structureMode === 'quick-floor' ? 'Ajouter des portes' : 'Structure du bâtiment'}</h3></div><button aria-label="Fermer la configuration" className="icon-action" onClick={() => setStructureMode(null)} type="button">×</button></header>
            {structureMode === 'quick-floor' ? <>
              <p className="structure-sheet-lead">Crée les portes de cet étage en une fois. Elles commencent en Pas encore fait.</p>
              <div className="quick-door-fields"><label>Combien<input aria-label="Nombre de portes a ajouter" min="1" max="50" onChange={(event) => setQuickDoorCount(event.target.value)} type="number" value={quickDoorCount} /></label><label>Premier numero<input aria-label="Premier numero de porte" min="0" onChange={(event) => setQuickFirstLabel(event.target.value)} type="number" value={quickFirstLabel} /></label></div>
              <button className="primary-action" disabled={structurePending} onClick={() => void addDoorsToCurrentFloor()} type="button">{structurePending ? 'Enregistrement…' : <>Créer {Math.max(1, Number(quickDoorCount) || 1)} porte{Number(quickDoorCount) > 1 ? 's' : ''}</>}</button>
            </> : <div className="structure-panel">
              <p className="structure-sheet-lead">Décris les niveaux une seule fois. Toutes les portes seront créées en « Pas encore fait ».</p>
              {showsCadastralNotice && <p className="structure-suggestion">{CADASTRAL_SUGGESTION_NOTICE}</p>}
              <div className="structure-fields"><label><span>Étages au-dessus du rez-de-chaussée</span><Stepper label="Étages au-dessus du rez-de-chaussée" max={20} min={0} onChange={(value) => editStructureDraft({ floorCount: String(value) })} unit="étages" value={Math.max(0, Number(floorCount) || 0)} gloss={`RDC compris = ${Math.max(1, Number(floorCount) + 1)} niveaux`} /></label><label><span>Portes par étage</span><Stepper label="Portes par étage" max={50} min={1} onChange={(value) => editStructureDraft({ doorsPerFloor: String(value) })} value={Math.max(1, Number(doorsPerFloor) || 1)} gloss="modifiable étage par étage" /></label></div>
              <p className="structure-numbering-label">Numérotation</p>
              <div className="numbering-options" aria-label="Numérotation"><button aria-pressed={numbering === 'floor'} onClick={() => chooseNumbering('floor')} type="button">01, 02 · 11, 12</button><button aria-pressed={numbering === 'hundreds'} onClick={() => chooseNumbering('hundreds')} type="button">101, 102 · 201</button><button aria-pressed={numbering === 'serial'} onClick={() => chooseNumbering('serial')} type="button">1 à {structurePreview.flat().length}, en suite</button></div>
              <section className="structure-preview" aria-label="Aperçu vivant"><p className="eyebrow">Aperçu</p>{structurePreview.slice().reverse().map((labels, reverseIndex) => { const floorNumber = structurePreview.length - reverseIndex - 1; return <div key={floorNumber}><strong>{floorLabel(floorNumber)}</strong>{labels.map((label) => <span key={label}>{label}</span>)}</div>; })}<small>Rue · entrée principale</small></section>
              {confirmStructureArchive && structurePlan.archived.length > 0 && <div className="structure-reset-confirm structure-archive-confirm" role="alert">
                <b>Retirer {structurePlan.archived.length === 1 ? 'la porte' : `ces ${structurePlan.archived.length} portes`} : {structurePlan.archived.map((door) => `${floorLabel(door.floor)} ${door.label}`).join(', ')} ?</b>
                <span>Elles disparaissent de la coupe. Leurs passages restent dans l’historique. Les {structurePlan.kept} autres portes gardent leur suivi.</span>
                <span className="structure-reset-actions"><button disabled={structurePending} onClick={() => void applyStructurePlan()} type="button">Oui, retirer</button><button onClick={() => setConfirmStructureArchive(false)} type="button">Non</button></span>
              </div>}
              <button className="primary-action" disabled={structurePending || (structurePlan.created === 0 && structurePlan.archived.length === 0)} onClick={() => void applyStructurePlan()} type="button">{structurePending ? 'Enregistrement…' : structurePlanLabel(structurePlan)}</button>
              {canDeleteVisitedDoors && <button className="text-button" onClick={() => { if (!showManual) setManualPlan(structureDoors.filter((door) => door.active).map((door) => `${door.floor} | ${door.label} | ${door.id}`).join('\n')); setShowManual((current) => !current); }} type="button">Ajustement manuel</button>}
              {canDeleteVisitedDoors && showManual && <><label className="manual-plan-label">Plan manuel (etage | porte | ID ou new:ID)<textarea aria-label="Plan manuel de portes" onChange={(event) => setManualPlan(event.target.value)} rows={5} value={manualPlan} /></label><button className="secondary-action" onClick={() => void runStructure(() => parseManualTargets(manualPlan))} type="button">Appliquer le plan manuel</button></>}
              <details className="structure-advanced"><summary>Portes archivées</summary>
              {ambiguities.length > 0 && <section className="structure-ambiguities" aria-label="Renommages ambigus"><p>Choisir la porte historique:</p>{ambiguities.map((ambiguity) => <div key={`${ambiguity.target.floor}-${ambiguity.target.label}`}><strong>{floorLabel(ambiguity.target.floor)} / {ambiguity.target.label}</strong>{ambiguity.candidateDoorIds.map((doorId) => <button className="secondary-action" key={doorId} onClick={() => resolveAmbiguity(ambiguity, doorId)} type="button">{ambiguityChoiceLabel(structureDoors.find((door) => door.id === doorId), statusesById)}</button>)}</div>)}</section>}
              <div className="archived-doors"><p className="eyebrow">Archivees</p>{structureDoors.filter((door) => !door.active).length === 0 ? <span>Aucune</span> : structureDoors.filter((door) => !door.active).map((door) => <span key={door.id}>{floorLabel(door.floor)} / {door.label}</span>)}</div>
              </details>
            </div>}
            {structureMessage && <p className="structure-sheet-message" role="status">{structureMessage}</p>}
          </section>
        </div>}
      </aside>
    </div>
  );
}
