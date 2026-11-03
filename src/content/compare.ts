import type { SeoArticle } from './types';

export const COMPARE_ARTICLES: SeoArticle[] = [
  {
    path: '/compare/planner-5d/',
    title: 'Toova vs Planner 5D — Which Room Design Tool Fits You? | Toova',
    description:
      'Compare Toova and Planner 5D. Planner 5D is a general floor-plan suite; Toova focuses on photo-to-3D furniture and designing before you buy.',
    heading: 'Toova vs Planner 5D',
    lead: 'Both help you visualize a room. They optimize for different jobs.',
    priority: 0.7,
    breadcrumbs: [
      { name: 'Home', path: '/' },
      { name: 'Compare', path: '/compare/planner-5d/' },
      { name: 'Planner 5D', path: '/compare/planner-5d/' },
    ],
    cta: { label: 'Try Toova free', href: '/' },
    sections: [
      {
        heading: 'Quick take',
        body: [
          'Planner 5D is a broad interior-design suite with large asset catalogs and floor-plan tools aimed at remodeling and decoration projects.',
          'Toova is a shopping-first room designer: upload a product photo, get a real-scale 3D model, and place it in your room — including measured UChicago dorm plans.',
        ],
      },
      {
        heading: 'When to choose Toova',
        body: [
          'You are about to buy furniture online and want to know it fits.',
          'You need a measured dorm starter more than a full remodeling toolkit.',
          'You want photo-to-3D of a specific product, not only catalog meshes.',
        ],
      },
      {
        heading: 'When Planner 5D may fit better',
        body: [
          'You are renovating and need extensive catalogs, materials, and presentation tools for a whole-home project.',
          'You already work in Planner 5D’s ecosystem and need its collaboration or export features.',
        ],
      },
    ],
    faq: [
      {
        question: 'Is Toova a Planner 5D alternative?',
        answer:
          'For shoppers checking fit before buying, yes. For full architectural or remodeling workflows, Planner 5D remains the broader suite.',
      },
    ],
  },
  {
    path: '/compare/roomsketcher/',
    title: 'Toova vs RoomSketcher — Room Planner Comparison | Toova',
    description:
      'Compare Toova and RoomSketcher. RoomSketcher emphasizes floor plans and home drawings; Toova emphasizes photo-to-3D furniture and pre-purchase fit.',
    heading: 'Toova vs RoomSketcher',
    lead: 'RoomSketcher shines at drawing homes. Toova shines at placing the products you are about to order.',
    priority: 0.7,
    breadcrumbs: [
      { name: 'Home', path: '/' },
      { name: 'RoomSketcher', path: '/compare/roomsketcher/' },
    ],
    cta: { label: 'Try Toova free', href: '/' },
    sections: [
      {
        heading: 'Quick take',
        body: [
          'RoomSketcher is known for accessible 2D/3D floor plans, measurements, and home design drawings for homeowners and professionals.',
          'Toova starts from the purchase: turn a store photo into a model, drop it into a real-scale room, and decide with confidence.',
        ],
      },
      {
        heading: 'When to choose Toova',
        body: [
          'You care most about whether a specific SKU fits a dorm or apartment.',
          'You want AI photo-to-3D rather than only premade furniture libraries.',
        ],
      },
      {
        heading: 'When RoomSketcher may fit better',
        body: [
          'You need polished floor-plan documents, elevations, or contractor-ready drawings.',
        ],
      },
    ],
  },
  {
    path: '/compare/homestyler/',
    title: 'Toova vs Homestyler — 3D Room Design Comparison | Toova',
    description:
      'Compare Toova and Homestyler. Homestyler offers rich interior scenes; Toova focuses on real-scale product fit before you buy.',
    heading: 'Toova vs Homestyler',
    lead: 'Homestyler is strong for styled interior renders. Toova is strong for honest product-scale fit checks.',
    priority: 0.7,
    breadcrumbs: [
      { name: 'Home', path: '/' },
      { name: 'Homestyler', path: '/compare/homestyler/' },
    ],
    cta: { label: 'Try Toova free', href: '/' },
    sections: [
      {
        heading: 'Quick take',
        body: [
          'Homestyler provides cloud-based 3D interior design with large brand catalogs and presentation-oriented renders.',
          'Toova is narrower on purpose: photo-to-3D of the item in your cart, measured student-housing plans, and a path from layout to purchase.',
        ],
      },
      {
        heading: 'Choose Toova when',
        body: [
          'Fit and clearance matter more than a magazine render.',
          'You are planning a dorm with a known footprint.',
        ],
      },
    ],
  },
  {
    path: '/compare/ikea-kreativ/',
    title: 'Toova vs IKEA Kreativ — Beyond One Retailer | Toova',
    description:
      'Compare Toova and IKEA Kreativ. Kreativ visualizes IKEA products in your space; Toova works with product photos from any store.',
    heading: 'Toova vs IKEA Kreativ',
    lead: 'IKEA Kreativ is excellent inside the IKEA catalog. Toova helps when your cart spans many stores.',
    priority: 0.7,
    breadcrumbs: [
      { name: 'Home', path: '/' },
      { name: 'IKEA Kreativ', path: '/compare/ikea-kreativ/' },
    ],
    cta: { label: 'Try Toova free', href: '/' },
    sections: [
      {
        heading: 'Quick take',
        body: [
          'IKEA Kreativ lets you scan a room and place IKEA products with strong brand fidelity.',
          'Toova is retailer-agnostic: upload a photo from any product page, generate a real-scale model, and test it in your plan — including non-IKEA furniture and dorm templates.',
        ],
      },
      {
        heading: 'Use both',
        body: [
          'Many shoppers mix IKEA with marketplace finds. Kreativ covers the IKEA half; Toova covers the rest of the cart and measured dorm footprints.',
        ],
      },
    ],
  },
];
