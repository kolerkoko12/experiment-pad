#!/usr/bin/env node
import {
  buildTxt2ImgWorkflow,
  extractLoraNames,
  handleComfyGenerate,
  normalizeLoraStack,
  planComfyJob,
  resolveFamilyId,
} from '../netlify/functions/comfy-generate.mjs'

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

function parse(result) {
  return { status: result.statusCode, body: result.body ? JSON.parse(result.body) : {} }
}

const noKey = parse(
  await handleComfyGenerate({
    method: 'POST',
    body: JSON.stringify({ prompt: 'a cat', api_key: 'should-be-ignored', apiKey: 'nope' }),
    env: { COMFY_CLOUD_API_KEY: '', COMFY_BASE_URL: 'https://example.invalid' },
  }),
)
assert(noKey.status === 503, `expected 503 missing key, got ${noKey.status}`)
assert(noKey.body.error === 'missing_key', `expected missing_key, got ${noKey.body.error}`)
assert(/COMFY_CLOUD_API_KEY/.test(noKey.body.message), '503 should mention env key')
assert(/Drop/.test(noKey.body.message), '503 should mention Drop vs git deploy')

const emptyPrompt = parse(
  await handleComfyGenerate({
    method: 'POST',
    body: JSON.stringify({ prompt: '   ', api_key: 'client-secret' }),
    env: { COMFY_CLOUD_API_KEY: 'dummy-not-used-for-empty-prompt' },
  }),
)
assert(emptyPrompt.status === 400, `expected 400 empty prompt, got ${emptyPrompt.status}`)
assert(emptyPrompt.body.error === 'bad_request', 'empty prompt should be bad_request')

const missingId = parse(
  await handleComfyGenerate({
    method: 'GET',
    query: {},
    env: { COMFY_CLOUD_API_KEY: 'dummy-not-used' },
  }),
)
assert(missingId.status === 400, `expected 400 missing promptId, got ${missingId.status}`)
assert(missingId.body.error === 'bad_request', 'GET without promptId should be bad_request')

const options = parse(
  await handleComfyGenerate({
    method: 'OPTIONS',
    env: {},
  }),
)
assert(options.status === 204, `expected 204 OPTIONS, got ${options.status}`)

assert(resolveFamilyId('illustrious', '') === 'illustrious', 'brain illustrious')
assert(resolveFamilyId('', 'SDXL realista') === 'sdxl', 'family sdxl realista')
assert(resolveFamilyId('flux', 'FLUX.1') === 'flux', 'brain flux')

const illustrious = planComfyJob({ prompt: 'a cat', brainId: 'illustrious' }, {})
assert(
  illustrious.checkpoint === 'Illustrious-XL-sdxl.safetensors',
  `illustrious ckpt, got ${illustrious.checkpoint}`,
)
assert(illustrious.sampler === 'euler', 'illustrious sampler')
assert(illustrious.cfg === 6, `illustrious cfg, got ${illustrious.cfg}`)

const sdxl = planComfyJob({ prompt: 'a cat', brainId: 'sdxl', family: 'SDXL realista' }, {})
assert(
  sdxl.checkpoint === 'realvisxlV50_v50Bakedvae.safetensors',
  `sdxl ckpt, got ${sdxl.checkpoint}`,
)
assert(sdxl.cfg === 5, `sdxl cfg, got ${sdxl.cfg}`)

const flux = planComfyJob({ prompt: 'a cat', brainId: 'flux' }, {})
assert(flux.checkpoint === 'flux1-dev-fp8.safetensors', `flux ckpt, got ${flux.checkpoint}`)
assert(flux.cfg === 3.5, `flux cfg, got ${flux.cfg}`)
assert(flux.sampler === 'euler', 'flux sampler')
assert(flux.scheduler === 'simple', `flux scheduler, got ${flux.scheduler}`)

const forced = planComfyJob(
  { prompt: 'a cat', brainId: 'illustrious', checkpoint: 'client-ignored-if-env.safetensors' },
  { COMFY_CHECKPOINT: 'forced.safetensors' },
)
assert(forced.checkpoint === 'forced.safetensors', 'COMFY_CHECKPOINT force override')

const clientCkpt = planComfyJob(
  { prompt: 'a cat', brainId: 'sdxl', checkpoint: 'wai-illustrious-sdxl.safetensors' },
  {},
)
assert(clientCkpt.checkpoint === 'wai-illustrious-sdxl.safetensors', 'client checkpoint when no env force')

const legacy = planComfyJob({ prompt: 'a cat' }, {})
assert(legacy.checkpoint === 'sd_xl_base_1.0.safetensors', 'legacy default checkpoint')

const video = planComfyJob({ prompt: 'a cat', brainId: 'ltx' }, {})
assert(video.checkpoint === 'realvisxlV50_v50Bakedvae.safetensors', 'unmapped brain falls back to SDXL')
assert(video.warnings.some((w) => /no tiene checkpoint mapeado/.test(w)), 'unmapped brain warns in Spanish')

