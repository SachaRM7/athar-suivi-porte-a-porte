export type DoorLayoutItem = {
  id: string;
  label: string;
  floor: number;
};

export type DoorLayoutPosition = DoorLayoutItem & {
  x: number;
  y: number;
};

export function layoutDoorsAtBuilding(
  doors: DoorLayoutItem[],
  spacing = 34
): DoorLayoutPosition[] {
  const sorted = [...doors].sort((a, b) =>
    a.floor - b.floor || a.label.localeCompare(b.label) || a.id.localeCompare(b.id)
  );
  const columns = Math.max(1, Math.ceil(Math.sqrt(sorted.length)));
  const rows = Math.max(1, Math.ceil(sorted.length / columns));

  return sorted.map((door, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    return {
      ...door,
      x: (column - (columns - 1) / 2) * spacing,
      y: (row - (rows - 1) / 2) * spacing
    };
  });
}

