import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { DOOR, WINDOW } from '../units';
import {
  type FloorPlan,
  type FloorPlanOpening,
  type LengthUnit,
  EDITOR_CANVAS_PAD,
  EDITOR_VERTEX_RADIUS,
  GRID_MAJOR_IN,
  GRID_SNAP_IN,
  OPENING_END_CLEARANCE,
  formatLength,
  genId,
  getWallSegment,
  hitWallAtPoint,
  moveVertex,
  openEndpointVertexIds,
  offsetOnWall,
  planBounds,
  removeOpening,
  removeWall,
  resolveWallAnchor,
  sanitizeWallGraph,
  snapAngle,
  snapPoint,
  snapToGrid,
  validateFloorPlan,
  wallById,
  wallLength,
  type WallAnchorResolution,
} from '../lib/floorPlanGeometry';
import type { Item } from '../store';
import { itemRect } from '../interaction/collision';
import { FloorPlanInspector, type GridSnapSize } from './FloorPlanInspector';
import { FloorPlanToolRail } from './FloorPlanToolRail';

export type FloorPlanTool = 'select' | 'wall' | 'door' | 'window' | 'pan';

interface FloorPlanEditorProps {
  plan: FloorPlan;
  onChange: (plan: FloorPlan) => void;
  furnitureOverlay?: Item[];
  readOnlyFurniture?: boolean;
}

interface EditorState {
  plan: FloorPlan;
  past: FloorPlan[];
  future: FloorPlan[];
}

type EditorAction =
  | { type: 'set'; plan: FloorPlan }
  | { type: 'undo' }
  | { type: 'redo' };

interface EditorView {
  cx: number;
  cz: number;
  scale: number;
}

function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'set':
      return {
        plan: action.plan,
        past: [...state.past, state.plan],
        future: [],
      };
    case 'undo':
      if (state.past.length === 0) return state;
      return {
        plan: state.past[state.past.length - 1]!,
        past: state.past.slice(0, -1),
        future: [state.plan, ...state.future],
      };
    case 'redo':
      if (state.future.length === 0) return state;
      return {
        plan: state.future[0]!,
        past: [...state.past, state.plan],
        future: state.future.slice(1),
      };
    default:
      return state;
  }
}

function applyWallAnchor(plan: FloorPlan, anchor: WallAnchorResolution): { plan: FloorPlan; vertexId: string } {
  if (anchor.kind === 'pending') {
    return {
      plan: {
        ...plan,
        vertices: [...plan.vertices, { id: anchor.vertexId, x: anchor.x, z: anchor.z }],
      },
      vertexId: anchor.vertexId,
    };
  }
  return { plan: anchor.plan, vertexId: anchor.vertexId };
}

function wallDimLabel(seg: NonNullable<ReturnType<typeof getWallSegment>>) {
  const mx = (seg.start.x + seg.end.x) / 2;
  const mz = (seg.start.z + seg.end.z) / 2;
  const offset = 10;
  return {
    x: mx - seg.outward[0] * offset,
    y: mz - seg.outward[1] * offset,
  };
}

function wallDraftPoint(plan: FloorPlan, draft: WallDraft | null): { x: number; z: number } | null {
  if (!draft) return null;
  if (draft.mode === 'pending') return { x: draft.x, z: draft.z };
  const v = plan.vertices.find((vert) => vert.id === draft.id);
  return v ? { x: v.x, z: v.z } : null;
}

type WallDraft =
  | { mode: 'existing'; id: string }
  | { mode: 'pending'; id: string; x: number; z: number };

function defaultView(plan: FloorPlan): EditorView {
  const b = planBounds(plan);
  const pad = EDITOR_CANVAS_PAD;
  return {
    cx: (b.minX + b.maxX) / 2,
    cz: (b.minZ + b.maxZ) / 2,
    scale: 1,
  };
}

