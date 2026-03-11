// Mock react-native-fs for vitest environment.
// Mobile-only module — not installed in the monorepo root.

export const DocumentDirectoryPath = '/mock/Documents';
export const CachesDirectoryPath = '/mock/Caches';
export const TemporaryDirectoryPath = '/mock/tmp';

export function readFile(_path: string, _encoding?: string): Promise<string> {
  return Promise.resolve('');
}
export function writeFile(_path: string, _content: string, _encoding?: string): Promise<void> {
  return Promise.resolve();
}
export function exists(_path: string): Promise<boolean> {
  return Promise.resolve(false);
}
export function mkdir(_path: string): Promise<void> {
  return Promise.resolve();
}
export function unlink(_path: string): Promise<void> {
  return Promise.resolve();
}
export function readDir(_path: string): Promise<Array<{ name: string; path: string; isFile: () => boolean; isDirectory: () => boolean }>> {
  return Promise.resolve([]);
}
export function stat(_path: string): Promise<{ size: number; isFile: () => boolean; isDirectory: () => boolean; mtime: Date }> {
  return Promise.resolve({ size: 0, isFile: () => true, isDirectory: () => false, mtime: new Date() });
}

const RNFS = {
  DocumentDirectoryPath,
  CachesDirectoryPath,
  TemporaryDirectoryPath,
  readFile,
  writeFile,
  exists,
  mkdir,
  unlink,
  readDir,
  stat,
};

export default RNFS;
