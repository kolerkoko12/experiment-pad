import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { buildTxt2ImgWorkflow } from '../netlify/functions/comfy-generate.mjs'
import {
  collectWorkflowWarnings,
  formatReport,
  validateComfyWorkflow,
} from '../src/lib/validateComfyWorkflow.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const cli = fileURLToPath(new URL('./validate-comfy-workflow.mjs', import.meta.url))
const okPath = fileURLToPath(
  new URL('./fixtures/workflows/video_minimax_h3_i2v_ok.json', import.meta.url),
)
const brokenPath = fileURLToPath(
  new URL('./fixtures/workflows/video_minimax_h3_i2v_latent_unlinked.json', import.meta.url),
)

const okWorkflow = JSON.parse(readFileSync(okPath, 'utf8'))
const brokenWorkflow = JSON.parse(readFileSync(brokenPath, 'utf8'))

function runCli(args) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    encoding: 'utf8',
  })
}

test('valid MiniMax H3 workflow has no orphan required inputs', () => {
  const report = validateComfyWorkflow(okWorkflow)
  assert.equal(report.format, 'ui')
  assert.equal(report.error, null)
  assert.deepEqual(report.issues, [])
  assert.match(formatReport(report), /No orphan required inputs/)
})

test('disconnected ImageScaleToTotalPixels is reported only with --all', () => {
  const report = validateComfyWorkflow(okWorkflow, { includeDisconnected: true })
  assert.equal(report.issues.length, 1)
  const issue = report.issues[0]
  assert.equal(issue.nodeId, 119)
  assert.equal(issue.nodeType, 'ImageScaleToTotalPixels')
  assert.equal(issue.subgraphName, null)
  assert.equal(issue.inputName, 'image')
  assert.equal(issue.inputType, 'IMAGE')
  assert.equal(issue.suggestions[0].nodeId, 114)
  assert.equal(issue.suggestions[0].nodeType, 'LoadImage')
  assert.equal(
    report.issues.some((item) => item.inputName === 'latent_image' || item.inputName === 'last_frame'),
    false,
  )
})

test('removed latent_image link is flagged and points at MiniMaxH3ImageToVideo', () => {
  const subgraph = brokenWorkflow.definitions.subgraphs[0]
  assert.equal(
    subgraph.links.some((link) => link.id === 188),
    false,
  )
  const sampler = subgraph.nodes.find((node) => node.id === 14)
  assert.equal(sampler.inputs.find((input) => input.name === 'latent_image').link, null)

  const report = validateComfyWorkflow(brokenWorkflow)
  assert.equal(report.issues.length, 1)
  const issue = report.issues[0]
  assert.equal(issue.nodeId, 14)
  assert.equal(issue.nodeType, 'SamplerCustomAdvanced')
  assert.equal(issue.nodeTitle, null)
  assert.equal(issue.subgraphName, 'Image to Video (MiniMax H3)')
  assert.equal(issue.inputName, 'latent_image')
  assert.equal(issue.inputType, 'LATENT')
  assert.equal(issue.inputSlot, 4)
  assert.equal(issue.reason, 'no incoming link')
  assert.equal(issue.suggestions[0].nodeId, 104)
  assert.equal(issue.suggestions[0].nodeType, 'MiniMaxH3ImageToVideo')
  assert.equal(issue.suggestions[0].outputName, 'LATENT')
  assert.equal(issue.suggestions[0].outputSlot, 1)
  assert.equal(issue.suggestions[0].outputType, 'LATENT')
  assert.equal(issue.suggestions[0].hint, 'ImageToVideo')
  assert.match(formatReport(report), /Image to Video \(MiniMax H3\)/)
  assert.match(formatReport(report), /node 104 MiniMaxH3ImageToVideo/)
})

