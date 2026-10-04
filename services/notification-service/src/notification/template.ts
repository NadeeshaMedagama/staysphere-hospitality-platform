import { DomainError, ErrorCode } from '@staysphere/contracts';

export interface Template {
  readonly key: string;
  readonly subject: string | null;
  readonly body: string;
  readonly required: readonly string[];
}

export interface RenderedMessage {
  readonly subject: string | null;
  readonly body: string;
}

const TOKEN_PATTERN = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;

/**
 * Renders a template.
 *
 * Values are HTML-escaped by default. A guest's name goes into an email body
 * unescaped only if someone opts out deliberately — a name containing `<script>`
 * must not become one.
 *
 * A missing *required* token is an error rather than an empty string: sending
 * "Your booking REF is confirmed" with a blank reference is worse than not
 * sending at all, because the guest cannot act on it.
 */
export function renderTemplate(
  template: Template,
  values: Readonly<Record<string, unknown>>,
  options: { escape?: boolean } = {},
): RenderedMessage {
  const escape = options.escape ?? true;

  const missing = template.required.filter(
    (token) => values[token] === undefined || values[token] === null || values[token] === '',
  );
  if (missing.length > 0) {
    throw new DomainError(
      ErrorCode.VALIDATION_FAILED,
      `Template '${template.key}' is missing required value(s): ${missing.join(', ')}.`,
      { details: { template: template.key, missing } },
    );
  }

  const substitute = (text: string): string =>
    text.replace(TOKEN_PATTERN, (_match, token: string) => {
      const value = resolvePath(values, token);
      if (value === undefined || value === null) return '';
      const asText = String(value);
      return escape ? escapeHtml(asText) : asText;
    });

  return {
    subject: template.subject ? substitute(template.subject) : null,
    body: substitute(template.body),
  };
}

/** Tokens a template references, for validating it at authoring time. */
export function extractTokens(template: Pick<Template, 'subject' | 'body'>): string[] {
  const tokens = new Set<string>();
  for (const source of [template.subject ?? '', template.body]) {
    for (const match of source.matchAll(TOKEN_PATTERN)) {
      if (match[1]) tokens.add(match[1]);
    }
  }
  return [...tokens].sort();
}

function resolvePath(values: Readonly<Record<string, unknown>>, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>(
      (current, segment) =>
        current && typeof current === 'object'
          ? (current as Record<string, unknown>)[segment]
          : undefined,
      values,
    );
}

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);
}
