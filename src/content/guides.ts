import type { SeoArticle } from './types';

export const GUIDE_ARTICLES: SeoArticle[] = [
  {
    path: '/guides/how-to-design-a-dorm-room/',
    title: 'How to Design a Dorm Room Before Move-In | Toova',
    description:
      'Step-by-step guide to designing a dorm room before you arrive: measure or pick a template, place beds and desks, and buy only what fits.',
    heading: 'How to design a dorm room',
    lead: 'Design the room on a laptop the week before you arrive — not on the floor with unopened boxes.',
    priority: 0.75,
    breadcrumbs: [
      { name: 'Home', path: '/' },
      { name: 'Guides', path: '/guides/how-to-design-a-dorm-room/' },
      { name: 'Design a dorm', path: '/guides/how-to-design-a-dorm-room/' },
    ],
    cta: { label: 'Design a UChicago dorm', href: '/dorms/uchicago/design-your-dorm/' },
    sections: [
      {
        heading: '1. Start from a real footprint',
        body: [
          'If your school publishes dimensions, use them. For University of Chicago halls, open a measured Toova starter for your building and layout (single, double, or pass-through).',
        ],
      },
      {
        heading: '2. Place the immovables first',
        body: [
          'Beds, desks, and wardrobes eat the plan. Put them down before decor. Check door swings and window clearance.',
        ],
      },
      {
        heading: '3. Add products from photos',
        body: [
          'Upload store photos for chairs, lamps, and storage. Toova builds real-scale models so you are not guessing from a lifestyle shot.',
        ],
      },
      {
        heading: '4. Buy from the plan',
        body: [
          'Once the layout works, purchase the pieces you already tested. Fewer returns, less chaos on move-in day.',
        ],
      },
    ],
  },
  {
    path: '/guides/how-to-measure-your-room-for-furniture/',
    title: 'How to Measure Your Room for Furniture | Toova',
    description:
      'Learn what to measure before buying furniture: wall lengths, door swings, ceiling height, and pathways — then check fit in Toova.',
    heading: 'How to measure your room for furniture',
    lead: 'A tape measure and three numbers prevent most “it doesn’t fit” disasters.',
    priority: 0.7,
    breadcrumbs: [
      { name: 'Home', path: '/' },
      { name: 'Measure your room', path: '/guides/how-to-measure-your-room-for-furniture/' },
    ],
    cta: { label: 'Check fit in 3D', href: '/furniture-fit-checker/' },
    sections: [
      {
        heading: 'Walls and openings',
        body: [
          'Measure each wall length, then door and window widths and their positions from a corner. Note which way doors swing.',
        ],
      },
      {
        heading: 'Height and pathways',
        body: [
          'Ceiling height matters for loft beds and tall bookcases. Leave walking paths of at least 30 inches where you can.',
        ],
      },
      {
        heading: 'Transfer into Toova',
        body: [
          'Recreate the rectangle (or use a dorm template), place candidate furniture at real scale, and adjust before you order.',
        ],
      },
    ],
  },
  {
    path: '/guides/small-bedroom-layout-ideas/',
    title: 'Small Bedroom Layout Ideas That Actually Fit | Toova',
    description:
      'Practical small bedroom layout ideas: bed placement, desk zones, and storage — test them at real scale in Toova before you buy.',
    heading: 'Small bedroom layout ideas',
    lead: 'In a small bedroom every inch is a decision. Try the layout before the truck arrives.',
    priority: 0.7,
    breadcrumbs: [
      { name: 'Home', path: '/' },
      { name: 'Small bedroom ideas', path: '/guides/small-bedroom-layout-ideas/' },
    ],
    cta: { label: 'Design a small bedroom', href: '/' },
    sections: [
      {
        heading: 'Bed on the longest wall',
        body: [
          'Often frees a rectangle for a desk or dresser. In dorms, confirm the bed still clears the door and any built-in wardrobe.',
        ],
      },
      {
        heading: 'Desk under the window',
        body: [
          'Natural light helps study setups. Check that the chair can pull out without hitting the bed.',
        ],
      },
      {
        heading: 'Vertical storage',
        body: [
          'Tall, narrow shelves beat deep cabinets in tight rooms. Test height against your ceiling measurement in the planner.',
        ],
      },
    ],
  },
];
