declare module '*.css' {
  const content: Record<string, string>;
  export default content;
}

declare module '*.png' {
  const src: string;
  export default src;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare module 'd3-force-3d' {
  // d3-force-3d has no @types package. Minimal declarations for our usage.
  // Force simulation with 3D support — API mirrors d3-force but adds z dimension.
  export function forceSimulation(nodes?: any[], numDimensions?: number): any;
  export function forceLink(links?: any[]): any;
  export function forceManyBody(): any;
  export function forceCenter(x?: number, y?: number, z?: number): any;
  export function forceZ(z?: number): any;
  export function forceCollide(): any;
}
