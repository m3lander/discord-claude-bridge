/**
 * Code Block Formatter - Formats code snippets for Discord
 *
 * Handles syntax highlighting hints and truncation
 */

const MAX_CODE_LINES = 30;
const MAX_LINE_LENGTH = 120;

/**
 * Language detection from file extension
 */
const EXTENSION_TO_LANGUAGE: Record<string, string> = {
  // JavaScript/TypeScript
  ts: 'typescript',
  tsx: 'tsx',
  js: 'javascript',
  jsx: 'jsx',
  mjs: 'javascript',
  cjs: 'javascript',

  // Python
  py: 'python',
  pyw: 'python',
  pyi: 'python',

  // Systems languages
  rs: 'rust',
  go: 'go',
  c: 'c',
  cpp: 'cpp',
  cc: 'cpp',
  h: 'c',
  hpp: 'cpp',

  // JVM
  java: 'java',
  kt: 'kotlin',
  scala: 'scala',
  groovy: 'groovy',

  // Web
  html: 'html',
  htm: 'html',
  css: 'css',
  scss: 'scss',
  sass: 'sass',
  less: 'less',

  // Data formats
  json: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'toml',
  xml: 'xml',

  // Shell
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  fish: 'fish',

  // Other
  rb: 'ruby',
  php: 'php',
  sql: 'sql',
  md: 'markdown',
  dockerfile: 'dockerfile',
  makefile: 'makefile',
  r: 'r',
  swift: 'swift',
  lua: 'lua',
  vim: 'vim',
  ex: 'elixir',
  exs: 'elixir',
  erl: 'erlang',
  hs: 'haskell',
  clj: 'clojure',
};

/**
 * Format code with syntax highlighting for Discord
 */
export function formatCodeBlock(code: string, language?: string): string {
  const lang = language || '';
  const truncated = truncateCode(code);

  return `\`\`\`${lang}\n${truncated}\n\`\`\``;
}

/**
 * Format code from a file with auto-detected language
 */
export function formatCodeFromFile(filePath: string, code: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  const language = EXTENSION_TO_LANGUAGE[ext] || '';

  return formatCodeBlock(code, language);
}

/**
 * Truncate code to fit Discord limits
 */
function truncateCode(code: string): string {
  const lines = code.split('\n');

  // Truncate individual lines
  const truncatedLines = lines.map(line => {
    if (line.length > MAX_LINE_LENGTH) {
      return line.slice(0, MAX_LINE_LENGTH - 3) + '...';
    }
    return line;
  });

  // Limit total lines
  if (truncatedLines.length > MAX_CODE_LINES) {
    const half = Math.floor(MAX_CODE_LINES / 2);
    const first = truncatedLines.slice(0, half);
    const last = truncatedLines.slice(-half);
    const omitted = truncatedLines.length - MAX_CODE_LINES;

    return [
      ...first,
      `... (${omitted} lines omitted) ...`,
      ...last,
    ].join('\n');
  }

  return truncatedLines.join('\n');
}

/**
 * Format inline code (single backticks)
 */
export function formatInlineCode(code: string, maxLength: number = 50): string {
  const clean = code.replace(/`/g, "'"); // Escape backticks
  if (clean.length > maxLength) {
    return `\`${clean.slice(0, maxLength - 3)}...\``;
  }
  return `\`${clean}\``;
}

/**
 * Detect language from file path
 */
export function detectLanguage(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  return EXTENSION_TO_LANGUAGE[ext] || '';
}

/**
 * Format a file read result for Discord
 */
export function formatFileContent(filePath: string, content: string, startLine?: number): string {
  const language = detectLanguage(filePath);

  // Add line numbers if we have a start line
  let displayContent = content;
  if (startLine !== undefined) {
    const lines = content.split('\n');
    displayContent = lines
      .map((line, i) => `${String(startLine + i).padStart(4)} │ ${line}`)
      .join('\n');
  }

  const truncated = truncateCode(displayContent);

  // Header with file path
  const home = process.env.HOME || '';
  let displayPath = filePath;
  if (home && displayPath.startsWith(home)) {
    displayPath = '~' + displayPath.slice(home.length);
  }

  return `📖 **\`${displayPath}\`**\n\`\`\`${language}\n${truncated}\n\`\`\``;
}
