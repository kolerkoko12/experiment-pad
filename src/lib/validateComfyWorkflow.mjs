/**
 * Find ComfyUI nodes whose required inputs have no incoming link.
 *
 * UI / litegraph workflows (`nodes` + `links`, including `definitions.subgraphs`)
 * and API prompts (`{ [id]: { class_type, inputs } }`) are both accepted.
 * `objectInfo` is the optional `/object_info` map (class name → node def).
 *
 * A socket counts as required when it has a slot type and is not backed by a
 * widget value. `shape: 7` (LiteGraph hollow circle) marks an optional socket.
 * When `objectInfo` is passed, its required/optional lists win.
 *
 * A link that comes from a subgraph input node (id -10) is connected only when
 * the outer instance has that slot linked or holds a widget value. Local
 * defaults inside the subgraph do not satisfy a promoted input.
 *
 * Nodes that cannot reach an output (Save/Preview nodes, or output_node) are
 * skipped unless the graph has no outputs or `includeDisconnected` is set.
 * Muted (mode 2) and bypassed (mode 4) nodes are not checked.
 */

const SUBGRAPH_INPUT_ID = -10
const SUBGRAPH_OUTPUT_ID = -20
const OPTIONAL_SHAPE = 7
const MODE_NEVER = 2
const MODE_BYPASS = 4
const MAX_SUGGESTIONS = 5

const WIDGET_TYPES = new Set(['INT', 'FLOAT', 'STRING', 'BOOLEAN', 'COMBO'])

/** Sockets that are required on common nodes when object_info is absent. */
const KNOWN_REQUIRED_SOCKETS = {
  KSampler: [
    ['model', 'MODEL'],
    ['positive', 'CONDITIONING'],
    ['negative', 'CONDITIONING'],
    ['latent_image', 'LATENT'],
  ],
  SamplerCustomAdvanced: [
    ['noise', 'NOISE'],
    ['guider', 'GUIDER'],
    ['sampler', 'SAMPLER'],
    ['sigmas', 'SIGMAS'],
    ['latent_image', 'LATENT'],
  ],
  CLIPTextEncode: [['clip', 'CLIP']],
  VAEDecode: [
    ['samples', 'LATENT'],
    ['vae', 'VAE'],
  ],
  VAEDecodeAudio: [
    ['samples', 'LATENT'],
    ['vae', 'VAE'],
  ],
  VAEEncode: [
    ['pixels', 'IMAGE'],
    ['vae', 'VAE'],
  ],
  LoraLoader: [
    ['model', 'MODEL'],
    ['clip', 'CLIP'],
  ],
  LoraLoaderModelOnly: [['model', 'MODEL']],
  BasicGuider: [
    ['model', 'MODEL'],
    ['conditioning', 'CONDITIONING'],
  ],
  BasicScheduler: [['model', 'MODEL']],
  SaveImage: [['images', 'IMAGE']],
  SaveVideo: [['video', 'VIDEO']],
  CreateVideo: [['images', 'IMAGE']],
  MiniMaxH3ImageToVideo: [
    ['clip', 'CLIP'],
    ['vae', 'VAE'],
  ],
  LoadImage: [],
  CheckpointLoaderSimple: [],
  EmptyLatentImage: [],
  UNETLoader: [],
  CLIPLoader: [],
  VAELoader: [],
}