const known = new Set([
  'illustrious-realistic_skin_texture_style.safetensors',
  'sdxl-realistic_skin_texture_style_xl_detailed_skin_flux1d_illu.safetensors',
])
const stacked = planComfyJob(
  {
    prompt: 'portrait',
    brainId: 'illustrious',
    cfg: 5.5,
    sampler: 'euler_ancestral',
    scheduler: 'karras',
    loras: [
      { name: 'illustrious-realistic_skin_texture_style.safetensors', strength_model: 0.6 },
      { name: 'missing-on-cloud.safetensors', strength_model: 0.8 },
      { name: 'https://evil.example/steal.safetensors' },
      { name: '../weights/ohwx.safetensors' },
    ],
  },
  {},
  known,
)
assert(stacked.loras.length === 1, `expected 1 applied LoRA, got ${stacked.loras.length}`)
assert(
  stacked.loras[0].name === 'illustrious-realistic_skin_texture_style.safetensors',
  'applied exact Cloud lora_name',
)
assert(stacked.loras[0].strength_model === 0.6, 'strength_model from payload')
assert(
  stacked.warnings.some((w) => /missing-on-cloud/.test(w) && /falta en Comfy/.test(w)),
  'missing LoRA Spanish warning',
)
assert(
  stacked.warnings.some((w) => /https:\/\/evil/.test(w) || /no es un lora_name/.test(w)),
  'URL LoRA rejected',
)

const skipUnknown = normalizeLoraStack(
  [{ name: 'casca.safetensors' }, { name: 'ohwx.safetensors' }],
  known,
)
assert(skipUnknown.applied.length === 0, 'unknown names are not applied')
assert(skipUnknown.warnings.length >= 2, 'each missing LoRA warns')

const capped = normalizeLoraStack(
  [
    { name: 'a.safetensors' },
    { name: 'b.safetensors' },
    { name: 'c.safetensors' },
    { name: 'd.safetensors' },
  ],
  null,
)
assert(capped.applied.length === 3, 'stack cap 3')
assert(capped.warnings.some((w) => /3 LoRAs/.test(w)), 'cap warning')

const wf = buildTxt2ImgWorkflow(stacked)
assert(wf['4'].class_type === 'CheckpointLoaderSimple', 'checkpoint loader')
assert(wf['4'].inputs.ckpt_name === 'Illustrious-XL-sdxl.safetensors', 'workflow checkpoint')
assert(wf['10'].class_type === 'LoraLoader', 'LoraLoader inserted')
assert(wf['10'].inputs.lora_name === 'illustrious-realistic_skin_texture_style.safetensors')
assert(wf['10'].inputs.model[0] === '4', 'first LoRA reads checkpoint model')
assert(wf['6'].inputs.clip[0] === '10', 'CLIP encode uses LoRA clip')
assert(wf['3'].inputs.model[0] === '10', 'KSampler uses LoRA model')
assert(wf['3'].inputs.cfg === 5.5, 'cfg from payload')
assert(wf['3'].inputs.sampler_name === 'euler_ancestral', 'sampler from payload')
assert(wf['8'].inputs.vae[0] === '4', 'VAE still from checkpoint')

const two = planComfyJob(
  {
    prompt: 'skin',
    brainId: 'sdxl',
    loras: [
      { name: 'sdxl-realistic_skin_texture_style_xl_detailed_skin_flux1d_illu.safetensors' },
      { name: 'illustrious-realistic_skin_texture_style.safetensors', strength_clip: 0.4 },
    ],
  },
  {},
  known,
)
const wf2 = buildTxt2ImgWorkflow(two)
assert(wf2['11'].class_type === 'LoraLoader', 'second LoraLoader')
assert(wf2['11'].inputs.model[0] === '10', 'LoRAs chain')
assert(wf2['3'].inputs.model[0] === '11', 'sampler after stack')

const extracted = extractLoraNames({
  LoraLoader: {
    input: {
      required: {
        lora_name: [['illustrious-realistic_skin_texture_style.safetensors', 'other.safetensors'], {}],
      },
    },
  },
})
assert(extracted.has('illustrious-realistic_skin_texture_style.safetensors'), 'object_info parse')

const { readFileSync } = await import('node:fs')
const catalog = JSON.parse(readFileSync(new URL('../data/loras.json', import.meta.url), 'utf8'))
const skin = catalog.loras.find((lora) => lora.id === 'skin-microdetail')
assert(skin, 'skin-microdetail exists')
assert(skin.placeholder === false, 'skin is mapped, not a placeholder')
assert(
  skin.comfyByBrain.illustrious === 'illustrious-realistic_skin_texture_style.safetensors',
  'illustrious skin file',
)
assert(
  skin.comfyByBrain.sdxl === 'sdxl-realistic_skin_texture_style_xl_detailed_skin_flux1d_illu.safetensors',
  'sdxl skin file',
)
assert(
  skin.comfyByBrain.flux === 'flux1-realistic_skin_texture_style_xl_detailed_skin_flux1d_illu.safetensors',
  'flux skin file',
)
for (const lora of catalog.loras) {
  const names = [
    lora.comfyName,
    lora.comfyFile,
    ...Object.values(lora.comfyByBrain || {}),
  ].filter(Boolean)
  for (const name of names) {
    assert(!/^https?:/i.test(name), `${lora.id} must not store a download URL`)
    assert(!/[\\/]/.test(name), `${lora.id} must be a Cloud filename, not a path`)
  }
}

const fluxGraph = buildTxt2ImgWorkflow(flux)
assert(fluxGraph['3'].inputs.cfg === 3.5, 'FLUX default cfg')
assert(fluxGraph['3'].inputs.scheduler === 'simple', 'FLUX default scheduler')
assert(!fluxGraph['10'], 'FLUX without LoRAs has no LoraLoader')

console.log('comfy-generate smoke: ok')
