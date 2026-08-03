const freezeTheme = (theme) =>
  Object.freeze({
    ...theme,
    palette: Object.freeze({ ...theme.palette }),
    dressing: Object.freeze([...(theme.dressing ?? [])]),
  });

export const BATTLEGROUNDS = Object.freeze([
  freezeTheme({
    id: "clear-grid",
    terrainId: "none",
    label: "CLEAR GRID",
    description: "A clean field for learning the network.",
    palette: {
      background: "#071216",
      grid: "#173036",
      fog: "#102126",
      accent: "#f08a4b",
      secondary: "#9ed8dd",
    },
    dressing: ["core-chamber", "breach-lanes"],
  }),
  freezeTheme({
    id: "relay-storm",
    terrainId: "relay-storm",
    label: "RELAY STORM",
    description: "Charged relay pylons bend routes around the breach.",
    palette: {
      background: "#06151a",
      grid: "#1a3e45",
      fog: "#0c2a32",
      accent: "#9ed8dd",
      secondary: "#50c7c7",
    },
    dressing: ["relay-pylons", "electrical-arcs"],
  }),
  freezeTheme({
    id: "data-fog",
    terrainId: "data-fog",
    label: "DATA FOG",
    description: "Warm fog hides threats beyond the first sightline.",
    palette: {
      background: "#141016",
      grid: "#3a2833",
      fog: "#2b1b29",
      accent: "#c9a8dc",
      secondary: "#d9793f",
    },
    dressing: ["fog-banks", "broken-relays"],
  }),
]);

const CLEAR_GRID = BATTLEGROUNDS[0];

const normalizeWave = (wave) => {
  const numeric = Number.isFinite(Number(wave)) ? Math.trunc(Number(wave)) : 1;
  return Math.max(1, Math.min(8, numeric));
};

export function getBattleground(id) {
  return BATTLEGROUNDS.find((theme) => theme.id === id) ?? CLEAR_GRID;
}

export function getBattlegroundForWave(wave) {
  const normalizedWave = normalizeWave(wave);
  if (normalizedWave === 1) return CLEAR_GRID;
  if (normalizedWave <= 3) return getBattleground("relay-storm");
  return getBattleground("data-fog");
}