const KNOWN_OUTPUTS = {
  CheckpointLoaderSimple: [
    ['MODEL', 'MODEL'],
    ['CLIP', 'CLIP'],
    ['VAE', 'VAE'],
  ],
  EmptyLatentImage: [['LATENT', 'LATENT']],
  CLIPTextEncode: [['CONDITIONING', 'CONDITIONING']],
  KSampler: [['LATENT', 'LATENT']],
  LoraLoader: [
    ['MODEL', 'MODEL'],
    ['CLIP', 'CLIP'],
  ],
  LoraLoaderModelOnly: [['MODEL', 'MODEL']],
  VAEDecode: [['IMAGE', 'IMAGE']],
  VAEEncode: [['LATENT', 'LATENT']],
  SamplerCustomAdvanced: [
    ['output', 'LATENT'],
    ['denoised_output', 'LATENT'],
  ],
  MiniMaxH3ImageToVideo: [
    ['positive', 'CONDITIONING'],
    ['LATENT', 'LATENT'],
  ],
  UNETLoader: [['MODEL', 'MODEL']],
  CLIPLoader: [['CLIP', 'CLIP']],
  VAELoader: [['VAE', 'VAE']],
  RandomNoise: [['NOISE', 'NOISE']],
  KSamplerSelect: [['SAMPLER', 'SAMPLER']],
  BasicScheduler: [['SIGMAS', 'SIGMAS']],
  BasicGuider: [['GUIDER', 'GUIDER']],
  LoadImage: [
    ['IMAGE', 'IMAGE'],
    ['MASK', 'MASK'],
  ],
  CreateVideo: [['VIDEO', 'VIDEO']],
}

/**
 * Ranked name/type hints. Earlier patterns win, so latent_image prefers
 * *ImageToVideo over EmptyLatent*, VAEEncode*, then anything *Latent*.
 */
const INPUT_HINTS = [
  {
    test: (name) => /latent[_\s-]?image|^latent$|^samples$/i.test(name),
    patterns: [
      ['ImageToVideo', /ImageToVideo/i],
      ['EmptyLatent', /EmptyLatent/i],
      ['VAEEncode', /VAEEncode/i],
      ['Latent', /Latent/i],
    ],
  },
  {
    test: (name) => /^(images|image|pixels)$/i.test(name),
    patterns: [
      ['LoadImage', /LoadImage/i],
      ['VAEDecode', /VAEDecode/i],
      ['Image', /Image/i],
    ],
  },
  {
    test: (name) => name === 'model',
    patterns: [
      ['CheckpointLoader', /CheckpointLoader/i],
      ['UNETLoader', /UNETLoader/i],
      ['LoraLoader', /LoraLoader/i],
      ['Model', /Model/i],
    ],
  },
  {
    test: (name) => name === 'clip',
    patterns: [
      ['CLIPLoader', /CLIPLoader|DualCLIP/i],
      ['CheckpointLoader', /CheckpointLoader/i],
    ],
  },
  {
    test: (name) => name === 'vae',
    patterns: [
      ['VAELoader', /VAELoader/i],
      ['CheckpointLoader', /CheckpointLoader/i],
    ],
  },
  {
    test: (name) => /conditioning|^positive$|^negative$/i.test(name),
    patterns: [
      ['CLIPTextEncode', /CLIPTextEncode/i],
      ['Conditioning', /Conditioning/i],
    ],
  },
  {
    test: (name) => name === 'noise',
    patterns: [['RandomNoise', /RandomNoise|Noise/i]],
  },
  {
    test: (name) => name === 'guider',
    patterns: [['Guider', /Guider/i]],
  },
  {
    test: (name) => name === 'sampler',
    patterns: [['KSamplerSelect', /KSamplerSelect|Sampler/i]],
  },
  {
    test: (name) => name === 'sigmas',
    patterns: [['Scheduler', /Scheduler/i]],
  },
  {
    test: (name) => name === 'video',
    patterns: [['CreateVideo', /CreateVideo|SaveVideo|Video/i]],
  },
]

/**
 * @param {unknown} workflow
 * @param {{ objectInfo?: Record<string, unknown> | null, includeDisconnected?: boolean }} [options]
 */
export function validateComfyWorkflow(workflow, options = {}) {
  const objectInfo = options.objectInfo ?? null
  const includeDisconnected = options.includeDisconnected === true
  let data = workflow
  if (typeof workflow === 'string') {
    try {
      data = JSON.parse(workflow)
    } catch {
      return emptyReport('unknown', 'Invalid JSON.')
    }
  }
  const detected = detectWorkflow(data)
  if (detected.format === 'ui') {
    return {
      format: 'ui',
      issues: validateUi(detected.data, objectInfo, includeDisconnected),
      error: null,
    }
  }
  if (detected.format === 'api') {
    return {
      format: 'api',
      issues: validateApi(detected.data, objectInfo, includeDisconnected),
      error: null,
    }
  }
  return emptyReport(
    'unknown',
    'Unrecognized ComfyUI workflow JSON (expected UI nodes/links or an API prompt).',
  )
}

