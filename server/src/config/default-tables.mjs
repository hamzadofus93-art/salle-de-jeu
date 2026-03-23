export const DEFAULT_TABLES = [
  ...Array.from({ length: 6 }, (_, index) => ({
    id: `pool-${index + 1}`,
    name: `Phoenix Pool ${index + 1}`,
    discipline: "Pool anglais",
    shortDiscipline: "Pool",
  })),
  ...Array.from({ length: 3 }, (_, index) => ({
    id: `snooker-${index + 1}`,
    name: `Phoenix Snooker ${index + 1}`,
    discipline: "Snooker",
    shortDiscipline: "Snooker",
  })),
];
