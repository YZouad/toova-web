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

export const UCHICAGO_DESIGN_ARTICLE: SeoArticle = {
  path: '/dorms/uchicago/design-your-dorm/',
  title: 'Design Your UChicago Dorm Room — Measured Templates | Toova',
  description:
    'Design your University of Chicago dorm before move-in: measured Woodlawn, North, Max P, B-J, I-House, RGG, and Snell-Hitchcock layouts. Place beds, desks, and carts at real scale.',
  heading: 'Design your UChicago dorm',
  lead: 'Start from your residence hall’s measured footprint, drag in beds and desks, and see what fits before you shop.',
  priority: 0.88,
  breadcrumbs: [
    { name: 'Home', path: '/' },
    { name: 'UChicago dorms', path: '/dorms/uchicago/' },
    { name: 'Design your dorm', path: '/dorms/uchicago/design-your-dorm/' },
  ],
  cta: { label: 'Open Woodlawn double', href: '/?template=uchicago-woodlawn-double' },
  sections: [
    {
      heading: 'Built for Chicago dorm shapes',
      body: [
        'Every template matches a UChicago single, double, or Burton-Judson pass-through footprint. The preview on this page shows example furniture — your room opens blank so you can place your actual bed, desk, and mini-fridge.',
        'Use the shopping checklist inside Toova to keep what you still need to buy.',
      ],
    },
    {
      heading: 'Works for doubles and roommates',
      body: [
        'In a double, mirror beds along each wall, pull chairs back from desks, and leave the door swing clear before you argue about the rug.',
        'Share the saved room link so your roommate sees the same layout.',
      ],
    },
  ],
  faq: [
    {
      question: 'Do I need to know my exact room number?',
      answer:
        'You need your hall and layout type (single or double). If housing gives you different dimensions, tweak the walls in the editor after you open the template.',
    },
    {
      question: 'Can I use my own furniture photos?',
      answer:
        'Yes. Upload a product image and Toova builds a real-scale model you can place on the dorm plan.',
    },
  ],
};

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
        'For a walkthrough with example layouts for every hall, see Design your UChicago dorm.',
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
