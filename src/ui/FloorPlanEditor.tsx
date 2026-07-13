import { useCallback, useMemo, useReducer, useRef, useState } from 'react';
import { DOOR, WINDOW } from '../units';
import {
  type FloorPlan,
  type FloorPlanOpening,
  type FloorPlanWall,
  EDITOR_CANVAS_PAD,
  EDITOR_VERTEX_RADIUS,
  GRID_MAJOR_IN,
  GRID_SNAP_IN,
  OPENING_END_CLEARANCE,
  defaultRectanglePlan,
  editorCanvasBounds,
  genId,
  getWallSegment,
  hitWallAtPoint,
  openEndpointVertexIds,
  offsetOnWall,
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

export type FloorPlanTool = 'select' | 'wall' | 'door' | 'window';

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
  const [selectedWallId, setSelectedWallId] = useState<string | null>(null);
  const [selectedOpeningId, setSelectedOpeningId] = useState<string | null>(null);
  const [wallDraft, setWallDraft] = useState<WallDraft | null>(null);
  const [windowDraft, setWindowDraft] = useState<{ wallId: string; offset: number } | null>(null);
  const [cursor, setCursor] = useState<[number, number] | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const commit = useCallback(
    (next: FloorPlan) => {
      const cleaned = sanitizeWallGraph(next);
      dispatch({ type: 'set', plan: cleaned });
      onChange(cleaned);
    },
    [onChange],
  );


  const canvas = useMemo(() => editorCanvasBounds(), []);
  const issues = useMemo(() => validateFloorPlan(plan), [plan]);
  const openEndpoints = useMemo(() => new Set(openEndpointVertexIds(plan)), [plan]);
  const pad = EDITOR_CANVAS_PAD;
  const viewBox = `${canvas.minX - pad} ${canvas.minZ - pad} ${canvas.width + pad * 2} ${canvas.depth + pad * 2}`;

  const screenToWorld = useCallback(
    (clientX: number, clientY: number): [number, number] | null => {
      const svg = svgRef.current;
      if (!svg) return null;
      const pt = svg.createSVGPoint();
      pt.x = clientX;
      pt.y = clientY;
      const ctm = svg.getScreenCTM();
      if (!ctm) return null;
      const local = pt.matrixTransform(ctm.inverse());
      return [local.x, local.y];
    },
    [],
  );

  const handleCanvasClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const world = screenToWorld(e.clientX, e.clientY);
    if (!world) return;
    let [x, z] = world;

    if (tool === 'wall') {
      const startPt = wallDraftPoint(plan, wallDraft);
      if (startPt) {
        [x, z] = snapAngle([startPt.x, startPt.z], x, z, angleSnap);
      } else {
        [x, z] = snapPoint(x, z);
      }

      const hitVert = plan.vertices.find((v) => Math.hypot(v.x - x, v.z - z) < GRID_SNAP_IN);

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
      let offset = snapToGrid(offsetOnWall(plan, wall, x, z) - width / 2);
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
      const clickOffset = snapToGrid(offsetOnWall(plan, wall, x, z));

      if (!windowDraft || windowDraft.wallId !== wall.id) {
        const maxStart = len - OPENING_END_CLEARANCE - GRID_SNAP_IN;
        const offset = Math.max(OPENING_END_CLEARANCE, Math.min(maxStart, clickOffset));
        setWindowDraft({ wallId: wall.id, offset });
        return;
      }

      const start = Math.min(windowDraft.offset, clickOffset);
      let width = Math.abs(clickOffset - windowDraft.offset);
      if (width < GRID_SNAP_IN) width = GRID_SNAP_IN;
      width = Math.min(width, len - start - OPENING_END_CLEARANCE);
      width = Math.max(GRID_SNAP_IN, width);
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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setWallDraft(null);
      setWindowDraft(null);
      setSelectedOpeningId(null);
      setSelectedWallId(null);
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
        dispatch({ type: 'undo' });
        onChange(past[past.length - 1] ?? plan);
      }
      if (e.key === 'z' && e.shiftKey) {
        e.preventDefault();
        dispatch({ type: 'redo' });
        onChange(future[0] ?? plan);
      }
    }
  };

  const clearPlan = () => {
    commit({ ...plan, vertices: [], walls: [], openings: [] });
    setWallDraft(null);
    setWindowDraft(null);
  };

  const resetRectangle = () => {
    commit(defaultRectanglePlan());
    setWallDraft(null);
    setWindowDraft(null);
  };

  const gridLines = [];
  const step = GRID_SNAP_IN;
  const gridMinX = canvas.minX - pad;
  const gridMaxX = canvas.maxX + pad;
  const gridMinZ = canvas.minZ - pad;
  const gridMaxZ = canvas.maxZ + pad;
  for (let x = gridMinX; x <= gridMaxX; x += step) {
    const major = Math.round(x) % GRID_MAJOR_IN === 0;
    gridLines.push(
      <line
        key={`gx-${x}`}
        x1={x}
        y1={gridMinZ}
        x2={x}
        y2={gridMaxZ}
        className={major ? 'fp-grid fp-grid-major' : 'fp-grid'}
      />,
    );
  }
  for (let z = gridMinZ; z <= gridMaxZ; z += step) {
    const major = Math.round(z) % GRID_MAJOR_IN === 0;
    gridLines.push(
      <line
        key={`gz-${z}`}
        x1={gridMinX}
        y1={z}
        x2={gridMaxX}
        y2={z}
        className={major ? 'fp-grid fp-grid-major' : 'fp-grid'}
      />,
    );
  }

  return (
    <div className="fp-editor" onKeyDown={handleKeyDown} tabIndex={0}>
      <div className="fp-toolbar">
        {(['select', 'wall', 'door', 'window'] as FloorPlanTool[]).map((t) => (
          <button
            key={t}
            type="button"
            className={`fp-tool-btn${tool === t ? ' active' : ''}`}
            onClick={() => {
              setTool(t);
              setWallDraft(null);
              setWindowDraft(null);
            }}
          >
            {t === 'select' ? 'Select' : t === 'wall' ? 'Wall' : t === 'door' ? 'Door' : 'Window'}
          </button>
        ))}
        <div className="fp-toolbar-sep" />
        <button type="button" className="fp-tool-btn" onClick={() => dispatch({ type: 'undo' })} disabled={past.length === 0}>Undo</button>
        <button type="button" className="fp-tool-btn" onClick={() => dispatch({ type: 'redo' })} disabled={future.length === 0}>Redo</button>
        <label className="fp-toggle">
          <input type="checkbox" checked={angleSnap} onChange={(e) => setAngleSnap(e.target.checked)} />
          45° snap
        </label>
        <button type="button" className="fp-tool-btn" onClick={resetRectangle}>Reset rectangle</button>
        <button type="button" className="fp-tool-btn" onClick={clearPlan}>Clear</button>
      </div>

      <div className="fp-canvas-wrap">
        <svg
          ref={svgRef}
          className="fp-canvas"
          viewBox={viewBox}
          preserveAspectRatio="xMidYMid meet"
          onClick={handleCanvasClick}
          onMouseMove={(e) => {
            const w = screenToWorld(e.clientX, e.clientY);
            if (w) setCursor(w);
          }}
        >
          <rect
            x={canvas.minX - pad}
            y={canvas.minZ - pad}
            width={canvas.width + pad * 2}
            height={canvas.depth + pad * 2}
            fill="#1a1814"
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

          {plan.walls.map((w) => {
            const seg = getWallSegment(plan, w);
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
                <text
                  x={label.x}
                  y={label.y}
                  className="fp-dim"
                  dominantBaseline="middle"
                  textAnchor="middle"
                >
                  {Math.round(seg.length)}″
                </text>
              </g>
            );
          })}

          {plan.openings.map((o) => {
            const w = wallById(plan, o.wallId);
            if (!w) return null;
            const seg = getWallSegment(plan, w);
            if (!seg) return null;
            const x0 = seg.start.x + seg.tangent[0] * o.offset;
            const z0 = seg.start.z + seg.tangent[1] * o.offset;
            const x1 = x0 + seg.tangent[0] * o.width;
            const z1 = z0 + seg.tangent[1] * o.width;
            const selected = selectedOpeningId === o.id;
            return (
              <g key={o.id}>
                <line
                  x1={x0}
                  y1={z0}
                  x2={x1}
                  y2={z1}
                  className={`fp-opening fp-opening-${o.kind}${selected ? ' selected' : ''}`}
                />
                {o.kind === 'door' ? (
                  <path
                    d={`M ${x0} ${z0} A ${o.width} ${o.width} 0 0 1 ${x1} ${z1}`}
                    className="fp-door-swing"
                    fill="none"
                  />
                ) : null}
              </g>
            );
          })}

          {plan.vertices.map((v) => (
            <circle
              key={v.id}
              cx={v.x}
              cy={v.z}
              r={openEndpoints.has(v.id) ? EDITOR_VERTEX_RADIUS + 1 : EDITOR_VERTEX_RADIUS}
              className={openEndpoints.has(v.id) ? 'fp-vertex fp-vertex-open' : 'fp-vertex'}
            />
          ))}

          {wallDraft?.mode === 'pending' ? (
            <circle
              cx={wallDraft.x}
              cy={wallDraft.z}
              r={EDITOR_VERTEX_RADIUS}
              className="fp-vertex fp-vertex-pending"
            />
          ) : null}

          {wallDraft && cursor && tool === 'wall' ? (() => {
            const a = wallDraftPoint(plan, wallDraft);
            if (!a) return null;
            const [lx, lz] = snapAngle([a.x, a.z], cursor[0], cursor[1], angleSnap);
            return (
              <line x1={a.x} y1={a.z} x2={lx} y2={lz} className="fp-wall-draft" strokeDasharray="6 4" />
            );
          })() : null}

          {windowDraft && cursor ? (() => {
            const wall = wallById(plan, windowDraft.wallId);
            if (!wall) return null;
            const seg = getWallSegment(plan, wall);
            if (!seg) return null;
            const len = wallLength(plan, wall);
            const endOff = snapToGrid(offsetOnWall(plan, wall, cursor[0], cursor[1]));
            const start = Math.min(windowDraft.offset, endOff);
            let width = Math.abs(endOff - windowDraft.offset);
            if (width < GRID_SNAP_IN) width = GRID_SNAP_IN;
            width = Math.min(width, len - start - OPENING_END_CLEARANCE);
            width = Math.max(GRID_SNAP_IN, width);
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
                className="fp-opening fp-opening-window"
                strokeDasharray="4 3"
                opacity={0.7}
              />
            );
          })() : null}
        </svg>
      </div>

      <div className="fp-status">
        {issues.length === 0 ? (
          <span className="fp-status-ok">Floor plan ready</span>
        ) : (
          <span className="fp-status-warn">{issues[0]?.message}</span>
        )}
        <span className="fp-status-scale">1 square = 6″ (½ ft) · bold lines = 1 ft</span>
        <span className="fp-status-meta">
          {plan.walls.length} walls · {plan.openings.filter((o) => o.kind === 'door').length} doors ·{' '}
          {plan.openings.filter((o) => o.kind === 'window').length} windows
        </span>
      </div>
    </div>
  );
}

export function isFloorPlanReady(plan: FloorPlan): boolean {
  return validateFloorPlan(plan).length === 0;
}
