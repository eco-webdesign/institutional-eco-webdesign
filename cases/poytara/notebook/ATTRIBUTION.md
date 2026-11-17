# Atribuição · Codrops / Tympanus Device Showcase

## Código / demo base

| Item | Valor |
|---|---|
| Tutorial | [Interactive 3D Device Showcase with Threepipe](https://tympanus.net/codrops/2024/08/07/interactive-3d-device-showcase-with-threepipe/) (Codrops / Tympanus) |
| Demo live | https://tympanus.net/Tutorials/DeviceShowcase/ |
| Repo | [repalash/threepipe-device-mockup-codrops](https://github.com/repalash/threepipe-device-mockup-codrops) |
| Autor do demo | Palash Bansal (repalash) |
| Licença do repo | **MIT** — ver `LICENSE-MIT-repalash.txt` |
| Codrops | Conteúdo Codrops tipicamente free para uso pessoal/comercial **com atribuição**; manter créditos Tympanus/Codrops + autor |

Esta prova **não** embute o runtime Threepipe. Porta o **asset GLB** do tutorial para Three.js vanilla (OrbitControls + soft-gpu / reduced-motion / fallback do harness Poytara).

## Modelo 3D (Sketchfab → GLB do tutorial)

| Peça | Origem | Licença |
|---|---|---|
| MacBook Pro 13″ 2020 | [timblewee no Sketchfab](https://sketchfab.com/3d-models/macbook-pro-13-inch-2020-efab224280fd4c3993c808107f7c0b38) | **CC-BY-4.0** |
| iPhone 15 Pro Max | [polyman no Sketchfab](https://sketchfab.com/3d-models/apple-iphone-15-pro-max-black-df17520841214c1792fb8a44c6783ee7) | **CC-BY-4.0** (presente no GLB original do tutorial; **removido** nesta prova) |

## Asset nesta pasta

| Arquivo | Notas |
|---|---|
| `macbook-only.glb` (~1.19 MB) | Extraído de `tabletop_macbook_iphone.glb` (tutorial, ~12 MB). Subárvore `iphone` **removida**; só `macbook`. Draco mantido. |
| `lid-poses.json` | Poses `closed` / `hover` / `open` do `TransformAnimationPlugin` (Bevels_2) no GLB original Threepipe/WebGI. |

## Risco Apple / publicação

Silhueta MacBook = trademark / trade dress. Autorizado só como **base da prova** no Agent Store. Clearance antes de CDN / case Interago.
