import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore, type HangingDecorKind, type MeasureAcceptField } from '../../store';

export type ImportMeasuringField = MeasureAcceptField | null;
import {
  COMPACT_MQ,
  TOUR_STEPS,
  TOUR_STORAGE_KEY,
  type DesignerOverlay,
  type DesignerPanel,
  type ImportRoute,
  type InspectorTab,
} from './chromeTypes';
import { defaultInspectorTab } from './inspectorTabs';

function loadTourDone(): boolean {
  try {
    return localStorage.getItem(TOUR_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function saveTourDone() {
  try {
    localStorage.setItem(TOUR_STORAGE_KEY, '1');
  } catch {
    /* ignore */
  }
}

export function useDesignerChrome() {
  const selectedId = useStore((s) => s.selectedId);
  const selectedItem = useStore((s) => (selectedId ? s.items[selectedId] : null));
  const selectedWallId = useStore((s) => s.selectedWallId);
  const wallSelectEpoch = useStore((s) => s.wallSelectEpoch);
  const designerTool = useStore((s) => s.designerTool);
  const hangingDraft = useStore((s) => s.hangingDraft);
  const measurePending = useStore((s) => s.measurePending);
  const measurements = useStore((s) => s.measurements);
  const setDesignerTool = useStore((s) => s.setDesignerTool);
  const cancelHangingDraft = useStore((s) => s.cancelHangingDraft);
  const cancelMeasure = useStore((s) => s.cancelMeasure);
  const cancelMeasurePending = useStore((s) => s.cancelMeasurePending);
  const measureAcceptRef = useRef<((value: string) => void) | null>(null);

  const [panel, setPanelRaw] = useState<DesignerPanel>(null);
  const [overlay, setOverlay] = useState<DesignerOverlay>(null);
  const [present, setPresent] = useState(false);
  const [radialOpen, setRadialOpen] = useState(false);
  const [tickerOpen, setTickerOpen] = useState(true);
  const [tourOn, setTourOn] = useState(() => !loadTourDone());
  const [tourStep, setTourStep] = useState(0);
  const [importOpen, setImportOpen] = useState(false);
  const [importRoute, setImportRoute] = useState<ImportRoute>(null);
  const [importMeasuring, setImportMeasuring] = useState(false);
  const [importMeasuringField, setImportMeasuringField] = useState<ImportMeasuringField>(null);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('fit');
  const [compact, setCompact] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(COMPACT_MQ).matches,
  );

  useEffect(() => {
    const mq = window.matchMedia(COMPACT_MQ);
    const sync = () => setCompact(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  const drawing = designerTool === 'hanging-leaves'
    || designerTool === 'hanging-lights'
    || designerTool === 'hanging-led-strip';
  const measuring = designerTool === 'measure';

  const setPanel = useCallback((next: DesignerPanel) => {
    setPanelRaw((cur) => (cur === next ? null : next));
    setOverlay(null);
    setRadialOpen(false);
    if (next) setTourOn(false);
  }, []);

  const closePanels = useCallback(() => {
    setPanelRaw(null);
    setRadialOpen(false);
  }, []);

  const openInspector = useCallback(() => {
    setPanelRaw('inspect');
    setRadialOpen(false);
    setOverlay(null);
    setInspectorTab(defaultInspectorTab(selectedItem?.kind));
  }, [selectedItem?.kind]);

  const openInspectorTab = useCallback((tab: InspectorTab) => {
    setPanelRaw('inspect');
    setRadialOpen(false);
    setOverlay(null);
    setInspectorTab(tab);
  }, []);

  const clearSelection = useCallback(() => {
    useStore.getState().select(null);
    setRadialOpen(false);
    setPanelRaw((p) => (p === 'inspect' ? null : p));
  }, []);

  useEffect(() => {
    setRadialOpen(false);
    if (!selectedId && panel === 'inspect') setPanelRaw(null);
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selectedWallId || present || drawing || tourOn) return;
    setPanelRaw('look');
    setRadialOpen(false);
  }, [selectedWallId, wallSelectEpoch]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (panel !== 'inspect' || !selectedItem) return;
    const kind = selectedItem.kind;
    if (kind === 'hanging') {
      setInspectorTab((t) => (t === 'path' || t === 'bulbs' ? t : 'path'));
      return;
    }
    if (kind === 'light') {
      setInspectorTab('light');
      return;
    }
    setInspectorTab((t) => {
      if (kind !== 'bed' && t === 'bedding') return 'fit';
      if (t === 'path' || t === 'bulbs' || t === 'light') return 'fit';
      if (t === 'thrixel') return t;
      return t;
    });
  }, [selectedItem?.kind, panel]); // eslint-disable-line react-hooks/exhaustive-deps

  const togglePresent = useCallback(() => {
    setPresent((v) => {
      const next = !v;
      if (next) {
        setPanelRaw(null);
        setOverlay(null);
        setTourOn(false);
        setRadialOpen(false);
        if (hangingDraft) cancelHangingDraft();
        if (importMeasuring || measuring) {
          measureAcceptRef.current = null;
          setImportMeasuring(false);
          setImportMeasuringField(null);
        }
        if (measuring) cancelMeasure();
        setDesignerTool('select');
      }
      return next;
    });
  }, [
    hangingDraft,
    measuring,
    importMeasuring,
    cancelHangingDraft,
    cancelMeasure,
    setDesignerTool,
  ]);

  const endTour = useCallback(() => {
    setTourOn(false);
    saveTourDone();
  }, []);

  const restartTour = useCallback(() => {
    setTourStep(0);
    setTourOn(true);
    setPanelRaw(null);
    setOverlay(null);
    setPresent(false);
  }, []);

  const tourNext = useCallback(() => {
    setTourStep((s) => {
      if (s >= TOUR_STEPS.length - 1) {
        setTourOn(false);
        saveTourDone();
        return 0;
      }
      return s + 1;
    });
  }, []);

  const tourPrev = useCallback(() => {
    setTourStep((s) => Math.max(0, s - 1));
  }, []);

  // Apply per-step tour side effects (select item, open ticker).
  useEffect(() => {
    if (!tourOn) return;
    const step = TOUR_STEPS[tourStep];
    if (!step) return;
    if (step.openTicker) setTickerOpen(true);
    if (step.selectFirst) {
      const { order, select } = useStore.getState();
      const first = order[0];
      if (first) select(first);
    }
  }, [tourOn, tourStep]);

  const openImport = useCallback((route: ImportRoute = null) => {
    setImportOpen(true);
    setImportRoute(route);
    setPanelRaw(null);
    setOverlay(null);
  }, []);

  const closeImport = useCallback(() => {
    setImportOpen(false);
    setImportRoute(null);
    setImportMeasuring(false);
    setImportMeasuringField(null);
    measureAcceptRef.current = null;
    if (useStore.getState().designerTool === 'measure') {
      useStore.getState().cancelMeasure();
    }
  }, []);

  const startDraw = useCallback((kind: HangingDecorKind) => {
    useStore.getState().beginHangingDraft(kind);
    setPanelRaw(null);
    setOverlay(null);
    setRadialOpen(false);
    setImportMeasuring(false);
    setImportMeasuringField(null);
    measureAcceptRef.current = null;
    useStore.getState().select(null);
  }, []);

  const startMeasure = useCallback(() => {
    useStore.getState().beginMeasure(null);
    setPanelRaw(null);
    setOverlay(null);
    setRadialOpen(false);
    setImportMeasuring(false);
    setImportMeasuringField(null);
    measureAcceptRef.current = null;
    useStore.getState().select(null);
  }, []);

  const startMeasureFromImport = useCallback(
    (field: MeasureAcceptField, onAccept: (value: string) => void) => {
      measureAcceptRef.current = onAccept;
      setImportMeasuringField(field);
      setImportMeasuring(true);
      useStore.getState().beginMeasure(field, true);
      setPanelRaw(null);
      setOverlay(null);
      setRadialOpen(false);
      useStore.getState().select(null);
    },
    [],
  );

  const acceptMeasureFromImport = useCallback(() => {
    const value = useStore.getState().getMeasureAcceptValue();
    if (value != null && measureAcceptRef.current) {
      measureAcceptRef.current(value);
    }
    measureAcceptRef.current = null;
    setImportMeasuringField(null);
    setImportMeasuring(false);
    useStore.getState().finishMeasure();
  }, []);

  const cancelMeasureFromImport = useCallback(() => {
    measureAcceptRef.current = null;
    setImportMeasuringField(null);
    setImportMeasuring(false);
    useStore.getState().cancelMeasure();
  }, []);

  // Import is a modal over the room — keep chrome painted so the blurred
  // designer stays visible behind the scrim (pointer-events blocked by overlay).
  const chromeOn = !present && !drawing;
  const showContextBar =
    !!selectedId && !present && !drawing && !importOpen && panel !== 'inspect' && !compact;
  const showActionSheet =
    compact &&
    !!selectedId &&
    !present &&
    !drawing &&
    !importOpen &&
    panel !== 'inspect' &&
    panel == null;
  const dockOn = compact && chromeOn && !importOpen && !selectedId && panel == null;
  const tickerVisible = chromeOn && !importOpen && panel !== 'inspect';

  return useMemo(
    () => ({
      compact,
      panel,
      setPanel,
      closePanels,
      overlay,
      setOverlay,
      present,
      togglePresent,
      setPresent,
      radialOpen,
      setRadialOpen,
      tickerOpen,
      setTickerOpen,
      tourOn,
      tourStep,
      endTour,
      restartTour,
      tourNext,
      tourPrev,
      importOpen,
      importRoute,
      setImportRoute,
      openImport,
      closeImport,
      importMeasuring,
      importMeasuringField,
      startMeasure,
      startMeasureFromImport,
      acceptMeasureFromImport,
      cancelMeasureFromImport,
      inspectorTab,
      setInspectorTab,
      openInspector,
      openInspectorTab,
      clearSelection,
      startDraw,
      drawing,
      measuring,
      hangingDraft,
      measurePending,
      measurements,
      cancelMeasurePending,
      chromeOn,
      showContextBar,
      showActionSheet,
      dockOn,
      tickerVisible,
      selectedId,
      selectedItem,
    }),
    [
      compact,
      panel,
      setPanel,
      closePanels,
      overlay,
      present,
      togglePresent,
      radialOpen,
      tickerOpen,
      tourOn,
      tourStep,
      endTour,
      restartTour,
      tourNext,
      tourPrev,
      importOpen,
      importRoute,
      openImport,
      closeImport,
      importMeasuring,
      importMeasuringField,
      startMeasure,
      startMeasureFromImport,
      acceptMeasureFromImport,
      cancelMeasureFromImport,
      inspectorTab,
      openInspector,
      openInspectorTab,
      clearSelection,
      startDraw,
      drawing,
      measuring,
      hangingDraft,
      measurePending,
      measurements,
      cancelMeasurePending,
      chromeOn,
      showContextBar,
      showActionSheet,
      dockOn,
      tickerVisible,
      selectedId,
      selectedItem,
    ],
  );
}

export type DesignerChrome = ReturnType<typeof useDesignerChrome>;