function viewBoxFromView(view: EditorView, aspect: number, baseW: number, baseH: number): string {
  const w = baseW / view.scale;
  const h = Math.max(w / Math.max(aspect, 0.1), baseH / view.scale);
  const x = view.cx - w / 2;
  const z = view.cz - h / 2;
  return `${x} ${z} ${w} ${h}`;
}

function renderOpening(
  o: FloorPlanOpening,
  plan: FloorPlan,
  selected: boolean,
  preview = false,
) {
  const w = wallById(plan, o.wallId);
  if (!w) return null;
  const seg = getWallSegment(plan, w);
  if (!seg) return null;
  const x0 = seg.start.x + seg.tangent[0] * o.offset;
  const z0 = seg.start.z + seg.tangent[1] * o.offset;
  const x1 = x0 + seg.tangent[0] * o.width;
  const z1 = z0 + seg.tangent[1] * o.width;
  return (
    <g key={preview ? 'preview' : o.id} className={preview ? 'fp-opening-preview' : undefined}>
      <line
        x1={x0}
        y1={z0}
        x2={x1}
        y2={z1}
        className={`fp-opening fp-opening-${o.kind}${selected ? ' selected' : ''}${preview ? ' preview' : ''}`}
      />
      {o.kind === 'door' ? (
        <path
          d={`M ${x0} ${z0} A ${o.width} ${o.width} 0 0 1 ${x1} ${z1}`}
          className={`fp-door-swing${preview ? ' preview' : ''}`}
          fill="none"
        />
      ) : null}
    </g>
  );
}

