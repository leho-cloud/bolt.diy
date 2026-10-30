const MAX_LIST_RESULTS = 500;

export const PROJECT_TOOL_NAMES = [
  'project_read_file',
  'project_write_file',
  'project_patch_file',
  'project_delete_path',
  'project_create_directory',
  'project_list_paths',
  'project_search_content',
  'project_find_related_files',
  'project_run_command',
  'project_get_process_output',
  'project_quality_report',
  'project_preview_report',
  'project_visual_review',
  'project_stop_process',
  'web_search',
  'web_fetch',
] as const;

export function getProjectToolNames(webSearchEnabled = true) {
  return PROJECT_TOOL_NAMES.filter((name) => webSearchEnabled || (name !== 'web_search' && name !== 'web_fetch'));
}

type ProjectToolName = (typeof PROJECT_TOOL_NAMES)[number];
type JsonSchema = Record<string, unknown>;

const objectSchema = (properties: JsonSchema, required: string[]): JsonSchema => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
});

/** JSON Schema contracts shared by the server chat route and browser MCP bridge. */
export const projectToolDefinitions: Record<ProjectToolName, { description: string; inputSchema: JsonSchema }> = {
  project_visual_review: {
    description:
      'Export desktop/mobile images of the existing rendered preview and request an independent AI review of typography, spacing, contrast and visual consistency. Uses the existing server AI connection. This is a DOM image export, not native browser screenshots; unavailable captures do not count as approval. Fix concrete issues with small style patches, preserve content/functionality, then rerun code/browser/visual checks.',
    inputSchema: objectSchema({}, []),
  },
  project_preview_report: {
    description:
      'Inspect the existing rendered preview at desktop and mobile sizes. Measures blank pages, horizontal overflow, broken img elements, missing local anchors and runtime errors without clicking links or submitting forms. Does NOT take screenshots or judge aesthetics. Repair errors, rerun checks and inspect again after edits. Requires a running visible project preview.',
    inputSchema: objectSchema({}, []),
  },
  project_quality_report: {
    description:
      'Inspect current project source syntax and identify real build/typecheck/lint scripts. Returns issues and suggested commands. Does NOT run builds or approve visual quality. Use after edits, repair errors, then run the reported checks and inspect the actual preview.',
    inputSchema: objectSchema({}, []),
  },
  project_read_file: {
    description:
      'Read a UTF-8 text file from the active project. Returns content and revision; subsequent successful edits return the new revision. The latest known revision is checked automatically if expectedRevision is omitted when patching.',
    inputSchema: objectSchema({ path: { type: 'string', minLength: 1 } }, ['path']),
  },
  project_write_file: {
    description:
      'Create a UTF-8 text file. For changes to existing files prefer project_patch_file. Replacing an existing file requires replacementReason explaining why a full replacement is necessary. Set overwrite to false to require a new path.',
    inputSchema: objectSchema(
      {
        path: { type: 'string', minLength: 1 },
        content: { type: 'string' },
        overwrite: { type: 'boolean' },
        replacementReason: { type: 'string', minLength: 1, maxLength: 500 },
      },
      ['path', 'content'],
    ),
  },
  project_patch_file: {
    description:
      'Patch a file using either oldText/newText or an ordered edits array of those pairs. For multiple changes to ONE file use ONE edits array, not parallel calls. All edits are checked and saved together or none are saved. Each oldText must match exactly once after earlier edits. Read first, then use the latest revision returned by a read/write/patch, never reuse an older revision. If omitted, the latest known revision is checked automatically. Returns the new revision. On conflict read again, never repeat a stale patch. Invalid final JS/TS is rejected before saving.',
    inputSchema: objectSchema(
      {
        path: { type: 'string', minLength: 1 },
        expectedContent: { type: 'string' },
        expectedRevision: { type: 'string', pattern: '^[a-f0-9]{64}$' },
        oldText: { type: 'string', minLength: 1 },
        newText: { type: 'string' },
        edits: {
          type: 'array',
          minItems: 1,
          maxItems: 100,
          items: objectSchema({ oldText: { type: 'string', minLength: 1 }, newText: { type: 'string' } }, [
            'oldText',
            'newText',
          ]),
        },
      },
      ['path'],
    ),
  },
  project_delete_path: {
    description: 'Delete a file or an explicitly selected directory in the active project.',
    inputSchema: objectSchema({ path: { type: 'string', minLength: 1 }, recursive: { type: 'boolean' } }, ['path']),
  },
  project_create_directory: {
    description: 'Create a directory in the active project.',
    inputSchema: objectSchema({ path: { type: 'string', minLength: 1 } }, ['path']),
  },
  project_list_paths: {
    description:
      'List active project files and folders. Omit path or use "." for the project root; use "src" for a directory prefix. Paths may be relative to the project or absolute within /home/project.',
    inputSchema: objectSchema(
      { path: { type: 'string' }, limit: { type: 'integer', minimum: 1, maximum: MAX_LIST_RESULTS } },
      [],
    ),
  },
  project_search_content: {
    description: 'Search project file contents using ripgrep.',
    inputSchema: objectSchema(
      {
        query: { type: 'string', minLength: 1 },
        path: { type: 'string' },
        limit: { type: 'integer', minimum: 1, maximum: 200 },
      },
      ['query'],
    ),
  },
  project_find_related_files: {
    description: 'Find files related by shared directory or filename stem. Each result includes the matching evidence.',
    inputSchema: objectSchema(
      { path: { type: 'string', minLength: 1 }, limit: { type: 'integer', minimum: 1, maximum: 100 } },
      ['path'],
    ),
  },
  project_run_command: {
    description:
      'Run a shell command in the active WebContainer project and stream its output to Bolt Terminal. Set purpose to run, test, install, or other. A test passes only when it exits with code 0; poll project_get_process_output for running commands before dependent work. Reuses an already running preview for a plain dev/start command instead of starting a duplicate. A reused preview may have no processId; do not poll it. Returns process ID when spawned, command, purpose, output, exit status, and previewReady. Commands require user approval.',
    inputSchema: objectSchema(
      {
        command: { type: 'string', minLength: 1, maxLength: 4000 },
        purpose: { type: 'string', enum: ['run', 'test', 'install', 'other'] },
      },
      ['command', 'purpose'],
    ),
  },
  project_get_process_output: {
    description:
      'Get current or final combined output, exit status, and previewReady for a project command. Poll a running installation before starting dependent commands, and poll a dev server until previewReady is true.',
    inputSchema: objectSchema({ processId: { type: 'string', minLength: 1 } }, ['processId']),
  },
  project_stop_process: {
    description: 'Stop a running project command.',
    inputSchema: objectSchema({ processId: { type: 'string', minLength: 1 } }, ['processId']),
  },
  web_search: {
    description: 'Search the public web without an API key and return sourced result snippets.',
    inputSchema: objectSchema(
      { query: { type: 'string', minLength: 1, maxLength: 1000 }, limit: { type: 'integer', minimum: 1, maximum: 10 } },
      ['query'],
    ),
  },
  web_fetch: {
    description: 'Fetch and summarize the public content at a URL without an API key.',
    inputSchema: objectSchema({ url: { type: 'string', minLength: 1, maxLength: 2048 } }, ['url']),
  },
};
