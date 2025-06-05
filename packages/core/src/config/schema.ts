import { z } from 'zod';

const domainSchema = z.string();

const networkingSchema = z.object({
  natGateways: z.number().min(0).max(3).default(0), // 0=no egress, 1=cost-effective, 2-3=high availability
});

const buildSchema = z.object({
  exclude: z.array(z.string()).optional(),
});

export const configSchema = z.object({
  projectName: z.string(),
  environment: z.string().default('dev'),
  provider: z.enum(['aws', 'cloudflare']),
  region: z.string().optional(),
  domainName: domainSchema.optional(),
  networking: networkingSchema.optional(),
  build: buildSchema.optional(),
  secrets: z
    .record(
      z.string(),
      z.object({
        value: z.union([z.string(), z.function().returns(z.string())]),
        description: z.string().optional(), // Optional description of the secret
      })
    )
    .optional(),
  events: z
    .object({
      subscribers: z
        .record(
          z.object({
            events: z.array(z.string()), // Array of event types this subscriber listens to
          })
        )
        .optional(),
    })
    .optional(),
});

export type Config = z.infer<typeof configSchema>;
