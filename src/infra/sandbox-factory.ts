import { Sandbox, SandboxKind, LocalSandbox, LocalSandboxOptions } from './sandbox';

export type SandboxFactoryFn = (config: Record<string, any>) => Sandbox;

export class SandboxFactory {
  private factories = new Map<SandboxKind, SandboxFactoryFn>();

  constructor() {
    this.factories.set('local', (config) => new LocalSandbox(config as LocalSandboxOptions));
  }

  register(kind: SandboxKind, factory: SandboxFactoryFn): void {
    this.factories.set(kind, factory);
  }

  create(config: { kind: SandboxKind } & Record<string, any>): Sandbox {
    const factory = this.factories.get(config.kind);
    if (!factory) {
      throw new Error(`Sandbox factory not registered: ${config.kind}`);
    }
    return factory(config);
  }
}
