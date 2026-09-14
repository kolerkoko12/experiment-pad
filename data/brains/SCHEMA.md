# Contrato `model_profile` v1 — 100% Control

**Fuente:** §2 + §6 de `/workspace/informes/00-auditoria-cerebros.md`  
**Decisión A–H:** `/workspace/informes/00-leyenda-AH-unificada.md` (C11, adoptada 2026-09-14)  
**Alcance:** `scope` = `model_brain_only`. CEREBRO ≠ WORKFLOW ≠ CHECKPOINT ≠ LoRA.

---

## Required (raíz)

| Campo | Tipo | Notas |
|-------|------|-------|
| `brain_id` | string | `flux` \| `sdxl` \| `illustrious` \| `sd35` \| `ltx` \| `wan` |
| `family` | string | etiqueta humana de familia |
| `vendor` | string | proveedor |
| `modality` | enum | `image` \| `video` |
| `scope` | const | `"model_brain_only"` |
| `accessed` | string | fecha ISO de la investigación fuente |
| `sources` | string[] | URLs / rutas de evidencia |
| `evidence_policy` | object | ver abajo |
| `model_brain` | object | identidad + prompting + params abstractos |
| `version_matrix` | array | filas por variante |
| `checkpoints` | array | **solo pesos** (id HF, archivo, licencia, cuantización). NO sampler |
| `lora_policy` | object | compat/escalas como política; no recipes |
| `workflow_adapter_hints` | object | mapeo abstract→API/nodos; OpenAPI field names **aquí** |
| `open_questions` | array | `{id, label:"REQUIERE INVESTIGACIÓN", detail, impact?}` |

## `evidence_policy` (obligatorio)

```json
{
  "tags": {
    "A": "oficial vendor",
    "B": "paper",
    "C": "HF card",
    "D": "blog",
    "E": "community",
    "F": "product UI",
    "G": "secondary",
    "H": "REQUIERE INVESTIGACIÓN"
  },
  "note": "Las letras A–H son SOLO tags de evidencia. Las secciones temáticas (Identidad, Lenguaje…) van como claves semánticas en model_brain, NO como letras A–H.",
  "adopted": "2026-09-14"
}
```

## `model_brain` (required internos)

`identity`, `architecture`, `prompting`, `params_abstract`, `capabilities`, `limitations`, `dynamic_blocks`, `constraints`  
Opcional: `intent_fields` si hay datos.

- `prompting`: claves semánticas (`style`, `priority_order`, `negative_prompts`, `weighting_syntax`, `temporal_rules`, `official_formulas`, `notes`) — **no** letras A–H.
- `params_abstract`: CFG/steps/shift/guidance/resolution/duration como semántica de modelo, **no** nombres de nodos.

## Capas

| Capa | Va en | No va |
|------|-------|-------|
| Cerebro | `model_brain`, `version_matrix` (deltas) | grafos Comfy, LoRA recipes |
| Workflow adapter | `workflow_adapter_hints` | semántica DiT/LDM |
| Checkpoints | `checkpoints` | sampler/CFG |
| LoRA | `lora_policy` | nodos/escalas inventadas |

## `version_matrix[]`

`version_id`, `status` (`recommended` \| `legacy` \| `api_only` \| `open_weights` \| `deprecated`), `diffs_vs_family`, `params_overrides`, `prompting_overrides`, `evidence` (tags A–H).

## Contradicciones / huecos

Usar IDs de auditoría `Cxx` / `Hxx` en `open_questions` cuando existan.  
Rangos o ramas por backend (p. ej. Turbo CFG 0↔1) — **nunca** un único valor inventado.

## Validación

JSON UTF-8, pretty-print indent 2, `python -m json.tool` OK.
