import { z } from 'zod';

const domainCertificateSchema = z.union([
  z.object({
    create: z.literal(true),
  }),
  z.object({
    arn: z.string(),
  }),
]);

const domainSchema = z.object({
  name: z.string(),
  type: z.enum(['subdomain', 'hosted-zone', 'external']).default('subdomain'),
  certificate: domainCertificateSchema.default({ create: true }),
});

const networkingSchema = z.object({
  natGateways: z.number().min(0).max(3).default(0), // 0=no egress, 1=cost-effective, 2-3=high availability
});

const buildSchema = z.object({
  exclude: z.array(z.string()).optional(),
});

export const configSchema = z.object({
  projectName: z.string(),
  environment: z.string().default('dev'),
  provider: z.enum(['aws']),
  region: z.string().optional(),
  domain: domainSchema.optional(),
  networking: networkingSchema.optional(),
  build: buildSchema.optional(),
  resources: z.record(z.any()).optional(),
  events: z
    .object({
      eventBus: z.string().default('default'),
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
