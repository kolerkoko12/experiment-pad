export type ComfyGenerateRequest = {
  prompt: string
  negative_prompt?: string
  width?: number
  height?: number
  steps?: number
}

export type ComfyGenerateSuccess = {
  promptId: string
  status: string
  imageUrl?: string
  imageBase64?: string
  mimeType?: string
  filename?: string
  imageSrc: string
}

export class ComfyGenerateError extends Error {
  status: number
  code: string

  constructor(message: string, status: number, code: string) {
    super(message)
    this.name = 'ComfyGenerateError'
    this.status = status
    this.code = code
  }
}

const ENDPOINTS = ['/.netlify/functions/comfy-generate', '/api/comfy-generate'] as const

const POLL_MS = 2000
const CLIENT_TIMEOUT_MS = 180_000

type PendingBody = {
  ok?: boolean
  pending?: boolean
  promptId?: string
  status?: string
  message?: string
  error?: string
  imageUrl?: string
  imageBase64?: string
  mimeType?: string
  filename?: string
}

export async function generateWithComfy(
  request: ComfyGenerateRequest,
  options?: { signal?: AbortSignal; onStatus?: (message: string) => void },
): Promise<ComfyGenerateSuccess> {
  options?.onStatus?.('Enviando a Comfy Cloud…')
  const first = await callComfy('POST', request, undefined, options?.signal)
  return settle(first, options)
}

export async function continueComfyPoll(
  promptId: string,
  options?: { signal?: AbortSignal; onStatus?: (message: string) => void },
): Promise<ComfyGenerateSuccess> {
  const first = await callComfy('GET', undefined, promptId, options?.signal)
  return settle(first, options)
}

async function settle(
  first: { status: number; body: PendingBody },
  options?: { signal?: AbortSignal; onStatus?: (message: string) => void },
): Promise<ComfyGenerateSuccess> {
  const started = Date.now()
  let current = first

  while (true) {
    throwIfAborted(options?.signal)
    if (isSuccess(current.body)) {
      return toSuccess(current.body)
    }
    if (!current.body.pending || !current.body.promptId) {
      throw errorFrom(current.status, current.body)
    }
    if (Date.now() - started > CLIENT_TIMEOUT_MS) {
      throw new ComfyGenerateError(
        'Comfy Cloud tardó demasiado. Prueba otra vez en un momento.',
        504,
        'timeout',
      )
    }
    options?.onStatus?.('Generando… aún en Comfy Cloud')
    await wait(POLL_MS, options?.signal)
    current = await callComfy('GET', undefined, current.body.promptId, options?.signal)
  }
}

async function callComfy(
  method: 'GET' | 'POST',
  body: ComfyGenerateRequest | undefined,
  promptId: string | undefined,
  signal: AbortSignal | undefined,
): Promise<{ status: number; body: PendingBody }> {
  let lastHtml404: ComfyGenerateError | null = null

  for (const endpoint of ENDPOINTS) {
    const url =
      method === 'GET' && promptId
        ? `${endpoint}?promptId=${encodeURIComponent(promptId)}`
        : endpoint
    const response = await fetch(url, {
      method,
      signal,
      headers: method === 'POST' ? { 'Content-Type': 'application/json' } : undefined,
      body: method === 'POST' ? JSON.stringify(body) : undefined,
    })

    const text = await response.text()
    const parsed = parseBody(text)
    if (looksLikeMissingFunction(response.status, text, parsed)) {
      lastHtml404 = missingFunctionError()
      continue
    }
    if (parsed) return { status: response.status, body: parsed }
    throw new ComfyGenerateError(
      'La Function no devolvió JSON. ¿Publicaste con Drop estático?',
      response.status,
      'bad_response',
    )
  }

  throw lastHtml404 ?? missingFunctionError()
}

function parseBody(text: string): PendingBody | null {
  const trimmed = text.trim()
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return null
  try {
    return JSON.parse(trimmed) as PendingBody
  } catch {
    return null
  }
}

function looksLikeMissingFunction(status: number, text: string, parsed: PendingBody | null) {
  if (parsed) return false
  if (status === 404) return true
  return /<!DOCTYPE html>/i.test(text) && status >= 400
}

function missingFunctionError() {
  return new ComfyGenerateError(
    'No está la Function comfy-generate (404). El Drop de un zip estático no la incluye: hay que publicar con git o `netlify deploy --build`.',
    404,
    'missing_function',
  )
}

function isSuccess(body: PendingBody) {
  return Boolean(body.ok && (body.imageUrl || body.imageBase64) && !body.pending)
}

function toSuccess(body: PendingBody): ComfyGenerateSuccess {
  const imageSrc = body.imageUrl
    ? body.imageUrl
    : `data:${body.mimeType || 'image/png'};base64,${body.imageBase64}`
  return {
    promptId: body.promptId || '',
    status: body.status || 'completed',
    imageUrl: body.imageUrl,
    imageBase64: body.imageBase64,
    mimeType: body.mimeType,
    filename: body.filename,
    imageSrc,
  }
}

function errorFrom(status: number, body: PendingBody) {
  return new ComfyGenerateError(
    body.message || 'No se pudo generar en Comfy Cloud.',
    status,
    body.error || 'upstream',
  )
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    const err = new Error('AbortError')
    err.name = 'AbortError'
    throw err
  }
}

function wait(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      window.clearTimeout(timer)
      const err = new Error('AbortError')
      err.name = 'AbortError'
      reject(err)
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}
