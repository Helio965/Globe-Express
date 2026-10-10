import { z } from 'zod';
export const coordinatesSchema = z.object({
  lat: z.number().finite().min(-90).max(90),
  lng: z.number().finite().min(-180).max(180),
}).strict();
export const referenceSchema = z.discriminatedUnion('provider', [
  z.object({ provider: z.literal('google'), id: z.string().min(1).max(512).regex(/^[A-Za-z0-9_-]+$/) }).strict(),
  z.object({ provider: z.literal('wikipedia'), id: z.string().regex(/^[1-9]\d{0,15}$/), language: z.enum(['pt', 'en']) }).strict(),
  coordinatesSchema.extend({ provider: z.literal('coordinates') }).strict(),
]);
export const destinationRequestSchema = z.object({
  reference: referenceSchema,
  sessionToken: z.uuid().optional(),
}).strict();
export const searchRequestSchema = z.object({
  q: z.string().trim().min(2).max(160),
  sessionToken: z.uuid().optional(),
}).strict();
export const reverseRequestSchema = z.object({
  lat: z.union([z.number(), z.string().trim().min(1)]).transform(Number).pipe(z.number().finite().min(-90).max(90)),
  lng: z.union([z.number(), z.string().trim().min(1)]).transform(Number).pipe(z.number().finite().min(-180).max(180)),
}).strict();
