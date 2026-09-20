# LoRAs NSFW para Comfy Cloud (creators)

Catálogo curado en `data/loras.json` (versión 5+). Vite sirve `/data` desde `data/` y, en el build, copia esa carpeta a `dist/data`. No hace falta duplicar `loras.json` en `public/data/` salvo que quieras el mismo path estático sin el plugin.

## Cómo funciona el catálogo

| Campo | Qué es | Qué no es |
| --- | --- | --- |
| `examplesUrl` | URL de la **ficha exacta** en Civitai (`https://civitai.com/models/…`). El panel muestra «Ver ejemplos». | Un buscador genérico (`https://civitai.com/models`) ni una URL de descarga. |
| `comfyName` / `comfyByBrain` | `lora_name` **exacto** del archivo ya subido a Comfy Cloud (el string que entiende `LoraLoader`). | Nunca una URL. Nunca el nombre de Civitai «por si acaso». Si no está confirmado en Cloud, **se omite**. |
| Triggers / tip | Texto que «Incluir» pega al prompt. El tip (ES) dice pesos y avisos. | No sustituyen los pesos `.safetensors`. |

Sin `comfyName` / `comfyByBrain`, la fila es **solo trigger**: badge ámbar «solo texto / falta en Comfy». Generar no apila `LoraLoader` para esa entrada.

**Sube el `.safetensors` a Comfy Cloud con el nombre exacto que pondrás en `comfyName` antes de que Incluir muestre el badge verde Cloud.** Si el archivo en Cloud se llama distinto, el job omite los pesos y avisa. No inventes el filename desde la ficha.

Las entradas `prefectious-xl-nsfw` y `persephone-flux-nsfw` son **checkpoints** (Illustrious / Flux), no LoRAs: van en el loader de checkpoint del cerebro, no en Incluir.

`sex-box-pony` e `intercourse-vampire` viven en el motor `pony-import` (la ficha es Pony XL).

## Image-ref (cara / identidad)

El iPad puede adjuntar `image_ref` / `character_refs` en la UI. Para que Comfy use esa foto hace falta un grafo de identidad en Cloud, no solo el prompt:

- [PuLID_ComfyUI](https://github.com/cubiq/PuLID_ComfyUI) — identidad Flux / SDXL a partir de una foto.
- [ComfyUI_InstantID](https://github.com/cubiq/ComfyUI_InstantID) — InstantID (InsightFace) para SDXL.
- Guía Civitai (PuLID para principiantes): [civitai.com/models/1032821](https://civitai.com/models/1032821)

Hasta que ese workflow esté en la Function de Generar, la foto de ref no sustituye a un LoRA de personaje ni desbloquea el badge Cloud.

## Flow Sexo hiperreal (SDXL, no Flux Dev)

Flux Dev es SFW de base: desbloquea desnudo, pero anatomía vaginal y penetración salen flojas. El camino de calidad en esta app es el cerebro **SDXL** → checkpoint Cloud `realvisxlV50_v50Bakedvae.safetensors` (RealVis XL V5). Lustify u otros NSFW checkpoints solo si ya existen en Cloud con ese filename; no los inventes.

Tope de la Function: **3 LoRAs**. Una pose por job.

### Receta A — ya en Cloud (Generar puede cargar pesos)

1. Cerebro **SDXL**.
2. Incluir **NSFW POV All In One SDXL** (`NsfwPovAllInOneLoraSdxl-000009MINI.safetensors`) + **Skin Realism**.
3. Un solo trigger de pose: `riding cowgirl` / `doggy style` / `reversecowgirl` / `butterfly sex` / `sidefuck`.
4. Picante 3 + gancho **Fluidos / squirting** si quieres el spray en texto.
5. Sujeto adulto explícito (30+). Negative: `child, teen, underage, watermark`.

### Receta B — anatomía + penetración (sube los `.safetensors` a Cloud)

| Hueco | Catálogo | Trigger | Archivo Civitai (confirma el nombre en Cloud) |
| --- | --- | --- | --- |
| Pose (elige una) | POV Missionary SDXL o POV Cowgirl SDXL | `pm1s` / `cwgr` + `girl, pov, penis` | `pm1s.safetensors` / `cwgr.safetensors` |
| Vulva | Realistic hairy vagina (SDXL) | `hairypussy` | `hairypussy.safetensors` |
| Squirting | PornMaster squirting (SDXL) | `female ejaculation`, `pussy juice` | `PornMaster-squirting-sdxl-V3-lora-000004.safetensors` |

Si no caben 3, prioriza **pose + vulva + skin**. El squirting puede ir solo como trigger / gancho Fluidos.

Bloques Control: Pose Missionary/Cowgirl/Doggy POV, Acción Penetración vaginal o Squirting, Cámara POV íntimo.
