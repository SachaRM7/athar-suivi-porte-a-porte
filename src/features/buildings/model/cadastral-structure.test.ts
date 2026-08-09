import { describe, expect, it } from 'vitest';
import { cadastralSuggestion } from './cadastral-structure';

describe('cadastralSuggestion', () => {
  it('converts BD TOPO levels into floors above the ground floor', () => {
    // `building-carmes` de l'échantillon versionné : 3 niveaux, 6 logements.
    expect(cadastralSuggestion({ nombre_d_etages: 3, nombre_de_logements: 6 })).toEqual({ floorsAboveGround: 2, doorsPerFloor: 2 });
  });

  it('reads a pavillon as a single ground floor door', () => {
    expect(cadastralSuggestion({ nombre_d_etages: 1, nombre_de_logements: 1 })).toEqual({ floorsAboveGround: 0, doorsPerFloor: 1 });
  });

  it('suggests nothing when one of the two attributes is missing', () => {
    expect(cadastralSuggestion({ nombre_d_etages: 4 })).toBeNull();
    expect(cadastralSuggestion({ nombre_de_logements: 12 })).toBeNull();
    expect(cadastralSuggestion({ usage_1: 'Indifférencié', hauteur: 6.1 })).toBeNull();
    expect(cadastralSuggestion(null)).toBeNull();
  });

  it('discards values that cannot describe a building', () => {
    expect(cadastralSuggestion({ nombre_d_etages: 0, nombre_de_logements: 4 })).toBeNull();
    expect(cadastralSuggestion({ nombre_d_etages: 3, nombre_de_logements: -1 })).toBeNull();
    expect(cadastralSuggestion({ nombre_d_etages: 400, nombre_de_logements: 400 })).toBeNull();
    expect(cadastralSuggestion({ nombre_d_etages: 22, nombre_de_logements: 44 })).toBeNull();
    expect(cadastralSuggestion({ nombre_d_etages: 2, nombre_de_logements: 102 })).toBeNull();
  });

  it('never proposes an empty floor', () => {
    expect(cadastralSuggestion({ nombre_d_etages: 5, nombre_de_logements: 2 })?.doorsPerFloor).toBe(1);
  });

  it('accepts the numeric strings a vector tile may carry', () => {
    expect(cadastralSuggestion({ nombre_d_etages: '4', nombre_de_logements: '12' })).toEqual({ floorsAboveGround: 3, doorsPerFloor: 3 });
  });
});
