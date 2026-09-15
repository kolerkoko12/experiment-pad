/**
 * Comfy Cloud txt2img proxy.
 * API key is read ONLY from env (COMFY_CLOUD_API_KEY). Client body/headers are ignored.
 *
 * LoRA weights are NEVER downloaded to the client. The Function loads files that
 * already exist on Comfy Cloud via LoraLoader (selection metadata only).
 */

const DEFAULT_BASE = 'https://cloud.comfy.org'
const DEFAULT_CHECKPOINT = 'sd_xl_base_1.0.safetensors'
const DEFAULT_WIDTH = 1024
const DEFAULT_HEIGHT = 1024
const DEFAULT_STEPS = 28
const POLL_BUDGET_MS = 10_000
const POLL_INTERVAL_MS = 1_400
const MAX_BASE64_BYTES = 4_500_000
const MAX_LORAS = 3
const OBJECT_INFO_TIMEOUT_MS = 2_500
const LORA_CATALOG_TTL_MS = 60_000

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8',
}

const DONE = new Set(['success', 'completed', 'complete'])
const FAILED = new Set(['error', 'failed', 'cancelled', 'canceled'])

const FAMILY_CHECKPOINTS = {
  illustrious: 'Illustrious-XL-sdxl.safetensors',
  sdxl: 'realvisxlV50_v50Bakedvae.safetensors',
  flux: 'flux1-dev-fp8.safetensors',
}

const FAMILY_ENV_KEYS = {
  illustrious: 'COMFY_CHECKPOINT_ILLUSTRIOUS',
  sdxl: 'COMFY_CHECKPOINT_SDXL',
  flux: 'COMFY_CHECKPOINT_FLUX',
}

const FAMILY_SAMPLING = {
  illustrious: { cfg: 6, sampler: 'euler', scheduler: 'normal' },
  sdxl: { cfg: 5, sampler: 'euler', scheduler: 'normal' },
  flux: { cfg: 3.5, sampler: 'euler', scheduler: 'simple' },
  default: { cfg: 7, sampler: 'euler', scheduler: 'normal' },
}

const SAMPLERS = new Set([
  'euler',
  'euler_ancestral',
  'heun',
  'heunpp2',
  'dpm_2',
  'dpm_2_ancestral',
  'lms',
  'dpm_fast',
  'dpm_adaptive',
  'dpmpp_2s_ancestral',
  'dpmpp_sde',
  'dpmpp_sde_gpu',
  'dpmpp_2m',
  'dpmpp_2m_sde',
  'dpmpp_2m_sde_gpu',
  'dpmpp_3m_sde',
  'ddim',
  'uni_pc',
  'uni_pc_bh2',
  'lcm',
  'deis',
])

const SCHEDULERS = new Set([
  'normal',
  'karras',
  'exponential',
  'sgm_uniform',
  'simple',
  'ddim_uniform',
  'beta',
  'linear_quadratic',
  'kl_optimal',
])

let loraCatalogCache = { at: 0, names: null }

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
      return await pollAndResolve({ baseUrl, apiKey, promptId, extra: {} })
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

    const knownLoras = await getKnownLoraNames(baseUrl, apiKey)
    const plan = planComfyJob(payload, env, knownLoras)
    const workflow = buildTxt2ImgWorkflow(plan)
    const extra = publicPlanMeta(plan)

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
        ...extra,
      })
    }

    const nodeErrors = submitted.data?.node_errors
    if (nodeErrors && Object.keys(nodeErrors).length > 0) {
      return json(502, {
        ok: false,
        error: 'upstream',
        promptId,
        ...extra,
        message: spanishUpstream(
          `El flujo no es válido (checkpoint «${plan.checkpoint}»). Revisa cerebro / COMFY_CHECKPOINT / LoRAs.`,
        ),
      })
    }

    return await pollAndResolve({ baseUrl, apiKey, promptId, extra })
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

/**
 * Map POST body + env to a txt2img plan. Pure (no network).
 * @param {Record<string, unknown>} payload
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} env
 * @param {Set<string> | null} knownLoraNames
 */
