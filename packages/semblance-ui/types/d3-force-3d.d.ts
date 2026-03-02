/**
 * Minimal type declarations for d3-force-3d.
 *
 * d3-force-3d extends d3-force with 3D simulation support but does not ship
 * its own TypeScript type definitions. This ambient module declaration lets
 * consumer code import from the package without type errors. Specific function
 * signatures are typed loosely — callers should cast return values where needed.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
declare module 'd3-force-3d' {
  export function forceSimulation(nodes?: any[], dimensions?: number): any;
  export function forceLink(links?: any[]): any;
  export function forceManyBody(): any;
  export function forceCenter(x?: number, y?: number, z?: number): any;
  export function forceCollide(radius?: number | ((node: any) => number)): any;
  export function forceX(x?: number): any;
  export function forceY(y?: number): any;
  export function forceZ(z?: number): any;
}
