import { generateText, isStepCount } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { describe, expect, it } from 'vitest';
import { createAgentLoopTools } from './agent-loop';
import type { AgentPlan } from '~/lib/common/agentLoop';
import type { AnyMessage } from '~/lib/persistence/messageMigration';

const plan: AgentPlan = {
  goal: 'Change the button',
  steps: ['Read', 'Patch', 'Run and verify'],
  criteria: [{ id: 'button', description: 'The requested button is present and checks pass.' }],
  requiresPreview: true,
};

const user: AnyMessage = { role: 'user', content: 'Change the button' };

const part = (name: string, output: Record<string, unknown>, id = name) => ({
  type: `tool-${name}`,
  toolCallId: id,
  state: 'output-available',
  output,
});
const verified: AnyMessage[] = [
  user,
  {
    role: 'assistant',
    parts: [
      part('agent_plan', { plan }),
      part('project_patch_file', { patched: true }, 'edit'),
      part(
        'project_run_command',
        { processId: 'server', purpose: 'run', status: 'running', previewReady: true },
        'run',
      ),
      part(
        'project_run_command',
        { processId: 'check', purpose: 'test', status: 'exited', exitCode: 0, previewReady: true },
        'check',
      ),
    ],
  },
];
const completion = {
  outcome: 'complete' as const,
  summary: 'Button updated and checks pass.',
  criteria: [{ id: 'button' }],
};

const executeOptions = { toolCallId: 'complete', messages: [], context: {} };

