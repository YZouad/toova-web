import { DOOR } from '../../units';
import type { ScaleConsensus, ScaleEstimate } from './types';

const FT_IN = 12;
const M_IN = 39.37007874;

function parseFeetInchChunk(text: string): number | null {
  const t = text.trim();
  const m =
    t.match(/^(\d+(?:\.\d+)?)\s*['′']\s*(\d+(?:\.\d+)?)?\s*[""″]?$/i) ??
    t.match(/^(\d+(?:\.\d+)?)\s*ft\s*(\d+(?:\.\d+)?)?\s*in?$/i);
  if (m) {
    const feet = parseFloat(m[1]!);
    const inches = m[2] ? parseFloat(m[2]) : 0;
    return feet * FT_IN + inches;
  }
  const feetOnly = t.match(/^(\d+(?:\.\d+)?)\s*['′']$/);
  if (feetOnly) return parseFloat(feetOnly[1]!) * FT_IN;
  const inOnly = t.match(/^(\d+(?:\.\d+)?)\s*[""″]$/);
  if (inOnly) return parseFloat(inOnly[1]!);
  const plain = t.match(/^(\d+(?:\.\d+)?)\s*in(?:ches)?$/i);
  if (plain) return parseFloat(plain[1]!);
  const meters = t.match(/^(\d+(?:\.\d+)?)\s*m(?:eters?)?$/i);
  if (meters) return parseFloat(meters[1]!) * M_IN;
  const cm = t.match(/^(\d+(?:\.\d+)?)\s*cm$/i);
  if (cm) return parseFloat(cm[1]!) * (M_IN / 100);
  const num = t.match(/^(\d+(?:\.\d+)?)$/);
  if (num) return parseFloat(num[1]!);
  return null;
}

export function parseLengthToInches(text: string): number | null {
  const t = text.trim();
  if (/sq\s*\.?\s*ft|sqft|m²|sq\s*m|square\s+feet/i.test(t)) return null;
  const combined = t.match(
    /^(\d+)\s*['′']\s*(\d+)\s*[""″]$/i,
  );
  if (combined) return parseInt(combined[1]!, 10) * FT_IN + parseInt(combined[2]!, 10);
  return parseFeetInchChunk(t);
}

export function parseAreaToSqIn(text: string): number | null {
  const t = text.trim();
  const sqFt = t.match(/(\d+(?:\.\d+)?)\s*(?:sq\.?\s*ft\.?|sqft|square\s+feet)/i);
  if (sqFt) return parseFloat(sqFt[1]!) * FT_IN * FT_IN;
  const sqM = t.match(/(\d+(?:\.\d+)?)\s*(?:m²|sq\s*m|square\s+meters?)/i);
  if (sqM) return parseFloat(sqM[1]!) * M_IN * M_IN;
  return null;
}

export function parseRoomDimensions(text: string): { widthIn: number; depthIn: number } | null {
  const parts = text.split(/\s*[x×]\s*/i);
  if (parts.length !== 2) return null;
  const widthIn = parseLengthToInches(parts[0]!);
  const depthIn = parseLengthToInches(parts[1]!);
  if (widthIn == null || depthIn == null) return null;
  return { widthIn, depthIn };
}

export function estimateScaleFromArea(areaSqInPx: number, areaSqInReal: number): ScaleEstimate {
  if (areaSqInPx <= 0 || areaSqInReal <= 0) {
    return { inchesPerPixel: 1, source: 'area', confidence: 0.2 };
  }
  const linearRatio = Math.sqrt(areaSqInReal / areaSqInPx);
  return {
    inchesPerPixel: linearRatio,
    source: 'area',
    confidence: 0.65,
  };
}

export function estimateScaleFromLength(
  lengthPx: number,
  lengthIn: number,
  source: string,
): ScaleEstimate {
  if (lengthPx <= 0 || lengthIn <= 0) {
    return { inchesPerPixel: 1, source, confidence: 0.2 };
  }
  return {
    inchesPerPixel: lengthIn / lengthPx,
    source,
    confidence: 0.75,
  };
}

function median(nums: number[]): number {
  if (nums.length === 0) return 1;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

export function consensusScale(
  estimates: ScaleEstimate[],
  opts?: { doorGapMedianPx?: number },
): ScaleConsensus {
  if (estimates.length === 0) {
    if (opts?.doorGapMedianPx && opts.doorGapMedianPx > 0) {
      const ipp = DOOR.width / opts.doorGapMedianPx;
      return {
        inchesPerPixel: ipp,
        estimates: [
          {
            inchesPerPixel: ipp,
            source: 'door_default',
            confidence: 0.35,
          },
        ],
        confirmed: false,
        provisional: true,
      };
    }
    return {
      inchesPerPixel: 1,
      estimates: [],
      confirmed: false,
      provisional: true,
    };
  }

  const ipp = median(estimates.map((e) => e.inchesPerPixel));
  const agreeing = estimates.filter(
    (e) => Math.abs(e.inchesPerPixel - ipp) / ipp <= 0.05,
  );
  const confirmed = agreeing.length >= 2;

  return {
    inchesPerPixel: ipp,
    estimates,
    confirmed,
    provisional: !confirmed,
  };
}