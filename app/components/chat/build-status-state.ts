import { uiText } from '~/lib/common/localization/ui';
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
    return uiText("Ellenőrzöm, miért akadt el a lépés…", "Checking why this step stopped…");
  }

  // A completed old tool is not evidence that this phase is still running.
  if (state === 'output-available' && output?.status !== 'running') {
    return uiText("Dolgozom az oldaladon…", "Working on your project…");
  }

  if (name === 'agent_plan') {
    return uiText("Megtervezem az oldalt…", "Planning your project…");
  }

  if (name === 'website_reference') {
    return uiText("Beolvasom a mintaoldalt…", "Reading the reference site…");
  }

  if (name?.startsWith('design_21st_')) {
    return uiText("Összeállítom a megjelenést…", "Preparing the design…");
  }

  if (['project_write_file', 'project_patch_file'].includes(name ?? '')) {
    return uiText("Írom az oldal kódját…", "Writing your code…");
  }

  if (['project_read_file', 'project_list_paths', 'project_search_content'].includes(name ?? '')) {
    return uiText("Átnézem az oldal fájljait…", "Inspecting your files…");
  }

  if (name === 'project_render_media') {
    return uiText("Előkészítem a letölthető fájlt…", "Preparing the export…");
  }

  if (name === 'project_visual_review') {
    return uiText("Átnézem az oldal megjelenését…", "Reviewing the design…");
  }

  if (name === 'project_preview_report') {
    return uiText("Ellenőrzöm az asztali és telefonos nézetet…", "Checking desktop and mobile previews…");
  }

  if (name === 'project_quality_report') {
    return uiText("Ellenőrzöm a kódot…", "Checking the code…");
  }

  if (name === 'agent_complete') {
    return uiText("Lezárom az ellenőrzést…", "Finishing the checks…");
  }

  if (name === 'project_run_command' || name === 'project_get_process_output') {
    const purpose = output?.purpose ?? input?.purpose;

    if (purpose === 'test') {
      return uiText("Ellenőrzöm az oldal működését…", "Testing the project…");
    }

    if (purpose === 'install') {
      return uiText("Előkészítem az oldalt…", "Preparing the project…");
    }

    if (purpose === 'run') {
      return uiText("Indítom az előnézetet…", "Starting the preview…");
    }
  }

  return uiText("Dolgozom az oldaladon…", "Working on your project…");
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
    return { kind: 'waiting', text: uiText("A jóváhagyásodra várok.", "Waiting for approval.") };
  }

  if (active) {
    const repair = repairEnabled ? getAgentLoopProgress(messages, true, repairRounds).automaticRepair : undefined;

    if (repair?.phase === 'fixing') {
      return { kind: 'working', text: uiText("Automatikus javítás folyik…", "Applying an automatic fix…") };
    }

    if (repair?.phase === 'checking') {
      return { kind: 'working', text: uiText("Újraellenőrzöm a javítást…", "Verifying the fix…") };
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
        ? uiText("A készítés megállt · az előnézet megnyitható.", "The build stopped · Preview is available.")
        : uiText("A készítés megállt · a részletek a beszélgetésben láthatók.", "The build stopped · See the conversation for details."),
    };
  }

  if (completed && preview) {
    return { kind: 'ready', text: uiText("Elkészült · az előnézet kipróbálható.", "Ready · Try the preview.") };
  }

  if (preview) {
    return { kind: 'idle', text: uiText("Most nem dolgozom · az előnézet megnyitható.", "Idle · Preview is available.") };
  }

  return { kind: 'idle', text: uiText("Most nem dolgozom · még nincs futó előnézet.", "Idle · No preview running.") };
}

export function formatBuildDuration(milliseconds: number) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(seconds / 60);

  return minutes >= 60
    ? `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}
