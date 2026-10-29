import {
  getMessageParts,
  getToolName,
  getToolState,
  getToolOutput,
  type AnyMessage,
} from '~/lib/persistence/messageMigration';

export function buildStatus(messages: AnyMessage[], active: boolean, preview: boolean, error = false) {
  if (active) {
    return { kind: 'working', text: 'Dolgozom az oldaladon…' };
  }

  const lastUser = messages.findLastIndex((message) => message.role === 'user');
  const parts = messages.slice(lastUser + 1).flatMap((message) => getMessageParts(message) ?? []);
  const incomplete = parts.some((part) => getToolState(part) === 'input-streaming');

  const completed = parts.some(
    (part) => getToolName(part) === 'agent_complete' && (getToolOutput(part) as any)?.completed === true,
  );

  const blocked = parts.some((part) => (getToolOutput(part) as any)?.blocked === true);

  if (error || incomplete || blocked) {
    return { kind: 'blocked', text: 'A készítés megállt · az oldal még nincs kész.' };
  }

  if (completed && preview) {
    return { kind: 'ready', text: 'Elkészült · az előnézet kipróbálható.' };
  }

  if (preview) {
    return { kind: 'idle', text: 'Most nem dolgozom · az előnézet megnyitható.' };
  }

  return { kind: 'idle', text: 'Most nem dolgozom · még nincs futó előnézet.' };
}
