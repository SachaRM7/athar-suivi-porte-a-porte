/**
 * Pré-remplissage du dialogue de structure depuis les attributs BD TOPO.
 *
 * `03-CARTO.md` : `nombre_d_etages` et `nombre_de_logements` viennent des fichiers fonciers
 * MAJIC, et sont **souvent absents**. Ce module ne produit donc jamais qu'une suggestion,
 * affichée « à confirmer ». Il ne crée aucune porte : seule une validation humaine le fait.
 */

export type CadastralSuggestion = {
  /** Étages au-dessus du rez-de-chaussée, tel que le stepper l'attend. */
  floorsAboveGround: number;
  doorsPerFloor: number;
};

/** Mention imposée par `03-CARTO.md` et `04-SCREENS.md`. Ne pas la reformuler. */
export const CADASTRAL_SUGGESTION_NOTICE = 'suggestion d’après le cadastre — à confirmer';

function positiveInteger(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
  if (!Number.isFinite(parsed) || parsed < 1) return null;
  return Math.floor(parsed);
}

/**
 * `nombre_d_etages` compte les **niveaux** (`max(dnbniv, dniv+1)`, RDC compris) tandis que le
 * stepper demande les étages au-dessus du rez-de-chaussée : d'où le décalage de un.
 * Les deux attributs doivent exister — un seul ne suffit pas à décrire une structure.
 */
export function cadastralSuggestion(properties: Readonly<Record<string, unknown>> | null | undefined): CadastralSuggestion | null {
  if (!properties) return null;
  const levels = positiveInteger(properties.nombre_d_etages);
  const dwellings = positiveInteger(properties.nombre_de_logements);
  if (levels === null || dwellings === null) return null;
  if (levels > 51) return null;
  return {
    floorsAboveGround: levels - 1,
    doorsPerFloor: Math.max(1, Math.min(100, Math.round(dwellings / levels)))
  };
}
