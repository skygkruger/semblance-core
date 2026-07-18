export interface EvidenceManifestRecord {
  id: 'semblance-verify' | 'data-audit';
  path: string;
  sha256: string;
  sizeBytes: number;
}

export interface EvidenceManifest {
  schemaVersion: 1;
  evidence: EvidenceManifestRecord[];
}

export interface EvidenceManifestInputs {
  verifyOutput: string;
  dataAuditOutput: string;
}

export function generateEvidenceManifest(inputs: EvidenceManifestInputs): EvidenceManifest;
