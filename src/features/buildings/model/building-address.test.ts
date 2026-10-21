import { describe, expect, it } from 'vitest';
import { footprintBuildingLabel, hasPlaceholderAddress, MANUAL_BUILDING_LABEL, normalizeAddressLabel } from './building-address';

describe('building address', () => {
  it('recognises the fallback labels only', () => {
    expect(hasPlaceholderAddress({ id: 'PG31CARMES003', addressLabel: footprintBuildingLabel('PG31CARMES003') })).toBe(true);
    expect(hasPlaceholderAddress({ id: 'local_1', addressLabel: MANUAL_BUILDING_LABEL })).toBe(true);
    expect(hasPlaceholderAddress({ id: 'PG31CARMES003', addressLabel: '12 rue de l’Église' })).toBe(false);
    expect(hasPlaceholderAddress({ id: 'PG31CARMES003', addressLabel: 'Bâtiment A' })).toBe(false);
  });

  it('collapses spaces and refuses an empty address', () => {
    expect(normalizeAddressLabel('  12   rue des Filatiers ')).toBe('12 rue des Filatiers');
    expect(normalizeAddressLabel('   ')).toBeNull();
  });
});