test('latent_image prefers ImageToVideo over EmptyLatent', () => {
  const report = validateComfyWorkflow({
    nodes: [
      source(1, 'EmptyLatentImage', 'LATENT', 'LATENT'),
      {
        id: 2,
        type: 'MiniMaxH3ImageToVideo',
        inputs: [
          { name: 'clip', type: 'CLIP', link: 1 },
          { name: 'vae', type: 'VAE', link: 2 },
        ],
        outputs: [
          { name: 'positive', type: 'CONDITIONING', links: [] },
          { name: 'LATENT', type: 'LATENT', links: [] },
        ],
      },
      source(5, 'CLIPLoader', 'CLIP', 'CLIP', 1),
      source(6, 'VAELoader', 'VAE', 'VAE', 2),
      {
        id: 3,
        type: 'SamplerCustomAdvanced',
        inputs: [
          { name: 'noise', type: 'NOISE', link: 3 },
          { name: 'guider', type: 'GUIDER', link: 4 },
          { name: 'sampler', type: 'SAMPLER', link: 5 },
          { name: 'sigmas', type: 'SIGMAS', link: 6 },
          { name: 'latent_image', type: 'LATENT', link: null },
        ],
        outputs: [{ name: 'output', type: 'LATENT', links: [7] }],
      },
      source(7, 'RandomNoise', 'NOISE', 'NOISE', 3),
      source(8, 'BasicGuider', 'GUIDER', 'GUIDER', 4),
      source(9, 'KSamplerSelect', 'SAMPLER', 'SAMPLER', 5),
      source(10, 'BasicScheduler', 'SIGMAS', 'SIGMAS', 6),
      {
        id: 4,
        type: 'SaveLatent',
        inputs: [{ name: 'samples', type: 'LATENT', link: 7 }],
        outputs: [],
      },
    ],
    links: [
      [1, 5, 0, 2, 0, 'CLIP'],
      [2, 6, 0, 2, 1, 'VAE'],
      [3, 7, 0, 3, 0, 'NOISE'],
      [4, 8, 0, 3, 1, 'GUIDER'],
      [5, 9, 0, 3, 2, 'SAMPLER'],
      [6, 10, 0, 3, 3, 'SIGMAS'],
      [7, 3, 0, 4, 0, 'LATENT'],
    ],
  })
  const latent = report.issues.find((issue) => issue.inputName === 'latent_image')
  assert.ok(latent)
  assert.deepEqual(
    latent.suggestions.map((suggestion) => suggestion.nodeType),
    ['MiniMaxH3ImageToVideo', 'EmptyLatentImage'],
  )
  assert.equal(latent.suggestions[0].hint, 'ImageToVideo')
  assert.equal(latent.suggestions[1].hint, 'EmptyLatent')
})

test('subgraph boundary input counts only when the instance is wired', () => {
  const workflow = boundaryWorkflow(null)
  const report = validateComfyWorkflow(workflow)
  assert.equal(report.issues.length, 1)
  const issue = report.issues[0]
  assert.equal(issue.nodeId, 14)
  assert.equal(issue.nodeType, 'SamplerCustomAdvanced')
  assert.equal(issue.subgraphName, 'New Subgraph')
  assert.equal(issue.instanceNodeId, 10)
  assert.equal(issue.inputName, 'latent_image')
  assert.match(issue.reason, /subgraph input "latent_image"/)
  assert.match(issue.reason, /instance node 10/)

  const wired = boundaryWorkflow(1)
  wired.nodes.unshift(source(9, 'EmptyLatentImage', 'LATENT', 'LATENT', 1))
  wired.links.push([1, 9, 0, 10, 0, 'LATENT'])
  const ok = validateComfyWorkflow(wired)
  assert.deepEqual(ok.issues, [])
})

test('promoted widget is satisfied by the instance value, not the inner default', () => {
  const workflow = {
    nodes: [
      {
        id: 2,
        type: 'sg',
        inputs: [{ name: 'text', type: 'STRING', widget: { name: 'text' }, link: null }],
        outputs: [{ name: 'CONDITIONING', type: 'CONDITIONING', links: [2] }],
        widgets_values_named: {},
      },
      {
        id: 3,
        type: 'SaveImage',
        inputs: [{ name: 'images', type: 'IMAGE', link: 2 }],
        outputs: [],
      },
    ],
    links: [[2, 2, 0, 3, 0, 'IMAGE']],
    definitions: {
      subgraphs: [
        {
          id: 'sg',
          name: 'Prompt Box',
          inputNode: { id: -10 },
          outputNode: { id: -20 },
          inputs: [{ name: 'text', type: 'STRING', linkIds: [5] }],
          outputs: [{ name: 'CONDITIONING', type: 'CONDITIONING', linkIds: [6] }],
          nodes: [
            {
              id: 8,
              type: 'CLIPTextEncode',
              inputs: [
                { name: 'text', type: 'STRING', widget: { name: 'text' }, link: 5 },
                { name: 'clip', type: 'CLIP', link: 7 },
              ],
              outputs: [{ name: 'CONDITIONING', type: 'CONDITIONING', links: [6] }],
              widgets_values_named: { text: 'stale inner default' },
            },
            source(9, 'CLIPLoader', 'CLIP', 'CLIP', 7),
          ],
          links: [
            { id: 5, origin_id: -10, origin_slot: 0, target_id: 8, target_slot: 0, type: 'STRING' },
            { id: 6, origin_id: 8, origin_slot: 0, target_id: -20, target_slot: 0, type: 'CONDITIONING' },
            { id: 7, origin_id: 9, origin_slot: 0, target_id: 8, target_slot: 1, type: 'CLIP' },
          ],
        },
      ],
    },
  }
  const missing = validateComfyWorkflow(workflow)
  assert.equal(missing.issues.length, 1)
  assert.equal(missing.issues[0].nodeId, 8)
  assert.equal(missing.issues[0].inputName, 'text')
  assert.match(missing.issues[0].reason, /instance node 2/)

  workflow.nodes[0].widgets_values_named = { text: 'hello from the instance' }
  assert.deepEqual(validateComfyWorkflow(workflow).issues, [])
})

