export const workspaceDefaults = {
  memoryEnabled: false,
  repairEnabled: true,
  repairRounds: 2,
  ledEnabled: false,
  led: { width: 1080, height: 1920, fps: 60, seconds: 20 },
};

export function workspaceProjectId(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,95}$/.test(value) ? value : undefined;
}

const invalid = (message) => Object.assign(new Error(message), { status: 400 });

function integer(data, name, minimum, maximum) {
  const value = Number(data.get(name));
  if (!Number.isInteger(value) || value < minimum || value > maximum) throw invalid('Ellenőrizd a számértékeket.');
  return value;
}

function ledSettings(data) {
  const width = integer(data, 'width', 1, 4096);
  const height = integer(data, 'height', 1, 4096);
  const fps = integer(data, 'fps', 50, 60);
  const seconds = integer(data, 'seconds', 1, 60);
  if (width * height > 4096 * 2160 || ![50, 60].includes(fps))
    throw invalid('Az exporthoz érvényes pixelméret és 50 vagy 60 fps szükséges.');
  return { width, height, fps, seconds };
}

export function parseWorkspacePreferences(data) {
  return {
    memoryEnabled: data.get('memoryEnabled') === 'on',
    repairEnabled: data.get('repairEnabled') === 'on',
    repairRounds: integer(data, 'repairRounds', 1, 3),
    ledEnabled: data.get('ledEnabled') === 'on',
    led: ledSettings(data),
  };
}

export function parseProjectPreferences(data) {
  const notes = (data.get('notes') || '').trim();
  if (notes.length > 2000) throw invalid('A projektjegyzet legfeljebb 2000 karakter lehet.');
  return { notes, ...(data.get('useProjectLed') === 'on' ? { led: ledSettings(data) } : {}) };
}
