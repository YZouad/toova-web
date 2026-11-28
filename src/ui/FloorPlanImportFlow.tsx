import { useCallback, useRef, useState } from 'react';
import type { FloorPlan, FloorPlanUnderlay } from '../lib/floorPlanGeometry';
import { ingestFloorPlanFromRgba } from '../lib/floorPlanIngest';
import { renderMarkedOverlayDataUrl } from '../lib/floorPlanIngest/renderMarks';
import { analyzeFloorPlanVision } from '../lib/floorPlanIngestApi';
import { extractRoomScanFrameFromImageFile, isRoomScanImageFile } from '../lib/roomScanFrames';
import type { FloorPlanIngestReview } from './FloorPlanEditor';
import { Banner, Button, Spinner } from './kit';

export interface FloorPlanImportResult {
  plan: FloorPlan;
  underlay: FloorPlanUnderlay;
  ingestReview: FloorPlanIngestReview;
}

interface FloorPlanImportFlowProps {
  disabled?: boolean;
  onBack: () => void;
  onImported: (result: FloorPlanImportResult) => void | Promise<void>;
}

type Phase = 'pick' | 'decoding' | 'extracting' | 'vision' | 'building';

async function decodeImageToRgba(
  dataUrl: string,
): Promise<{ rgba: Uint8ClampedArray; width: number; height: number; objectUrl: string }> {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    throw new Error('Could not read floor plan image.');
  }
  ctx.drawImage(bitmap, 0, 0);
  const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
  bitmap.close();
  const objectUrl = URL.createObjectURL(blob);
  return {
    rgba: imageData.data,
    width: imageData.width,
    height: imageData.height,
    objectUrl,
  };
}

export function FloorPlanImportFlow({ disabled, onBack, onImported }: FloorPlanImportFlowProps) {
  const [phase, setPhase] = useState<Phase>('pick');
  const [error, setError] = useState<string | null>(null);
  const [statusNote, setStatusNote] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const runImport = useCallback(
    async (file: File) => {
      if (disabled) return;
      setError(null);
      setStatusNote(null);
      setPhase('decoding');
      try {
        if (!isRoomScanImageFile(file)) {
          setError('Choose a JPEG, PNG, or WebP floor plan image.');
          setPhase('pick');
          return;
        }
        const frame = await extractRoomScanFrameFromImageFile(file);
        setPhase('extracting');
        const decoded = await decodeImageToRgba(frame);

        // Geometry-only first pass (needed for mark positions).
        let geometry = ingestFloorPlanFromRgba(decoded.rgba, decoded.width, decoded.height);

        setPhase('vision');
        let visionOk = false;
        try {
          const faces = geometry.marks?.faces ?? [];
          const gaps = geometry.marks?.gaps ?? [];
          const overlay = await renderMarkedOverlayDataUrl(decoded.objectUrl, faces, gaps);
          const vision = await analyzeFloorPlanVision({
            imageDataUrl: frame,
            overlayDataUrl: overlay,
            faceIds: faces.map((f) => f.id),
            gapIds: gaps.map((g) => g.id),
          });
          if (vision.ok) {
            visionOk = true;
            setPhase('building');
            geometry = ingestFloorPlanFromRgba(decoded.rgba, decoded.width, decoded.height, {
              vision: vision.vision,
            });
          } else {
            setStatusNote(
              vision.warnings[0] ??
                'Could not read labels from the image — walls were extracted; confirm scale manually.',
            );
          }
        } catch {
          setStatusNote('Vision labeling skipped — confirm scale with the Set scale tool.');
        }

        setPhase('building');
        const scaleNeedsConfirmation =
          geometry.report.scale.provisional || !geometry.report.scale.confirmed;

        const underlay: FloorPlanUnderlay = {
          imageUrl: decoded.objectUrl,
          imageWidth: geometry.underlay.imageWidth,
          imageHeight: geometry.underlay.imageHeight,
          originX: geometry.underlay.originX,
          originZ: geometry.underlay.originZ,
          inchesPerPixel: geometry.underlay.inchesPerPixel,
        };

        const ingestReview: FloorPlanIngestReview = {
          uncertainWallIds: geometry.report.uncertainWallIds,
          uncertainOpeningIds: geometry.report.uncertainOpeningIds,
          scaleNeedsConfirmation,
        };

        if (!visionOk && geometry.report.warnings.length) {
          setStatusNote(geometry.report.warnings[0] ?? statusNote);
        }

        await onImported({ plan: geometry.plan, underlay, ingestReview });
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not import floor plan');
        setPhase('pick');
      }
    },
    [disabled, onImported, statusNote],
  );

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) void runImport(file);
  };

  const busy = phase !== 'pick';
  const status =
    phase === 'decoding'
      ? 'Reading image…'
      : phase === 'extracting'
        ? 'Detecting walls…'
        : phase === 'vision'
          ? 'Reading room labels and dimensions…'
          : phase === 'building'
            ? 'Building floor plan…'
            : null;

  return (
    <div className="agentic-room-flow floorplan-import-flow">
      <div className="agentic-room-flow__head">
        <Button size="sm" variant="outline" disabled={disabled || busy} onClick={onBack}>
          Back
        </Button>
      </div>
      <p className="agentic-room-scan__intro">
        Upload a 2D floor plan image. We extract walls and openings, read labels when possible, and
        open the editor so you can review over the original drawing.
      </p>
      <ul className="agentic-room-scan__limits">
        <li>JPEG, PNG, or WebP work best. Furniture drawings are ignored.</li>
        <li>
          If the plan has no dimensions, pick one wall with Set scale and type its real length — the
          rest scales with it.
        </li>
        <li>Curved walls and scanned paper photos may need manual fixes in the editor.</li>
      </ul>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
        className="agentic-room-scan__file-input"
        disabled={disabled || busy}
        onChange={onFileChange}
      />
      <div className="agentic-room-scan__actions">
        <Button disabled={disabled || busy} onClick={() => inputRef.current?.click()}>
          Upload floor plan
        </Button>
      </div>
      {status ? (
        <p className="agentic-room-flow__status">
          <Spinner inline /> {status}
        </p>
      ) : null}
      {statusNote && !error ? <Banner tone="info">{statusNote}</Banner> : null}
      {error ? <Banner tone="error">{error}</Banner> : null}
    </div>
  );
}
