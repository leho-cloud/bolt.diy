import { describe, expect, it } from 'vitest';
import { buildStatus, formatBuildDuration } from './build-status-state';

const user = { role: 'user', parts: [{ type: 'text', text: 'Build an app' }] };

const partial = {
  role: 'assistant',
  parts: [{ type: 'tool-project_write_file', state: 'input-streaming', toolCallId: 'old' }],
};
describe('persistent build status', () => {
  it('shows active work independently of old tool states', () => {
    expect(buildStatus([user, partial], true, false).kind).toBe('working');
  });
  it('does not claim a partial tool input is still running when the request stopped', () => {
    expect(buildStatus([user, partial], false, false).kind).toBe('blocked');
  });
  it('does not show success just because an older preview exists', () => {
    expect(buildStatus([user, partial], false, true).kind).toBe('blocked');
  });
  it('does not let an older interrupted turn pollute a new request', () => {
    expect(buildStatus([user, partial, user], false, false).kind).toBe('idle');
  });
  it('requires both completion evidence and a preview for the ready label', () => {
    const complete = {
      role: 'assistant',
      parts: [{ type: 'tool-agent_complete', state: 'output-available', output: { completed: true } }],
    };
    expect(buildStatus([user, complete], false, false).kind).toBe('idle');
    expect(buildStatus([user, complete], false, true).kind).toBe('ready');
  });
});

describe('clear work phases', () => {
  it.each([
    ['website_reference', {}, 'Beolvasom a mintaoldalt'],
    ['project_run_command', { purpose: 'test' }, 'Ellenőrzöm az oldal működését'],
    ['project_run_command', { purpose: 'install' }, 'Előkészítem az oldalt'],
    ['project_quality_report', {}, 'Ellenőrzöm a kódot'],
  ])('labels the active %s phase in Hungarian', (tool, input, expected) => {
    const message = { role: 'assistant', parts: [{ type: `tool-${tool}`, state: 'input-available', input }] };
    expect(buildStatus([user, message], true, true).text).toContain(expected);
  });
  it('shows approval waiting instead of pretending to work', () => {
    const message = { role: 'assistant', parts: [{ type: 'tool-project_run_command', state: 'approval-requested' }] };
    expect(buildStatus([user, message], true, true)).toMatchObject({ kind: 'waiting' });
  });
  it('does not keep reporting a completed old phase', () => {
    const message = {
      role: 'assistant',
      parts: [{ type: 'tool-project_quality_report', state: 'output-available', output: { checked: true } }],
    };
    expect(buildStatus([user, message], true, true).text).toBe('Dolgozom az oldaladon…');
  });
  it('formats short, long and invalid negative durations without a time limit', () => {
    expect(formatBuildDuration(0)).toBe('00:00');
    expect(formatBuildDuration(65000)).toBe('01:05');
    expect(formatBuildDuration(3605000)).toBe('1:00:05');
    expect(formatBuildDuration(-1000)).toBe('00:00');
  });
});
