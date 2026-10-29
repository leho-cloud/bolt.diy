import { describe, it, expect, vi } from 'vitest';
import { createWebsiteTools, isDesignTool, isDesignReadTool } from './tools';
import { isServerAgentTool } from '~/lib/common/agentLoop';

describe('website tool registration', () => {
  it('truthfully reports unconfigured services and never starts a reference capture without credentials', async () => {
    const tools = await createWebsiteTools({ text: 'minta https://mingai.hu/', owner: 'owner', env: {} });
    const status = await tools.website_tools_status.execute!({}, {} as any);
    expect(status).toMatchObject({ oxylabs: false, design: false });
    await expect(tools.website_reference.execute!({ url: 'https://mingai.hu/' }, {} as any)).rejects.toThrow(
      'nincs bekötve',
    );
  });
  it('honours disabled tools and separates server execution from browser approval', async () => {
    const tools = await createWebsiteTools({ text: '', owner: 'owner', env: {}, disabled: ['website_reference'] });
    expect(tools.website_reference).toBeUndefined();
    expect(isServerAgentTool('website_reference')).toBe(true);
    expect(isServerAgentTool('design_21st_search')).toBe(true);
    expect(isServerAgentTool('project_quality_report')).toBe(false);
  });
  it('does not expose deployment, account or file mutation tools from a design server', () => {
    expect(isDesignTool('search_components')).toBe(true);
    expect(isDesignTool('generate_component')).toBe(true);

    for (const name of ['install_component', 'generate_deploy_key', 'search_accounts', 'publish_component']) {
      expect(isDesignTool(name)).toBe(false);
    }
  });
  it('allows existing component retrieval without enabling paid generation or installs', () => {
    expect(isDesignReadTool('search')).toBe(true);
    expect(isDesignReadTool('get_component')).toBe(true);
    expect(isDesignReadTool('21st_magic_component_inspiration')).toBe(true);

    for (const name of ['generate', 'component_builder', 'refine_component', 'install_component', 'search_accounts']) {
      expect(isDesignReadTool(name)).toBe(false);
    }
  });
  it('returns a diagnostic status without exposing server details or disguising a capture failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('private server details', { status: 401 })),
    );

    try {
      const tools = await createWebsiteTools({
        text: 'https://example.com/',
        owner: 'diagnostic',
        env: {
          MUHELY_TOOL_BRIDGE_TOKEN: 'scoped-secret',
          MUHELY_TOOL_BRIDGE_URL: 'https://muhely.example/',
        },
      });

      const output = await tools.website_reference.execute!({ url: 'https://example.com/' }, {} as any);
      expect(output).toMatchObject({ isError: true, status: 401 });
      expect(JSON.stringify(output)).not.toMatch(/private server|scoped-secret/);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
