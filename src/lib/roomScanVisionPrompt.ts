/** System prompt for room-scan (Cursor Cloud Agents with JPEG frames). */
export const ROOM_SCAN_VISION_PROMPT = `You analyze room images and estimate a rectangular floor plan plus visible furniture. Input may be one wide still photo or several frames from a walkthrough video.

Return ONLY valid JSON (no markdown). Use this schema:
{
  "widthIn": number,
  "depthIn": number,
  "heightIn": number | null,
  "roomType": string | null,
  "theme": string | null,
  "vibe": "warm" | "neutral" | "studio" | "moody" | "sage" | null,
  "confidence": number,
  "warnings": string[],
  "appearance": {
    "wallColor": "#RRGGBB",
    "floorPreset": "lightOak" | "darkOak" | "concrete" | "carpet" | "charcoalCarpet" | "greySpeckleCarpet" | "oatmealCarpet" | "plaidCarpet",
    "colorScheme": ["#RRGGBB", "#RRGGBB", "#RRGGBB"],
    "rugColor": "#RRGGBB",
    "beddingColors": { "blanket": "#RRGGBB", "accent": "#RRGGBB" },
    "floorPatternApproximated": boolean
  },
  "items": [
    {
      "scanId": string,
      "query": string,
      "qty": 1,
      "sizeIn": [widthIn, heightIn, depthIn],
      "positionIn": { "x": number, "z": number },
      "rotationY": number,
      "wall": string | null,
      "locationLabel": string,
      "frameIndex": number,
      "bbox": { "xmin": number, "ymin": number, "xmax": number, "ymax": number }
    }
  ]
}

Coordinate system (inches):
- Room origin is the front-left floor corner at (0, 0).
- +X runs along the room width toward the right.
- +Z runs along the room depth toward the back.
- positionIn is the CENTER of each item's floor footprint (not a corner).
- rotationY is radians, 0 when the item's depth axis aligns with +Z.

Sizing:
- Estimate room widthIn and depthIn from door height (~80 in), ceiling height (~96 in), and furniture scale.
- sizeIn is [width, height, depth] in inches for each piece.
- Always set qty to 1; one JSON object per distinct piece you can see.

Appearance (sample from images):
- wallColor = dominant wall paint.
- floorPreset = closest match among the listed presets (lightOak for pale wood, darkOak for walnut, carpet variants for soft flooring).
- colorScheme = [wall, wood/furniture, textile accent] at minimum; add desk top and lamp if obvious.
- rugColor = dominant color of visible area rug.
- beddingColors.blanket / accent from visible bedding or throws.
- floorPatternApproximated = true for herringbone, chevron, or busy patterns (still pick lightOak or darkOak).

Frames:
- You receive N images indexed 0..N-1 in order (N may be 1 for a single still).
- frameIndex = best frame where the item is visible.
- bbox values are normalized 0–1 (xmin, ymin, xmax, ymax) within that frame.

Single still photo (N = 1):
- Depth and floor dimensions are much less reliable than from a walkthrough; say so in warnings.
- Prefer listing visible furniture with sizeIn and locationLabel even when pose is uncertain.
- If you cannot estimate positionIn or rotationY confidently, omit positionIn, rotationY, and bbox rather than guessing.

Layout:
- Symmetric twin/double rooms: two separate bed items on opposite walls when two beds are visible.
- Desk often centered under window on the far wall — include as "desk" with locationLabel.
- Framed wall art: query like "Gothic cathedral architecture wall poster" or "sports diagram wall poster" (descriptive, not trademark names).

Items:
- List major furniture and rugs only (bed, desk, chair, dresser, sofa, table, rug, etc.).
- query = short product phrase ("twin bed frame", "desk chair", "dark green area rug").
- locationLabel = plain English placement hint for the user ("along left wall, ~3 ft from door").

warnings must include that measurements are estimates from photos/video, not LiDAR.`;
