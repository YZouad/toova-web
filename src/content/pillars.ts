import type { SeoArticle } from './types';

export const PILLAR_ARTICLES: SeoArticle[] = [
  {
    path: '/room-designer/',
    title: 'Free 3D Room Designer — Plan Your Space Before You Buy | Toova',
    description:
      'Toova is a free 3D room designer. Place furniture at real scale, use measured dorm plans, and see what fits before you buy.',
    heading: 'Free 3D room designer',
    lead: 'Design your room in the browser. Turn product photos into real-scale 3D models and arrange them against your actual walls.',
    priority: 0.9,
    breadcrumbs: [
      { name: 'Home', path: '/' },
      { name: 'Room designer', path: '/room-designer/' },
    ],
    cta: { label: 'Start designing, free', href: '/' },
    sections: [
      {
        heading: 'What a room designer should do',
        body: [
          'A room designer is only useful if the pieces match the room you will actually live in. Toova keeps dimensions honest: models are reconstructed to real-world scale, and dorm starters use measured University of Chicago floor plans.',
          'You do not need CAD experience. Upload a photo from any store page, wait about thirty seconds for a 3D model, then drag it into your layout.',
        ],
      },
      {
        heading: 'Design before you spend',
        body: [
          'Most furniture returns start as a guess on a product page. A free room designer that shows clearance, door swings, and how a chair sits next to a desk prevents that guess.',
          'Toova is free for five rooms. When you need more, Lite and Pro unlock higher limits without changing the core workflow.',
        ],
      },
      {
        heading: 'Who it is for',
        body: [
          'Students planning a dorm before move-in day, renters furnishing a first apartment, and anyone who wants to see a product in their space before checkout.',
        ],
      },
    ],
    faq: [
      {
        question: 'Is the Toova room designer free?',
        answer: 'Yes. You can design up to five rooms for free. Paid plans add more rooms, credits, and export options.',
      },
      {
        question: 'Do I need to install software?',
        answer: 'No. The room designer runs in the browser at toova.net. There is also an iOS app for designing on your phone.',
      },
    ],
  },
  {
    path: '/room-planner/',
    title: 'Online Room Planner — Layout Your Space in 3D | Toova',
    description:
      'Plan room layouts online with Toova. Build walls, place furniture at real scale, and share a plan before you buy.',
    heading: 'Online room planner',
    lead: 'Sketch a floor plan, drop in furniture at real scale, and share the layout with a roommate or roommate-to-be.',
    priority: 0.9,
    breadcrumbs: [
      { name: 'Home', path: '/' },
      { name: 'Room planner', path: '/room-planner/' },
    ],
    cta: { label: 'Open the room planner', href: '/' },
    sections: [
      {
        heading: 'Floor plans without the learning curve',
        body: [
          'Start from a blank plan, a simple rectangle, or a measured dorm template. Adjust walls and openings, then furnish from photos or the catalog.',
          'The planner is built for shopping decisions, not architectural drawings: enough precision to know a dresser fits, without a week of tutorials.',
        ],
      },
      {
        heading: 'Plan together',
        body: [
          'Share a room link when you want a second opinion. Public gallery rooms show how other people solved the same footprint.',
        ],
      },
    ],
  },
  {
    path: '/dorm-room-planner/',
    title: 'Dorm Room Planner — Measured UChicago Layouts | Toova',
    description:
      'Plan your dorm before move-in. Toova includes measured University of Chicago dorm plans so you can place furniture at real scale.',
    heading: 'Dorm room planner',
    lead: 'Move-in week is a dozen purchases for a room you have never stood in. Plan it first with measured dorm layouts.',
    priority: 0.9,
    breadcrumbs: [
      { name: 'Home', path: '/' },
      { name: 'Dorm room planner', path: '/dorm-room-planner/' },
    ],
    cta: { label: 'Browse UChicago dorm plans', href: '/dorms/uchicago/' },
    sections: [
      {
        heading: 'Measured plans, not guesswork',
        body: [
          'Toova ships blank starters for Woodlawn, North, Max Palevsky, Burton-Judson, International House, Renee Granville-Grossman, and Snell-Hitchcock — singles, doubles, and BJ pass-through where it applies.',
          'Open a layout, add loft beds, desks, and mini-fridges from photos, and check whether the door still clears.',
        ],
      },
      {
        heading: 'Built for student housing first',
        body: [
          'We started with dorms because the problem is sharp: remote shopping, tight footprints, and a hard deadline. Apartments and first homes are next; the same planner workflow carries over.',
        ],
      },
    ],
    faq: [
      {
        question: 'Which campuses have dorm plans?',
        answer:
          'University of Chicago residence halls are available today. More campuses are on the roadmap.',
      },
    ],
  },
  {
    path: '/furniture-fit-checker/',
    title: 'Furniture Fit Checker — See If It Fits Before You Buy | Toova',
    description:
      'Check whether furniture fits your room before you buy. Place real-scale 3D models in your layout with Toova.',
    heading: 'See if furniture fits before you buy',
    lead: 'Stop measuring with a tape after delivery. Drop a real-scale model into your room and check fit first.',
    priority: 0.85,
    breadcrumbs: [
      { name: 'Home', path: '/' },
      { name: 'Furniture fit checker', path: '/furniture-fit-checker/' },
    ],
    cta: { label: 'Check fit in your room', href: '/' },
    sections: [
      {
        heading: 'Fit is more than width × depth',
        body: [
          'A sofa that fits the wall may still block a closet door. Toova lets you place pieces against your openings so clearance problems show up before checkout.',
          'Upload a product photo to generate a 3D model at real-world scale, or pick from supported catalog items.',
        ],
      },
      {
        heading: 'Fewer returns, fewer trucks',
        body: [
          'The best return is the one that never happens. A quick fit check saves money, time, and a trip back to the carrier.',
        ],
      },
    ],
  },
  {
    path: '/photo-to-3d-furniture/',
    title: 'Photo to 3D Furniture — Real-Scale Models from a Snapshot | Toova',
    description:
      'Turn a product photo into a real-scale 3D furniture model in about thirty seconds, then place it in your Toova room.',
    heading: 'Photo to 3D furniture',
    lead: 'One clear product photo becomes a solid object you can drop into your room planner at real scale.',
    priority: 0.85,
    breadcrumbs: [
      { name: 'Home', path: '/' },
      { name: 'Photo to 3D', path: '/photo-to-3d-furniture/' },
    ],
    cta: { label: 'Try photo to 3D', href: '/' },
    sections: [
      {
        heading: 'From store page to floor plan',
        body: [
          'Find a chair, lamp, or shelf online. Upload the photo. Toova reconstructs a 3D model in roughly thirty seconds so you can test it in your layout before you buy.',
          'Works with your own photos and with pieces already in the Toova catalog.',
        ],
      },
      {
        heading: 'Why scale matters',
        body: [
          'A pretty 3D preview is useless if it is the wrong size. Toova aims for real-world dimensions so a desk that is 48 inches wide stays 48 inches in the room.',
        ],
      },
    ],
  },
];
