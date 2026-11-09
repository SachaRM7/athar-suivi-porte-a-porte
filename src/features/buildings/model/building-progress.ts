/** L'avancement décrit les passages, jamais une fin définitive du suivi. */
export function buildingProgressLabel(doorCount: number, visitedCount: number): string {
  if (doorCount === 0) return 'À décrire';
  if (visitedCount === 0) return 'Préparé';
  if (visitedCount < doorCount) return 'En cours';
  return 'Toutes visitées';
}
