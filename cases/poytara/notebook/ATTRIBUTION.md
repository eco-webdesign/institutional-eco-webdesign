# Atribuição · Poytara notebook estúdio v0.3.0

## Modelo 3D (genérico alumínio)

| Peça | Origem | Licença |
|---|---|---|
| Laptop 14″ (LOD0 / LOD1) | [tevy.dev/models/laptop](https://tevy.dev/models/laptop) v1 (2026-11-01) | **CC0-1.0** |
| Arquivo pinado | `https://tevy.dev/models/laptop/v1/lod0.glb` (sha256 `6fa81683…`) | CC0 |
| Mobile | tevy LOD1 → reexport CSP | CC0 |

Reexport CSP (este pacote): `gltf-transform` ktxdecompress + dequantize (sem `EXT_meshopt_compression` / `KHR_texture_basisu` / Draco). AO bake Blender Cycles (mapa multiplicado no albedo). Metadados: `tevy-laptop.json`. Texto CC0: `LICENSE-CC0.txt`.

Poly Haven Classic Laptop (**CC0**) foi avaliado e **não usado** (estilo retro bege 1990s, fora do look alumínio HQ).

## HDRI (só reflexos)

| Peça | Origem | Licença |
|---|---|---|
| Studio Small 08 1K HDR | [polyhaven.com/a/studio_small_08](https://polyhaven.com/a/studio_small_08) · Sergej Majboroda | **CC0** (política Poly Haven) |
| Arquivo | `studio-small-08-1k.hdr` | CC0 |

Fundo da cena permanece preto puro; o HDRI alimenta só `scene.environment` (intensidade baixa).

## Código / demo base (histórico)

| Item | Valor |
|---|---|
| Tutorial (estrutura de abertura) | [Codrops Device Showcase](https://tympanus.net/codrops/2024/08/07/interactive-3d-device-showcase-with-threepipe/) |
| Repo demo | [repalash/threepipe-device-mockup-codrops](https://github.com/repalash/threepipe-device-mockup-codrops) · **MIT** (`LICENSE-MIT-repalash.txt`) |

A partir de **v0.3.0** o GLB MacBook (Sketchfab CC-BY / trade dress Apple) **não** entra mais no pacote. Runtime: Three.js vanilla + jsDelivr pin.

## Assets nesta pasta

| Arquivo | Notas |
|---|---|
| `laptop-generic.glb` | LOD0 ~3.5 MB, PNG embutidos 2K, sem compressão GPU |
| `laptop-generic-mobile.glb` | LOD1 ~1.1 MB, texturas 1K |
| `lid-poses.json` | closed / hover / open no nó `lid` |
| `studio-small-08-1k.hdr` | reflexos estúdio |
| `scene.mjs` | timeline TIMING herdada de v0.2.6; cena/materiais/luz v0.3.0 |
