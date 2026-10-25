import { defineCatalog } from '@json-render/core';
import { standardActionDefinitions, standardComponentDefinitions } from '@json-render/react-native/catalog';
import { schema } from '@json-render/react-native/schema';
import { z } from 'zod';

const d = standardComponentDefinitions;
// Pulled from the library's own definitions so descriptions and param shapes stay identical.
const standardActionsFrom = (name: keyof typeof standardActionDefinitions) => standardActionDefinitions[name];

/**
 * The only components and actions a model may use. Trimmed to what this app themes and supports,
 * which also keeps the system prompt short enough for small models.
 */
export const catalog = defineCatalog(schema, {
  components: {
    Card: d.Card,
    Container: d.Container,
    Column: d.Column,
    Row: d.Row,
    Spacer: d.Spacer,
    Divider: d.Divider,
    Pressable: d.Pressable,
    Heading: d.Heading,
    Paragraph: d.Paragraph,
    Label: d.Label,
    Badge: d.Badge,
    Chip: d.Chip,
    Image: d.Image,
    Button: d.Button,
    TextInput: d.TextInput,
    Switch: d.Switch,
    Checkbox: d.Checkbox,
    Slider: d.Slider,
    ProgressBar: d.ProgressBar,
    ListItem: d.ListItem,
    CodeBlock: {
      props: z.object({ language: z.string().nullable(), code: z.string() }),
      slots: [],
      description: 'Monospace code block',
    },
  },
  actions: {
    setState: standardActionsFrom('setState'),
    pushState: standardActionsFrom('pushState'),
    removeState: standardActionsFrom('removeState'),
    showAlert: standardActionsFrom('showAlert'),
    share: standardActionsFrom('share'),
    openURL: standardActionsFrom('openURL'),
    sendMessage: { params: z.object({ text: z.string() }), description: 'Send a message in this chat as the user' },
    setDefaultModel: { params: z.object({ id: z.string() }), description: 'Make a model the default for new chats' },
    runMcpTool: {
      params: z.object({ server: z.string(), tool: z.string(), args: z.record(z.string(), z.unknown()).nullable() }),
      description: 'Run an MCP tool (always asks the user first)',
    },
  },
});

/** Component types a model may use; anything else is dropped before rendering. */
export const ALLOWED_TYPES: ReadonlySet<string> = new Set(Object.keys((catalog.data as { components: Record<string, unknown> }).components));

/** Action → approval policy shown in Components & actions. */
export const ACTION_POLICY: Record<string, 'Auto' | 'Ask' | 'Always ask'> = {
  setState: 'Auto',
  pushState: 'Auto',
  removeState: 'Auto',
  showAlert: 'Auto',
  share: 'Ask',
  sendMessage: 'Auto',
  setDefaultModel: 'Auto',
  openURL: 'Ask',
  runMcpTool: 'Always ask',
};

const RULES = [
  'Write one or two sentences first, then the UI inside a ```spec fence. If the user does not need a UI, answer in plain text only.',
  'Only build a UI when it helps: forms, checklists, comparisons, dashboards, settings, small tools. Never for simple questions.',
  'Do NOT set colors, backgroundColor, fontSize or fonts on any element. The app applies its own light/dark theme.',
  'Use a Card as the outermost element, Column for vertical stacks and Row for horizontal ones.',
  'The screen is a phone (about 390pt wide). Keep each UI compact: at most about 25 elements.',
  'A button that should ask the assistant something uses the sendMessage action with params {"text": "..."}.',
  'Always seed realistic sample data in /state for anything that uses $state, $bindState, $item or repeat.',
];

/** System-prompt section that teaches a chat model to answer with text plus a streamed UI. */
export const genUiSystemPrompt = () =>
  catalog.prompt({
    mode: 'inline',
    system: 'You are a helpful assistant that can also build small interactive UIs inside the chat.',
    customRules: RULES,
  });

/** Same, for the full-screen mini app: the model must output only the UI patches. */
export const miniAppSystemPrompt = () =>
  catalog.prompt({
    mode: 'standalone',
    system: 'You build small mobile apps as a UI spec.',
    customRules: RULES.slice(2),
  });