/** Spanish, non-blocking warnings for the Comfy Cloud submit path. */
export function collectWorkflowWarnings(workflow, options) {
  const report = validateComfyWorkflow(workflow, options)
  if (report.error) return []
  return report.issues.map(formatIssueWarning)
}

export function formatReport(report, filePath = '') {
  const prefix = filePath ? `${filePath}\n` : ''
  if (report.error) return `${prefix}${report.error}`
  const label = report.format === 'ui' ? 'UI' : report.format === 'api' ? 'API' : report.format
  const count = report.issues.length
  const noun = count === 1 ? 'orphan required input' : 'orphan required inputs'
  const lines = [`${prefix}${label} workflow: ${count} ${noun}.`]
  if (count === 0) {
    lines.push('No orphan required inputs.')
    return lines.join('\n')
  }
  report.issues.forEach((issue, index) => {
    lines.push('')
    lines.push(`[${index + 1}] ${describeNode(issue)}`)
    lines.push(`    Missing required input "${issue.inputName}" (${issue.inputType}): ${issue.reason}`)
    if (issue.suggestions.length === 0) {
      lines.push('    No same-graph output of this type to reconnect.')
      return
    }
    lines.push('    Suggested reconnection:')
    issue.suggestions.forEach((suggestion, suggestionIndex) => {
      const title =
        suggestion.nodeTitle && suggestion.nodeTitle !== suggestion.nodeType
          ? ` "${suggestion.nodeTitle}"`
          : ''
      const hint = suggestion.hint ? ` — hint ${suggestion.hint}` : ''
      lines.push(
        `      ${suggestionIndex + 1}. node ${suggestion.nodeId} ${suggestion.nodeType}${title} output "${suggestion.outputName}" slot ${suggestion.outputSlot} (${suggestion.outputType})${hint}`,
      )
    })
  })
  return lines.join('\n')
}

function emptyReport(format, error) {
  return { format, issues: [], error }
}

function formatIssueWarning(issue) {
  const place = issue.subgraphName
    ? `subgrafo «${issue.subgraphName}», nodo ${issue.nodeId} (${issue.nodeTitle || issue.nodeType})`
    : `nodo ${issue.nodeId} (${issue.nodeTitle || issue.nodeType})`
  const top = issue.suggestions[0]
  const hint = top
    ? ` Candidato: ${top.nodeType} nodo ${top.nodeId}, salida «${top.outputName}» (slot ${top.outputSlot}).`
    : ''
  return `Entrada obligatoria sin conexión en ${place}: «${issue.inputName}» (${issue.inputType}).${hint}`
}

function describeNode(issue) {
  const title =
    issue.nodeTitle && issue.nodeTitle !== issue.nodeType ? ` "${issue.nodeTitle}"` : ''
  const where = issue.subgraphName ? `subgraph "${issue.subgraphName}" — ` : ''
  return `${where}node ${issue.nodeId} ${issue.nodeType}${title}`
}

function detectWorkflow(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { format: 'unknown' }
  if (Array.isArray(data.nodes)) return { format: 'ui', data }
  if (data.workflow && typeof data.workflow === 'object' && Array.isArray(data.workflow.nodes)) {
    return { format: 'ui', data: data.workflow }
  }
  if (isApiDict(data)) return { format: 'api', data }
  if (isApiDict(data.prompt)) return { format: 'api', data: data.prompt }
  if (isApiDict(data.output)) return { format: 'api', data: data.output }
  return { format: 'unknown' }
}

function isApiNode(value) {
  return Boolean(
    value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      typeof value.class_type === 'string' &&
      value.inputs &&
      typeof value.inputs === 'object' &&
      !Array.isArray(value.inputs),
  )
}

function isApiDict(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false
  const entries = Object.entries(data).filter(([, value]) => value && typeof value === 'object')
  if (entries.length === 0) return false
  const nodes = entries.filter(([, value]) => isApiNode(value))
  return nodes.length > 0 && nodes.length >= Math.ceil(entries.length * 0.5)
}

