import { WALL_COLOR_SWATCHES } from '../lib/roomAppearance';
import { FURNITURE_FINISH_SWATCHES } from '../lib/furnitureFinish';
import {
  activeAgenticSchemeRoles,
  addOptionalAgenticSchemeRole,
  colorForAgenticInput,
  DEFAULT_AGENTIC_SCHEME_COLORS,
  ensureAgenticSchemeColors,
  removeOptionalAgenticSchemeRoles,
  setAgenticSchemeColor,
  type AgenticSchemeRole,
  type AgenticSchemeRoleId,
} from '../lib/agenticColorScheme';
import { Button } from './kit';

const ACCENT_SWATCHES = [
  { label: 'Sand', color: '#b89b7a' },
  { label: 'Clay', color: '#a96f59' },
  { label: 'Slate blue', color: '#7a8fa3' },
  { label: 'Sage', color: '#8a9a82' },
  { label: 'Blush', color: '#d8c0c0' },
  { label: 'Charcoal', color: '#3a3a3a' },
] as const;

const TOP_SWATCHES = [
  { label: 'Warm yellow', color: '#e8d8b0' },
  { label: 'Soft white', color: '#f2efe8' },
  { label: 'Gray laminate', color: '#5c6166' },
  { label: 'Walnut', color: '#6b4f33' },
] as const;

const LAMP_SWATCHES = [
  { label: 'Warm white', color: '#ffd090' },
  { label: 'Soft white', color: '#fff4e0' },
  { label: 'Cool white', color: '#e8f0ff' },
  { label: 'Amber', color: '#ffb84d' },
] as const;

function presetsForRole(role: AgenticSchemeRoleId): readonly { label: string; color: string }[] {
  switch (role) {
    case 'wall':
      return WALL_COLOR_SWATCHES;
    case 'wood':
      return FURNITURE_FINISH_SWATCHES;
    case 'accent':
      return ACCENT_SWATCHES;
    case 'top':
      return TOP_SWATCHES;
    case 'lamp':
      return LAMP_SWATCHES;
    default:
      return WALL_COLOR_SWATCHES;
  }
}

function SchemeColorRow({
  role,
  color,
  disabled,
  onPick,
}: {
  role: AgenticSchemeRole;
  color: string;
  disabled?: boolean;
  onPick: (hex: string) => void;
}) {
  const inputHex = colorForAgenticInput(color, DEFAULT_AGENTIC_SCHEME_COLORS[0]!);
  const presets = presetsForRole(role.id);

  return (
    <div className="agentic-scheme-row">
      <div className="agentic-scheme-row__head">
        <span className="agentic-scheme-row__label">{role.label}</span>
        <span className="agentic-scheme-row__hint">{role.hint}</span>
      </div>
      <div className="agentic-scheme-row__controls">
        <input
          type="color"
          className="agentic-scheme-row__picker"
          value={inputHex}
          disabled={disabled}
          aria-label={`${role.label} color`}
          onChange={(e) => onPick(e.target.value)}
        />
        <div className="agentic-scheme-row__swatches" role="group" aria-label={`${role.label} presets`}>
          {presets.map((swatch) => (
            <button
              key={`${role.id}-${swatch.color}`}
              type="button"
              className={`agentic-scheme-row__swatch${
                inputHex.toLowerCase() === swatch.color.toLowerCase() ? ' is-active' : ''
              }`}
              style={{ background: swatch.color }}
              title={swatch.label}
              aria-label={swatch.label}
              aria-pressed={inputHex.toLowerCase() === swatch.color.toLowerCase()}
              disabled={disabled}
              onClick={() => onPick(swatch.color)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export function AgenticColorSchemeEditor({
  value,
  onChange,
  disabled,
}: {
  value: string[] | undefined;
  onChange: (colors: string[] | undefined) => void;
  disabled?: boolean;
}) {
  const enabled = (value?.length ?? 0) > 0;
  const colors = enabled ? ensureAgenticSchemeColors(value) : [];
  const roles = enabled ? activeAgenticSchemeRoles(colors) : [];
  const canAddTop = enabled && colors.length < 4;
  const canAddLamp = enabled && colors.length < 5;

  return (
    <div className="agentic-scheme-editor">
      <div className="agentic-scheme-editor__toggle-row">
        <button
          type="button"
          className={`agentic-scheme-editor__toggle${enabled ? ' is-on' : ''}`}
          aria-pressed={enabled}
          disabled={disabled}
          onClick={() =>
            onChange(enabled ? undefined : ensureAgenticSchemeColors(undefined, 3))
          }
        >
          {enabled ? 'On' : 'Off'}
        </button>
        <p className="agentic-scheme-editor__lead">
          {enabled
            ? 'Pick colors for walls and furniture. AI suggestions appear here when you generate a list.'
            : 'Use theme & vibe only, or turn on to choose your own palette.'}
        </p>
      </div>

      {enabled ? (
        <>
          <div className="agentic-scheme-editor__rows">
            {roles.map((role, index) => (
              <SchemeColorRow
                key={role.id}
                role={role}
                color={colors[index] ?? DEFAULT_AGENTIC_SCHEME_COLORS[index]!}
                disabled={disabled}
                onPick={(hex) => onChange(setAgenticSchemeColor(colors, role.id, hex))}
              />
            ))}
          </div>
          <div className="agentic-scheme-editor__extras">
            {canAddTop ? (
              <Button
                size="sm"
                variant="outline"
                disabled={disabled}
                onClick={() => onChange(addOptionalAgenticSchemeRole(colors, 'top'))}
              >
                Add desk top color
              </Button>
            ) : null}
            {canAddLamp ? (
              <Button
                size="sm"
                variant="outline"
                disabled={disabled}
                onClick={() => onChange(addOptionalAgenticSchemeRole(colors, 'lamp'))}
              >
                Add lamp glow color
              </Button>
            ) : null}
            {colors.length > 3 ? (
              <Button
                size="sm"
                variant="outline"
                disabled={disabled}
                onClick={() => onChange(removeOptionalAgenticSchemeRoles(colors))}
              >
                Use only 3 colors
              </Button>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
