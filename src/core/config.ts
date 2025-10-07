export interface Configurable<TConfig> {
  toConfig(): TConfig;
}

export interface SerializedComponent<TKind extends string, TConfig = Record<string, any>> {
  kind: TKind;
  config: TConfig;
}

export interface WithMetadata<TMeta = Record<string, any>> {
  metadata?: TMeta;
}

