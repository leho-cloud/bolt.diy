import { describe, expect, it } from 'vitest';
import { buildStatus } from './build-status-state';

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
