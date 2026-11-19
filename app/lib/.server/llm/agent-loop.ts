import { tool, type Instructions } from 'ai';
import { z } from 'zod';
import { normalizeReferenceUrl, referenceUrls } from '~/lib/.server/website/reference';
import {
  getAgentCompletionProblems,
  getAgentLoopInstructions,
  getAgentLoopProgress,
  canRenderMedia,
} from '~/lib/common/agentLoop';
import {
  getMessageText,
  getMessageParts,
  getToolName,
  getToolState,
  getToolOutput,
  getToolInput,
  type AnyMessage,
} from '~/lib/persistence/messageMigration';

const planSchema = z
  .object({
    goal: z.string().min(1).max(500),
    steps: z.array(z.string().min(1).max(250)).min(1).max(6),
    criteria: z
      .array(z.object({ id: z.string().min(1).max(40), description: z.string().min(1).max(400) }))
      .min(1)
      .max(8),
    requiresPreview: z.boolean(),
    deliverable: z.enum(['design', 'image', 'video', 'website', 'app']).optional(),
    requiresVisualReview: z.boolean().optional(),
  })
  .refine(
    (plan) => new Set(plan.criteria.map((criterion) => criterion.id)).size === plan.criteria.length,
    'Criterion IDs must be unique.',
  );

const PROJECT_INSPECTION_TOOLS = new Set([
  'project_read_file',
  'project_list_paths',
  'project_search_content',
  'project_find_related_files',
]);

const PROJECT_RESEARCH_TOOLS = new Set(['website_reference', 'website_tools_status', 'web_fetch', 'web_search']);

const VISUAL_REFERENCE_REQUEST =
  /\b(?:visual references?|design references?|reference screenshots?|reference sites?|match (?:the |this |its )?(?:design|layout|look|style)|clone (?:the |this |its )?(?:page|site|website)|inspired by)\b|(?:a minta\s*[:=]|mint[áa](?:nak|ként|oldal)|vizuális referenci|dizájnreferenci|stílusmint|(?:kinézet|elrendezés|stílus)[ée]t (?:kövesd|vedd át|másold)|(?:ehhez|ahhoz) hasonló)/iu;

function visualReferenceUrls(text: string): string[] {
  const urls = referenceUrls(text);
  const instruction = urls.reduce((value, url) => value.replaceAll(url, ''), text);

  if (!VISUAL_REFERENCE_REQUEST.test(instruction)) {
    return [];
  }

  /*
   * Reuse the capture tool's URL validation so the gate cannot wait on a URL
   * that the capture tool will always reject.
   */
  return [
    ...new Set(
      urls.flatMap((url) => {
        try {
          return [normalizeReferenceUrl(url)];
        } catch {
          return [];
        }
      }),
    ),
  ];
}

