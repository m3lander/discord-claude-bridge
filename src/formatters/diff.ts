/**
 * Diff Formatter - Formats file edits as Discord-friendly diffs
 *
 * Supports Edit tool's old_string → new_string format
 */

const MAX_DIFF_LINES = 20;
const MAX_LINE_LENGTH = 100;

export interface EditInfo {
  filePath: string;
  oldString: string;
  newString: string;
  replaceAll?: boolean;
}

/**
 * Format an edit operation as a diff for Discord
 */
export function formatDiff(edit: EditInfo): string {
  const { filePath, oldString, newString, replaceAll } = edit;

  // Header
  const home = process.env.HOME || '';
  let displayPath = filePath;
  if (home && displayPath.startsWith(home)) {
    displayPath = '~' + displayPath.slice(home.length);
  }

  const header = `✏️ **Edit: \`${displayPath}\`**${replaceAll ? ' (all occurrences)' : ''}`;

  // Generate diff
  const diff = generateSimpleDiff(oldString, newString);

  return `${header}\n\`\`\`diff\n${diff}\n\`\`\``;
}

/**
 * Generate a simple line-based diff
 */
function generateSimpleDiff(oldStr: string, newStr: string): string {
  const oldLines = oldStr.split('\n');
  const newLines = newStr.split('\n');

  const diffLines: string[] = [];
  let lineCount = 0;

  // Simple approach: show removed lines, then added lines
  // For more complex cases, a proper diff algorithm would be better

  // Check if this is a small inline change
  if (oldLines.length === 1 && newLines.length === 1) {
    diffLines.push(`- ${truncateLine(oldLines[0])}`);
    diffLines.push(`+ ${truncateLine(newLines[0])}`);
    return diffLines.join('\n');
  }

  // Show old lines as removed
  for (const line of oldLines) {
    if (lineCount >= MAX_DIFF_LINES / 2) {
      diffLines.push(`... (${oldLines.length - lineCount} more lines removed)`);
      break;
    }
    diffLines.push(`- ${truncateLine(line)}`);
    lineCount++;
  }

  lineCount = 0;

  // Show new lines as added
  for (const line of newLines) {
    if (lineCount >= MAX_DIFF_LINES / 2) {
      diffLines.push(`... (${newLines.length - lineCount} more lines added)`);
      break;
    }
    diffLines.push(`+ ${truncateLine(line)}`);
    lineCount++;
  }

  return diffLines.join('\n');
}

/**
 * Truncate a line for display
 */
function truncateLine(line: string): string {
  if (line.length <= MAX_LINE_LENGTH) return line;
  return line.slice(0, MAX_LINE_LENGTH - 3) + '...';
}

/**
 * Format a write operation (new file creation)
 */
export function formatWrite(filePath: string, content: string): string {
  const home = process.env.HOME || '';
  let displayPath = filePath;
  if (home && displayPath.startsWith(home)) {
    displayPath = '~' + displayPath.slice(home.length);
  }

  const lines = content.split('\n');
  const preview = lines.slice(0, 10).map(l => truncateLine(l)).join('\n');
  const moreLines = lines.length > 10 ? `\n... (${lines.length - 10} more lines)` : '';

  // Try to detect language from extension
  const ext = filePath.split('.').pop() || '';
  const langMap: Record<string, string> = {
    ts: 'typescript',
    tsx: 'tsx',
    js: 'javascript',
    jsx: 'jsx',
    py: 'python',
    rs: 'rust',
    go: 'go',
    java: 'java',
    rb: 'ruby',
    sh: 'bash',
    json: 'json',
    yaml: 'yaml',
    yml: 'yaml',
    md: 'markdown',
    css: 'css',
    html: 'html',
    sql: 'sql',
  };
  const lang = langMap[ext] || '';

  return `📝 **Write: \`${displayPath}\`**\n\`\`\`${lang}\n${preview}${moreLines}\n\`\`\``;
}

/**
 * Format a compact diff summary (single line)
 */
export function formatDiffCompact(filePath: string, oldLength: number, newLength: number): string {
  const home = process.env.HOME || '';
  let displayPath = filePath;
  if (home && displayPath.startsWith(home)) {
    displayPath = '~' + displayPath.slice(home.length);
  }

  const change = newLength - oldLength;
  const changeStr = change >= 0 ? `+${change}` : `${change}`;

  return `✏️ \`${displayPath}\` (${changeStr} chars)`;
}
