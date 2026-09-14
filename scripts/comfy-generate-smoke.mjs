#!/usr/bin/env node
import { handleComfyGenerate } from '../netlify/functions/comfy-generate.mjs'

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

console.log('comfy-generate smoke: ok')
