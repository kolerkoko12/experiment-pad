/**
 * Comfy Cloud txt2img proxy.
 * API key is read ONLY from env (COMFY_CLOUD_API_KEY). Client body/headers are ignored.
 */

const DEFAULT_BASE = 'https://cloud.comfy.org'
const DEFAULT_CHECKPOINT = 'sd_xl_base_1.0.safetensors'
const DEFAULT_WIDTH = 1024
const DEFAULT_HEIGHT = 1024
const DEFAULT_STEPS = 28
const POLL_BUDGET_MS = 10_000
const POLL_INTERVAL_MS = 1_400
const MAX_BASE64_BYTES = 4_500_000

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8',
}

const DONE = new Set(['success', 'completed', 'complete'])
const FAILED = new Set(['error', 'failed', 'cancelled', 'canceled'])

/**
 * Core handler used by Netlify, Vite dev middleware, and smoke tests.
 * @param {{ method: string, query?: Record<string, string | undefined>, body?: string | null, env?: NodeJS.ProcessEnv }} event
 */
export async function handleComfyGenerate(event) {
  const method = (event.method || 'GET').toUpperCase()
  const env = event.env || process.env
  const query = event.query || {}

  if (method === 'OPTIONS') {
    return json(204, { ok: true })
  }

  if (method !== 'GET' && method !== 'POST') {
    return json(405, {
      ok: false,
      error: 'method_not_allowed',
      message: 'Usa GET o POST en /.netlify/functions/comfy-generate.',
    })
  }

  const apiKey = String(env.COMFY_CLOUD_API_KEY || '').trim()
  if (!apiKey) {
    return json(503, {
      ok: false,
      error: 'missing_key',
      message:
        'Falta la clave de Comfy Cloud en el servidor (COMFY_CLOUD_API_KEY). Un Drop estático no sirve: publica con git conectado a Netlify o `netlify deploy --build`.',
    })
  }

  const baseUrl = normalizeBase(env.COMFY_BASE_URL || DEFAULT_BASE)

  try {
    if (method === 'GET') {
      const promptId = String(query.promptId || query.prompt_id || '').trim()
      if (!promptId) {
        return json(400, {
          ok: false,
          error: 'bad_request',
          message: 'Falta promptId para seguir la generación.',
        })
      }
      return await pollAndResolve({ baseUrl, apiKey, promptId, env })
    }

    const parsed = parseJsonBody(event.body)
    if (!parsed.ok) return parsed.response

    const payload = parsed.value
    const prompt = String(payload.prompt ?? '').trim()
    if (!prompt) {
      return json(400, {
        ok: false,
        error: 'bad_request',
        message: 'El prompt está vacío. Experimenta o escribe algo en Prompt Final.',
      })
    }

    const width = clampDim(payload.width, DEFAULT_WIDTH)
    const height = clampDim(payload.height, DEFAULT_HEIGHT)
    const steps = clampInt(payload.steps, DEFAULT_STEPS, 1, 80)
    const negative = String(payload.negative_prompt ?? '').trim()
    const checkpoint = String(env.COMFY_CHECKPOINT || '').trim() || DEFAULT_CHECKPOINT

    const workflow = buildTxt2ImgWorkflow({
      prompt,
      negative,
      width,
      height,
      steps,
      checkpoint,
    })

    const submitted = await comfyFetch(`${baseUrl}/api/prompt`, apiKey, {
      method: 'POST',
      body: JSON.stringify({ prompt: workflow }),
    })
    if (!submitted.ok) return submitted.response

    const promptId =
      submitted.data?.prompt_id || submitted.data?.promptId || submitted.data?.id
    if (!promptId) {
      return json(502, {
        ok: false,
        error: 'upstream',
        message: 'Comfy Cloud aceptó el envío pero no devolvió promptId.',
      })
    }

    const nodeErrors = submitted.data?.node_errors
    if (nodeErrors && Object.keys(nodeErrors).length > 0) {
      return json(502, {
        ok: false,
        error: 'upstream',
        promptId,
        message: spanishUpstream(
          `El flujo no es válido (checkpoint «${checkpoint}»). Revisa COMFY_CHECKPOINT.`,
        ),
      })
    }

    return await pollAndResolve({ baseUrl, apiKey, promptId, env })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return json(502, {
      ok: false,
      error: 'upstream',
      message: `No se pudo hablar con Comfy Cloud. ${message}`,
    })
  }
}

export async function handler(event) {
  let body = event.body
  if (event.isBase64Encoded && body) {
    body = Buffer.from(body, 'base64').toString('utf8')
  }
  const query = event.queryStringParameters || {}
  const result = await handleComfyGenerate({
    method: event.httpMethod || event.method || 'GET',
    query: {
      promptId: query.promptId || query.prompt_id,
      prompt_id: query.prompt_id || query.promptId,
    },
    body,
    env: process.env,
  })
  return {
    statusCode: result.statusCode,
    headers: result.headers,
    body: result.body,
  }
}

