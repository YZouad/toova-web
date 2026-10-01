import type { AgenticItemAsk, AgenticVibeId } from './agenticRoomPrompt';

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
  warnings: string[];
  source: 'cursor' | 'rules-fallback';
}