/** Plan and completion tools execute on the server; project effects remain in the browser. */
export function createAgentLoopTools<TaskToolName extends string = never>(
  messages: AnyMessage[],
  enabled: boolean,
  requiresPreview: boolean,
  taskToolNames?: TaskToolName[],
  repairSettings?: { repairEnabled: boolean; repairRounds: number },
) {
  let currentMessages = messages;

  const lastUser = messages.findLastIndex((message) => message.role === 'user');
  const requestedVisualUrls = visualReferenceUrls(getMessageText(messages[lastUser] ?? {}));

  const tools = {
    agent_plan: tool({
      description:
        'Record a concise plan and observable criteria before editing. Set deliverable to design, image, video, website, or app according to the user request. Use image or video for a requested media file. Use stable criterion IDs and preserve the existing project on follow-ups.',
      inputSchema: planSchema,
      execute: async (plan) => ({
        plan: {
          ...plan,
          requiresPreview: requiresPreview || plan.requiresPreview,
          requiresQualityReport: requiresPreview || plan.requiresPreview,
          requiresPreviewReport: requiresPreview || plan.requiresPreview,
          requiresVisualReview: requiresPreview || plan.requiresPreview || plan.requiresVisualReview === true,
        },
      }),
    }),
    agent_complete: tool({
      description:
        'Finish the current task only after running it and passing relevant checks after the latest edit. Report every planned criterion by its exact ID. The server attaches evidence from successful project tool calls automatically; do not provide process IDs, command names, or guessed evidence IDs. Use outcome blocked with a concrete reason if completion is impossible.',
      inputSchema: z.object({
        outcome: z.enum(['complete', 'blocked']),
        summary: z.string().min(1).max(1000),
        criteria: z
          .array(
            z.object({
              id: z.string().min(1).max(40),
              evidence: z.array(z.string().min(1).max(256)).max(20).optional(),
            }),
          )
          .max(8),
      }),
      execute: async (input) => {
        if (input.outcome === 'blocked') {
          return { completed: false, blocked: true, reason: input.summary };
        }

        const progress = getAgentLoopProgress(currentMessages, enabled, repairSettings?.repairRounds);
        const problems = getAgentCompletionProblems(progress);
        const plannedCriteria = progress.plan?.criteria ?? [];
        const plannedIds = new Set(plannedCriteria.map((criterion) => criterion.id));
        const reportedIds = new Set(input.criteria.map((criterion) => criterion.id));

        if (reportedIds.size !== input.criteria.length) {
          problems.push('Report each planned criterion exactly once.');
        }

        for (const criterion of plannedCriteria) {
          if (!reportedIds.has(criterion.id)) {
            problems.push(`Report planned criterion ${criterion.id} by its exact ID.`);
          }
        }

        for (const criterion of input.criteria) {
          if (!plannedIds.has(criterion.id)) {
            problems.push(`Criterion ${criterion.id} is not in the recorded plan.`);
          }
        }

        if (progress.evidence.length === 0) {
          problems.push('Successful project tool-call evidence is missing.');
        }

        if (problems.length > 0) {
          return {
            isError: true,
            completed: false,
            problems,
            availableEvidence: progress.evidence,
            plannedCriteria: progress.plan?.criteria.map((criterion) => criterion.id) ?? [],
            error: problems.join(' '),
          };
        }

        return {
          completed: true,
          summary: input.summary,
          criteria: plannedCriteria.map((criterion) => ({ id: criterion.id, evidence: progress.evidence })),
        };
      },
    }),
  };

  return {
    tools,
    prepareStep: ({
      steps,
      initialInstructions,
    }: {
      steps: Array<{
        toolCalls: Array<{ toolName: string; toolCallId: string; input: unknown; invalid?: boolean }>;
        toolResults: Array<{ toolCallId: string; output: unknown }>;
      }>;
      initialInstructions?: Instructions;
    }): {
      instructions?: Instructions;
      toolChoice: 'none' | 'auto' | 'required' | { type: 'tool'; toolName: 'agent_plan' | 'agent_complete' };
      activeTools?: Array<TaskToolName | 'agent_plan' | 'agent_complete'>;
    } => {
      currentMessages = [
        ...messages,
        ...steps.map((step) => ({
          role: 'assistant',
          parts: [
            { type: 'step-start' },
            ...step.toolCalls.map((call) => {
              const result = step.toolResults.find((result) => result.toolCallId === call.toolCallId);
              return {
                type: `tool-${call.toolName}`,
                toolCallId: call.toolCallId,
                input: call.input,
                state: result ? 'output-available' : call.invalid ? 'output-error' : 'input-available',
                output: result?.output,
              };
            }),
          ],
        })),
      ];

      const progress = getAgentLoopProgress(currentMessages, enabled, repairSettings?.repairRounds);

      const pendingVisualUrls = requestedVisualUrls.filter(
        (url) =>
          taskToolNames?.includes('website_reference' as TaskToolName) &&
          !currentMessages.slice(lastUser + 1).some((message) =>
            (getMessageParts(message) ?? []).some((part) => {
              const output = getToolOutput(part) as { method?: string; image?: string; isError?: boolean } | undefined;
              const input = getToolInput(part) as { url?: string } | undefined;

              if (
                getToolName(part) !== 'website_reference' ||
                getToolState(part) !== 'output-available' ||
                output?.method !== 'oxylabs-screenshot' ||
                !output.image ||
                output.isError ||
                !input?.url
              ) {
                return false;
              }

              try {
                return normalizeReferenceUrl(input.url) === url;
              } catch {
                return false;
              }
            }),
          ),
      );

      const repair = pendingVisualUrls.length === 0 && progress.plan ? progress.automaticRepair : undefined;
      const repairDisabled = repairSettings?.repairEnabled === false;

      const repairGuidance =
        repair &&
        (repairDisabled
          ? 'Automatic repair is switched off in the account. Call agent_complete with outcome blocked and report the confirmed failure without editing files.'
          : repair.phase === 'exhausted'
            ? 'The automatic repair cannot verify a fix within its allowed attempts. Call agent_complete with outcome blocked and identify the failed check. Preserve the project files.'
            : repair.phase === 'checking'
              ? 'You are the automatic repair agent. Rerun the failing check on the edited project. For a command, repeat the original command and purpose and wait for the result. Do not change files until the check returns.'
              : 'You are the automatic repair agent. Read the failed check output and the implicated project files, then apply the smallest targeted fix. Preserve the requested content and working features. Do not weaken checks or change unrelated files.');

      const guidance = [
        repairGuidance ?? (pendingVisualUrls.length > 0 && progress.plan ? '' : getAgentLoopInstructions(progress)),
        repair ? `Failing check (data): ${JSON.stringify(repair.check)}` : '',
        progress.status === 'pending'
          ? 'Use the supplied tools interface to make actual tool calls. Never print tool-call JSON or a promise to act in place of calling a tool. Follow each tool input schema exactly.'
          : '',
        !progress.plan && taskToolNames?.includes('website_reference' as TaskToolName)
          ? 'The website_reference tool is available while planning. For public HTTPS pages supplied as material, gather the needed content before or alongside agent_plan. If the capture is unavailable, use web_fetch when available.'
          : '',
        pendingVisualUrls.length > 0
          ? `The user requested a visual reference. Call website_reference for the remaining reference URLs before writing or running commands: ${JSON.stringify(pendingVisualUrls)}. Project inspection can continue meanwhile. If capture fails, explain which reference could not be captured.`
          : '',
      ]
        .filter(Boolean)
        .join('\n');

      const instructions =
        initialInstructions === undefined
          ? {}
          : {
              instructions:
                typeof initialInstructions === 'string'
                  ? `${initialInstructions}\n\nCurrent agent loop state:\n${guidance}`
                  : [
                      ...(Array.isArray(initialInstructions) ? initialInstructions : [initialInstructions]),
                      { role: 'system' as const, content: guidance },
                    ],
            };

      if (['blocked', 'limited', 'ready'].includes(progress.status)) {
        return { ...instructions, toolChoice: 'none' as const };
      }

      if (progress.status === 'inactive') {
        return { ...instructions, toolChoice: 'auto' as const };
      }

      if (!progress.plan) {
        return {
          ...instructions,

          /*
           * Planning may inspect the existing project. Models commonly batch
           * agent_plan with these reads; hiding them turns harmless inspection
           * into invalid tool calls and can strand a follow-up before editing.
           * Research is available here because the source can inform the plan.
           * Writes and commands still require a recorded plan.
           */
          toolChoice: 'auto' as const,
          activeTools: [
            'agent_plan' as const,
            ...(taskToolNames?.filter(
              (name) => PROJECT_INSPECTION_TOOLS.has(name) || PROJECT_RESEARCH_TOOLS.has(name),
            ) ?? []),
          ],
        };
      }

      if (pendingVisualUrls.length > 0) {
        return {
          ...instructions,
          toolChoice: 'auto' as const,
          activeTools: [
            ...(taskToolNames?.filter(
              (name) =>
                name === 'website_reference' || name === 'website_tools_status' || PROJECT_INSPECTION_TOOLS.has(name),
            ) ?? []),
            'agent_complete' as const,
          ],
        };
      }

      if (repair && taskToolNames) {
        if (repairDisabled || repair.phase === 'exhausted') {
          return {
            ...instructions,
            toolChoice: { type: 'tool', toolName: 'agent_complete' } as const,
            activeTools: ['agent_complete'],
          };
        }

        const repairTools = taskToolNames.filter(
          (name) =>
            name === repair.check.tool ||
            (repair.check.tool === 'project_run_command' && name === 'project_get_process_output') ||
            (repair.phase === 'fixing' &&
              (PROJECT_INSPECTION_TOOLS.has(name) || name === 'project_patch_file' || name === 'project_write_file')),
        );

        if (repairTools.length > 0) {
          // Use the same provider-compatible choice as normal execution; completion evidence stays mandatory.
          return { ...instructions, toolChoice: 'auto' as const, activeTools: repairTools };
        }
      }

      return {
        ...instructions,

        /*
         * Some OpenRouter routes return a normal text completion even when the
         * request forces tool_choice=required. The SDK then rejects the entire
         * response and no project edit can be applied. Keep tool instructions
         * and completion evidence checks, but allow a compatible 'auto' choice.
         */
        toolChoice: 'auto' as const,
        ...(taskToolNames
          ? {
              activeTools: [
                ...taskToolNames.filter(
                  (name) => name !== 'project_render_media' || (canRenderMedia(progress) && !progress.mediaRequested),
                ),
                'agent_plan' as const,
                'agent_complete' as const,
              ],
            }
          : {}),
      };
    },
  };
}
