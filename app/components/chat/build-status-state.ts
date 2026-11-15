import { getAgentLoopProgress } from '~/lib/common/agentLoop';
import {
  getMessageParts,
  getToolName,
  getToolState,
  getToolOutput,
  getToolInput,
  type AnyMessage,
} from '~/lib/persistence/messageMigration';

function workingPhase(parts: unknown[]) {
  const latest = parts.findLast((part) => getToolName(part));
  const name = getToolName(latest);
  const output = getToolOutput(latest) as Record<string, unknown> | undefined;
  const input = getToolInput(latest) as Record<string, unknown> | undefined;
  const state = getToolState(latest);

  if (state === 'output-error' || output?.isError === true) {
    return 'Ellenőrzöm, miért akadt el a lépés…';
  }

  // A completed old tool is not evidence that this phase is still running.
  if (state === 'output-available' && output?.status !== 'running') {
    return 'Dolgozom az oldaladon…';
  }

  if (name === 'agent_plan') {
    return 'Megtervezem az oldalt…';
  }

  if (name === 'website_reference') {
    return 'Beolvasom a mintaoldalt…';
  }

  if (name?.startsWith('design_21st_')) {
    return 'Összeállítom a megjelenést…';
  }

  if (['project_write_file', 'project_patch_file'].includes(name ?? '')) {
    return 'Írom az oldal kódját…';
  }

  if (['project_read_file', 'project_list_paths', 'project_search_content'].includes(name ?? '')) {
    return 'Átnézem az oldal fájljait…';
  }

  if (name === 'project_render_media') {
    return 'Előkészítem a letölthető fájlt…';
  }

  if (name === 'project_visual_review') {
    return 'Átnézem az oldal megjelenését…';
  }

  if (name === 'project_preview_report') {
    return 'Ellenőrzöm az asztali és telefonos nézetet…';
  }

  if (name === 'project_quality_report') {
    return 'Ellenőrzöm a kódot…';
  }

  if (name === 'agent_complete') {
    return 'Lezárom az ellenőrzést…';
  }

  if (name === 'project_run_command' || name === 'project_get_process_output') {
    const purpose = output?.purpose ?? input?.purpose;

    if (purpose === 'test') {
      return 'Ellenőrzöm az oldal működését…';
    }

    if (purpose === 'install') {
      return 'Előkészítem az oldalt…';
    }

    if (purpose === 'run') {
      return 'Indítom az előnézetet…';
    }
  }

  return 'Dolgozom az oldaladon…';
}

export function buildStatus(
  messages: AnyMessage[],
  active: boolean,
  preview: boolean,
  error = false,
  repairEnabled = true,
  repairRounds?: number,
) {
  const lastUser = messages.findLastIndex((message) => message.role === 'user');
  const parts = messages.slice(lastUser + 1).flatMap((message) => getMessageParts(message) ?? []);

  if (parts.some((part) => getToolState(part) === 'approval-requested')) {
    return { kind: 'waiting', text: 'A jóváhagyásodra várok.' };
  }

  if (active) {
    const repair = repairEnabled ? getAgentLoopProgress(messages, true, repairRounds).automaticRepair : undefined;

    if (repair?.phase === 'fixing') {
      return { kind: 'working', text: 'Automatikus javítás folyik…' };
    }

    if (repair?.phase === 'checking') {
      return { kind: 'working', text: 'Újraellenőrzöm a javítást…' };
    }

    return { kind: 'working', text: workingPhase(parts) };
  }

  const incomplete = parts.some((part) => getToolState(part) === 'input-streaming');

  const completed = parts.some(
    (part) => getToolName(part) === 'agent_complete' && (getToolOutput(part) as any)?.completed === true,
  );

  const blocked = parts.some((part) => (getToolOutput(part) as any)?.blocked === true);

  if (error || incomplete || blocked) {
    return {
      kind: 'blocked',
      text: preview
        ? 'A készítés megállt · az előnézet megnyitható.'
        : 'A készítés megállt · a részletek a beszélgetésben láthatók.',
    };
  }

  if (completed && preview) {
    return { kind: 'ready', text: 'Elkészült · az előnézet kipróbálható.' };
  }

  if (preview) {
    return { kind: 'idle', text: 'Most nem dolgozom · az előnézet megnyitható.' };
  }

  return { kind: 'idle', text: 'Most nem dolgozom · még nincs futó előnézet.' };
}

export function formatBuildDuration(milliseconds: number) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(seconds / 60);

  return minutes >= 60
    ? `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}
