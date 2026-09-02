import type { CameraPresetId } from '../../lib/renderQuality';
import { WALL_COLOR_SWATCHES } from '../../lib/roomAppearance';
import type { HangingDecorKind } from '../../store';
import { useStore } from '../../store';
import { pushRecentCommand } from '../../lib/recentCatalogKinds';
export interface CommandPaletteCommand {
  id: string;
  label: string;
  hint?: string;
  run: () => void;
}

export interface BuildCommandsInput {
  setPanel: (panel: 'add' | 'look' | 'light' | 'pieces' | null) => void;
  openInspector: () => void;
  openImport: () => void;
  togglePresent: () => void;
  startDraw: (kind: HangingDecorKind) => void;
  addLightSource: () => void;
  handleSave: () => void;
  onOpenChecklist: () => void;
  onEditFloorPlan?: () => void;
  openShare?: () => void;
  openExport: () => void;
  openFeedback: () => void;
  openKeys: () => void;
  restartTour: () => void;
  goPreset: (id: CameraPresetId) => void;
  resetCamera: () => void;
  selectedId: string | null;
  saveLabel: string;
  isOwner: boolean;
}

function wrap(id: string, run: () => void): () => void {
  return () => {
    pushRecentCommand(id);
    run();
  };
}

/** Static + contextual designer commands for the command palette. */
export function buildDesignerCommands(input: BuildCommandsInput): CommandPaletteCommand[] {
  const fixturesLit = useStore.getState().roomFixturesLit();
  const lampCount = useStore
    .getState()
    .order.filter((id) => {
      const it = useStore.getState().items[id];
      return (
        it &&
        (it.kind === 'lamp' ||
          it.kind === 'light' ||
          !!it.emitter ||
          (it.kind === 'hanging' && it.hanging?.kind === 'lights'))
      );
    }).length;

  const cmds: CommandPaletteCommand[] = [
    {
      id: 'add',
      label: 'Add a piece',
      hint: 'A',
      run: wrap('add', () => input.setPanel('add')),
    },
    {
      id: 'look',
      label: 'Room look',
      run: wrap('look', () => input.setPanel('look')),
    },
    {
      id: 'light',
      label: 'Light & mood',
      run: wrap('light', () => input.setPanel('light')),
    },
    {
      id: 'pieces',
      label: 'Pieces in the room',
      run: wrap('pieces', () => input.setPanel('pieces')),
    },
    {
      id: 'toggle-lamps',
      label: fixturesLit
        ? lampCount > 0
          ? `Turn the lamps off`
          : 'Turn the lights off'
        : lampCount > 0
          ? `Turn the lamps on`
          : 'Turn the lights on',
      hint: 'L',
      run: wrap('toggle-lamps', () => {
        useStore.getState().toggleRoomFixtures(!useStore.getState().roomFixturesLit());
      }),
    },
    {
      id: 'draw-lights',
      label: 'Draw string lights',
      run: wrap('draw-lights', () => input.startDraw('lights')),
    },
    {
      id: 'draw-led-strip',
      label: 'Draw LED strip',
      run: wrap('draw-led-strip', () => input.startDraw('led-strip')),
    },
    {
      id: 'draw-leaves',
      label: 'Draw hanging leaves',
      run: wrap('draw-leaves', () => input.startDraw('leaves')),
    },
    {
      id: 'add-free-light',
      label: 'Add free light',
      run: wrap('add-free-light', () => input.addLightSource()),
    },
    {
      id: 'ceiling-lights',
      label: 'Toggle ceiling lights',
      run: wrap('ceiling-lights', () => {
        const a = useStore.getState().environment.appearance;
        useStore.getState().setAppearance({ recessedLights: !a.recessedLights });
      }),
    },
    {
      id: 'view-room',
      label: 'View: Room',
      run: wrap('view-room', () => input.goPreset('corner')),
    },
    {
      id: 'view-desk',
      label: 'View: Desk',
      run: wrap('view-desk', () => input.goPreset('catalog')),
    },
    {
      id: 'view-top',
      label: 'View: Top',
      run: wrap('view-top', () => input.goPreset('topDown')),
    },
    {
      id: 'reset-cam',
      label: 'Reset camera',
      hint: '0',
      run: wrap('reset-cam', () => input.resetCamera()),
    },
  ];

  if (input.selectedId) {
    cmds.push({
      id: 'inspect',
      label: 'Edit selected piece',
      hint: 'Enter',
      run: wrap('inspect', () => input.openInspector()),
    });
  }

  cmds.push(
    {
      id: 'import',
      label: 'Import a model',
      run: wrap('import', () => input.openImport()),
    },
    {
      id: 'present',
      label: 'Present mode',
      hint: 'P',
      run: wrap('present', () => input.togglePresent()),
    },
    {
      id: 'save',
      label: input.saveLabel,
      run: wrap('save', () => input.handleSave()),
    },
    {
      id: 'checklist',
      label: 'Open full checklist',
      run: wrap('checklist', () => input.onOpenChecklist()),
    },
  );

  if (input.onEditFloorPlan) {
    cmds.push({
      id: 'floor',
      label: 'Edit floor plan',
      hint: 'F',
      run: wrap('floor', () => input.onEditFloorPlan?.()),
    });
  }
  if (input.isOwner && input.openShare) {
    cmds.push({
      id: 'share',
      label: 'Share room',
      hint: '⇧S',
      run: wrap('share', () => input.openShare?.()),
    });
  }

  cmds.push(
    {
      id: 'export',
      label: 'Export render',
      hint: '⇧E',
      run: wrap('export', () => input.openExport()),
    },
    {
      id: 'feedback',
      label: 'Send feedback',
      run: wrap('feedback', () => input.openFeedback()),
    },
    {
      id: 'keys',
      label: 'Keyboard shortcuts',
      hint: '?',
      run: wrap('keys', () => input.openKeys()),
    },
    {
      id: 'tour',
      label: 'Restart walkthrough',
      run: wrap('tour', () => input.restartTour()),
    },
  );

  // Generic wall paint entry (opens Look) — Hollis shows this beside lighting controls.
  cmds.push({
    id: 'wall-paint',
    label: 'Change wall paint',
    run: wrap('wall-paint', () => input.setPanel('look')),
  });

  // Specific swatches — match when the user names a color.
  for (const swatch of WALL_COLOR_SWATCHES) {
    cmds.push({
      id: `wall-paint-${swatch.color}`,
      label: `Change wall paint to ${swatch.label}`,
      run: wrap(`wall-paint-${swatch.color}`, () =>
        useStore.getState().setAppearance({ wallColor: swatch.color }),
      ),
    });
  }

  return cmds;
}

export function actionIconFor(
  id: string,
): 'light' | 'paint' | 'camera' | 'add' | 'look' | 'pieces' | 'help' | 'save' | 'share' | 'export' | 'dot' {
  if (id === 'wall-paint' || id.startsWith('wall-paint-') || id === 'look') {
    return id === 'look' ? 'look' : 'paint';
  }
  if (id.includes('light') || id.includes('lamp') || id === 'draw-lights' || id === 'ceiling-lights') {
    return 'light';
  }
  if (id.startsWith('view-') || id === 'reset-cam') return 'camera';
  if (id === 'add' || id === 'import' || id === 'draw-leaves' || id === 'add-free-light') return 'add';
  if (id === 'pieces' || id === 'inspect') return 'pieces';
  if (id === 'save') return 'save';
  if (id === 'share') return 'share';
  if (id === 'export') return 'export';
  if (id === 'keys' || id === 'tour' || id === 'feedback') return 'help';
  return 'dot';
}
