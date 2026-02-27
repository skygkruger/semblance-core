// d3-force-3d has no @types package. Minimal declarations for our usage.
declare module 'd3-force-3d' {
  export function forceSimulation(nodes?: unknown[], numDimensions?: number): any; // eslint-disable-line @typescript-eslint/no-explicit-any
  export function forceLink(links?: unknown[]): any; // eslint-disable-line @typescript-eslint/no-explicit-any
  export function forceManyBody(): any; // eslint-disable-line @typescript-eslint/no-explicit-any
  export function forceCenter(x?: number, y?: number, z?: number): any; // eslint-disable-line @typescript-eslint/no-explicit-any
  export function forceZ(z?: number): any; // eslint-disable-line @typescript-eslint/no-explicit-any
  export function forceCollide(): any; // eslint-disable-line @typescript-eslint/no-explicit-any
}
