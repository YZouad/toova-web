import {
  JUST_WEB_DEMO_URL,
  MOBILE_DEMO_URL,
  TWO_D_THREE_D_DEMO_URL,
} from './DemoVideoModal';

export const DEMOS = [
  {
    id: '2d-3d',
    badge: '2D → 3D',
    url: TWO_D_THREE_D_DEMO_URL,
    caption: 'Upload a product photo and watch AI turn it into an interactive 3D model.',
    mobile: false,
  },
  {
    id: 'web',
    badge: 'Web',
    url: JUST_WEB_DEMO_URL,
    caption: 'Design your dorm, place furniture, and visualize your space on desktop.',
    mobile: false,
  },
  {
    id: 'mobile',
    badge: 'Mobile / AR',
    url: MOBILE_DEMO_URL,
    caption: 'View your room in augmented reality on iPhone.',
    mobile: true,
  },
] as const;

export type DemoVideo = (typeof DEMOS)[number];