function validateUi(workflow, objectInfo, includeDisconnected) {
  const subgraphs = collectSubgraphs(workflow)
  const issues = []
  const seen = new Set()
  walkUiGraph({
    nodes: Array.isArray(workflow.nodes) ? workflow.nodes : [],
    links: parseLinks(workflow.links),
    subgraphs,
    subgraph: null,
    instance: null,
    parentLinksById: new Map(),
    objectInfo,
    includeDisconnected,
    issues,
    seen,
  })
  return issues
}

function walkUiGraph(ctx) {
  const linksById = indexLinks(ctx.links)
  const nodesById = new Map(ctx.nodes.map((node) => [String(node.id), node]))
  const scope = ancestorIds(ctx.nodes, ctx.links, ctx.objectInfo, ctx.includeDisconnected, ctx.subgraph)
  for (const node of ctx.nodes) {
    if (isMuted(node)) continue
    const nested = ctx.subgraphs.get(String(node.type))
    if (nested) {
      if (!scope.has(String(node.id))) continue
      walkUiGraph({
        nodes: Array.isArray(nested.nodes) ? nested.nodes : [],
        links: parseLinks(nested.links),
        subgraphs: ctx.subgraphs,
        subgraph: nested,
        instance: node,
        parentLinksById: linksById,
        objectInfo: ctx.objectInfo,
        includeDisconnected: ctx.includeDisconnected,
        issues: ctx.issues,
        seen: ctx.seen,
      })
      continue
    }
    if (!scope.has(String(node.id))) continue
    auditUiNode(node, {
      linksById,
      nodesById,
      nodes: ctx.nodes,
      subgraph: ctx.subgraph,
      instance: ctx.instance,
      parentLinksById: ctx.parentLinksById,
      objectInfo: ctx.objectInfo,
      issues: ctx.issues,
      seen: ctx.seen,
    })
  }
}

function auditUiNode(node, ctx) {
  const info = lookupNodeInfo(ctx.objectInfo, node.type)
  const inputs = Array.isArray(node.inputs) ? node.inputs : []
  const seenNames = new Set()

  inputs.forEach((input) => {
    if (input?.name == null || seenNames.has(input.name)) return
    const slots = inputs
      .map((candidate, slot) => ({ input: candidate, slot }))
      .filter((candidate) => candidate.input?.name === input.name)
    seenNames.add(input.name)
    const states = slots.map((slot) => connectionState(node, slot.input, ctx))
    if (states.some((state) => state.connected)) return
    if (!slots.some((slot) => slotIsRequired(slot.input, info))) return
    const failed = states.find((state) => !state.connected) || states[0]
    pushIssue(ctx, node, {
      inputName: input.name,
      inputType: typeOfInput(input, info),
      inputSlot: slots[0].slot,
      reason: failed?.reason || 'no incoming link',
      viaSubgraphInput: failed?.viaSubgraphInput || null,
    })
  })

  const required = info?.input?.required
  if (!required || typeof required !== 'object') return
  for (const [name, spec] of Object.entries(required)) {
    if (seenNames.has(name)) continue
    if (inputs.some((input) => input?.name === name)) continue
    const kind = specKind(spec)
    if (kind.kind === 'widget' && hasWidgetValue(node, name)) continue
    if (kind.kind === 'widget' && !node.widgets_values_named) continue
    pushIssue(ctx, node, {
      inputName: name,
      inputType: kind.type || 'UNKNOWN',
      inputSlot: null,
      reason: 'no incoming link',
      viaSubgraphInput: null,
    })
  }
}

function connectionState(node, input, ctx) {
  const link = resolveLink(node, input, ctx.linksById)
  if (link && ctx.subgraph && isBoundaryOrigin(link, ctx.subgraph)) {
    const sgInput = subgraphInputAt(ctx.subgraph, link.originSlot)
    const connected = boundaryConnected(
      ctx.instance,
      ctx.subgraph,
      link.originSlot,
      ctx.parentLinksById,
    )
    const inputName = sgInput?.name || `#${link.originSlot}`
    return {
      connected,
      viaSubgraphInput: sgInput?.name || null,
      reason: connected
        ? null
        : `subgraph input "${inputName}" is not connected on instance node ${ctx.instance?.id}`,
    }
  }
  if (link) return { connected: true, viaSubgraphInput: null, reason: null }
  if (hasOwnWidget(node, input)) return { connected: true, viaSubgraphInput: null, reason: null }
  return { connected: false, viaSubgraphInput: null, reason: 'no incoming link' }
}