function parseJsonBody(raw) {
  if (raw == null || raw === '') {
    return {
      ok: false,
      response: json(400, {
        ok: false,
        error: 'bad_request',
        message: 'El cuerpo JSON está vacío. Hace falta un prompt.',
      }),
    }
  }
  try {
    const value = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {
        ok: false,
        response: json(400, {
          ok: false,
          error: 'bad_request',
          message: 'El cuerpo debe ser un objeto JSON con prompt.',
        }),
      }
    }
    return { ok: true, value }
  } catch {
    return {
      ok: false,
      response: json(400, {
        ok: false,
        error: 'bad_request',
        message: 'JSON inválido en el cuerpo de la petición.',
      }),
    }
  }
}

async function pollAndResolve({ baseUrl, apiKey, promptId }) {
  const deadline = Date.now() + POLL_BUDGET_MS
  let status = 'pending'
  let errorMessage = ''

  while (Date.now() < deadline) {
    const response = await fetch(`${baseUrl}/api/job/${encodeURIComponent(promptId)}/status`, {
      headers: { 'X-API-Key': apiKey, Accept: 'application/json' },
    })
    const mapped = mapComfyHttp(response.status)
    if (mapped) return json(mapped.status, mapped.body)

    if (response.status === 404) {
      await sleep(POLL_INTERVAL_MS)
      continue
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      return json(502, {
        ok: false,
        error: 'upstream',
        promptId,
        message: spanishUpstream(text) || `Comfy Cloud respondió ${response.status} al consultar el job.`,
      })
    }

    const data = await response.json().catch(() => ({}))
    status = String(data?.status || 'pending').toLowerCase()
    errorMessage = String(data?.error_message || data?.error || '')

    if (DONE.has(status)) {
      const image = await resolveImage({ baseUrl, apiKey, promptId })
      if (!image.ok) return image.response
      return json(200, {
        ok: true,
        promptId,
        status: 'completed',
        ...image.payload,
      })
    }

    if (FAILED.has(status)) {
      return json(502, {
        ok: false,
        error: 'job_failed',
        promptId,
        status,
        message: errorMessage
          ? `La generación falló en Comfy Cloud: ${errorMessage}`
          : 'La generación falló en Comfy Cloud.',
      })
    }

    await sleep(POLL_INTERVAL_MS)
  }

  return json(202, {
    ok: true,
    pending: true,
    promptId,
    status,
    message: 'Sigue en cola o generando. Vuelve a consultar con promptId.',
  })
}

async function resolveImage({ baseUrl, apiKey, promptId }) {
  const outputs = await fetchOutputs(baseUrl, apiKey, promptId)
  const file = firstImage(outputs)
  if (!file) {
    return {
      ok: false,
      response: json(502, {
        ok: false,
        error: 'no_image',
        promptId,
        message: 'El trabajo terminó pero Comfy Cloud no devolvió ninguna imagen.',
      }),
    }
  }

  const params = new URLSearchParams({
    filename: file.filename,
    subfolder: file.subfolder || '',
    type: file.type || 'output',
  })
  const viewUrl = `${baseUrl}/api/view?${params.toString()}`

  const viewed = await fetch(viewUrl, {
    headers: { 'X-API-Key': apiKey },
    redirect: 'manual',
  })

  const mapped = mapComfyHttp(viewed.status)
  if (mapped) {
    return { ok: false, response: json(mapped.status, mapped.body) }
  }

  const location = viewed.headers.get('location')
  if (location && viewed.status >= 300 && viewed.status < 400) {
    const imageUrl = new URL(location, viewUrl).toString()
    return { ok: true, payload: { imageUrl, filename: file.filename } }
  }

  if (!viewed.ok) {
    return {
      ok: false,
      response: json(502, {
        ok: false,
        error: 'upstream',
        promptId,
        message: `No se pudo bajar la imagen (${viewed.status}).`,
      }),
    }
  }

  const mime = viewed.headers.get('content-type') || guessMime(file.filename)
  const buf = Buffer.from(await viewed.arrayBuffer())
  if (buf.byteLength > MAX_BASE64_BYTES) {
    return {
      ok: false,
      response: json(502, {
        ok: false,
        error: 'too_large',
        promptId,
        message: 'La imagen es demasiado grande para devolverla por la Function.',
      }),
    }
  }

  return {
    ok: true,
    payload: {
      imageBase64: buf.toString('base64'),
      mimeType: mime,
      filename: file.filename,
    },
  }
}

