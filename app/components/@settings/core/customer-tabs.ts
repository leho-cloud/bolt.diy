// Local tab preferences are not an operator authorization mechanism.
const operatorTabs = new Set(['cloud-providers', 'local-providers', 'mcp', 'plugins']);

export function isCustomerTab(tab: string) {
  return !operatorTabs.has(tab);
}