describe('agent plan and completion tools', () => {
  it('withholds editing until the supplied reference really returned a screenshot', () => {
    const request: AnyMessage = { role: 'user', content: 'A minta: https://mingai.hu/' };
    const messages: AnyMessage[] = [request, { role: 'assistant', parts: [part('agent_plan', { plan })] }];

    const loop = createAgentLoopTools(messages, true, true, [
      'project_write_file',
      'website_reference',
      'website_tools_status',
    ]);
    expect(loop.prepareStep({ steps: [] }).activeTools).toEqual([
      'website_reference',
      'website_tools_status',
      'agent_complete',
    ]);

    const output = { method: 'oxylabs-screenshot', image: 'data:image/webp;base64,UklGRg==' };

    const next = loop.prepareStep({
      steps: [
        {
          toolCalls: [{ toolName: 'website_reference', toolCallId: 'capture', input: { url: 'https://mingai.hu/' } }],
          toolResults: [{ toolCallId: 'capture', output }],
        },
      ],
    });
    expect(next.activeTools).toContain('project_write_file');

    const missing = loop.prepareStep({
      steps: [
        {
          toolCalls: [{ toolName: 'website_reference', toolCallId: 'capture', input: { url: 'https://mingai.hu/' } }],
          toolResults: [{ toolCallId: 'capture', output: { method: 'oxylabs-screenshot' } }],
        },
      ],
    });
    expect(missing.activeTools).not.toContain('project_write_file');
  });
  it('requires a fresh static report as well as real build checks on newly recorded web plans', async () => {
    const strictPlan = { ...plan, requiresQualityReport: true };

    const messages: AnyMessage[] = [
      user,
      { role: 'assistant', parts: [part('agent_plan', { plan: strictPlan }), ...(verified[1] as any).parts.slice(1)] },
    ];

    const loop = createAgentLoopTools(messages, true, true);
    expect(await loop.tools.agent_complete.execute!(completion, executeOptions)).toMatchObject({
      completed: false,
      isError: true,
    });
    messages.push({ role: 'assistant', parts: [part('project_quality_report', { checked: true, isError: false })] });

    const checked = createAgentLoopTools(messages, true, true);
    expect(await checked.tools.agent_complete.execute!(completion, executeOptions)).toMatchObject({ completed: true });
    messages.push({ role: 'assistant', parts: [part('project_patch_file', { patched: true })] });

    const changed = createAgentLoopTools(messages, true, true);
    expect(await changed.tools.agent_complete.execute!(completion, executeOptions)).toMatchObject({
      completed: false,
      isError: true,
    });
  });
  it('requires the plan tool first and enforces preview criteria for starter builds', async () => {
    const loop = createAgentLoopTools([user], true, true);
    expect(loop.prepareStep({ steps: [] })).toEqual({
      toolChoice: 'auto',
      activeTools: ['agent_plan'],
    });
    expect(await loop.tools.agent_plan.execute!({ ...plan, requiresPreview: false }, executeOptions)).toMatchObject({
      plan: { requiresPreview: true },
    });
  });

  it('keeps verification tools available after planning while completion still requires evidence', () => {
    const loop = createAgentLoopTools(
      [user, { role: 'assistant', parts: [part('agent_plan', { plan })] }],
      true,
      true,
      ['project_read_file', 'project_run_command'],
    );
    expect(loop.prepareStep({ steps: [] }).activeTools).toEqual([
      'project_read_file',
      'project_run_command',
      'agent_plan',
      'agent_complete',
    ]);
  });

  it('allows inspecting a follow-up alongside its plan, then exposes edits without requesting an old reference', () => {
    const messages: AnyMessage[] = [
      { role: 'user', content: 'A minta: https://mingai.hu/' },
      ...verified.slice(1),
      { role: 'user', content: 'A meglévő cím legyen kisebb, a videót ne változtasd.' },
    ];
    const loop = createAgentLoopTools(messages, true, true, [
      'project_read_file',
      'project_list_paths',
      'project_write_file',
      'project_run_command',
      'website_reference',
      'website_tools_status',
    ]);
    expect(loop.prepareStep({ steps: [] }).activeTools).toEqual([
      'agent_plan',
      'project_read_file',
      'project_list_paths',
    ]);

    const next = loop.prepareStep({
      steps: [
        {
          toolCalls: [
            { toolName: 'agent_plan', toolCallId: 'plan', input: plan },
            { toolName: 'project_read_file', toolCallId: 'read', input: { path: 'src/styles.css' } },
          ],
          toolResults: [
            { toolCallId: 'plan', output: { plan } },
            { toolCallId: 'read', output: { content: 'h1 { font-size: 120px; }' } },
          ],
        },
      ],
    });
    expect(next.activeTools).toContain('project_write_file');
    expect(next.activeTools).toContain('project_read_file');
    expect(next.activeTools).toContain('project_run_command');
  });

  it('keeps command and quality tools available after failure and rejected completion', async () => {
    const messages: AnyMessage[] = [
      user,
      {
        role: 'assistant',
        parts: [
          part('agent_plan', { plan: { ...plan, requiresQualityReport: true } }),
          part('project_patch_file', { patched: true }),
          part('project_run_command', { purpose: 'test', processId: 'broken', exitCode: 1, isError: true }),
        ],
      },
    ];

    const names = ['project_patch_file', 'project_run_command', 'project_get_process_output', 'project_quality_report'];
    const loop = createAgentLoopTools(messages, true, true, names);
    loop.prepareStep({ steps: [] });

    const rejection = await loop.tools.agent_complete.execute!(completion, executeOptions);
    expect(rejection).toMatchObject({ completed: false, isError: true });
    expect(
      loop.prepareStep({
        steps: [
          {
            toolCalls: [{ toolName: 'agent_complete', toolCallId: 'finish', input: completion }],
            toolResults: [{ toolCallId: 'finish', output: rejection }],
          },
        ],
      }).activeTools,
    ).toEqual([...names, 'agent_plan', 'agent_complete']);
    loop.prepareStep({
      steps: [
        {
          toolCalls: [
            { toolName: 'project_run_command', toolCallId: 'check', input: { purpose: 'test' } },
            { toolName: 'project_quality_report', toolCallId: 'quality', input: {} },
          ],
          toolResults: [
            {
              toolCallId: 'check',
              output: { processId: 'fixed', purpose: 'test', status: 'exited', exitCode: 0, previewReady: true },
            },
            { toolCallId: 'quality', output: { checked: true } },
          ],
        },
      ],
    });
    expect(await loop.tools.agent_complete.execute!(completion, executeOptions)).toMatchObject({ completed: true });
  });

  it('rejects completion without actual run and test evidence', async () => {
    const loop = createAgentLoopTools(
      [
        user,
        {
          role: 'assistant',
          parts: [part('agent_plan', { plan }), part('project_patch_file', { patched: true }, 'edit')],
        },
      ],
      true,
      true,
    );
    expect(await loop.tools.agent_complete.execute!(completion, executeOptions)).toMatchObject({
      isError: true,
      completed: false,
      error: expect.stringContaining('purpose test'),
    });
  });

  it('requires every planned criterion and attaches successful tool-call evidence automatically', async () => {
    const loop = createAgentLoopTools(verified, true, true);

    for (const criteria of [[], [{ id: 'invented' }], [{ id: 'button' }, { id: 'button' }]]) {
      expect(await loop.tools.agent_complete.execute!({ ...completion, criteria }, executeOptions)).toMatchObject({
        isError: true,
        completed: false,
        error: expect.stringContaining('criterion'),
        availableEvidence: expect.arrayContaining(['edit', 'run', 'check']),
        plannedCriteria: ['button'],
      });
    }

    const completed = await loop.tools.agent_complete.execute!(
      {
        ...completion,
        criteria: [{ id: 'button', evidence: ['server-123', 'npm run build'] }],
      },
      executeOptions,
    );

    expect(completed).toMatchObject({
      completed: true,
      criteria: [{ id: 'button', evidence: ['edit', 'run', 'check'] }],
    });
  });

  it('supports a concrete blocked outcome without claiming success', async () => {
    const loop = createAgentLoopTools([user], true, true);

    const output = await loop.tools.agent_complete.execute!(
      { outcome: 'blocked', summary: 'Dependency registry is unavailable.', criteria: [] },
      executeOptions,
    );
    expect(output).toMatchObject({ completed: false, blocked: true });
    expect(
      loop.prepareStep({
        steps: [
          {
            toolCalls: [{ toolName: 'agent_complete', toolCallId: 'complete', input: {} }],
            toolResults: [{ toolCallId: 'complete', output }],
          },
        ],
      }),
    ).toEqual({ toolChoice: 'none' });
  });

  it('sees a server-executed plan in the next SDK step of the same request', async () => {
    const loop = createAgentLoopTools([user], true, true);
    const output = await loop.tools.agent_plan.execute!(plan, executeOptions);
    expect(
      loop.prepareStep({
        steps: [
          {
            toolCalls: [{ toolName: 'agent_plan', toolCallId: 'plan', input: plan }],
            toolResults: [{ toolCallId: 'plan', output }],
          },
        ],
      }),
    ).toEqual({ toolChoice: 'auto' });
  });

  it('allows a final answer after successful completion within the real SDK loop', async () => {
    let call = 0;

    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        const completing = call++ === 0;
        return {
          content: completing
            ? [
                {
                  type: 'tool-call' as const,
                  toolCallId: 'complete',
                  toolName: 'agent_complete',
                  input: JSON.stringify(completion),
                },
              ]
            : [{ type: 'text' as const, text: 'Updated the button. Checks passed.' }],
          finishReason: {
            unified: completing ? ('tool-calls' as const) : ('stop' as const),
            raw: completing ? 'tool_calls' : 'stop',
          },
          usage: {
            inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
            outputTokens: { total: 1, reasoning: 0, text: 1 },
          },
          warnings: [],
        };
      },
    });

    const loop = createAgentLoopTools(verified, true, true);

    const result = await generateText({
      model,
      prompt: 'Finish the verified change.',
      system: 'Base project instructions.',
      tools: loop.tools,
      prepareStep: loop.prepareStep,
      stopWhen: isStepCount(4),
    });
    expect(result.text).toBe('Updated the button. Checks passed.');
    expect(model.doGenerateCalls.map((call) => call.toolChoice)).toEqual([{ type: 'auto' }, { type: 'none' }]);
    expect(result.steps[0].toolResults[0].output).toMatchObject({ completed: true });
    expect(result.steps).toHaveLength(2);
    expect(model.doGenerateCalls[1].prompt[0]).toMatchObject({
      role: 'system',
      content: expect.stringContaining('completion gate accepted'),
    });
    expect(model.doGenerateCalls[1].prompt[0]).toMatchObject({
      content: expect.stringContaining('Base project instructions.'),
    });
  });
});
