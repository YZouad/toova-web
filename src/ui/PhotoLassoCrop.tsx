import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import {
  appendLassoPoint,
  clampNaturalPoint,
  finalizeLassoPath,
  lassoSampleDistance,
} from '../lib/cropLasso';
import {
  displayPointToNatural,
  imageLayoutFromHtmlImage,
  type ImageLayout,
  type NaturalPoint,
  naturalPointsToDisplay,
} from '../lib/cropPixels';

export interface PhotoLassoCropHandle {
  getLassoPoints: () => NaturalPoint[] | null;
}

interface PhotoLassoCropProps {
  imageUrl: string;
  disabled?: boolean;
  initialPoints?: NaturalPoint[] | null;
  onLassoChange?: (points: NaturalPoint[] | null) => void;
}

function pointsPath(points: { x: number; y: number }[], closed: boolean): string {
  if (points.length === 0) return '';
  const segments = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`);
  if (closed && points.length >= 3) segments.push('Z');
  return segments.join(' ');
}

/**
 * Freehand lasso crop for photo prep. Drag around the piece; the stroke closes
 * on pointer up and outside the shape is dimmed until Apply crop.
 */
export const PhotoLassoCrop = forwardRef<PhotoLassoCropHandle, PhotoLassoCropProps>(
  function PhotoLassoCrop(
    { imageUrl, disabled = false, initialPoints = null, onLassoChange },
    ref,
  ) {
    const imgRef = useRef<HTMLImageElement>(null);
    const pointsRef = useRef<NaturalPoint[]>([]);
    const committedRef = useRef<NaturalPoint[] | null>(
      initialPoints && initialPoints.length >= 3 ? [...initialPoints] : null,
    );
    const drawingRef = useRef(false);
    const onLassoChangeRef = useRef(onLassoChange);
    onLassoChangeRef.current = onLassoChange;

    const [layout, setLayout] = useState<ImageLayout | null>(null);
    const [points, setPoints] = useState<NaturalPoint[]>(() =>
      initialPoints && initialPoints.length >= 3 ? [...initialPoints] : [],
    );
    const [closed, setClosed] = useState(() => (initialPoints?.length ?? 0) >= 3);
    const [drawing, setDrawing] = useState(false);

    pointsRef.current = points;

    const emitClosed = useCallback((next: NaturalPoint[] | null) => {
      onLassoChangeRef.current?.(next && next.length >= 3 ? next : null);
    }, []);

    const syncLayout = useCallback(() => {
      const img = imgRef.current;
      if (!img?.naturalWidth || !img.naturalHeight) return;
      setLayout(imageLayoutFromHtmlImage(img));
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

    useEffect(() => {
      if (imgRef.current?.complete) syncLayout();
    }, [imageUrl, syncLayout]);

    useImperativeHandle(
      ref,
      () => ({
        getLassoPoints: () => {
          if (drawingRef.current) return null;
          const current = committedRef.current ?? pointsRef.current;
          return current.length >= 3 ? current.map((point) => ({ ...point })) : null;
        },
      }),
      [],
    );

    const naturalFromClient = (clientX: number, clientY: number, nextLayout: ImageLayout) => {
      const img = imgRef.current;
      if (!img) return null;
      const rect = img.getBoundingClientRect();
      return clampNaturalPoint(
        displayPointToNatural({ x: clientX - rect.left, y: clientY - rect.top }, nextLayout),
        nextLayout.naturalWidth,
        nextLayout.naturalHeight,
      );
    };

    const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
      if (disabled || !layout || !imgRef.current || event.button !== 0) return;
      const natural = naturalFromClient(event.clientX, event.clientY, layout);
      if (!natural) return;

      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      drawingRef.current = true;
      setDrawing(true);
      setClosed(false);
      const next = [natural];
      setPoints(next);
      emitClosed(null);
    };

    const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
      if (!drawingRef.current || disabled || !layout || !imgRef.current) return;
      const natural = naturalFromClient(event.clientX, event.clientY, layout);
      if (!natural) return;
      const minDistance = lassoSampleDistance(layout.naturalWidth, layout.contentWidth);
      const next = appendLassoPoint(pointsRef.current, natural, minDistance);
      if (next === pointsRef.current) return;
      setPoints(next);
    };

    const finishStroke = () => {
      if (!drawingRef.current) return;
      drawingRef.current = false;
      setDrawing(false);

      const epsilon = layout
        ? lassoSampleDistance(layout.naturalWidth, layout.contentWidth) * 1.25
        : 3;
      const finalized = finalizeLassoPath(pointsRef.current, epsilon);
      if (!finalized) {
        const previous = committedRef.current;
        if (previous) {
          setPoints(previous);
          setClosed(true);
          emitClosed(previous);
        } else {
          setPoints([]);
          setClosed(false);
          emitClosed(null);
        }
        return;
      }

      committedRef.current = finalized;
      setPoints(finalized);
      setClosed(true);
      emitClosed(finalized);
    };

    const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      finishStroke();
    };

    const handleRedraw = () => {
      if (disabled) return;
      drawingRef.current = false;
      committedRef.current = null;
      setDrawing(false);
      setClosed(false);
      setPoints([]);
      emitClosed(null);
    };

    const displayPoints = layout ? naturalPointsToDisplay(points, layout) : [];
    const maskPath =
      layout && closed && displayPoints.length >= 3
        ? [
            `M 0 0 H ${layout.elementWidth} V ${layout.elementHeight} H 0 Z`,
            pointsPath(displayPoints, true),
          ].join(' ')
        : '';
    const lastDisplay = displayPoints[displayPoints.length - 1];

    return (
      <div className="photo-prep__polygon-crop">
        <div className="photo-prep__polygon-crop-stage">
          <div
            className={`photo-prep__polygon-crop-frame photo-prep__polygon-crop-frame--lasso${
              drawing ? ' photo-prep__polygon-crop-frame--drawing' : ''
            }`}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          >
            <img
              ref={imgRef}
              src={imageUrl}
              alt="Draw a lasso around the piece to crop"
              className="photo-prep__polygon-crop-img"
              onLoad={() => syncLayout()}
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
                    className="photo-prep__polygon-crop-line photo-prep__polygon-crop-line--lasso"
                    d={pointsPath(displayPoints, closed)}
                  />
                ) : null}
                {drawing && lastDisplay ? (
                  <circle
                    className="photo-prep__polygon-crop-vertex"
                    cx={lastDisplay.x}
                    cy={lastDisplay.y}
                    r={4}
                  />
                ) : null}
              </svg>
            ) : null}
          </div>
        </div>
        <div className="photo-prep__polygon-crop-tools">
          <button
            type="button"
            className="photo-prep__btn photo-prep__btn--quiet"
            disabled={disabled || (points.length === 0 && !closed)}
            onClick={handleRedraw}
          >
            Redraw
          </button>
          <span className="photo-prep__polygon-crop-hint">
            {drawing
              ? 'Release to close lasso'
              : closed
                ? 'Drag around the piece to draw a lasso'
                : 'Drag around the piece to outline your object.'}
          </span>
        </div>
      </div>
    );
  },
);
