import { describe, expect, it } from 'vitest';
import { mapSVG } from './auth-map';

describe('auth map backdrop', () => {
  it('reproduit exactement le même fond à chaque génération avec la graine 23', () => {
    expect(mapSVG()).toBe(mapSVG());
  });

  it('reste décoratif et utilise les jetons cartographiques et de statut', () => {
    const svg = mapSVG();

    expect(svg).toContain('aria-hidden="true"');
    expect(svg).toContain('focusable="false"');
    expect(svg).toContain('preserveAspectRatio="xMidYMid slice"');
    expect(svg).toContain('var(--map-bg)');
    expect(svg).toContain('var(--map-road)');
    expect(svg).toContain('var(--map-park)');
    expect(svg).toContain('var(--map-water)');
    expect(svg).toContain('var(--foot-todo)');
    expect(svg).toContain('var(--st-open)');
    expect(svg).not.toMatch(/#(?:8B948F|1F7A5A|C87A0A|2456A6|A93B2E|6B5AA8|CDD3CD)/i);
  });
});
