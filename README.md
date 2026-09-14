# 100% Control, 100% Experimental

## Publicar / refrescar en Safari (Netlify Drop)

Live de referencia: [polite-pothos-bced37.netlify.app](https://polite-pothos-bced37.netlify.app). Para **actualizar** esa URL:

1. Baja `artifacts/control-experimental-dist.zip` (o `npm ci && npm run build` y zippea `dist/` con `index.html` en la raíz).
2. Abre [https://app.netlify.com/drop](https://app.netlify.com/drop) y arrastra la carpeta **descomprimida** (o el zip).
3. Si ya existe el site, en Netlify: Deploys → **Add new deploy** → drag & drop el mismo `dist`.
4. Safari iPad: recarga forzada o borra la PWA y vuelve a Añadir a pantalla de inicio.

Codebase Origin: [cursor.com/codebase/koko12-koko12/experiment-pad](https://cursor.com/codebase/koko12-koko12/experiment-pad).

### Novedades (lote A–F)

- **LoRAs:** importadas arriba, categorías de color, contador verde, aviso fuerte al tope de slots, glosario `?`, seleccionadas fijadas bajo «Sugerir por escena», pesos bajo/medio/alto de color, «Ver ejemplos» solo con URL exacta.
- **Export:** Directo / Promptbox / assistant Mage (gratis, stub) / análisis avanzado (~0,30 €, stub).
- **Bloques:** prompt por colores; cámara Fija / Zoom+ / Zoom−; micro-variaciones 2+1; anti-repetición; bloque **Iluminación**.
- **Picante + Exageración (beta):** niveles 1–3; tramos grises tocables (cuerpo/escena); ganchos futanari/fluidos (estructura, prompt vacío).
- **Planes Mage:** cuotas en `data/mage.json`; upsell al pasarte; pegar análisis → bloques.
- **Plantillas** en carpetas de situación renombrables.

---

Compositor táctil de prompts para usar **al lado de [Mage.space](https://www.mage.space/)** en Safari Split View (iPad). Experimentas bloques de color, anclas lo que late, controlas solo lo libre, y copias un prompt listo para pegar.

iPad-first PWA: colored prompt blocks, lock/anchor, constrained randomness, Mage model tips from JSON. No Mage API, no chat, no poetry engine.

---

## Español — cómo usarlo

### En el iPad (Safari + Split View)

1. Arranca el servidor en tu red (`npm run dev`) y abre la URL en **Safari** del iPad.
2. Pon esta pestaña a un lado: toca los tres puntos o el selector de apps y elige **Split View**. Abre [mage.space](https://www.mage.space/) en la otra mitad.
3. Pulsa **Experimental** → **Experimentar**. Bloques de color (escenario, personaje, complexión, ropa, pose, objeto, acción, **luz**, cámara).
4. Toca el candado de lo que te gusta (**Anclar**). Vuelve a **Experimentar**: solo se mueven los libres (sin repetir los últimos).
5. Pasa a **Control** para editar a mano los bloques desanclados.
6. **Directo** o **Promptbox** copian el prompt. El assistant / análisis Mage son stubs (copian y abren Mage).
7. Cambia motor y **plan** (cuotas). Pega un análisis del helper si quieres mapear a bloques.
8. **LoRAs:** importadas primero; incluye solo las elegidas; tope = min(motor, plan).
9. **Picante / Exageración (beta):** sliders y tramos de color en el prompt.

### Añadir a pantalla de inicio (PWA)

1. En Safari: **Compartir** → **Añadir a pantalla de inicio**.
2. Se instala como app (manifiesto + service worker).
3. En iPadOS, una PWA a pantalla completa no siempre entra en Split View. Para trabajar junto a Mage, deja la app **en una pestaña de Safari**.

### Editar catálogos JSON (sin reescribir la app)

Archivos en `/data` (se sirven en `/data/…`):

| Archivo | Qué es |
| --- | --- |
| `data/block-types.json` | Tipos de bloque, color, orden. Añade un tipo nuevo aquí. |
| `data/options.json` | Listas de opciones + `weight` + `tags` de compatibilidad. |
| `data/models.json` | Motores Mage, tips, `maxLoras`. |
| `data/mage.json` | Planes / cuotas, URLs de ayuda y stubs. |
| `data/loras.json` | LoRAs: `source` imported/catalog, categoría, pesos, `examplesUrl` solo si es la ficha exacta. |
| `data/glossary.json` | Textos del `?`. |
| `data/spicy.json` | Niveles picante / exageración / ganchos extra. |
| `data/micro-variations.json` | 2 obvias + pool inusual rotatorio. |
| `data/concepts-piloto.json` | Grafo piloto (piscina/lluvia/humedad…). Copia en `public/data/` para el mismo path. |

Tras editar, recarga Safari. En producción, vuelve a `npm run build` (los JSON se copian a `dist/data`).

### Piloto coherente (Experimental)

Grafo **pequeño**: conceptos ponderados → relaciones → consecuencias simples → texto en inglés para el modelo. No hay Neo4j, embeddings ni LLM. El camino clásico de `options.json` sigue siendo el fallback (personaje, pose, objeto, acción, cámara, y el resto si apagas el piloto).

**Probar**

1. Modo **Experimental**. El interruptor **Piloto coherente** está activado por defecto (también `useCoherentPilot` en el JSON).
2. Pulsa **Experimentar**. Escena / luz / ropa / complexión libres se rellenan desde el grafo (p. ej. piscina + lluvia + reflejos + piel/ropa mojada), no con frases sueltas al azar.
3. **Ancla** un bloque y vuelve a Experimentar: los anclados no cambian.
4. Chips (Piscina, Lluvia, …) siembran ese concepto y expanden consecuencias en bloques libres.
5. Apaga **Piloto coherente** (o pon `"useCoherentPilot": false` en el JSON y recarga) para el randomizador de opciones anterior. El flag se guarda en `localStorage` (`control-experimental.useCoherentPilot`).

Bloques piloto llevan una etiqueta Verde / Ámbar / Rojo según compatibilidad con lo anclado.

Comprobar el motor (sin UI): `npx tsx scripts/coherent-smoke.mts`.

Las entradas con `"placeholder": true` son aproximaciones (p. ej. Illustrious/Pony importados). Márcalas o corrige nombres cuando confirmes el catálogo real de tu cuenta.

### Más adelante (no es este MVP)

Esta PWA de iPad es el **prototipo de prueba**. La visión final es una ventana flotante always-on-top encima de Mage (u otras apps), luego conectada a bots de Grok. Esa capa (Electron o similar) debe envolver **el mismo motor y los JSON**, no reescribirlos. v1 se queda en Safari/PWA.

---

## English — run locally

```bash
npm install
npm run dev
```

Dev server: [http://127.0.0.1:4733](http://127.0.0.1:4733) (binds `0.0.0.0`).

```bash
npm run build
npm run preview
```

### Flow

Experimental → interesting combo → **lock / Anclar combo** → keep rolling unlocked → **Control** (edit unlocked only) → **Exportar** (English Mage-ready text) → paste into Mage.

Templates live in `localStorage`. Session auto-saves.

### Architecture

- UI: Vite + React + TypeScript + Tailwind. Spanish chrome, English export.
- Engine: pure TS in `src/engine` (no React). Constrained randomness uses option weights + tag overlap with locked blocks (~14% explore). Optional coherent pilot (`src/engine/coherent.ts`) fills scene-related unlocked blocks from `data/concepts-piloto.json`.
- Catalogs are data, not code. New block types = JSON only.
- Extension points only (no v1 UI): `src/engine/extensions.ts` — poetry engine, chat assistant, LoRA injection.

### Later phase (not this repo slice)

This iPad PWA is the **test prototype**. The longer product vision is a floating always-on-top window you can park over Mage (or other apps), later wired to Grok bots. That shell (Electron or similar) should wrap **this same engine + JSON catalogs**, not replace them. v1 stays a Safari/PWA compositor.

### Out of scope (v1)

API real de Mage, overlay flotante, scrape Civitai, shaman, vídeo continuo, affiliates, backdoors.

### Cerebros dinámicos (brains-ui-pack)

- `data/brains-ui-pack.json` — cerebros FLUX / Illustrious / SDXL / SD3.5 / LTX / Wan.
- `data/brains/*-model_profile.json` — perfiles completos (referencia; la UI usa el pack).
- Un solo shell: el cerebro seleccionado muestra/oculta negative, params, modos y uploads.
- Referencias (image_ref / video_ref / character_refs): UI-ready con objectURL; el adaptador Comfy que envía base64/metadata es el siguiente lote (el Enviar actual solo manda prompt string si hay Function Netlify).
- `mage.json` sigue cargando (planes/cuotas legado) sin romper el build.