function pushIssue(ctx, node, detail) {
  const subgraphId = ctx.subgraph?.id ?? null
  const boundary = Boolean(detail.viaSubgraphInput)
  const key = boundary
    ? `${subgraphId}:${ctx.instance?.id}:${node.id}:${detail.inputName}`
    : `${subgraphId ?? ''}:${node.id}:${detail.inputName}`
  if (ctx.seen.has(key)) return
  ctx.seen.add(key)
  const suggestions = suggestForGraph(ctx.nodes, detail.inputName, detail.inputType, node.id, ctx.subgraph)
  ctx.issues.push({
    nodeId: node.id,
    nodeType: node.type,
    nodeTitle: node.title || null,
    subgraphName: ctx.subgraph?.name || null,
    subgraphId,
    instanceNodeId: boundary ? (ctx.instance?.id ?? null) : null,
    inputName: detail.inputName,
    inputType: detail.inputType,
    inputSlot: detail.inputSlot,
    reason: detail.reason,
    suggestions,
  })
}

function validateApi(prompt, objectInfo, includeDisconnected) {
  const nodes = Object.entries(prompt).filter(([, value]) => isApiNode(value))
  const nodesById = new Map(nodes)
  const links = []
  for (const [id, node] of nodes) {
    for (const value of Object.values(node.inputs || {})) {
      if (!isLinkValue(value)) continue
      links.push({ originId: value[0], targetId: id })
    }
  }
  const asNodes = nodes.map(([id, node]) => ({
    id,
    type: node.class_type,
    title: node._meta?.title || null,
    mode: node.mode,
  }))
  const scope = ancestorIds(asNodes, links, objectInfo, includeDisconnected, null)
  const issues = []
  for (const [id, node] of nodes) {
    if (isMuted(node) || !scope.has(String(id))) continue
    const classType = node.class_type
    const info = lookupNodeInfo(objectInfo, classType)
    const requirements = requiredApiInputs(classType, info)
    const inputs = node.inputs || {}
    const flagged = new Set()
    for (const requirement of requirements) {
      if (requirement.optional) continue
      const value = inputs[requirement.name]
      if (requirement.kind === 'widget') {
        if (value == null) {
          flagged.add(requirement.name)
          issues.push(
            apiIssue(id, node, requirement.name, requirement.type, 'no incoming link', nodes, objectInfo),
          )
        }
        continue
      }
      if (!linkOk(value, nodesById)) {
        flagged.add(requirement.name)
        issues.push(
          apiIssue(id, node, requirement.name, requirement.type, 'no incoming link', nodes, objectInfo),
        )
      }
    }
    for (const [name, value] of Object.entries(inputs)) {
      if (value != null || flagged.has(name)) continue
      if (requirements.some((requirement) => requirement.name === name && requirement.optional)) continue
      issues.push(apiIssue(id, node, name, 'UNKNOWN', 'no incoming link', nodes, objectInfo))
    }
  }
  return issues
}

function apiIssue(id, node, inputName, inputType, reason, nodes, objectInfo) {
  return {
    nodeId: id,
    nodeType: node.class_type,
    nodeTitle: node._meta?.title || null,
    subgraphName: null,
    subgraphId: null,
    instanceNodeId: null,
    inputName,
    inputType,
    inputSlot: null,
    reason,
    suggestions: suggestForApi(nodes, inputName, inputType, id, objectInfo),
  }
}

