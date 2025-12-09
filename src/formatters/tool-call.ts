/**
 * Tool Call Formatter - Formats SDK tool calls for Discord display
 *
 * Shows tool name, key parameters, and truncated output
 */

const MAX_TOOL_OUTPUT_LENGTH = 500;
const MAX_PATH_DISPLAY_LENGTH = 60;

export interface ToolCallInfo {
  toolName: string;
  input: Record<string, unknown>;
  output?: unknown;
  isError?: boolean;
}

/**
 * Format a tool call for Discord display
 */
export function formatToolCall(info: ToolCallInfo): string {
  const { toolName, input, output, isError } = info;

  const emoji = isError ? '❌' : '🔧';
  const header = `${emoji} **Tool: ${toolName}**`;

  const inputSummary = formatToolInput(toolName, input);
  const outputSummary = output !== undefined ? formatToolOutput(toolName, output) : '';

  const parts = [header];
  if (inputSummary) parts.push(inputSummary);
  if (outputSummary) parts.push(outputSummary);

  return parts.join('\n');
}

/**
 * Format tool input based on tool type
 */
function formatToolInput(toolName: string, input: Record<string, unknown>): string {
  switch (toolName) {
    case 'Read':
      return formatPath(input.file_path as string);

    case 'Write':
      return `📝 ${formatPath(input.file_path as string)}`;

    case 'Edit':
      return `✏️ ${formatPath(input.file_path as string)}`;

    case 'Bash':
      const cmd = truncate(input.command as string, 100);
      return `\`\`\`bash\n${cmd}\n\`\`\``;

    case 'Glob':
      return `🔍 Pattern: \`${input.pattern}\``;

    case 'Grep':
      return `🔍 Search: \`${input.pattern}\``;

    case 'WebFetch':
      return `🌐 ${input.url}`;

    case 'WebSearch':
      return `🔎 "${input.query}"`;

    case 'Task':
      return `🤖 Agent: ${input.subagent_type}\n📋 ${truncate(input.description as string, 80)}`;

    default:
      // Generic formatting for unknown tools
      const keys = Object.keys(input).slice(0, 3);
      const summary = keys.map(k => `${k}: ${truncate(String(input[k]), 30)}`).join(', ');
      return summary ? `\`${summary}\`` : '';
  }
}

/**
 * Format tool output based on tool type
 */
function formatToolOutput(toolName: string, output: unknown): string {
  if (output === null || output === undefined) return '';

  const str = typeof output === 'string' ? output : JSON.stringify(output, null, 2);

  // For Bash, show output in code block
  if (toolName === 'Bash') {
    return `\`\`\`\n${truncate(str, MAX_TOOL_OUTPUT_LENGTH)}\n\`\`\``;
  }

  // For Read, don't show content (it would be too long)
  if (toolName === 'Read') {
    return ''; // Content shown separately if needed
  }

  // For most tools, just truncate
  const truncated = truncate(str, MAX_TOOL_OUTPUT_LENGTH);
  if (truncated.length > 100) {
    return `\`\`\`\n${truncated}\n\`\`\``;
  }

  return truncated ? `→ ${truncated}` : '';
}

/**
 * Format a file path for display
 */
function formatPath(filePath: string | undefined): string {
  if (!filePath) return '';

  // Shorten home directory
  const home = process.env.HOME || '';
  let displayPath = filePath;
  if (home && displayPath.startsWith(home)) {
    displayPath = '~' + displayPath.slice(home.length);
  }

  // Truncate if still too long
  if (displayPath.length > MAX_PATH_DISPLAY_LENGTH) {
    const parts = displayPath.split('/');
    if (parts.length > 3) {
      displayPath = parts[0] + '/.../' + parts.slice(-2).join('/');
    }
  }

  return `\`${displayPath}\``;
}

/**
 * Truncate a string with ellipsis
 */
function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + '...';
}

/**
 * Format a tool call as a compact single-line summary
 */
export function formatToolCallCompact(toolName: string, input: Record<string, unknown>): string {
  const emoji = getToolEmoji(toolName);

  switch (toolName) {
    case 'Read':
      return `${emoji} Reading ${formatPath(input.file_path as string)}`;
    case 'Write':
      return `${emoji} Writing ${formatPath(input.file_path as string)}`;
    case 'Edit':
      return `${emoji} Editing ${formatPath(input.file_path as string)}`;
    case 'Bash':
      return `${emoji} Running: \`${truncate(input.command as string, 50)}\``;
    case 'Glob':
      return `${emoji} Searching: \`${input.pattern}\``;
    case 'Grep':
      return `${emoji} Grep: \`${input.pattern}\``;
    case 'Task':
      return `${emoji} Spawning ${input.subagent_type} agent`;
    default:
      return `${emoji} ${toolName}`;
  }
}

/**
 * Get emoji for a tool
 */
function getToolEmoji(toolName: string): string {
  const emojis: Record<string, string> = {
    Read: '📖',
    Write: '📝',
    Edit: '✏️',
    Bash: '💻',
    Glob: '🔍',
    Grep: '🔎',
    WebFetch: '🌐',
    WebSearch: '🔎',
    Task: '🤖',
    TodoWrite: '📋',
    NotebookEdit: '📓',
  };
  return emojis[toolName] || '🔧';
}
