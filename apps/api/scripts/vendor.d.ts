// Ambient types for dev-only script dependencies that ship none of their
// own (solc) or don't expose them through package exports (ganache).
// Scripts only — nothing under src/ imports these.

declare module "solc" {
  interface Solc {
    compile(input: string): string;
    version(): string;
  }
  const solc: Solc;
  export function compile(input: string): string;
  export function version(): string;
  export default solc;
}

declare module "ganache" {
  export interface GanacheRequestArguments {
    method: string;
    params?: unknown;
  }
  export interface GanacheProvider {
    request(args: GanacheRequestArguments): Promise<unknown>;
    disconnect(): Promise<void>;
  }
  export interface GanacheAccount {
    secretKey?: string;
    balance?: string | number | bigint;
  }
  export interface GanacheOptions {
    wallet?: {
      accounts?: GanacheAccount[];
      [key: string]: unknown;
    };
    chain?: Record<string, unknown>;
    [key: string]: unknown;
  }
  export function provider(options?: GanacheOptions): GanacheProvider;
  const ganache: { provider: typeof provider };
  export default ganache;
}
