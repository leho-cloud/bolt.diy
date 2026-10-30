import { act, cleanup, render } from '@testing-library/react';
import { atom } from 'nanostores';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BuildStatus } from './BuildStatus';
import type { AnyMessage } from '~/lib/persistence/messageMigration';

vi.mock('~/lib/stores/workbench', () => ({ workbenchStore: { previews: atom([]) } }));

const user: AnyMessage = { id: 'task-one', role: 'user', parts: [{ type: 'text', text: 'Készíts oldalt' }] };

const complete: AnyMessage = {
  role: 'assistant',
  parts: [
    { type: 'tool-agent_complete', toolCallId: 'finish', state: 'output-available', output: { completed: true } },
  ],
};

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function start() {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-30T09:00:00Z'));

  return render(<BuildStatus messages={[user]} active error={false} />);
}

describe('build duration in the fixed status bar', () => {
  it('counts across phases, freezes at the end and does not announce every tick', () => {
    const view = start();
    act(() => vi.advanceTimersByTime(12000));
    expect(view.getByRole('timer')).toHaveTextContent('00:12');
    expect(view.getByRole('timer')).toHaveAttribute('aria-live', 'off');
    view.rerender(
      <BuildStatus
        messages={[
          user,
          {
            role: 'assistant',
            parts: [{ type: 'tool-project_patch_file', toolCallId: 'patch', state: 'input-streaming' }],
          },
        ]}
        active
        error={false}
      />,
    );
    expect(view.getByRole('status')).toHaveTextContent('Írom az oldal kódját');
    act(() => vi.advanceTimersByTime(3000));
    view.rerender(<BuildStatus messages={[user, complete]} active={false} error={false} />);
    act(() => vi.advanceTimersByTime(60000));
    expect(view.getByRole('timer')).toHaveTextContent('00:15');
    expect(view.getByRole('status')).not.toHaveTextContent('Dolgozom');
  });

  it('starts fresh for a new request and never invents timing for restored history', () => {
    const view = start();
    act(() => vi.advanceTimersByTime(5000));
    view.rerender(<BuildStatus messages={[{ ...user, id: 'task-two' }]} active error={false} />);
    expect(view.getByRole('timer')).toHaveTextContent('00:00');
    act(() => vi.advanceTimersByTime(2000));
    view.rerender(<BuildStatus messages={[{ ...user, id: 'other-project' }]} active={false} error={false} />);
    expect(view.queryByRole('timer')).toBeNull();
  });

  it('keeps the full request start when work resumes and stops on error', () => {
    const view = start();
    act(() => vi.advanceTimersByTime(5000));
    view.rerender(<BuildStatus messages={[user]} active={false} error={false} />);
    act(() => vi.advanceTimersByTime(5000));
    view.rerender(<BuildStatus messages={[user]} active error={false} />);
    expect(view.getByRole('timer')).toHaveTextContent('00:10');
    act(() => vi.advanceTimersByTime(1000));
    view.rerender(<BuildStatus messages={[user]} active={false} error />);
    act(() => vi.advanceTimersByTime(10000));
    expect(view.getByRole('timer')).toHaveTextContent('00:11');
    expect(view.getByRole('status')).toHaveTextContent('megállt');
  });
});
