import { z } from 'zod';

const Semver = z.string().regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/);

export const ExtensionPermissions = z
  .object({
    tools: z.array(z.string().min(1)),
    slots: z.array(z.string().min(1)),
  })
  .strict();
export type ExtensionPermissions = z.infer<typeof ExtensionPermissions>;

export const UnsignedExtensionManifest = z
  .object({
    id: z.string().min(1),
    version: Semver,
    protocolVersion: z.literal(1),
    minCoreVersion: Semver,
    artifactRelativePath: z.string().min(1),
    artifactHash: z.string().regex(/^sha256:[0-9a-f]{64}$/),
    permissions: ExtensionPermissions,
    createdAt: z.string().datetime(),
    expiresAt: z.string().datetime().nullable(),
  })
  .strict();
export type UnsignedExtensionManifest = z.infer<typeof UnsignedExtensionManifest>;

export const SignedExtensionManifest = UnsignedExtensionManifest.extend({
  signatureKeyId: z.string().min(1),
  signature: z.string().min(1),
}).strict();
export type SignedExtensionManifest = z.infer<typeof SignedExtensionManifest>;

export const DrPublisherKeyRecord = z
  .object({
    keyId: z.string().min(1),
    algorithm: z.literal('Ed25519'),
    publicKeyPem: z.string().min(1),
    purpose: z.string().min(1).optional(),
  })
  .strict();
export type DrPublisherKeyRecord = z.infer<typeof DrPublisherKeyRecord>;

export const DrPublisherKeysFile = z
  .object({
    schemaVersion: z.literal(1),
    keys: z.array(DrPublisherKeyRecord).min(1),
  })
  .strict();
export type DrPublisherKeysFile = z.infer<typeof DrPublisherKeysFile>;
