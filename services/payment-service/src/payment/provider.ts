import { Injectable, Logger } from '@nestjs/common';
import { DomainError, ErrorCode, type Money, type PaymentProvider } from '@staysphere/contracts';
import { nanoid } from 'nanoid';

export interface ChargeRequest {
  readonly amount: Money;
  readonly description: string;
  readonly customerReference: string;
  /** Opaque token from the provider's client SDK. Never a raw card number. */
  readonly paymentToken?: string;
  readonly idempotencyKey: string;
  readonly capture: boolean;
}

export interface ChargeResult {
  readonly providerReference: string;
  readonly authorized: boolean;
  readonly captured: boolean;
  readonly cardLast4?: string;
  readonly cardBrand?: string;
}

export interface ProviderRefundRequest {
  readonly providerReference: string;
  readonly amount: Money;
  readonly reason: string;
  readonly idempotencyKey: string;
}

/**
 * What a payment provider must be able to do.
 *
 * Every provider sits behind this interface so the service's own logic — state
 * machine, refund caps, idempotency — is written once and does not change when
 * a hotel switches from Stripe to PayHere.
 */
export interface PaymentGateway {
  readonly provider: PaymentProvider;
  charge(request: ChargeRequest): Promise<ChargeResult>;
  refund(request: ProviderRefundRequest): Promise<{ providerReference: string }>;
  /** Verifies a webhook signature; a false result must be treated as hostile. */
  verifyWebhook(rawBody: string, signature: string): boolean;
}

/**
 * Settles a payment taken in person.
 *
 * Not a stub — cash and bank transfer are how a large share of walk-in and
 * corporate bookings are actually paid. There is no external call: the
 * receptionist has the money, and the reference is the audit trail.
 */
@Injectable()
export class ManualPaymentGateway implements PaymentGateway {
  private readonly logger = new Logger(ManualPaymentGateway.name);

  constructor(readonly provider: PaymentProvider) {}

  async charge(request: ChargeRequest): Promise<ChargeResult> {
    this.logger.log(
      { amount: request.amount, provider: this.provider },
      'Recording a manually collected payment',
    );
    return {
      providerReference: `${this.provider.toLowerCase()}_${nanoid(18)}`,
      authorized: true,
      // Cash in hand is captured by definition; there is nothing to settle later.
      captured: true,
    };
  }

  async refund(request: ProviderRefundRequest): Promise<{ providerReference: string }> {
    this.logger.log({ amount: request.amount }, 'Recording a manually issued refund');
    return { providerReference: `${this.provider.toLowerCase()}_rf_${nanoid(18)}` };
  }

  verifyWebhook(): boolean {
    // A manual payment never produces a webhook, so nothing can be trusted.
    return false;
  }
}

/**
 * Resolves the gateway for a provider.
 *
 * Card providers are registered at boot when their credentials are configured;
 * asking for one that is not configured fails loudly rather than silently
 * falling back to a manual charge, which would record money that was never taken.
 */
@Injectable()
export class GatewayRegistry {
  private readonly gateways = new Map<PaymentProvider, PaymentGateway>();

  register(gateway: PaymentGateway): void {
    this.gateways.set(gateway.provider, gateway);
  }

  get(provider: PaymentProvider): PaymentGateway {
    const gateway = this.gateways.get(provider);
    if (!gateway) {
      throw new DomainError(
        ErrorCode.UPSTREAM_UNAVAILABLE,
        `The ${provider} payment provider is not configured in this environment.`,
        { details: { provider, configured: [...this.gateways.keys()] } },
      );
    }
    return gateway;
  }

  get configured(): PaymentProvider[] {
    return [...this.gateways.keys()];
  }
}
