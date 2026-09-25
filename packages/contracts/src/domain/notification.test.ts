import { describe, expect, it } from 'vitest';
import { TemplateKey, isSuppressible } from './notification.js';

describe('isSuppressible', () => {
  it('lets a guest opt out of a review invitation', () => {
    expect(isSuppressible(TemplateKey.REVIEW_INVITATION)).toBe(true);
  });

  it('never suppresses a transactional message', () => {
    for (const template of [
      TemplateKey.BOOKING_CONFIRMED,
      TemplateKey.PAYMENT_RECEIPT,
      TemplateKey.PASSWORD_RESET,
      TemplateKey.CHECK_OUT_INVOICE,
      TemplateKey.EMAIL_VERIFICATION,
    ]) {
      expect(isSuppressible(template), `${template} must not be suppressible`).toBe(false);
    }
  });
});
