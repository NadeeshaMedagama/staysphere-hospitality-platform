import { Module } from '@nestjs/common';
import { PaymentProvider } from '@staysphere/contracts';
import { loadPaymentEnv, type PaymentEnv } from '../config/env.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PaymentController } from './payment.controller.js';
import { CLOCK, PAYMENT_ENV, PaymentService, type Clock } from './payment.service.js';
import { GatewayRegistry, ManualPaymentGateway } from './provider.js';

const systemClock: Clock = { now: () => new Date() };

/**
 * Registers the gateways available in this environment.
 *
 * Cash and bank transfer are always available — a receptionist can always take
 * money in person. Card providers register only when their credentials are
 * configured, so asking for an unconfigured one fails loudly instead of
 * silently recording a charge that never happened.
 */
function buildRegistry(): GatewayRegistry {
  const registry = new GatewayRegistry();
  registry.register(new ManualPaymentGateway(PaymentProvider.CASH));
  registry.register(new ManualPaymentGateway(PaymentProvider.BANK_TRANSFER));
  return registry;
}

@Module({
  controllers: [PaymentController],
  providers: [
    PrismaService,
    PaymentService,
    { provide: GatewayRegistry, useFactory: buildRegistry },
    { provide: PAYMENT_ENV, useFactory: (): PaymentEnv => loadPaymentEnv() },
    { provide: CLOCK, useValue: systemClock },
  ],
  exports: [PaymentService, PrismaService],
})
export class PaymentModule {}
