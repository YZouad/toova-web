# Room materials

Procedural PBR maps (albedo, normal, roughness) are generated at runtime in
`src/lib/proceduralTextures.ts`. All generated textures are original works
released under CC0 1.0 Universal.

To replace them with authored WebP sets later, place files under:

```
public/materials/<preset>/albedo.webp
public/materials/<preset>/normal.webp
public/materials/<preset>/roughness.webp
```

and extend the loader in `proceduralTextures.ts`.
