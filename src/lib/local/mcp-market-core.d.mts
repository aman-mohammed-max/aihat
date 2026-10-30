export type McpCoreVariable = {
  description?: string;
  isRequired?: boolean;
  isSecret?: boolean;
  default?: string;
  choices?: string[];
};

export type McpCoreHeader = {
  name: string;
  description?: string;
  isRequired?: boolean;
  isSecret?: boolean;
  value?: string;
  variables?: Record<string, McpCoreVariable>;
};

export type McpCoreListing = {
  id: string;
  title: string;
  description: string;
  version: string;
  publisher: string;
  repoUrl?: string;
  websiteUrl?: string;
  remote?: {
    type: 'streamable-http' | 'sse';
    url: string;
    headers: McpCoreHeader[];
    variables: Record<string, McpCoreVariable>;
  };
};

export type McpCoreField = {
  key: string;
  label: string;
  hint?: string;
  secret: boolean;
  required: boolean;
  choices?: string[];
  default?: string;
};

export type McpCorePlan = {
  supported: boolean;
  reason?: string;
  fields: McpCoreField[];
  headerName?: string;
  headerTemplate?: string;
};

export type McpCoreConnection = {
  url: string;
  headerName?: string;
  headerTemplate?: string;
  token?: string;
};

export function normalizeMcpRegistryEntry(entry: unknown): McpCoreListing | null;
export function planMcp(listing: McpCoreListing): McpCorePlan;
export function buildMcpConnection(listing: McpCoreListing, plan: McpCorePlan, values: Record<string, string>): McpCoreConnection;
