# Toova OG gateway (deprecated)

> **Deprecated.** Link previews are now **static unfurl pages** generated into the
> GitHub Pages `dist` artifact (`npm run generate:unfurls`). See the root
> [README](../README.md) § Link previews.
>
> This Worker is no longer deployed. Keep the source only as reference for the
> previous Cloudflare-based OG injection approach.

Historically this Worker proxied `toova.net` to the GitHub Pages origin and
returned **HTTP 200** HTML with escaped Open Graph / Twitter meta for:

- `/r/:token` — share unfurl (`get_share_unfurl`)
- `/u/:handle` — public profile (`get_profile_page`)
- `/u/:handle/r/:roomId` — public room (`get_public_room_unfurl`)
