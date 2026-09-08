import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import {
  displayPointToNatural,
  imageLayoutFromHtmlImage,
  type ImageLayout,
  type NaturalPoint,
  naturalPointsToDisplay,
  pointerToNaturalPixels,
} from '../lib/cropPixels';

export interface PhotoPolygonCropHandle {
  getPolygonPoints: () => NaturalPoint[] | null;
}

interface PhotoPolygonCropProps {
  imageUrl: string;
  disabled?: boolean;
  initialPoints?: NaturalPoint[] | null;
  onPolygonChange?: (points: NaturalPoint[] | null) => void;
}

const VERTEX_HIT_RADIUS_ADD = 10;
const VERTEX_HIT_RADIUS_MOVE = 22;

type PolygonEditMode = 'add' | 'move';

function pointsPath(points: { x: number; y: number }[], closed: boolean): string {
  if (points.length === 0) return '';
  const segments = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`);
  if (closed && points.length >= 3) segments.push('Z');
  return segments.join(' ');
}

function nearestVertexIndex(
  displayX: number,
  displayY: number,
  displayPoints: { x: number; y: number }[],
  hitRadius: number,
): number | null {
  let best: number | null = null;
  let bestDist = hitRadius;
  displayPoints.forEach((point, index) => {
    const dist = Math.hypot(point.x - displayX, point.y - displayY);
    if (dist <= bestDist) {
      bestDist = dist;
      best = index;
    }
  });
  return best;
}

/**
 * Point-by-point polygon crop for photo prep. Click to place vertices; drag to
 * reposition; outside the shape is dimmed until Apply crop.
 */
export const PhotoPolygonCrop = forwardRef<PhotoPolygonCropHandle, PhotoPolygonCropProps>(
  function PhotoPolygonCrop(
    { imageUrl, disabled = false, initialPoints = null, onPolygonChange },
    ref,
  ) {
    const imgRef = useRef<HTMLImageElement>(null);
    const pointsRef = useRef<NaturalPoint[]>([]);
    const onPolygonChangeRef = useRef(onPolygonChange);
    onPolygonChangeRef.current = onPolygonChange;

    const [layout, setLayout] = useState<ImageLayout | null>(null);
    const [points, setPoints] = useState<NaturalPoint[]>(() =>
      initialPoints ? [...initialPoints] : [],
    );
    const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
    const [editMode, setEditMode] = useState<PolygonEditMode>('add');

    pointsRef.current = points;

    const emitPoints = useCallback((next: NaturalPoint[]) => {
      onPolygonChangeRef.current?.(next.length >= 3 ? next : next.length > 0 ? next : null);
    }, []);

    const syncLayout = useCallback(() => {
      const img = imgRef.current;
      if (!img?.naturalWidth || !img.naturalHeight) return;
      const nextLayout = imageLayoutFromHtmlImage(img);
      setLayout(nextLayout);
    }, []);

    useEffect(() => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const onResize = () => {
        clearTimeout(timer);
        timer = setTimeout(syncLayout, 100);
      };
      window.addEventListener('resize', onResize);
      return () => {
        clearTimeout(timer);
        window.removeEventListener('resize', onResize);
      };
    }, [syncLayout]);

    useImperativeHandle(
      ref,
      () => ({
        getPolygonPoints: () => {
          const current = pointsRef.current;
          return current.length >= 3 ? current.map((point) => ({ ...point })) : null;
        },
      }),
      [],
    );

    const updatePoints = (next: NaturalPoint[]) => {
      setPoints(next);
      emitPoints(next);
    };

    const handleImageLoad = (img: HTMLImageElement) => {
      syncLayout();
    };

    const displayPoints = layout ? naturalPointsToDisplay(points, layout) : [];
    const hitRadius =
      editMode === 'move' ? VERTEX_HIT_RADIUS_MOVE : VERTEX_HIT_RADIUS_ADD;
    const isDragging = draggingIndex !== null;

    const displayPointFromClient = (clientX: number, clientY: number) => {
      const img = imgRef.current;
      if (!img) return null;
      const rect = img.getBoundingClientRect();
      return {
        x: clientX - rect.left,
        y: clientY - rect.top,
      };
    };

    const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
      if (disabled || !layout || !imgRef.current) return;
      const display = displayPointFromClient(event.clientX, event.clientY);
      if (!display) return;

      const vertexIndex = nearestVertexIndex(
        display.x,
        display.y,
        displayPoints,
        hitRadius,
      );

      event.currentTarget.setPointerCapture(event.pointerId);

      if (editMode === 'move') {
        if (vertexIndex !== null) {
          setDraggingIndex(vertexIndex);
        }
        return;
      }

      if (vertexIndex !== null) {
        setEditMode('move');
        setDraggingIndex(vertexIndex);
        return;
      }

      const natural = pointerToNaturalPixels(event.clientX, event.clientY, imgRef.current);
      if (!natural) return;
      updatePoints([...pointsRef.current, natural]);
    };

    const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
      if (draggingIndex === null || disabled || !layout || !imgRef.current) return;
      const display = displayPointFromClient(event.clientX, event.clientY);
      if (!display) return;
      const natural = displayPointToNatural(display, layout);
      const clamped: NaturalPoint = {
        x: Math.max(0, Math.min(natural.x, layout.naturalWidth - 1)),
        y: Math.max(0, Math.min(natural.y, layout.naturalHeight - 1)),
      };
      const next = pointsRef.current.map((point, index) =>
        index === draggingIndex ? clamped : point,
      );
      updatePoints(next);
    };

    const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      setDraggingIndex(null);
    };

    const handleUndoPoint = () => {
      if (disabled || points.length === 0) return;
      updatePoints(points.slice(0, -1));
    };

    const closed = points.length >= 3;
    const maskPath =
      layout && closed
        ? [
            `M 0 0 H ${layout.elementWidth} V ${layout.elementHeight} H 0 Z`,
            pointsPath(displayPoints, true),
          ].join(' ')
        : '';

    return (
      <div className="photo-prep__polygon-crop">
        <div className="photo-prep__polygon-crop-stage">
          <div
            className={`photo-prep__polygon-crop-frame${
              editMode === 'move' ? ' photo-prep__polygon-crop-frame--move' : ''
            }${isDragging ? ' photo-prep__polygon-crop-frame--dragging' : ''}`}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            onPointerCancel={handlePointerUp}
          >
            <img
              ref={imgRef}
              src={imageUrl}
              alt="Click points around the piece to crop"
              className="photo-prep__polygon-crop-img"
              onLoad={(event) => handleImageLoad(event.currentTarget)}
            />
            {layout ? (
              <svg
                className="photo-prep__polygon-crop-overlay"
                viewBox={`0 0 ${layout.elementWidth} ${layout.elementHeight}`}
                aria-hidden
              >
                {closed ? (
                  <path
                    className="photo-prep__polygon-crop-mask"
                    d={maskPath}
                    fillRule="evenodd"
                  />
                ) : null}
                {displayPoints.length >= 2 ? (
                  <path
                    className="photo-prep__polygon-crop-line"
                    d={pointsPath(displayPoints, closed)}
                  />
                ) : null}
                {displayPoints.map((point, index) => (
                  <circle
                    key={`${index}-${point.x}-${point.y}`}
                    className={`photo-prep__polygon-crop-vertex${
                      editMode === 'move' ? ' photo-prep__polygon-crop-vertex--move' : ''
                    }${draggingIndex === index ? ' is-active' : ''}`}
                    cx={point.x}
                    cy={point.y}
                    r={editMode === 'move' ? 8 : 6}
                  />
                ))}
              </svg>
            ) : null}
          </div>
        </div>
        <div className="photo-prep__polygon-crop-tools">
          <div className="photo-prep__crop-mode" role="tablist" aria-label="Polygon edit mode">
            <button
              type="button"
              role="tab"
              aria-selected={editMode === 'add'}
              className={`photo-prep__crop-mode-btn${editMode === 'add' ? ' is-active' : ''}`}
              disabled={disabled}
              onClick={() => setEditMode('add')}
            >
              Add points
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={editMode === 'move'}
              className={`photo-prep__crop-mode-btn${editMode === 'move' ? ' is-active' : ''}`}
              disabled={disabled || points.length === 0}
              onClick={() => setEditMode('move')}
            >
              Move points
            </button>
          </div>
          <button
            type="button"
            className="photo-prep__btn photo-prep__btn--quiet"
            disabled={disabled || points.length === 0 || editMode !== 'add'}
            onClick={handleUndoPoint}
          >
            Undo last point
          </button>
          <span className="photo-prep__polygon-crop-hint">
            {editMode === 'move'
              ? closed
                ? 'Drag any point to reposition it'
                : 'Drag points to adjust their placement'
              : closed
                ? `${points.length} points — switch to Move points to adjust, then apply crop`
                : 'Click around the piece to add crop points (minimum 3)'}
          </span>
        </div>
      </div>
    );
  },
);