function requiredApiInputs(classType, info) {
  if (info?.input && (info.input.required || info.input.optional)) {
    const list = []
    for (const [name, spec] of Object.entries(info.input.required || {})) {
      const kind = specKind(spec)
      list.push({
        name,
        type: kind.type || 'UNKNOWN',
        kind: kind.kind === 'widget' ? 'widget' : 'socket',
        optional: false,
      })
    }
    for (const [name, spec] of Object.entries(info.input.optional || {})) {
      const kind = specKind(spec)
      list.push({
        name,
        type: kind.type || 'UNKNOWN',
        kind: kind.kind === 'widget' ? 'widget' : 'socket',
        optional: true,
      })
    }
    return list
  }
  return (KNOWN_REQUIRED_SOCKETS[classType] || []).map(([name, type]) => ({
    name,
    type,
    kind: 'socket',
    optional: false,
  }))
}

function suggestForGraph(nodes, inputName, inputType, excludeId, subgraph) {
  const candidates = []
  for (const node of nodes) {
    if (String(node.id) === String(excludeId)) continue
    const outputs = Array.isArray(node.outputs) ? node.outputs : []
    outputs.forEach((output, slot) => {
      const outputType = output?.type
      if (!outputType || outputType === '*' || outputType === 0) return
      if (!typesCompatible(outputType, inputType)) return
      candidates.push(
        scoredCandidate({
          nodeId: node.id,
          nodeType: node.type,
          nodeTitle: node.title || null,
          outputName: output.name || String(outputType),
          outputSlot: slot,
          outputType: String(outputType),
          inputName,
        }),
      )
    })
  }
  if (subgraph?.inputs) {
    subgraph.inputs.forEach((input, slot) => {
      if (!input?.type || !typesCompatible(input.type, inputType)) return
      candidates.push(
        scoredCandidate({
          nodeId: inputNodeId(subgraph),
          nodeType: 'SubgraphInput',
          nodeTitle: input.label || input.name,
          outputName: input.name,
          outputSlot: slot,
          outputType: String(input.type),
          inputName,
        }),
      )
    })
  }
  return rankCandidates(candidates)
}

function suggestForApi(nodes, inputName, inputType, excludeId, objectInfo) {
  const candidates = []
  for (const [id, node] of nodes) {
    if (String(id) === String(excludeId)) continue
    outputsOf(node.class_type, objectInfo).forEach((output) => {
      if (!typesCompatible(output.type, inputType)) return
      candidates.push(
        scoredCandidate({
          nodeId: id,
          nodeType: node.class_type,
          nodeTitle: node._meta?.title || null,
          outputName: output.name,
          outputSlot: output.slot,
          outputType: output.type,
          inputName,
        }),
      )
    })
  }
  return rankCandidates(candidates)
}

function scoredCandidate(candidate) {
  const label = `${candidate.nodeType} ${candidate.nodeTitle || ''} ${candidate.outputName}`
  const hint = matchHint(candidate.inputName, label)
  let score = hint ? hint.score : 0
  if (candidate.outputName.toLowerCase() === candidate.inputName.toLowerCase()) score += 80
  if (candidate.outputName.toLowerCase() === candidate.outputType.toLowerCase()) score += 10
  const tokens = candidate.inputName.split(/[_\s-]+/).filter((token) => token.length > 2)
  for (const token of tokens) {
    if (label.toLowerCase().includes(token.toLowerCase())) score += 10
  }
  return { ...candidate, score, hint: hint?.label || null }
}

function rankCandidates(candidates) {
  candidates.sort(
    (a, b) =>
      b.score - a.score ||
      String(a.nodeId).localeCompare(String(b.nodeId)) ||
      a.outputSlot - b.outputSlot,
  )
  return candidates.slice(0, MAX_SUGGESTIONS).map((candidate) => ({
    nodeId: candidate.nodeId,
    nodeType: candidate.nodeType,
    nodeTitle: candidate.nodeTitle,
    outputName: candidate.outputName,
    outputSlot: candidate.outputSlot,
    outputType: candidate.outputType,
    score: candidate.score,
    hint: candidate.hint,
  }))
}

function matchHint(inputName, label) {
  const rule = INPUT_HINTS.find((candidate) => candidate.test(inputName))
  if (!rule) return null
  const index = rule.patterns.findIndex(([, pattern]) => pattern.test(label))
  if (index < 0) return null
  return { label: rule.patterns[index][0], score: 400 - index * 80 }
}

