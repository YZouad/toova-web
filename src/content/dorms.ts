import {
  UCHICAGO_DORMS,
  UCHICAGO_LAYOUT_LABELS,
  buildUChicagoDormStarters,
  type UChicagoDormId,
  type UChicagoLayoutType,
} from '../lib/uchicagoDormTemplates';
import type { SeoArticle } from './types';

const starters = buildUChicagoDormStarters();

function starterFor(dormId: UChicagoDormId, layout: UChicagoLayoutType) {
  return starters.find((t) => t.dormMeta?.dormId === dormId && t.dormMeta?.layout === layout);
}

function dormPath(dormId: string, layout: string): string {
  return `/dorms/uchicago/${dormId}/${layout}/`;
}

export const UCHICAGO_HUB_ARTICLE: SeoArticle = {
  path: '/dorms/uchicago/',
  title: 'UChicago Dorm Room Plans — Measured Layouts in Toova',
  description:
    'Browse measured University of Chicago dorm plans in Toova: Woodlawn, North, Max P, Burton-Judson, I-House, RGG, and Snell-Hitchcock.',
  heading: 'University of Chicago dorm plans',
  lead: 'Open a measured blank layout for your residence hall, then furnish it at real scale before move-in.',
  priority: 0.85,
  breadcrumbs: [
    { name: 'Home', path: '/' },
    { name: 'UChicago dorms', path: '/dorms/uchicago/' },
  ],
  cta: { label: 'Start with any dorm', href: '/' },
  sections: [
    {
      heading: 'Halls included',
      body: [
        UCHICAGO_DORMS.map((d) => d.label).join(', ') +
          '. Each hall lists the layouts we ship (single, double, and Burton-Judson pass-through where it applies).',
        'Pick your building below, open the layout in Toova, and design before you buy.',
      ],
    },
    {
      heading: 'How to use a dorm plan',
      body: [
        'Choose your hall and room type. Toova opens a blank measured footprint. Add beds, desks, and decor from photos or the catalog, then share the plan with a roommate.',
      ],
    },
  ],
};

export function buildUChicagoDormArticles(): SeoArticle[] {
  const articles: SeoArticle[] = [];
  for (const dorm of UCHICAGO_DORMS) {
    for (const layout of dorm.layouts) {
      const starter = starterFor(dorm.id, layout);
      const path = dormPath(dorm.id, layout);
      const layoutLabel = UCHICAGO_LAYOUT_LABELS[layout];
      const dims = starter?.dimensionsLabel ?? 'measured footprint';
      const templateId = starter?.id ?? `uchicago-${dorm.id}-${layout}`;
      articles.push({
        path,
        title: `${dorm.label} ${layoutLabel} Dorm Plan — UChicago | Toova`,
        description: `Plan a ${dorm.label} ${layoutLabel.toLowerCase()} at UChicago in Toova. Measured layout (${dims}). Open the blank room and furnish at real scale.`,
        heading: `${dorm.label} · ${layoutLabel}`,
        lead: `Measured ${layoutLabel.toLowerCase()} footprint for ${dorm.label} (${dims}). Open it in Toova and place furniture before move-in.`,
        priority: 0.8,
        breadcrumbs: [
          { name: 'Home', path: '/' },
          { name: 'UChicago dorms', path: '/dorms/uchicago/' },
          { name: `${dorm.label} ${layoutLabel}`, path },
        ],
        cta: {
          label: `Open ${dorm.label} ${layoutLabel} in Toova`,
          href: `/?template=${encodeURIComponent(templateId)}`,
        },
        sections: [
          {
            heading: 'What’s included',
            body: [
              starter?.description ??
                `Blank ${layoutLabel.toLowerCase()} room for ${dorm.label} — draw and furnish from scratch.`,
              `Footprint: ${dims}. Walls and openings are a starting point you can adjust in the editor.`,
            ],
          },
          {
            heading: 'What to check before you buy',
            body: [
              'Bed and desk placement without blocking the door.',
              'Chair pull-out clearance at the desk.',
              'Storage that still leaves a walkway.',
              'Whether a mini-fridge or microwave cart fits the leftover rectangle.',
            ],
          },
          {
            heading: 'Other UChicago halls',
            body: [
              'See every measured hall on the UChicago dorms hub, including singles and doubles across Woodlawn, North, Max P, Burton-Judson, I-House, RGG, and Snell-Hitchcock.',
            ],
          },
        ],
        faq: [
          {
            question: `Is the ${dorm.label} plan exact?`,
            answer: `It is a measured starter for planning. Confirm final dimensions with housing if your assignment has a variant, then adjust walls in Toova if needed.`,
          },
        ],
      });
    }
  }
  return articles;
}

export const UCHICAGO_DORM_ARTICLES = buildUChicagoDormArticles();
