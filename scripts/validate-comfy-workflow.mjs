#!/usr/bin/env node
/**
 * Report ComfyUI nodes whose required inputs have no incoming link.
 *
 *   node scripts/validate-comfy-workflow.mjs <workflow.json>
 *   node scripts/validate-comfy-workflow.mjs --object-info object_info.json <workflow.json>
 *   node scripts/validate-comfy-workflow.mjs --all <workflow.json>
 *
 * Exit 0 when nothing is orphaned, 1 when a required input is unlinked, 2 on usage or parse errors.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { formatReport, validateComfyWorkflow } from '../src/lib/validateComfyWorkflow.mjs'

const usage = `Usage: node scripts/validate-comfy-workflow.mjs [--all] [--object-info <file>] <workflow.json>

Exit 0 when every required input is linked or widget-backed.
Exit 1 when an orphan required input is found.
Exit 2 when the file or arguments are invalid.`

const args = process.argv.slice(2)
let filePath = ''
let objectInfoPath = ''
let includeDisconnected = false

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i]
  if (arg === '--help' || arg === '-h') {
    console.log(usage)
    process.exit(0)
  }
  if (arg === '--all') {
    includeDisconnected = true
    continue
  }
  if (arg === '--object-info') {
    objectInfoPath = args[i + 1] || ''
    i += 1
    if (!objectInfoPath) {
      console.error(usage)
      process.exit(2)
    }
    continue
  }
  if (arg.startsWith('--')) {
    console.error(`Unknown option ${arg}\n\n${usage}`)
    process.exit(2)
  }
  if (filePath) {
    console.error(usage)
    process.exit(2)
  }
  filePath = arg
}

if (!filePath) {
  console.error(usage)
  process.exit(2)
}

let workflow
try {
  workflow = JSON.parse(readFileSync(resolve(filePath), 'utf8'))
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`Could not read workflow JSON: ${message}`)
  process.exit(2)
}

let objectInfo = null
if (objectInfoPath) {
  try {
    objectInfo = JSON.parse(readFileSync(resolve(objectInfoPath), 'utf8'))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`Could not read object_info JSON: ${message}`)
    process.exit(2)
  }
}

const report = validateComfyWorkflow(workflow, { objectInfo, includeDisconnected })
console.log(formatReport(report, resolve(filePath)))
if (report.error) process.exit(2)
if (report.issues.length > 0) process.exit(1)
