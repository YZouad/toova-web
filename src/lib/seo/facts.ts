import { formatUsd, PLAN_OFFERS } from '../../ui/billing/planCatalog';

/** Shared product copy — keep Landing FAQ, JSON-LD, and llms.txt aligned. */
export const PRODUCT_NAME = 'Toova';
export const PRODUCT_TAGLINE = '3D Room Planner to Design Before You Buy';
export const PRODUCT_DESCRIPTION =
  'A free 3D room designer that turns product photos into real-scale models so you can plan your room and see what fits before you buy.';

export const ORGANIZATION_SAME_AS = [
  'https://apps.apple.com/app/toova',
  'https://www.linkedin.com/company/toova',
  'https://x.com/toova',
  'https://www.producthunt.com/products/toova',
] as const;

export interface SeoFaqItem {
  question: string;
  answer: string;
}

const lite = PLAN_OFFERS[0]!;
const pro = PLAN_OFFERS[1]!;

export const PRICING_SUMMARY = `Free for five rooms. Lite is ${formatUsd(lite.monthlyCents)} a month or ${formatUsd(lite.yearlyCents)} a year. Pro is ${formatUsd(pro.monthlyCents)} a month or ${formatUsd(pro.yearlyCents)} a year.`;

/** Landing + schema FAQ. Keyword-bearing without stuffing. */
export const SEO_FAQ: SeoFaqItem[] = [
  {
    question: 'What is Toova?',
    answer:
      'Toova is a free 3D room designer and room planner: turn a product photo into a model and place it in your room at real scale.',
  },
  {
    question: 'How does the room planner work?',
    answer:
      'Upload a product photo, get a 3D model in about thirty seconds, arrange it against your walls, then buy with confidence from the room you designed.',
  },
  {
    question: 'Is Toova a free room designer?',
    answer: `Yes. ${PRICING_SUMMARY}`,
  },
  {
    question: 'How do I design my room online?',
    answer:
      'Open Toova, start a room (blank, rectangle, or a measured dorm plan), add furniture from a photo or the catalog, and drag pieces into place at real scale.',
  },
  {
    question: 'Can I see furniture in my room before buying?',
    answer:
      'Yes. Toova is built for that: place real-scale 3D models inside your layout so you can check fit, clearance, and style before you spend.',
  },
  {
    question: 'Can I plan a dorm before I move in?',
    answer:
      'Yes. Measured University of Chicago dorm plans (Woodlawn, North, Max P, Burton-Judson, I-House, RGG, Snell-Hitchcock) are available today.',
  },
  {
    question: 'How is Toova different from Planner 5D or RoomSketcher?',
    answer:
      'Those tools are general floor-plan editors. Toova focuses on shoppers: photo-to-3D furniture at real scale, measured dorm starters, and designing the room you are about to buy for.',
  },
];
