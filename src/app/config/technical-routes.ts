/**
 * Lot A4 — laboratoires techniques (`/_ds`, `/technical-lab`, `/technical-map`).
 *
 * Disponibles en développement (`vite`) et dans le build de recette `npm run build:lab`
 * (mode `lab`, cf. `.env.lab`). Absents du build de production ordinaire : la constante est
 * remplacée à la compilation, les imports dynamiques des laboratoires disparaissent du
 * bundle, et ces URL retombent sur la redirection des routes inconnues.
 */
export const TECHNICAL_ROUTES_ENABLED: boolean = __ATHAR_TECHNICAL_ROUTES__;

export const TECHNICAL_PATHS = ['/_ds', '/technical-lab', '/technical-map'] as const;
