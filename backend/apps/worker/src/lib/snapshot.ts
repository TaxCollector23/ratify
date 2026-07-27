/**
 * RepositorySnapshot.objectStorageKey currently points at a local
 * filesystem path (`local://<path>`) rather than an S3 object, because
 * the synced git working directory is what parser/graph/history-miner
 * stages need to operate on directly (see backend/ASSUMPTIONS.md for why
 * we didn't push whole working trees into object storage). This helper
 * centralizes that convention so it isn't string-parsed ad hoc per stage.
 */
export function localWorkingDirectoryFor(objectStorageKey: string): string {
  if (!objectStorageKey.startsWith("local://")) {
    throw new Error(`Expected a local:// snapshot key, got: ${objectStorageKey}`);
  }
  return objectStorageKey.slice("local://".length);
}