export function planComfyJob(payload, env = {}, knownLoraNames = null) {
  const warnings = []
  const brainId = String(payload.brainId ?? payload.brain_id ?? '').trim()
  const familyRaw = String(payload.family ?? '').trim()
  const familyId = resolveFamilyId(brainId, familyRaw)

  const prompt = String(payload.prompt ?? '').trim()
  const negative = String(payload.negative_prompt ?? payload.negative ?? '').trim()
  const width = clampDim(payload.width, DEFAULT_WIDTH)
  const height = clampDim(payload.height, DEFAULT_HEIGHT)
  const steps = clampInt(payload.steps, DEFAULT_STEPS, 1, 80)

  const envForce = sanitizeFilename(env.COMFY_CHECKPOINT)
  const clientCkpt = sanitizeFilename(payload.checkpoint)
  const familyCkpt = familyCheckpoint(familyId, env)

  let checkpoint
  if (envForce) {
    checkpoint = envForce
  } else if (clientCkpt) {
    checkpoint = clientCkpt
  } else if (familyCkpt) {
    checkpoint = familyCkpt
  } else if (brainId || familyRaw) {
    checkpoint = familyCheckpoint('sdxl', env) || FAMILY_CHECKPOINTS.sdxl
    warnings.push(
      `El cerebro «${brainId || familyRaw}» no tiene checkpoint mapeado. Se usa SDXL realista.`,
    )
  } else {
    checkpoint = DEFAULT_CHECKPOINT
  }

  const sampling = FAMILY_SAMPLING[familyId] || FAMILY_SAMPLING.default
  const cfg = clampCfg(payload.cfg ?? payload.guidance, sampling.cfg)
  const sampler = sanitizeChoice(payload.sampler ?? payload.sampler_name, SAMPLERS, sampling.sampler)
  const scheduler = sanitizeChoice(payload.scheduler, SCHEDULERS, sampling.scheduler)

  if (payload.sampler && !SAMPLERS.has(String(payload.sampler))) {
    warnings.push(`Sampler «${payload.sampler}» no es válido. Se usa «${sampler}».`)
  }
  if (payload.scheduler && !SCHEDULERS.has(String(payload.scheduler))) {
    warnings.push(`Scheduler «${payload.scheduler}» no es válido. Se usa «${scheduler}».`)
  }

  const stacked = normalizeLoraStack(payload.loras, knownLoraNames)
  warnings.push(...stacked.warnings)

  if (knownLoraNames === null && Array.isArray(payload.loras) && payload.loras.length > 0) {
    warnings.push(
      'No se pudo comprobar el catálogo de LoRAs en Comfy Cloud. Se envían los nombres tal cual.',
    )
  }

  return {
    prompt,
    negative,
    width,
    height,
    steps,
    checkpoint,
    familyId,
    brainId,
    cfg,
    sampler,
    scheduler,
    loras: stacked.applied,
    warnings,
  }
}

export function resolveFamilyId(brainId, family) {
  const raw = `${brainId || ''} ${family || ''}`.toLowerCase().replace(/[_-]+/g, ' ')
  if (/\billustrious\b/.test(raw) || /\billu\b/.test(raw)) return 'illustrious'
  if (/\bflux\b/.test(raw)) return 'flux'
  if (/\bsdxl\b/.test(raw) || /realvis/.test(raw) || /realista/.test(raw)) return 'sdxl'
  return ''
}

export function familyCheckpoint(familyId, env = {}) {
  if (!familyId) return ''
  const envName = FAMILY_ENV_KEYS[familyId]
  const fromEnv = envName ? sanitizeFilename(env[envName]) : ''
  return fromEnv || FAMILY_CHECKPOINTS[familyId] || ''
}

export function normalizeLoraStack(raw, knownNames = null) {
  const warnings = []
  const applied = []
  const seen = new Set()
  const list = Array.isArray(raw) ? raw : []

  for (const item of list) {
    if (applied.length >= MAX_LORAS) {
      warnings.push('Solo se apilan 3 LoRAs en Comfy Cloud. El resto se omitió.')
      break
    }
    if (!item || typeof item !== 'object') continue
    const name = sanitizeFilename(item.name ?? item.lora_name ?? item.comfyName ?? item.comfyFile)
    if (!name) {
      const hint = String(item.name ?? item.lora_name ?? '').trim()
      if (hint) {
        warnings.push(`Se ignoró «${hint.slice(0, 80)}»: no es un lora_name de Comfy Cloud.`)
      }
      continue
    }
    if (seen.has(name)) continue
    if (knownNames && !knownNames.has(name)) {
      warnings.push(
        `La LoRA «${name}» no está en Comfy Cloud. Se omitió (solo texto / falta en Comfy).`,
      )
      continue
    }
    seen.add(name)
    const strength_model = clampStrength(
      item.strength_model ?? item.weight ?? item.strength,
      0.7,
    )
    const strength_clip = clampStrength(
      item.strength_clip ?? item.strength_model ?? item.weight ?? item.strength,
      strength_model,
    )
    applied.push({ name, strength_model, strength_clip })
  }

  return { applied, warnings }
}

