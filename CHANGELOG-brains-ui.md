# CHANGELOG — brains UI (dynamic shell)

## Piloto coherente (2026-09-14)

Grafo mínimo para Experimental: `data/concepts-piloto.json` (+ `public/data/concepts-piloto.json`) y `src/engine/coherent.ts`.

- Conceptos: piscina, lluvia, cuero, noche, agua, reflejos, humedad, piel_mojada, ropa_mojada.
- Flujo: peso → relaciones → consecuencias → fragmentos EN. Compatibilidad verde/ámbar/rojo.
- UI: interruptor **Piloto coherente** (default on). Anclados intactos. Resto de bloques sigue en `options.json`.
- Cómo probar: Experimental → Experimentar; ancla escena y vuelve a tirar; apaga el interruptor para el path clásico. Ver README «Piloto coherente».

**Fecha:** 2026-09-14 (Europe/Madrid)  
**Snapshot local:** `/workspace/pack-100pct/app` (SCM Origin/GitHub no usado)

## Qué cambió

- **Cerebros desde JSON:** `data/brains-ui-pack.json` + perfiles en `data/brains/*`.
- **Un solo shell UI:** selector de cerebro decide:
  - Prompt Final editable (ensamblado desde bloques; override manual + restaurar)
  - Negative prompt **solo** si `brain.negatives.supported` (FLUX lo oculta; SDXL/Illustrious/SD3.5/LTX/Wan lo muestran)
  - Parámetros declarados por el cerebro (sliders/inputs; fallbacks UI si default/min/max vienen null)
  - Modos (`t2i` / `i2i` / `t2v` / `i2v` / `r2v`…)
  - Uploads solo para el modo activo (`image_ref`, `video_ref`, `character_refs`)
- **Control / Experimental + candados:** intactos.
- **Mage suavizado:** labels hacia Comfy/familia; panel legado colapsable; `mage.json` sigue cargando.
- **Conceptos piloto:** grafo en `data/concepts-piloto.json` + motor `src/engine/coherent.ts` (ver sección arriba).
- **Refs:** UI-ready (File + objectURL). El adaptador Comfy que manda base64/metadata es el siguiente lote (Enviar actual = prompt string vía Function Netlify si existe).

## Archivos tocados

| Ruta | Acción |
|------|--------|
| `app/data/brains-ui-pack.json` | añadido |
| `app/data/brains/*.json` + SCHEMA | añadidos |
| `app/src/engine/brains.ts` | nuevo loader/tipos |
| `app/src/engine/index.ts` | export brains |
| `app/src/components/BrainPanel.tsx` | nuevo panel dinámico |
| `app/src/components/ModelPanel.tsx` | labels legado / colapsable |
| `app/src/components/ExportBar.tsx` | copy stubs Comfy-oriented |
| `app/src/App.tsx` | cableado cerebro + Prompt Final |
| `app/README.md` | nota cerebros / refs |

## Artefacto

`/workspace/pack-100pct/control-experimental-brains-dist.zip` — contenido de `dist/` (index.html en la raíz).

## Cómo Drop en Netlify

Site vivo: https://control-experimental-comfy.netlify.app

1. Descomprime `control-experimental-brains-dist.zip` (o usa el zip directo si Netlify lo acepta).
2. Netlify → el site `control-experimental-comfy` → **Deploys** → **Add new deploy** → drag & drop la carpeta `dist` (o el zip).
3. Alternativa: [app.netlify.com/drop](https://app.netlify.com/drop) para un site nuevo de prueba.
4. Safari / PWA: recarga forzada o reinstala icono si el service worker cachea el bundle viejo.

**Nota:** Drop estático no incluye Netlify Functions; Enviar/Comfy generate solo funciona si el site ya tiene `comfy-generate` + `COMFY_CLOUD_API_KEY`. Este lote no cambia la Function.

## Limitaciones

- No hay grafo semántico coherente completo.
- Uploads de referencia no se envían aún al backend Comfy.
- Defaults numéricos del pack a menudo null → la UI aplica hints suaves (guidance/steps/…).
- Sincronización cerebro → `models.json` es heurística por familia (techos LoRA).
