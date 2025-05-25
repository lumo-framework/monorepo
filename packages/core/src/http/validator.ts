import { z, ZodIssue } from 'zod';

export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; errors: ZodIssue[] };

export const validate = <T>(
  schema: z.Schema<T>,
  data: unknown
): ValidationResult<T> => {
  const result = schema.safeParse(data);
  if (result.success) {
    return {
      success: true,
      data: result.data,
    };
  }

  return {
    success: false,
    errors: result.error.issues,
  };
};