test('optional hollow-circle sockets and muted nodes are not orphans', () => {
  const report = validateComfyWorkflow({
    nodes: [
      {
        id: 1,
        type: 'CreateVideo',
        inputs: [
          { name: 'images', type: 'IMAGE', link: 1 },
          { name: 'audio', shape: 7, type: 'AUDIO', link: null },
        ],
        outputs: [{ name: 'VIDEO', type: 'VIDEO', links: [2] }],
      },
      source(2, 'VAEDecode', 'IMAGE', 'IMAGE', 1),
      {
        id: 3,
        type: 'SaveVideo',
        inputs: [{ name: 'video', type: 'VIDEO', link: 2 }],
        outputs: [],
      },
      {
        id: 4,
        type: 'SamplerCustomAdvanced',
        mode: 2,
        inputs: [{ name: 'latent_image', type: 'LATENT', link: null }],
        outputs: [{ name: 'output', type: 'LATENT', links: [3] }],
      },
      {
        id: 5,
        type: 'SaveLatent',
        inputs: [{ name: 'samples', type: 'LATENT', link: 3 }],
        outputs: [],
      },
    ],
    links: [
      [1, 2, 0, 1, 0, 'IMAGE'],
      [2, 1, 0, 3, 0, 'VIDEO'],
      [3, 4, 0, 5, 0, 'LATENT'],
    ],
  })
  assert.deepEqual(report.issues, [])
})

test('object_info required wins and optional sockets stay quiet', () => {
  const node = {
    id: 1,
    type: 'CustomEncode',
    inputs: [
      { name: 'pixels', type: 'IMAGE', shape: 7, link: null },
      { name: 'mask', type: 'MASK', link: null },
    ],
    outputs: [{ name: 'LATENT', type: 'LATENT', links: [1] }],
  }
  const graph = {
    nodes: [
      node,
      {
        id: 2,
        type: 'SaveLatent',
        inputs: [{ name: 'samples', type: 'LATENT', link: 1 }],
        outputs: [],
      },
    ],
    links: [[1, 1, 0, 2, 0, 'LATENT']],
  }
  const required = validateComfyWorkflow(graph, {
    objectInfo: {
      CustomEncode: {
        input: { required: { pixels: ['IMAGE'] }, optional: { mask: ['MASK'] } },
        output: ['LATENT'],
        output_name: ['LATENT'],
      },
    },
  })
  assert.equal(required.issues.length, 1)
  assert.equal(required.issues[0].inputName, 'pixels')

  const optional = validateComfyWorkflow(graph, {
    objectInfo: {
      CustomEncode: {
        input: { required: {}, optional: { pixels: ['IMAGE'], mask: ['MASK'] } },
        output: ['LATENT'],
      },
    },
  })
  assert.deepEqual(optional.issues, [])
})

test('API prompt flags a missing latent_image and accepts a link', () => {
  const prompt = {
    4: { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'model.safetensors' } },
    5: { class_type: 'EmptyLatentImage', inputs: { width: 512, height: 512, batch_size: 1 } },
    6: { class_type: 'CLIPTextEncode', inputs: { text: 'a cat', clip: ['4', 1] } },
    7: { class_type: 'CLIPTextEncode', inputs: { text: '', clip: ['4', 1] } },
    3: {
      class_type: 'KSampler',
      inputs: {
        seed: 1,
        steps: 20,
        cfg: 7,
        sampler_name: 'euler',
        scheduler: 'normal',
        denoise: 1,
        model: ['4', 0],
        positive: ['6', 0],
        negative: ['7', 0],
      },
      _meta: { title: 'Sampler' },
    },
    8: { class_type: 'VAEDecode', inputs: { samples: ['3', 0], vae: ['4', 2] } },
    9: { class_type: 'SaveImage', inputs: { filename_prefix: 'x', images: ['8', 0] } },
  }
  const missing = validateComfyWorkflow({ prompt })
  assert.equal(missing.format, 'api')
  const latent = missing.issues.find((issue) => issue.inputName === 'latent_image')
  assert.ok(latent)
  assert.equal(latent.nodeId, '3')
  assert.equal(latent.nodeType, 'KSampler')
  assert.equal(latent.nodeTitle, 'Sampler')
  assert.equal(latent.suggestions[0].nodeType, 'EmptyLatentImage')
  assert.equal(latent.suggestions[0].hint, 'EmptyLatent')

  prompt['3'].inputs.latent_image = ['5', 0]
  assert.deepEqual(validateComfyWorkflow(prompt).issues, [])
})

