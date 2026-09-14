import type { Block, PromptState } from './types'

/**
 * Extension point — motor de “poesía matemática” (fuera de v1).
 * Un módulo futuro puede implementar PromptPoet y engancharse en exportPrompt.
 */
export type PromptPoet = {
  embellish: (prompt: string, blocks: Block[]) => string
}

export const noopPoet: PromptPoet = {
  embellish: (prompt) => prompt,
}

/**
 * Extension point — asistente de chat (fuera de v1).
 * No hay UI de chat. Reservado para un sidecar posterior.
 */
export type PromptAssistant = {
  suggest: (state: PromptState) => Promise<string | null>
}

export const disabledAssistant: PromptAssistant = {
  suggest: async () => null,
}

/**
 * Extension point — capa de escritorio flotante (fuera de v1).
 * Un shell Electron (u otro always-on-top) debería montar este mismo motor
 * y los JSON de /data, no duplicar el compositor.
 */
export type FloatingShellHost = {
  pinOver: (appName: string) => Promise<void>
}

/**
 * Extension point — sugeridor de LoRAs por escena (heurística mínima hoy).
 * Un motor futuro puede sustituir suggestLorasForScene.
 */
export type LoraResolver = {
  tokensFor: (modelId: string) => string[]
}

export const noopLoraResolver: LoraResolver = {
  tokensFor: () => [],
}

export const unimplementedFloatingShell: FloatingShellHost = {
  pinOver: async () => {
    throw new Error('Floating shell is a later phase. v1 is the iPad PWA.')
  },
}
