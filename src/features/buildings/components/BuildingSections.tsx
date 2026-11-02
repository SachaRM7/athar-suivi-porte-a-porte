import type { ReactElement } from 'react';
import type { BuildingSection } from '../../../domain/workspace/building-sections';

type Props = {
  sections: readonly BuildingSection[];
  activeId: string;
  canAdd: boolean;
  disabled: boolean;
  onSelect(id: string): void;
  onAdd(): void;
};

/** Aucun onglet ni numéro pour le cas courant : le découpage est toujours explicite. */
export function BuildingSections({ sections, activeId, canAdd, disabled, onSelect, onAdd }: Props): ReactElement | null {
  if (sections.length === 1 && !canAdd) return null;
  return <div className="building-sections">
    {sections.length > 1 && (sections.length <= 3
      ? <div className="building-section-tabs" role="group" aria-label="Bâtiments / halls à cette adresse">
        {sections.map(section => <button key={section.id} type="button" aria-pressed={section.id === activeId}
          disabled={disabled} onClick={() => onSelect(section.id)}>{section.label}</button>)}
      </div>
      : <label className="building-section-select">Bâtiment / hall
        <select disabled={disabled} value={activeId} onChange={event => onSelect(event.target.value)}>
          {sections.map(section => <option key={section.id} value={section.id}>{section.label}</option>)}
        </select>
      </label>)}
    {canAdd && <button className="text-button building-section-add" disabled={disabled} onClick={onAdd} type="button">+ Ajouter un bâtiment / hall</button>}
  </div>;
}
