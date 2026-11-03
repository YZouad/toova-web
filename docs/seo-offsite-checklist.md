# SEO & AI visibility — off-site checklist

On-site prerendering and keyword pages are necessary but not sufficient. AI Overviews and “best room designer” rankings lean on listicles, directories, social proof, and brand mentions. Work this list manually after deploy.

## Search consoles

- [ ] Verify `toova.net` in [Google Search Console](https://search.google.com/search-console)
- [ ] Submit `https://toova.net/sitemap.xml`
- [ ] Watch **Pages** for “Duplicate, Google chose different canonical” until prerendered routes clear
- [ ] Verify in [Bing Webmaster Tools](https://www.bing.com/webmasters) (also feeds Copilot / parts of ChatGPT search)
- [ ] Submit the same sitemap to Bing
- [ ] Cloudflare dashboard: set AI Crawl Control content signal to `search=yes, ai-input=yes, ai-train=no`
- [ ] Confirm Bot Fight Mode does **not** 403 `OAI-SearchBot`, `ChatGPT-User`, `PerplexityBot`, `Claude-SearchBot`, `Claude-User`, `Applebot`, `Bingbot`, `Googlebot`
- [ ] Enable Cloudflare **Crawler Hints** (IndexNow)

## Directories & profiles

- [ ] Product Hunt launch (or update)
- [ ] AlternativeTo — list as alternative to Planner 5D, RoomSketcher, Homestyler
- [ ] G2 / Capterra (when review volume allows)
- [ ] There’s An AI For That / Futurepedia
- [ ] Crunchbase
- [ ] Wikidata item for Toova (sameAs in JSON-LD already reserved)
- [ ] Keep App Store / LinkedIn / X URLs in sync with `ORGANIZATION_SAME_AS` in `src/lib/seo/facts.ts`

## Editorial & community

- [ ] Pitch “best room design apps 2026” listicle authors (AI Overviews cite these heavily)
- [ ] Genuine Reddit participation: r/dorm, r/uchicago, r/malelivingspace, r/InteriorDesign, r/AmateurRoomPorn (no spam)
- [ ] YouTube: product demo + short UChicago dorm walkthroughs
- [ ] Campus backlinks: housing pages, student orgs, student newspaper

## App Store

- [ ] Title / subtitle include “room designer” and “room planner”
- [ ] Keyword field covers dorm planner, furniture fit, 3D room

## Monthly AI citation check

Run the same prompts in ChatGPT, Perplexity, Gemini, and Claude; log whether Toova appears:

1. best tool to design my room
2. free room designer
3. UChicago dorm planner
4. see if furniture fits before buying
5. photo to 3D furniture

Also track GA4 referrals from `chatgpt.com` and `perplexity.ai`.
