# institutional-eco-webdesign

Material para website institucional da Eco Webdesign.

## Assets via jsDelivr (tag fixa)

Padrão de URL:

```
https://cdn.jsdelivr.net/gh/eco-webdesign/institutional-eco-webdesign@TAG/caminho/do/arquivo
```

Exemplo (notebook Poytara):

```
https://cdn.jsdelivr.net/gh/eco-webdesign/institutional-eco-webdesign@v0.1.0/cases/poytara/notebook/macbook-only.glb
https://cdn.jsdelivr.net/gh/eco-webdesign/institutional-eco-webdesign@v0.1.0/cases/poytara/notebook/lid-poses.json
```

Use sempre uma tag de release (`@vX.Y.Z`), não `@main`, para cache estável.

## Créditos

- MacBook GLB (Sketchfab → Codrops): **CC-BY-4.0** — timblewee
- Demo Codrops / runtime base: **MIT** — Palash Bansal (repalash)

Ver `cases/poytara/notebook/ATTRIBUTION.md` e `cases/poytara/notebook/LICENSE-MIT-repalash.txt`.


## Interago module

`cases/poytara/notebook/scene.mjs` — ES module for the Poytara notebook opening (Three.js). Loads GLB/poses from this same tag via jsDelivr. Include with:

```
<script type="module" src="https://cdn.jsdelivr.net/gh/eco-webdesign/institutional-eco-webdesign@v0.1.1/cases/poytara/notebook/scene.mjs"></script>
```
