import { describe, it, expect } from 'vitest';
import { createWebsiteTools, isDesignTool } from './tools';
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
});
