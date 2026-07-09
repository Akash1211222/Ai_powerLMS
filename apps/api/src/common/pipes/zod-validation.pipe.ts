import { type PipeTransform, Injectable, BadRequestException } from '@nestjs/common';
import { ZodError, type ZodSchema } from 'zod';

/**
 * Validates and parses a request payload against a Zod schema (§38, §39).
 * On failure, throws a 400 whose body is normalized by the global exception
 * filter into the shared ApiErrorBody shape (with field-level details).
 */
@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodSchema) {}

  transform(value: unknown): unknown {
    try {
      return this.schema.parse(value);
    } catch (err) {
      if (err instanceof ZodError) {
        throw new BadRequestException({
          zodIssues: err.issues.map((i) => ({
            path: i.path.join('.'),
            message: i.message,
          })),
        });
      }
      throw err;
    }
  }
}