export function buildTxt2ImgWorkflow(plan) {
  const seed = Number.isFinite(Number(plan.seed))
    ? Number(plan.seed)
    : Math.floor(Math.random() * 2 ** 32)
  const loras = Array.isArray(plan.loras) ? plan.loras : []

  const graph = {
    '4': {
      class_type: 'CheckpointLoaderSimple',
      inputs: { ckpt_name: plan.checkpoint },
    },
    '5': {
      class_type: 'EmptyLatentImage',
      inputs: { width: plan.width, height: plan.height, batch_size: 1 },
    },
  }

  let modelRef = ['4', 0]
  let clipRef = ['4', 1]
  loras.forEach((lora, index) => {
    const id = String(10 + index)
    graph[id] = {
      class_type: 'LoraLoader',
      inputs: {
        lora_name: lora.name,
        strength_model: lora.strength_model,
        strength_clip: lora.strength_clip,
        model: modelRef,
        clip: clipRef,
      },
    }
    modelRef = [id, 0]
    clipRef = [id, 1]
  })

  graph['6'] = {
    class_type: 'CLIPTextEncode',
    inputs: { text: plan.prompt, clip: clipRef },
  }
  graph['7'] = {
    class_type: 'CLIPTextEncode',
    inputs: { text: plan.negative || '', clip: clipRef },
  }
  graph['3'] = {
    class_type: 'KSampler',
    inputs: {
      seed,
      steps: plan.steps,
      cfg: plan.cfg,
      sampler_name: plan.sampler,
      scheduler: plan.scheduler,
      denoise: 1,
      model: modelRef,
      positive: ['6', 0],
      negative: ['7', 0],
      latent_image: ['5', 0],
    },
  }
  graph['8'] = {
    class_type: 'VAEDecode',
    inputs: { samples: ['3', 0], vae: ['4', 2] },
  }
  graph['9'] = {
    class_type: 'SaveImage',
    inputs: { filename_prefix: 'control-experimental', images: ['8', 0] },
  }

  return graph
}

export function extractLoraNames(data) {
  const node = data?.LoraLoader ?? data
  const combo = node?.input?.required?.lora_name
  if (!Array.isArray(combo) || combo.length === 0) return null
  const list = Array.isArray(combo[0]) ? combo[0] : combo
  const names = list.filter((item) => typeof item === 'string' && item.trim())
  return names.length > 0 ? new Set(names) : null
}

function publicPlanMeta(plan) {
  return {
    checkpoint: plan.checkpoint,
    family: plan.familyId || undefined,
    brainId: plan.brainId || undefined,
    lorasApplied: plan.loras.map((lora) => lora.name),
    warnings: plan.warnings,
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

async function pollAndResolve({ baseUrl, apiKey, promptId, extra }) {
  const deadline = Date.now() + POLL_BUDGET_MS
  let status = 'pending'
  let errorMessage = ''
  const meta = extra && typeof extra === 'object' ? extra : {}

  while (Date.now() < deadline) {
    const response = await fetch(`${baseUrl}/api/job/${encodeURIComponent(promptId)}/status`, {
      headers: { 'X-API-Key': apiKey, Accept: 'application/json' },
    })
    const mapped = mapComfyHttp(response.status)
    if (mapped) return json(mapped.status, { ...mapped.body, ...meta })

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
        ...meta,
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
        ...meta,
        ...image.payload,
      })
    }

    if (FAILED.has(status)) {
      return json(502, {
        ok: false,
        error: 'job_failed',
        promptId,
        status,
        ...meta,
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
    ...meta,
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

async function getKnownLoraNames(baseUrl, apiKey) {
  if (loraCatalogCache.names && Date.now() - loraCatalogCache.at < LORA_CATALOG_TTL_MS) {
    return loraCatalogCache.names
  }
  const names = await fetchKnownLoraNames(baseUrl, apiKey)
  if (names && names.size > 0) {
    loraCatalogCache = { at: Date.now(), names }
    return names
  }
  return null
}

async function fetchKnownLoraNames(baseUrl, apiKey) {
  const urls = [`${baseUrl}/api/object_info/LoraLoader`, `${baseUrl}/api/object_info`]
  for (const url of urls) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), OBJECT_INFO_TIMEOUT_MS)
    try {
      const response = await fetch(url, {
        headers: { 'X-API-Key': apiKey, Accept: 'application/json' },
        signal: controller.signal,
      })
      if (!response.ok) continue
      const data = await response.json().catch(() => null)
      const names = extractLoraNames(data)
      if (names && names.size > 0) return names
    } catch {
      /* timeout or network — try next */
    } finally {
      clearTimeout(timer)
    }
  }
  return null
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
  if (/lora/i.test(raw) && /not found|missing|does not exist|invalid/i.test(raw)) {
    return 'Comfy Cloud no encontró una LoRA. El iPad no descarga pesos: el archivo tiene que existir en la cuenta.'
  }
  if (/checkpoint|ckpt/i.test(raw)) {
    return 'Comfy Cloud no encontró el checkpoint. Define COMFY_CHECKPOINT o elige un cerebro mapeado (Illustrious / SDXL / FLUX).'
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

function sanitizeFilename(value) {
  const name = String(value ?? '').trim()
  if (!name) return ''
  if (name.length > 180) return ''
  if (/[\\/]/.test(name) || name.includes('..') || /https?:/i.test(name) || name.includes(':')) {
    return ''
  }
  return name
}

function sanitizeChoice(value, allowed, fallback) {
  const name = String(value ?? '').trim()
  if (allowed.has(name)) return name
  return fallback
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

function clampCfg(value, fallback) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(30, Math.max(0.1, n))
}

function clampStrength(value, fallback) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(2, Math.max(-2, n))
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
