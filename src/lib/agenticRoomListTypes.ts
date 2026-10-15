import type { AgenticItemAsk, AgenticVibeId } from './agenticRoomPrompt';
import type { WindowCurtains } from './floorPlanGeometry';

export interface AgenticFurnitureListResult {
  items: AgenticItemAsk[];
  widthIn?: number;
  depthIn?: number;
  budgetCents?: number;
  /** Parsed room type, e.g. "dorm bedroom", "home office". */
  roomType?: string;
  /** Free-text theme/style from the description, e.g. "gothic", "minimalist". */
  theme?: string;
  vibe?: AgenticVibeId;
  /** Sum of line estimates when Cursor provides them. */
  estimatedTotalCents?: number;
  /** Built-in window curtains for the 3D room (not a shopping line item). */
  windowCurtains?: WindowCurtains | null;
  /** User- or agent-chosen palette (#RRGGBB), applied to walls and furniture. */
  colorScheme?: string[];
  /** Wall height in inches when known (e.g. room scan). */
  heightIn?: number;
  warnings: string[];
  source: 'cursor' | 'rules-fallback' | 'manual' | 'room-scan';
}
