export type PillowSizeId = 'decorative' | 'standard' | 'queen' | 'king' | 'euro';

export interface BeddingColor {
  id: string;
  label: string;
  hex: string;
}

export interface BeddingPattern {
  id: string;
  label: string;
}

export interface BeddingFinish {
  colorId: string;
  patternId: string;
}

export interface BeddingPillow {
  id: string;
  size: PillowSizeId;
  colorId: string;
  patternId: string;
  offsetX?: number;
  offsetZ?: number;
}

export interface BeddingConfig {
  version: 1;
  topper: { enabled: boolean };
  sheets: { enabled: boolean } & BeddingFinish;
  comforter: { enabled: boolean; drapeInches?: number } & BeddingFinish;
  pillows: { enabled: boolean; items: BeddingPillow[] };
}

export type BeddingConfigPatch = {
  topper?: Partial<BeddingConfig['topper']>;
  sheets?: Partial<BeddingConfig['sheets']>;
  comforter?: Partial<BeddingConfig['comforter']>;
  pillows?: Partial<BeddingConfig['pillows']> & { items?: BeddingPillow[] };
};
