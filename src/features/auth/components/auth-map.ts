import { statusColorVar, type DoorStatus } from '../../../design/status';

const ST: Readonly<Record<DoorStatus, string>> = {
  todo: statusColorVar('todo'),
  open: statusColorVar('open'),
  away: statusColorVar('away'),
  linked: statusColorVar('linked'),
  dnd: statusColorVar('dnd'),
  locked: statusColorVar('locked')
};

/* Fond cartographique factice de la maquette d'authentification. */
let sd = 23;
const rnd = () => (sd = (sd * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

export function mapSVG(): string {
  sd = 23;
  let roads = '', foots = '';
  for (let c = 0; c < 13; c++) roads += `<line x1="${c * 100}" y1="0" x2="${c * 100 - 40}" y2="800" stroke="var(--map-road)" stroke-width="${c % 3 === 0 ? 9 : 5}"/>`;
  for (let r = 0; r < 10; r++) roads += `<line x1="0" y1="${r * 90}" x2="1240" y2="${r * 90 + 16}" stroke="var(--map-road)" stroke-width="${r % 3 === 0 ? 9 : 5}"/>`;
  const pool: DoorStatus[] = ['open', 'open', 'away', 'linked', 'todo', 'todo', 'todo', 'locked', 'dnd', 'open'];
  for (let r = 0; r < 10; r++) for (let c = 0; c < 13; c++) for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) {
    if (rnd() < .24) continue;
    const w = 26 + rnd() * 12, h = 22 + rnd() * 10, x = c * 100 + 14 + a * 40 + rnd() * 4, y = r * 90 + 12 + b * 38 + rnd() * 4;
    const st = pool[Math.floor(rnd() * pool.length)] ?? 'todo';
    const col = st === 'todo' ? 'var(--foot-todo)' : ST[st];
    foots += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="2" fill="${col}" fill-opacity="${st === 'todo' ? .85 : .55}" stroke="${col}" stroke-width="1.2"/>`;
  }
  return `<svg aria-hidden="true" focusable="false" viewBox="0 0 1240 800" preserveAspectRatio="xMidYMid slice">
    <rect width="1240" height="800" fill="var(--map-bg)"/>${roads}
    <path d="M980 0 L1060 300 L1010 560 L1090 800 L1240 800 L1240 0Z" fill="var(--map-park)"/>
    <path d="M0 620 Q220 580 430 646 T860 684 T1240 640 L1240 700 Q860 744 430 706 T0 684Z" fill="var(--map-water)"/>
    ${foots}</svg>`;
}