function ancestorIds(nodes, links, objectInfo, includeDisconnected, subgraph) {
  const sinks = []
  for (const node of nodes) {
    if (isOutputNode(node.type, lookupNodeInfo(objectInfo, node.type))) sinks.push(node.id)
  }
  if (subgraph) sinks.push(outputNodeId(subgraph))
  if (includeDisconnected || sinks.length === 0) {
    return new Set(nodes.map((node) => String(node.id)))
  }
  const reverse = new Map()
  for (const link of links) {
    const key = String(link.targetId)
    if (!reverse.has(key)) reverse.set(key, [])
    reverse.get(key).push(link.originId)
  }
  const seen = new Set()
  const stack = sinks.map((id) => String(id))
  while (stack.length > 0) {
    const id = stack.pop()
    if (seen.has(id)) continue
    seen.add(id)
    for (const origin of reverse.get(id) || []) stack.push(String(origin))
  }
  return seen
}

function isOutputNode(type, info) {
  if (!type || type === 'SubgraphInput') return false
  if (info?.output_node === true) return true
  return /^(Save|Preview)/.test(String(type))
}

function isMuted(node) {
  const mode = node?.mode
  return mode === MODE_NEVER || mode === MODE_BYPASS
}

function slotIsRequired(input, info) {
  if (!input) return false
  const name = input.name
  const requiredSpec = info?.input?.required
  const optionalSpec = info?.input?.optional
  if (requiredSpec && Object.prototype.hasOwnProperty.call(requiredSpec, name)) return true
  if (optionalSpec && Object.prototype.hasOwnProperty.call(optionalSpec, name)) return false
  if (input.optional === true || input.shape === OPTIONAL_SHAPE) return false
  if (input.type == null || input.type === '' || input.type === 0) return false
  return true
}

function typeOfInput(input, info) {
  if (input?.type != null && input.type !== '' && input.type !== 0) return String(input.type)
  const spec = info?.input?.required?.[input.name] || info?.input?.optional?.[input.name]
  return specKind(spec).type || 'UNKNOWN'
}

function hasOwnWidget(node, input) {
  if (!input) return false
  if (input.widget) return hasWidgetValue(node, input.widget.name) || hasWidgetValue(node, input.name)
  const types = String(input.type || '')
    .split(',')
    .map((type) => type.trim())
    .filter(Boolean)
  if (types.length > 0 && types.every((type) => WIDGET_TYPES.has(type))) {
    return hasWidgetValue(node, input.name)
  }
  return false
}

function hasWidgetValue(node, name) {
  if (!name) return false
  const named = node?.widgets_values_named
  if (named && Object.prototype.hasOwnProperty.call(named, name)) {
    return named[name] !== undefined && named[name] !== null
  }
  const widgetInputs = (node?.inputs || []).filter((input) => input?.widget)
  const index = widgetInputs.findIndex((input) => input.widget?.name === name || input.name === name)
  if (index >= 0 && Array.isArray(node.widgets_values) && index < node.widgets_values.length) {
    const value = node.widgets_values[index]
    return value !== undefined && value !== null
  }
  return false
}

function boundaryConnected(instance, subgraph, slotIndex, parentLinksById) {
  if (!instance) return true
  const sgInput = subgraphInputAt(subgraph, slotIndex)
  if (!sgInput) return false
  if (hasWidgetValue(instance, sgInput.name)) return true
  if (sgInput.label && hasWidgetValue(instance, sgInput.label)) return true
  const inputs = Array.isArray(instance.inputs) ? instance.inputs : []
  const byName = inputs.find((input) => input?.name === sgInput.name)
  const outer = byName || inputs[slotIndex] || null
  if (!outer) return false
  if (outer.widget && hasWidgetValue(instance, outer.widget.name)) return true
  return Boolean(resolveLink(instance, outer, parentLinksById))
}

function resolveLink(node, input, linksById) {
  if (!input || input.link == null) return null
  const link = linksById.get(String(input.link))
  if (!link) return null
  if (String(link.targetId) !== String(node.id)) return null
  return link
}

