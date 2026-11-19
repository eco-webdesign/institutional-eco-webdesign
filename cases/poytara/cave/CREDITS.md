# CREDITS · Poytara cenário-caverna v0.7.0

Só **CC0** Poly Haven. Sem Sketchfab / Fab / Megascans / Igloo / Abeto. Sem assets do notebook / montanha v0.5.0.

## HDRI

| Peça | Origem | Licença |
|---|---|---|
| Hiker's Cave 2K | [polyhaven.com/a/hikers_cave](https://polyhaven.com/a/hikers_cave) | **CC0** |

## Modelos (glTF 1K)

| Peça | Origem | Uso |
|---|---|---|
| Rock Face 01 | [polyhaven.com/a/rock_face_01](https://polyhaven.com/a/rock_face_01) | Paredes L/R + FG + fundo |
| Mountainside | [polyhaven.com/a/mountainside](https://polyhaven.com/a/mountainside) | Paredes / volume |
| Namaqualand Cliff 01 | [polyhaven.com/a/namaqualand_cliff_01](https://polyhaven.com/a/namaqualand_cliff_01) | Paredes / abertura / fundo |
| Sand Rocks Small 01 | [polyhaven.com/a/sand_rocks_small_01](https://polyhaven.com/a/sand_rocks_small_01) | Rochas 1º plano + pedras soltas |
| Coast Rocks 02 | [polyhaven.com/a/coast_rocks_02](https://polyhaven.com/a/coast_rocks_02) | Fragmentos angulares |

## Texturas PBR 4K

| Peça | Origem | Uso |
|---|---|---|
| Rock Wall 02 | [polyhaven.com/a/rock_wall_02](https://polyhaven.com/a/rock_wall_02) | Chão + displacement |
| Dark Rock 02 | [polyhaven.com/a/dark_rock_02](https://polyhaven.com/a/dark_rock_02) | Pedestal + displacement |

## Modelado / realtime (Eco Webdesign)

| Peça | Notas |
|---|---|
| Pedestal | Peça única, chanfro suave, weighted normals, displace PH |
| Fenda + céu emissivo | Boolean no teto; emit ciano |
| Bake Combined | Floor + pedestal 1024 → emission/basic no GLB |
| Three.js 0.170 | Facho soft shader, fumaça, poeira, bloom, grain, vinheta, ACES |
| Compressão | Draco + KTX2 (publicado); fallback WebP (preview `a=dr`) |

## Render / engine

| Item | Valor |
|---|---|
| Engine still | Blender Cycles 4.5.3 LTS · AgX High Contrast |
| Realtime | three@0.170.0 · EffectComposer |
| Script | `blender/cycles_caverna_v070.py` |
| Resolução | 1920×1080 |
| Câmeras | composição central · mais aberto · close (SEM notebook) |