test('object_info supplies API requirements for an unknown class', () => {
  const prompt = {
    1: { class_type: 'WidgetOnly', inputs: { seed: 4 } },
    2: {
      class_type: 'NeedsLatent',
      inputs: { caption: 'hello' },
    },
    3: { class_type: 'SaveLatent', inputs: { samples: ['2', 0] } },
  }
  const objectInfo = {
    NeedsLatent: {
      input: {
        required: { latent_image: ['LATENT'], caption: ['STRING', { multiline: true }] },
        optional: { mask: ['MASK'] },
      },
      output: ['LATENT'],
      output_name: ['LATENT'],
    },
    WidgetOnly: {
      input: { required: { seed: ['INT', { default: 0 }] } },
      output_node: true,
    },
  }
  const report = validateComfyWorkflow(prompt, { objectInfo })
  assert.deepEqual(
    report.issues.map((issue) => issue.inputName),
    ['latent_image'],
  )
})

test('the app txt2img prompt has no orphan inputs and a broken one warns in Spanish', () => {
  const workflow = buildTxt2ImgWorkflow({
    checkpoint: 'Illustrious-XL-sdxl.safetensors',
    width: 1024,
    height: 1024,
    steps: 28,
    cfg: 6,
    sampler: 'euler',
    scheduler: 'normal',
    prompt: 'a cat',
    negative: '',
    seed: 1,
    loras: [{ name: 'skin.safetensors', strength_model: 0.7, strength_clip: 0.7 }],
  })
  assert.deepEqual(validateComfyWorkflow(workflow).issues, [])
  assert.deepEqual(collectWorkflowWarnings(workflow), [])

  delete workflow['3'].inputs.latent_image
  const warnings = collectWorkflowWarnings(workflow)
  assert.equal(warnings.length, 1)
  assert.match(warnings[0], /Entrada obligatoria sin conexión/)
  assert.match(warnings[0], /latent_image/)
  assert.match(warnings[0], /EmptyLatentImage/)
})

test('CLI exits 0 for the valid workflow and 1 for the unlinked latent', () => {
  const ok = runCli([okPath])
  assert.equal(ok.status, 0, ok.stderr || ok.stdout)
  assert.match(ok.stdout, /No orphan required inputs/)

  const bad = runCli([brokenPath])
  assert.equal(bad.status, 1, bad.stdout)
  assert.match(bad.stdout, /SamplerCustomAdvanced/)
  assert.match(bad.stdout, /latent_image/)
  assert.match(bad.stdout, /MiniMaxH3ImageToVideo/)
  assert.match(bad.stdout, /slot 1/)

  const all = runCli(['--all', okPath])
  assert.equal(all.status, 1)
  assert.match(all.stdout, /ImageScaleToTotalPixels/)

  const usage = runCli([])
  assert.equal(usage.status, 2)

  const garbage = runCli([fileURLToPath(new URL('./validate-comfy-workflow.mjs', import.meta.url))])
  assert.equal(garbage.status, 2)
})

function source(id, type, outputType, outputName, linkId) {
  return {
    id,
    type,
    inputs: [],
    outputs: [{ name: outputName, type: outputType, links: linkId == null ? [] : [linkId] }],
  }
}

function boundaryWorkflow(outerLink) {
  return {
    nodes: [
      {
        id: 10,
        type: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        inputs: [{ name: 'latent_image', type: 'LATENT', link: outerLink }],
        outputs: [{ name: 'LATENT', type: 'LATENT', links: [2] }],
      },
      {
        id: 11,
        type: 'SaveLatent',
        inputs: [{ name: 'samples', type: 'LATENT', link: 2 }],
        outputs: [],
      },
    ],
    links: [[2, 10, 0, 11, 0, 'LATENT']],
    definitions: {
      subgraphs: [
        {
          id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
          name: 'New Subgraph',
          inputNode: { id: -10 },
          outputNode: { id: -20 },
          inputs: [{ id: 'in-latent', name: 'latent_image', type: 'LATENT', linkIds: [5] }],
          outputs: [{ id: 'out-latent', name: 'LATENT', type: 'LATENT', linkIds: [6] }],
          nodes: [
            {
              id: 14,
              type: 'SamplerCustomAdvanced',
              inputs: [{ name: 'latent_image', type: 'LATENT', link: 5 }],
              outputs: [{ name: 'output', type: 'LATENT', links: [6] }],
            },
          ],
          links: [
            {
              id: 5,
              origin_id: -10,
              origin_slot: 0,
              target_id: 14,
              target_slot: 0,
              type: 'LATENT',
            },
            {
              id: 6,
              origin_id: 14,
              origin_slot: 0,
              target_id: -20,
              target_slot: 0,
              type: 'LATENT',
            },
          ],
        },
      ],
    },
  }
}
