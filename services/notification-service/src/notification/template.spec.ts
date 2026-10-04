import { ErrorCode } from '@staysphere/contracts';
import { escapeHtml, extractTokens, renderTemplate, type Template } from './template';

const template: Template = {
  key: 'booking-confirmed',
  subject: 'Your booking {{reference}} is confirmed',
  body: 'Dear {{guestName}}, room {{room.number}} is reserved for {{nights}} nights.',
  required: ['reference', 'guestName'],
};

describe('renderTemplate', () => {
  it('substitutes every token', () => {
    const rendered = renderTemplate(template, {
      reference: 'SS-4KD9QW',
      guestName: 'Nadeesha',
      room: { number: '305' },
      nights: 3,
    });
    expect(rendered.subject).toBe('Your booking SS-4KD9QW is confirmed');
    expect(rendered.body).toBe('Dear Nadeesha, room 305 is reserved for 3 nights.');
  });

  it('resolves a dotted path', () => {
    const rendered = renderTemplate(template, {
      reference: 'X',
      guestName: 'Y',
      room: { number: '101' },
    });
    expect(rendered.body).toContain('room 101');
  });

  it('escapes HTML by default so a name cannot inject markup', () => {
    const rendered = renderTemplate(template, {
      reference: 'X',
      guestName: '<script>alert(1)</script>',
    });
    expect(rendered.body).toContain('&lt;script&gt;');
    expect(rendered.body).not.toContain('<script>');
  });

  it('can opt out of escaping for a trusted body', () => {
    const rendered = renderTemplate(
      { ...template, required: [] },
      { guestName: '<b>Nadeesha</b>', reference: 'X' },
      { escape: false },
    );
    expect(rendered.body).toContain('<b>Nadeesha</b>');
  });

  it('rejects a missing required value rather than sending a blank', () => {
    // "Your booking  is confirmed" is worse than not sending.
    expect(() => renderTemplate(template, { guestName: 'Nadeesha' })).toThrow(
      expect.objectContaining({ code: ErrorCode.VALIDATION_FAILED }),
    );
  });

  it('treats an empty string as missing', () => {
    expect(() => renderTemplate(template, { reference: '', guestName: 'N' })).toThrow();
  });

  it('lists every missing value at once', () => {
    expect.assertions(1);
    try {
      renderTemplate(template, {});
    } catch (error) {
      expect((error as { details?: { missing: string[] } }).details?.missing).toEqual([
        'reference',
        'guestName',
      ]);
    }
  });

  it('renders an optional token as empty rather than failing', () => {
    const rendered = renderTemplate(template, { reference: 'X', guestName: 'Y' });
    expect(rendered.body).toBe('Dear Y, room  is reserved for  nights.');
  });

  it('tolerates whitespace inside the braces', () => {
    const spaced: Template = { key: 'k', subject: null, body: 'Hi {{  name  }}', required: [] };
    expect(renderTemplate(spaced, { name: 'Sam' }).body).toBe('Hi Sam');
  });
});

describe('extractTokens', () => {
  it('lists every token in the subject and body, sorted and de-duplicated', () => {
    expect(extractTokens(template)).toEqual(['guestName', 'nights', 'reference', 'room.number']);
  });
});

describe('escapeHtml', () => {
  it('escapes the five characters that matter', () => {
    expect(escapeHtml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;');
  });
});
