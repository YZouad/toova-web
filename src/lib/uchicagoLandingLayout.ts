/**
 * Shared landing carousel + "Open this plan" payload for UChicago starters.
 */

import type { FloorPlan } from './floorPlanGeometry';
import {
  materializeStarterItems,
  type RoomStarterTemplate,
} from './roomStarterTemplates';
import { resolveStarterItemAssets } from './starterTemplateOverrides';
import { uchicagoDemoMaterializedItems } from './uchicagoDormMarketing';
import type { RoomEnvironment } from '../store';
import type { Item } from '../store';

export interface UChicagoCarouselLayout {
  plan: FloorPlan;
  environment: RoomEnvironment;
  items: Item[];
  order: string[];
}

/** Plan, environment, and furnished items shown in the landing dorm carousel. */
export async function buildUChicagoCarouselLayout(
  template: RoomStarterTemplate,
): Promise<UChicagoCarouselLayout> {
  const plan = template.buildPlan();
  const environment = template.buildEnvironment();
  let { items, order } = materializeStarterItems(template, plan);
  if (items.length === 0 && template.dormMeta?.layout) {
    ({ items, order } = uchicagoDemoMaterializedItems(template.dormMeta.layout, plan));
  }
  await resolveStarterItemAssets(items);
  return { plan, environment, items, order };
}