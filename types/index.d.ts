export type EnhancerStatus =
  | { kind: 'idle' }
  | { kind: 'working' }
  | { kind: 'done'; source: 'fork' | 'complete' }
  | { kind: 'error'; message: string }

declare module 'claude-code' {
  interface PluginState {
    'prompt-enhancer': { status: EnhancerStatus }
  }
}