export function FloorPlanEditor({
  plan: initialPlan,
  onChange,
  furnitureOverlay,
}: FloorPlanEditorProps) {
  const [{ plan, past, future }, dispatch] = useReducer(editorReducer, {
    plan: initialPlan,
    past: [],
    future: [],
  });

  const [tool, setTool] = useState<FloorPlanTool>('wall');
  const [angleSnap, setAngleSnap] = useState(true);
  const [gridSnap, setGridSnap] = useState<GridSnapSize>(GRID_SNAP_IN as GridSnapSize);
  const [lengthUnit, setLengthUnit] = useState<LengthUnit>('ft-in');
  const [selectedWallId, setSelectedWallId] = useState<string | null>(null);
  const [selectedOpeningId, setSelectedOpeningId] = useState<string | null>(null);
  const [wallDraft, setWallDraft] = useState<WallDraft | null>(null);
  const [windowDraft, setWindowDraft] = useState<{ wallId: string; offset: number } | null>(null);
  const [cursor, setCursor] = useState<[number, number] | null>(null);
  const [view, setView] = useState<EditorView>(() => defaultView(initialPlan));
  const [dragVertexId, setDragVertexId] = useState<string | null>(null);
  const [dragDraft, setDragDraft] = useState<FloorPlan | null>(null);
  const [panDrag, setPanDrag] = useState<{ startX: number; startZ: number; viewCx: number; viewCz: number } | null>(null);
  const [aspect, setAspect] = useState(1);

  const bounds = useMemo(() => planBounds(plan), [plan]);
  const [presetWidthFt, setPresetWidthFt] = useState(() => Math.floor(bounds.width / 12));
  const [presetWidthIn, setPresetWidthIn] = useState(() => Math.round(bounds.width % 12));
  const [presetDepthFt, setPresetDepthFt] = useState(() => Math.floor(bounds.depth / 12));
  const [presetDepthIn, setPresetDepthIn] = useState(() => Math.round(bounds.depth % 12));

  const svgRef = useRef<SVGSVGElement>(null);
  const canvasWrapRef = useRef<HTMLDivElement>(null);

  const commit = useCallback(
    (next: FloorPlan) => {
      const cleaned = sanitizeWallGraph(next);
      dispatch({ type: 'set', plan: cleaned });
      onChange(cleaned);
    },
    [onChange],
  );

  const baseW = Math.max(bounds.width + EDITOR_CANVAS_PAD * 2, 120);
  const baseH = Math.max(bounds.depth + EDITOR_CANVAS_PAD * 2, 120);
  const viewBox = viewBoxFromView(view, aspect, baseW, baseH);
  const openEndpoints = useMemo(() => new Set(openEndpointVertexIds(plan)), [plan]);
  const displayPlan = dragDraft ?? plan;
  const pad = EDITOR_CANVAS_PAD;

  useEffect(() => {
    const el = canvasWrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      if (r.height > 0) setAspect(r.width / r.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const screenToWorld = useCallback((clientX: number, clientY: number): [number, number] | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const local = pt.matrixTransform(ctm.inverse());
    return [local.x, local.y];
  }, []);

  const fitView = useCallback(() => {
    const b = planBounds(plan);
    const padFit = EDITOR_CANVAS_PAD;
    const w = Math.max(b.width + padFit * 2, 60);
    const h = Math.max(b.depth + padFit * 2, 60);
    const el = canvasWrapRef.current;
    const ar = el && el.clientHeight > 0 ? el.clientWidth / el.clientHeight : 1;
    const scaleW = baseW / w;
    const scaleH = baseH / (h / Math.max(ar, 0.1));
    setView({
      cx: (b.minX + b.maxX) / 2,
      cz: (b.minZ + b.maxZ) / 2,
      scale: Math.min(scaleW, scaleH, 4),
    });
  }, [plan, baseW, baseH]);

  const handleUndo = () => {
    if (past.length === 0) return;
    const prev = past[past.length - 1]!;
    dispatch({ type: 'undo' });
    onChange(prev);
  };

  const handleRedo = () => {
    if (future.length === 0) return;
    const next = future[0]!;
    dispatch({ type: 'redo' });
    onChange(next);
  };

  const hitVertexAt = (x: number, z: number) =>
    displayPlan.vertices.find((v) => Math.hypot(v.x - x, v.z - z) < gridSnap * 1.5);

  const handleCanvasClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (dragVertexId || panDrag) return;
    const world = screenToWorld(e.clientX, e.clientY);
    if (!world) return;
    let [x, z] = world;

    if (tool === 'pan') return;

    if (tool === 'wall') {
      const startPt = wallDraftPoint(plan, wallDraft);
      if (startPt) {
        [x, z] = snapAngle([startPt.x, startPt.z], x, z, angleSnap, gridSnap);
      } else {
        [x, z] = snapPoint(x, z, gridSnap);
      }

      const hitVert = plan.vertices.find((v) => Math.hypot(v.x - x, v.z - z) < gridSnap);

      if (!wallDraft) {
        const anchor = resolveWallAnchor(plan, x, z, genId('v'));
        if (anchor.kind === 'split') {
          commit(anchor.plan);
          setWallDraft({ mode: 'existing', id: anchor.vertexId });
        } else if (anchor.kind === 'existing') {
          setWallDraft({ mode: 'existing', id: anchor.vertexId });
        } else {
          setWallDraft({ mode: 'pending', id: anchor.vertexId, x: anchor.x, z: anchor.z });
        }
        return;
      }

      let workPlan = plan;
      let startId = wallDraft.id;

      if (wallDraft.mode === 'pending') {
        const start = applyWallAnchor(workPlan, {
          kind: 'pending',
          vertexId: wallDraft.id,
          x: wallDraft.x,
          z: wallDraft.z,
        });
        workPlan = start.plan;
        startId = start.vertexId;
      }

      if (hitVert && hitVert.id === startId) {
        setWallDraft(null);
        return;
      }

      const endAnchor = resolveWallAnchor(workPlan, x, z, genId('v'));
      if (endAnchor.kind !== 'pending' && endAnchor.vertexId === startId) {
        setWallDraft(null);
        return;
      }

      const end = applyWallAnchor(workPlan, endAnchor);
      workPlan = end.plan;
      const endId = end.vertexId;

      const exists = workPlan.walls.some(
        (w) =>
          (w.startId === startId && w.endId === endId) ||
          (w.startId === endId && w.endId === startId),
      );
      if (!exists) {
        commit({
          ...workPlan,
          walls: [...workPlan.walls, { id: genId('w'), startId, endId }],
        });
      } else {
        commit(workPlan);
      }
      setWallDraft(null);
      return;
    }

    if (tool === 'door') {
      const wall = hitWallAtPoint(plan, x, z);
      if (!wall) return;
      const len = wallLength(plan, wall);
      const width = DOOR.width;
      let offset = snapToGrid(offsetOnWall(plan, wall, x, z) - width / 2, gridSnap);
      offset = Math.max(OPENING_END_CLEARANCE, Math.min(len - width - OPENING_END_CLEARANCE, offset));
      const opening: FloorPlanOpening = {
        id: genId('o'),
        wallId: wall.id,
        kind: 'door',
        offset,
        width,
        height: DOOR.height,
        hinge: 'left',
      };
      commit({ ...plan, openings: [...plan.openings, opening] });
      setSelectedOpeningId(opening.id);
      return;
    }

    if (tool === 'window') {
      const wall = hitWallAtPoint(plan, x, z);
      if (!wall) return;
      const len = wallLength(plan, wall);
      const clickOffset = snapToGrid(offsetOnWall(plan, wall, x, z), gridSnap);

      if (!windowDraft || windowDraft.wallId !== wall.id) {
        const maxStart = len - OPENING_END_CLEARANCE - gridSnap;
        const offset = Math.max(OPENING_END_CLEARANCE, Math.min(maxStart, clickOffset));
        setWindowDraft({ wallId: wall.id, offset });
        return;
      }

      const start = Math.min(windowDraft.offset, clickOffset);
      let width = Math.abs(clickOffset - windowDraft.offset);
      if (width < gridSnap) width = gridSnap;
      width = Math.min(width, len - start - OPENING_END_CLEARANCE);
      width = Math.max(gridSnap, width);
      const offset = Math.max(
        OPENING_END_CLEARANCE,
        Math.min(len - width - OPENING_END_CLEARANCE, start),
      );
      const opening: FloorPlanOpening = {
        id: genId('o'),
        wallId: wall.id,
        kind: 'window',
        offset,
        width,
        height: WINDOW.height,
        sill: WINDOW.sill,
      };
      commit({ ...plan, openings: [...plan.openings, opening] });
      setWindowDraft(null);
      setSelectedOpeningId(opening.id);
      return;
    }

    if (tool === 'select') {
      const opening = plan.openings.find((o) => {
        const w = wallById(plan, o.wallId);
        if (!w) return false;
        const seg = getWallSegment(plan, w);
        if (!seg) return false;
        const ox = seg.start.x + seg.tangent[0] * (o.offset + o.width / 2);
        const oz = seg.start.z + seg.tangent[1] * (o.offset + o.width / 2);
        return Math.hypot(ox - x, oz - z) < 10;
      });
      if (opening) {
        setSelectedOpeningId(opening.id);
        setSelectedWallId(opening.wallId);
        return;
      }
      const wall = hitWallAtPoint(plan, x, z);
      setSelectedWallId(wall?.id ?? null);
      setSelectedOpeningId(null);
    }
  };

  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (e.button === 1 || tool === 'pan' || (e.button === 0 && e.altKey)) {
      const world = screenToWorld(e.clientX, e.clientY);
      if (!world) return;
      e.preventDefault();
      setPanDrag({ startX: world[0], startZ: world[1], viewCx: view.cx, viewCz: view.cz });
      return;
    }

    if (tool !== 'select' || e.button !== 0) return;
    const world = screenToWorld(e.clientX, e.clientY);
    if (!world) return;
    const vert = hitVertexAt(world[0], world[1]);
    if (vert) {
      e.preventDefault();
      setDragVertexId(vert.id);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const world = screenToWorld(e.clientX, e.clientY);
    if (!world) return;
    setCursor(world);

    if (panDrag) {
      const dx = world[0] - panDrag.startX;
      const dz = world[1] - panDrag.startZ;
      setView((v) => ({ ...v, cx: panDrag.viewCx - dx, cz: panDrag.viewCz - dz }));
      return;
    }

    if (dragVertexId) {
      setDragDraft(moveVertex(plan, dragVertexId, world[0], world[1], gridSnap));
      return;
    }
  };

  const handleMouseUp = () => {
    if (dragVertexId && dragDraft) {
      commit(dragDraft);
      setDragDraft(null);
    }
    setDragVertexId(null);
    setPanDrag(null);
  };

  const handleWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const world = screenToWorld(e.clientX, e.clientY);
    if (!world) return;
    const [wx, wz] = world;
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    setView((v) => {
      const newScale = Math.min(8, Math.max(0.25, v.scale * factor));
      const ratio = newScale / v.scale;
      return {
        cx: wx - (wx - v.cx) * ratio,
        cz: wz - (wz - v.cz) * ratio,
        scale: newScale,
      };
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const key = e.key.toLowerCase();
    if (!e.metaKey && !e.ctrlKey) {
      if (key === 'v') setTool('select');
      if (key === 'w') setTool('wall');
      if (key === 'd') setTool('door');
      if (key === 'n') setTool('window');
      if (key === 'h') setTool('pan');
    }
    if (e.key === 'Escape') {
      setWallDraft(null);
      setWindowDraft(null);
      setSelectedOpeningId(null);
      setSelectedWallId(null);
      setDragVertexId(null);
      setPanDrag(null);
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (selectedOpeningId) {
        e.preventDefault();
        commit(removeOpening(plan, selectedOpeningId));
        setSelectedOpeningId(null);
        return;
      }
      if (selectedWallId) {
        e.preventDefault();
        commit(removeWall(plan, selectedWallId));
        setSelectedWallId(null);
      }
    }
    if (e.metaKey || e.ctrlKey) {
      if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      }
      if (e.key === 'z' && e.shiftKey) {
        e.preventDefault();
        handleRedo();
      }
    }
  };

  const clearPlan = () => {
    commit({ ...plan, vertices: [], walls: [], openings: [] });
    setWallDraft(null);
    setWindowDraft(null);
    setSelectedWallId(null);
    setSelectedOpeningId(null);
  };

  const setToolSafe = (t: FloorPlanTool) => {
    setTool(t);
    setWallDraft(null);
    setWindowDraft(null);
  };

  const ghostOpening = useMemo((): FloorPlanOpening | null => {
    if (!cursor || wallDraft || windowDraft) return null;
    if (tool !== 'door' && tool !== 'window') return null;
    const wall = hitWallAtPoint(plan, cursor[0], cursor[1]);
    if (!wall) return null;
    const len = wallLength(plan, wall);
    if (tool === 'door') {
      const width = DOOR.width;
      let offset = snapToGrid(offsetOnWall(plan, wall, cursor[0], cursor[1]) - width / 2, gridSnap);
      offset = Math.max(OPENING_END_CLEARANCE, Math.min(len - width - OPENING_END_CLEARANCE, offset));
      return { id: 'ghost', wallId: wall.id, kind: 'door', offset, width, height: DOOR.height, hinge: 'left' };
    }
    const width = gridSnap * 2;
    let offset = snapToGrid(offsetOnWall(plan, wall, cursor[0], cursor[1]) - width / 2, gridSnap);
    offset = Math.max(OPENING_END_CLEARANCE, Math.min(len - width - OPENING_END_CLEARANCE, offset));
    return { id: 'ghost', wallId: wall.id, kind: 'window', offset, width, height: WINDOW.height, sill: WINDOW.sill };
  }, [cursor, plan, tool, wallDraft, windowDraft, gridSnap]);

  const visibleMinX = view.cx - baseW / view.scale / 2 - pad;
  const visibleMaxX = view.cx + baseW / view.scale / 2 + pad;
  const visibleMinZ = view.cz - baseH / view.scale / 2 - pad;
  const visibleMaxZ = view.cz + baseH / view.scale / 2 + pad;

  const gridLines = [];
  const gridStartX = Math.floor(visibleMinX / gridSnap) * gridSnap;
  const gridEndX = Math.ceil(visibleMaxX / gridSnap) * gridSnap;
  const gridStartZ = Math.floor(visibleMinZ / gridSnap) * gridSnap;
  const gridEndZ = Math.ceil(visibleMaxZ / gridSnap) * gridSnap;
  for (let x = gridStartX; x <= gridEndX; x += gridSnap) {
    const major = Math.round(x) % GRID_MAJOR_IN === 0;
    gridLines.push(
      <line key={`gx-${x}`} x1={x} y1={gridStartZ} x2={x} y2={gridEndZ} className={major ? 'fp-grid fp-grid-major' : 'fp-grid'} />,
    );
  }
  for (let z = gridStartZ; z <= gridEndZ; z += gridSnap) {
    const major = Math.round(z) % GRID_MAJOR_IN === 0;
    gridLines.push(
      <line key={`gz-${z}`} x1={gridStartX} y1={z} x2={gridEndX} y2={z} className={major ? 'fp-grid fp-grid-major' : 'fp-grid'} />,
    );
  }

  const cursorClass =
    tool === 'pan' || panDrag ? 'fp-canvas-pan' : tool === 'select' ? 'fp-canvas-select' : 'fp-canvas-draw';

  return (
    <div className="fp-editor" onKeyDown={handleKeyDown} tabIndex={0}>
      <FloorPlanToolRail
        tool={tool}
        onToolChange={setToolSafe}
        angleSnap={angleSnap}
        onAngleSnapChange={setAngleSnap}
        canUndo={past.length > 0}
        canRedo={future.length > 0}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onFitView={fitView}
        onClear={clearPlan}
      />

      <div className="fp-canvas-wrap" ref={canvasWrapRef}>
        <svg
          ref={svgRef}
          className={`fp-canvas ${cursorClass}`}
          viewBox={viewBox}
          preserveAspectRatio="xMidYMid meet"
          onClick={handleCanvasClick}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
        >
          <defs>
            <radialGradient id="fp-board-vignette" cx="50%" cy="45%" r="70%">
              <stop offset="0%" stopColor="#2e2820" />
              <stop offset="100%" stopColor="#1b1712" />
            </radialGradient>
          </defs>
          <rect
            x={visibleMinX}
            y={visibleMinZ}
            width={visibleMaxX - visibleMinX}
            height={visibleMaxZ - visibleMinZ}
            fill="url(#fp-board-vignette)"
          />
          {gridLines}

          {furnitureOverlay?.map((item) => {
            const r = itemRect(item);
            return (
              <rect
                key={item.id}
                x={r.minX}
                y={r.minZ}
                width={r.maxX - r.minX}
                height={r.maxZ - r.minZ}
                className="fp-furniture"
                transform={`rotate(${(item.rotationY * 180) / Math.PI} ${item.position[0]} ${item.position[2]})`}
              />
            );
          })}

          {displayPlan.walls.map((w) => {
            const seg = getWallSegment(displayPlan, w);
            if (!seg) return null;
            const selected = selectedWallId === w.id;
            const label = wallDimLabel(seg);
            return (
              <g key={w.id}>
                <line
                  x1={seg.start.x}
                  y1={seg.start.z}
                  x2={seg.end.x}
                  y2={seg.end.z}
                  className={`fp-wall${selected ? ' selected' : ''}`}
                />
                <text x={label.x} y={label.y} className="fp-dim" dominantBaseline="middle" textAnchor="middle">
                  {formatLength(seg.length, lengthUnit)}
                </text>
              </g>
            );
          })}

          {displayPlan.openings.map((o) => renderOpening(o, displayPlan, selectedOpeningId === o.id))}

          {ghostOpening ? renderOpening(ghostOpening, displayPlan, false, true) : null}

          {displayPlan.vertices.map((v) => (
            <circle
              key={v.id}
              cx={v.x}
              cy={v.z}
              r={openEndpoints.has(v.id) ? EDITOR_VERTEX_RADIUS + 1 : EDITOR_VERTEX_RADIUS}
              className={`fp-vertex${openEndpoints.has(v.id) ? ' fp-vertex-open' : ''}${dragVertexId === v.id ? ' fp-vertex-drag' : ''}${tool === 'select' ? ' fp-vertex-draggable' : ''}`}
            />
          ))}

          {wallDraft?.mode === 'pending' ? (
            <circle cx={wallDraft.x} cy={wallDraft.z} r={EDITOR_VERTEX_RADIUS} className="fp-vertex fp-vertex-pending" />
          ) : null}

          {wallDraft && cursor && tool === 'wall'
            ? (() => {
                const a = wallDraftPoint(plan, wallDraft);
                if (!a) return null;
                const [lx, lz] = snapAngle([a.x, a.z], cursor[0], cursor[1], angleSnap, gridSnap);
                const draftLen = Math.hypot(lx - a.x, lz - a.z);
                const mx = (a.x + lx) / 2;
                const mz = (a.z + lz) / 2;
                return (
                  <g>
                    <line x1={a.x} y1={a.z} x2={lx} y2={lz} className="fp-wall-draft" strokeDasharray="6 4" />
                    {draftLen >= gridSnap ? (
                      <text x={mx} y={mz - 10} className="fp-dim fp-dim-live" dominantBaseline="middle" textAnchor="middle">
                        {formatLength(draftLen, lengthUnit)}
                      </text>
                    ) : null}
                  </g>
                );
              })()
            : null}

          {windowDraft && cursor
            ? (() => {
                const wall = wallById(plan, windowDraft.wallId);
                if (!wall) return null;
                const seg = getWallSegment(plan, wall);
                if (!seg) return null;
                const len = wallLength(plan, wall);
                const endOff = snapToGrid(offsetOnWall(plan, wall, cursor[0], cursor[1]), gridSnap);
                const start = Math.min(windowDraft.offset, endOff);
                let width = Math.abs(endOff - windowDraft.offset);
                if (width < gridSnap) width = gridSnap;
                width = Math.min(width, len - start - OPENING_END_CLEARANCE);
                width = Math.max(gridSnap, width);
                const offset = Math.max(
                  OPENING_END_CLEARANCE,
                  Math.min(len - width - OPENING_END_CLEARANCE, start),
                );
                const x0 = seg.start.x + seg.tangent[0] * offset;
                const z0 = seg.start.z + seg.tangent[1] * offset;
                const x1 = x0 + seg.tangent[0] * width;
                const z1 = z0 + seg.tangent[1] * width;
                return (
                  <line
                    x1={x0}
                    y1={z0}
                    x2={x1}
                    y2={z1}
                    className="fp-opening fp-opening-window preview"
                    strokeDasharray="4 3"
                  />
                );
              })()
            : null}
        </svg>
      </div>

      <FloorPlanInspector
        plan={displayPlan}
        selectedWallId={selectedWallId}
        selectedOpeningId={selectedOpeningId}
        lengthUnit={lengthUnit}
        gridSnap={gridSnap}
        presetWidthFt={presetWidthFt}
        presetWidthIn={presetWidthIn}
        presetDepthFt={presetDepthFt}
        presetDepthIn={presetDepthIn}
        onLengthUnitChange={setLengthUnit}
        onGridSnapChange={setGridSnap}
        onPresetWidthFtChange={setPresetWidthFt}
        onPresetWidthInChange={setPresetWidthIn}
        onPresetDepthFtChange={setPresetDepthFt}
        onPresetDepthInChange={setPresetDepthIn}
        onPlanChange={commit}
        onSelectWall={setSelectedWallId}
        onSelectOpening={setSelectedOpeningId}
      />
    </div>
  );
}

export function isFloorPlanReady(plan: FloorPlan): boolean {
  return validateFloorPlan(plan).length === 0;
}
