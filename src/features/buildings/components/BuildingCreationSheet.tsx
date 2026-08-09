import { useEffect, useState, type ReactElement } from 'react';
import { geohashForLocation } from 'geofire-common';
import type { Building, GeoPoint, Zone } from '../../../domain/workspace/models';
import type { WorkspaceRepositories } from '../../../domain/workspace/repositories';
import { prepareFirestoreCacheRecovery } from '../../../infrastructure/firebase/client';
import { firestoreWriteErrorMessage } from '../../../infrastructure/firebase/firestore-errors';

type BuildingCreationSheetProps = {
  location: GeoPoint | null;
  authorId: string;
  repositories: WorkspaceRepositories;
  onCreated(building: Building): void;
  onClose(): void;
};

export function BuildingCreationSheet({ location, authorId, repositories, onCreated, onClose }: BuildingCreationSheetProps): ReactElement | null {
  const [zones, setZones] = useState<readonly Zone[]>([]);
  const [zoneId, setZoneId] = useState('');
  const [addressLabel, setAddressLabel] = useState('');
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!location) return;
    let live = true;
    void repositories.zones.list().then((values) => {
      if (!live) return;
      setZones(values);
      setZoneId((current) => current || values[0]?.id || '');
    }).catch(() => { if (live) setMessage('Les zones ne sont pas disponibles.'); });
    return () => { live = false; };
  }, [location, repositories.zones]);

  if (!location) return null;
  const buildingLocation = location;

  async function createBuilding(): Promise<void> {
    const label = addressLabel.trim();
    if (!label || !zoneId) {
      setMessage(!zoneId ? 'Dessinez d abord une zone pour y rattacher ce batiment.' : 'Indiquez le nom ou l adresse du batiment.');
      return;
    }
    const building: Building = {
      // `02-DATA-MODEL.md` : un bâtiment absent du RNB reçoit un identifiant local préfixé.
      id: `local_${crypto.randomUUID()}`,
      addressLabel: label,
      location: buildingLocation,
      geohash: geohashForLocation([buildingLocation.latitude, buildingLocation.longitude]),
      zoneId,
      createdBy: authorId,
      structureRevision: 0
    };
    setPending(true);
    setMessage('Création du bâtiment en cours…');
    try {
      await repositories.buildings.create(building);
      onCreated(building);
      onClose();
    } catch (error) {
      if (await prepareFirestoreCacheRecovery(error)) {
        setMessage('Le cache local Firebase était bloqué. Athar le répare et recharge l’application…');
        window.setTimeout(() => window.location.reload(), 500);
        return;
      }
      setMessage(firestoreWriteErrorMessage(error, 'Le bâtiment ne peut pas être créé. Réessaie, puis vérifie les droits Firebase si le problème continue.'));
    } finally {
      setPending(false);
    }
  }

  return <div className="structure-sheet-layer">
    <button aria-label="Annuler le nouveau batiment" className="structure-sheet-backdrop" onClick={onClose} type="button" />
    <section aria-label="Nouveau batiment" className="structure-sheet" role="dialog">
      <header><div><p className="eyebrow">Nouveau point</p><h3>Ajouter un batiment</h3></div><button aria-label="Annuler le nouveau batiment" className="icon-action" onClick={onClose} type="button">X</button></header>
      <p className="structure-sheet-lead">Le point est pose sur la carte. Ajoutez ensuite les portes depuis la fiche du batiment.</p>
      <div className="structure-fields"><label>Nom ou adresse<input aria-label="Nom ou adresse du batiment" autoFocus maxLength={160} onChange={(event) => setAddressLabel(event.target.value)} value={addressLabel} /></label><label>Zone<select aria-label="Zone du batiment" onChange={(event) => setZoneId(event.target.value)} value={zoneId}><option value="">Choisir une zone</option>{zones.map((zone) => <option key={zone.id} value={zone.id}>{zone.name}</option>)}</select></label></div>
      <button className="primary-action" disabled={pending} onClick={() => void createBuilding()} type="button">{pending ? 'Création en cours…' : 'Créer le bâtiment'}</button>
      {message && <p className="workspace-map-message" role="status">{message}</p>}
    </section>
  </div>;
}
