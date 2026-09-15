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
