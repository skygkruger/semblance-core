// esbuild inject shim: provides import.meta.url in CJS bundles.
import { pathToFileURL } from 'node:url';

export const import_meta_url = pathToFileURL(__filename).href;
