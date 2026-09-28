import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PRISMA_TRANSACTION_OPTIONS, connectWithRetry } from '@staysphere/service-core';
import { PrismaClient } from '../generated/prisma/index.js';

/**
 * Prisma client bound to the Nest lifecycle.
 *
 * `$connect` runs at boot so a bad `DATABASE_URL` fails the readiness probe
 * rather than the first guest request.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({ transactionOptions: PRISMA_TRANSACTION_OPTIONS });
  }

  async onModuleInit(): Promise<void> {
    // A serverless database parks itself when idle and takes a few seconds
    // to wake. Starting the platform wakes every database at once, so the
    // first connection can fail purely because the server is still coming
    // up — and an unretried failure here exits the process, leaving one
    // service down while the rest of the stack looks healthy.
    await connectWithRetry(() => this.$connect(), {
      onRetry: (attempt, delayMs) =>
        this.logger.warn(
          `Datastore not reachable yet (attempt ${attempt}); retrying in ${delayMs}ms`,
        ),
    });
    this.logger.log('Connected to the identity datastore');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /** Cheap round-trip used by the readiness probe. */
  async ping(): Promise<void> {
    await this.$queryRaw`SELECT 1`;
  }
}
