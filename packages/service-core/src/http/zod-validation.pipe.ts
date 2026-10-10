import { Injectable, type PipeTransform } from '@nestjs/common';
import type { ZodTypeAny, z } from 'zod';

/**
 * Validates and *narrows* a request payload with a Zod schema. Unlike
 * class-validator this strips unknown keys, which prevents mass-assignment:
 * a client cannot smuggle `role: SUPER_ADMIN` into a profile update.
 */
@Injectable()
export class ZodValidationPipe<TSchema extends ZodTypeAny> implements PipeTransform {
  constructor(private readonly schema: TSchema) {}

  transform(value: unknown): z.infer<TSchema> {
    // A ZodError thrown here is normalised by AllExceptionsFilter.
    return this.schema.parse(value);
  }
}

/** Convenience factory: `@Body(zodBody(createBookingSchema))`. */
export function zodBody<TSchema extends ZodTypeAny>(schema: TSchema): ZodValidationPipe<TSchema> {
  return new ZodValidationPipe(schema);
}
