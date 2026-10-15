import { useCallback, useRef, useState } from 'react';
import {
  extractRoomScanFrameFromImageFile,
  extractRoomScanKeyframesFromFile,
  attachScanPhotosToSidecar,
  isRoomScanImageFile,
} from '../lib/roomScanFrames';
import { analyzeRoomVideoFrames } from '../lib/agenticRoomScanApi';
import { appendSinglePhotoScanWarning, ROOM_SCAN_ESTIMATE_WARNING } from '../lib/roomScanManifest';
import type { AgenticRoomScanSession } from '../lib/roomScanSession';
import { AgenticRoomFlow, type AgenticRoomConfirmPayload } from './AgenticRoomFlow';
import { Banner, Button, Spinner } from './kit';

interface AgenticRoomScanFlowProps {
  disabled?: boolean;
  onConfirm: (payload: AgenticRoomConfirmPayload) => void | Promise<void>;
  onBack: () => void;
}

type ScanPhase = 'pick' | 'extracting' | 'preparing' | 'analyzing';

async function finishAnalyze(
  frames: string[],
  singlePhoto: boolean,
): Promise<AgenticRoomScanSession | { error: string }> {
  const analyzed = await analyzeRoomVideoFrames(frames);
  if (!analyzed.ok) {
    return { error: analyzed.warnings[0] ?? analyzed.error };
  }
  let list = analyzed.list;
  if (singlePhoto) {
    list = appendSinglePhotoScanWarning(list);
  }
  const photos = await attachScanPhotosToSidecar(frames, analyzed.sidecar);
  return { list, sidecar: analyzed.sidecar, photos };
}

export function AgenticRoomScanFlow({ disabled, onConfirm, onBack }: AgenticRoomScanFlowProps) {
  const [phase, setPhase] = useState<ScanPhase>('pick');
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<AgenticRoomScanSession | null>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const runVideo = useCallback(
    async (file: File) => {
      if (disabled) return;
      setError(null);
      setPhase('extracting');
      try {
        const frames = await extractRoomScanKeyframesFromFile(file);
        setPhase('analyzing');
        const result = await finishAnalyze(frames, false);
        if ('error' in result) {
          setError(result.error);
          setPhase('pick');
          return;
        }
        setSession(result);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not process video');
        setPhase('pick');
      }
    },
    [disabled],
  );

  const runPhoto = useCallback(
    async (file: File) => {
      if (disabled) return;
      setError(null);
      setPhase('preparing');
      try {
        const frame = await extractRoomScanFrameFromImageFile(file);
        setPhase('analyzing');
        const result = await finishAnalyze([frame], true);
        if ('error' in result) {
          setError(result.error);
          setPhase('pick');
          return;
        }
        setSession(result);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not process photo');
        setPhase('pick');
      }
    },
    [disabled],
  );

  const onVideoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) void runVideo(file);
  };

  const onPhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!isRoomScanImageFile(file)) {
      setError('Choose a JPEG, PNG, or WebP photo of the room.');
      return;
    }
    void runPhoto(file);
  };

  if (session) {
    return (
      <AgenticRoomFlow
        disabled={disabled}
        onBack={() => {
          setSession(null);
          setPhase('pick');
          setError(null);
        }}
        onConfirm={onConfirm}
        flowMode="scan"
        scanSession={session}
      />
    );
  }

  const busy = phase !== 'pick';
  const status =
    phase === 'extracting'
      ? 'Extracting keyframes from your video…'
      : phase === 'preparing'
        ? 'Preparing photo…'
        : phase === 'analyzing'
          ? 'Analyzing room layout and furniture…'
          : null;

  return (
    <div className="agentic-room-flow agentic-room-scan">
      <div className="agentic-room-flow__head">
        <Button size="sm" variant="outline" disabled={disabled || busy} onClick={onBack}>
          Back
        </Button>
      </div>
      <p className="agentic-room-scan__intro">
        Record or upload a short walkthrough, or upload one wide photo of the room. We&apos;ll
        estimate size and furniture, then match catalog pieces you can edit in 3D.
      </p>
      <ul className="agentic-room-scan__limits">
        <li>{ROOM_SCAN_ESTIMATE_WARNING}</li>
        <li>
          A single photo works best as a wide shot of the whole room; layout is less accurate than
          a walkthrough video.
        </li>
        <li>Catalog models match category and size — they won&apos;t look identical to your furniture.</li>
        <li>Small or hidden items may be missed; add them later in the designer.</li>
      </ul>
      <input
        ref={videoInputRef}
        type="file"
        accept="video/*"
        capture="environment"
        className="agentic-room-scan__file-input"
        disabled={disabled || busy}
        onChange={onVideoChange}
      />
      <input
        ref={photoInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif"
        className="agentic-room-scan__file-input"
        disabled={disabled || busy}
        onChange={onPhotoChange}
      />
      <div className="agentic-room-scan__actions">
        <Button disabled={disabled || busy} onClick={() => videoInputRef.current?.click()}>
          Choose or record video
        </Button>
        <Button
          variant="outline"
          disabled={disabled || busy}
          onClick={() => photoInputRef.current?.click()}
        >
          Upload a photo
        </Button>
      </div>
      {status ? (
        <p className="agentic-room-flow__status">
          <Spinner inline /> {status}
        </p>
      ) : null}
      {error ? <Banner tone="error">{error}</Banner> : null}
    </div>
  );
}