async function fetchOutputs(baseUrl, apiKey, promptId) {
  const jobs = await comfyFetch(`${baseUrl}/api/jobs/${encodeURIComponent(promptId)}`, apiKey)
  if (jobs.ok && jobs.data) {
    if (jobs.data.outputs) return jobs.data.outputs
    if (jobs.data.preview_output) return { preview: { images: [jobs.data.preview_output] } }
  }

  const history = await comfyFetch(
    `${baseUrl}/api/history/${encodeURIComponent(promptId)}`,
    apiKey,
  )
  if (history.ok && history.data) {
    const entry = history.data[promptId] || history.data
    if (entry?.outputs) return entry.outputs
  }

  const historyV2 = await comfyFetch(
    `${baseUrl}/api/history_v2/${encodeURIComponent(promptId)}`,
    apiKey,
  )
  if (historyV2.ok && historyV2.data) {
    const entry = historyV2.data[promptId] || historyV2.data
    if (entry?.outputs) return entry.outputs
  }

  return {}
}

function firstImage(outputs) {
  if (!outputs || typeof outputs !== 'object') return null
  for (const node of Object.values(outputs)) {
    if (!node || typeof node !== 'object') continue
    const images = node.images || node.gifs || []
    for (const item of images) {
      const filename = item?.filename || item?.display_name
      if (filename) {
        return {
          filename,
          subfolder: item.subfolder || '',
          type: item.type || 'output',
        }
      }
    }
  }
  return null
}

function buildTxt2ImgWorkflow({ prompt, negative, width, height, steps, checkpoint }) {
  const seed = Math.floor(Math.random() * 2 ** 32)
  return {
    '4': {
      class_type: 'CheckpointLoaderSimple',
      inputs: { ckpt_name: checkpoint },
    },
    '5': {
      class_type: 'EmptyLatentImage',
      inputs: { width, height, batch_size: 1 },
    },
    '6': {
      class_type: 'CLIPTextEncode',
      inputs: { text: prompt, clip: ['4', 1] },
    },
    '7': {
      class_type: 'CLIPTextEncode',
      inputs: { text: negative, clip: ['4', 1] },
    },
    '3': {
      class_type: 'KSampler',
      inputs: {
        seed,
        steps,
        cfg: 7,
        sampler_name: 'euler',
        scheduler: 'normal',
        denoise: 1,
        model: ['4', 0],
        positive: ['6', 0],
        negative: ['7', 0],
        latent_image: ['5', 0],
      },
    },
    '8': {
      class_type: 'VAEDecode',
      inputs: { samples: ['3', 0], vae: ['4', 2] },
    },
    '9': {
      class_type: 'SaveImage',
      inputs: { filename_prefix: 'control-experimental', images: ['8', 0] },
    },
  }
}

async function comfyFetch(url, apiKey, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      'X-API-Key': apiKey,
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers || {}),
    },
  })

  const mapped = mapComfyHttp(response.status)
  if (mapped) {
    return { ok: false, response: json(mapped.status, mapped.body) }
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    return {
      ok: false,
      response: json(502, {
        ok: false,
        error: 'upstream',
        message: spanishUpstream(text) || `Comfy Cloud respondió ${response.status}.`,
      }),
    }
  }

  const data = await response.json().catch(() => ({}))
  return { ok: true, data }
}

function mapComfyHttp(status) {
  if (status === 401) {
    return {
      status: 401,
      body: {
        ok: false,
        error: 'unauthorized',
        message: 'La clave de Comfy Cloud no es válida (401). Revisa COMFY_CLOUD_API_KEY en Netlify.',
      },
    }
  }
  if (status === 402) {
    return {
      status: 402,
      body: {
        ok: false,
        error: 'payment_required',
        message: 'No hay créditos suficientes en Comfy Cloud (402).',
      },
    }
  }
  if (status === 429) {
    return {
      status: 429,
      body: {
        ok: false,
        error: 'rate_limited',
        message: 'Límite o suscripción inactiva en Comfy Cloud (429).',
      },
    }
  }
  return null
}

function spanishUpstream(text) {
  const raw = String(text || '').slice(0, 280)
  if (!raw) return ''
  if (/checkpoint|ckpt/i.test(raw)) {
    return 'Comfy Cloud no encontró el checkpoint. Define COMFY_CHECKPOINT con un archivo que exista en tu cuenta.'
  }
  return raw
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: CORS,
    body: statusCode === 204 ? '' : JSON.stringify(body),
  }
}

function normalizeBase(url) {
  return String(url || DEFAULT_BASE).trim().replace(/\/+$/, '') || DEFAULT_BASE
}

function clampDim(value, fallback) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  const rounded = Math.round(n / 8) * 8
  return Math.min(2048, Math.max(64, rounded))
}

function clampInt(value, fallback, min, max) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.round(n)))
}

function guessMime(filename) {
  const lower = String(filename || '').toLowerCase()
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.webp')) return 'image/webp'
  return 'image/png'
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