function isBoundaryOrigin(link, subgraph) {
  return String(link.originId) === String(inputNodeId(subgraph))
}

function subgraphInputAt(subgraph, slot) {
  const inputs = subgraph?.inputs
  if (!Array.isArray(inputs)) return null
  return inputs[slot] || null
}

function inputNodeId(subgraph) {
  return subgraph?.inputNode?.id ?? SUBGRAPH_INPUT_ID
}

function outputNodeId(subgraph) {
  return subgraph?.outputNode?.id ?? SUBGRAPH_OUTPUT_ID
}

function parseLinks(links) {
  const list = Array.isArray(links) ? links : links && typeof links === 'object' ? Object.values(links) : []
  const parsed = []
  for (const link of list) {
    const normalized = normalizeLink(link)
    if (normalized) parsed.push(normalized)
  }
  return parsed
}

function normalizeLink(link) {
  if (Array.isArray(link)) {
    if (link.length < 5) return null
    return {
      id: link[0],
      originId: link[1],
      originSlot: link[2],
      targetId: link[3],
      targetSlot: link[4],
      type: link[5],
    }
  }
  if (!link || typeof link !== 'object') return null
  const id = link.id
  const originId = link.origin_id ?? link.originId
  const targetId = link.target_id ?? link.targetId
  if (id == null || originId == null || targetId == null) return null
  return {
    id,
    originId,
    originSlot: link.origin_slot ?? link.originSlot,
    targetId,
    targetSlot: link.target_slot ?? link.targetSlot,
    type: link.type,
  }
}

function indexLinks(links) {
  const map = new Map()
  for (const link of links) map.set(String(link.id), link)
  return map
}

function collectSubgraphs(root) {
  const map = new Map()
  const visit = (value) => {
    const list = value?.definitions?.subgraphs
    if (!Array.isArray(list)) return
    for (const subgraph of list) {
      if (!subgraph || subgraph.id == null || map.has(String(subgraph.id))) continue
      map.set(String(subgraph.id), subgraph)
      visit(subgraph)
    }
  }
  visit(root)
  return map
}

function lookupNodeInfo(objectInfo, classType) {
  if (!objectInfo || !classType || typeof objectInfo !== 'object') return null
  const info = objectInfo[classType]
  if (!info || typeof info !== 'object') return null
  return info
}

function specKind(spec) {
  if (!Array.isArray(spec) || spec.length === 0) return { kind: 'unknown', type: null }
  const first = spec[0]
  if (Array.isArray(first)) return { kind: 'widget', type: 'COMBO' }
  if (typeof first !== 'string') return { kind: 'unknown', type: null }
  if (WIDGET_TYPES.has(first)) return { kind: 'widget', type: first }
  return { kind: 'socket', type: first }
}

function outputsOf(classType, objectInfo) {
  const info = lookupNodeInfo(objectInfo, classType)
  if (Array.isArray(info?.output)) {
    const names = Array.isArray(info.output_name) ? info.output_name : info.output
    return info.output.map((type, slot) => ({
      name: String(names[slot] || type),
      type: String(type),
      slot,
    }))
  }
  const known = KNOWN_OUTPUTS[classType] || []
  return known.map(([name, type], slot) => ({ name, type, slot }))
}

function isLinkValue(value) {
  if (!Array.isArray(value) || value.length < 2 || value.length > 3) return false
  const [id, slot] = value
  if (typeof slot !== 'number' || !Number.isInteger(slot)) return false
  return typeof id === 'number' || (typeof id === 'string' && id.trim() !== '')
}

function linkOk(value, nodesById) {
  if (!isLinkValue(value)) return false
  return nodesById.has(String(value[0]))
}

function typesCompatible(outputType, inputType) {
  const outputs = String(outputType)
    .split(',')
    .map((type) => type.trim())
    .filter(Boolean)
  const inputs = String(inputType)
    .split(',')
    .map((type) => type.trim())
    .filter(Boolean)
  if (outputs.length === 0 || inputs.length === 0) return false
  if (outputs.includes('*') || inputs.includes('*')) return true
  return outputs.some((type) => inputs.includes(type))
}
