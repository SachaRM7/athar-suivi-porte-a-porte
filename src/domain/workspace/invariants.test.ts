import { describe, expect, it } from 'vitest';
import { demoWorkspace } from '../../infrastructure/demo/demo-workspace';
import { assertBuilding, assertDoor, assertStatus, assertVisit, assertZone } from './invariants';

describe('workspace domain invariants', () => {
  it('accepts the complete local demonstration model', () => {
    for (const status of demoWorkspace.statuses) assertStatus(status);
    for (const zone of demoWorkspace.zones) assertZone(zone);
    for (const building of demoWorkspace.buildings) assertBuilding(building);
    for (const door of demoWorkspace.doors) assertDoor(door, demoWorkspace.buildings.find((building) => building.id === door.buildingId));
    for (const visit of demoWorkspace.visits) assertVisit(visit);
  });

  it('rejects a door that pretends to have a different building location', () => {
    const door = { ...demoWorkspace.doors[0], location: { latitude: 43.61, longitude: 1.44 } };
    expect(() => assertDoor(door, demoWorkspace.buildings[0])).toThrow('share its building location');
  });

  it('rejects invalid status colors and oversized visit notes', () => {
    expect(() => assertStatus({ ...demoWorkspace.statuses[0], color: 'green' })).toThrow('hexadecimal');
    expect(() => assertVisit({ ...demoWorkspace.visits[0], note: 'x'.repeat(281) })).toThrow('note is invalid');
  });
});
