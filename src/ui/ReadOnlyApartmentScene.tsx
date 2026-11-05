import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  apartmentRoomById,
  isApartmentPlan,
  type ApartmentRoom,
} from '../lib/apartmentRooms';
import { dollhouseFraming, framingForArea } from '../lib/presentationCameras';
import { Scene, type SceneHandle } from '../scene/Scene';
import { getApartmentMode, useStore } from '../store';
import { ApartmentRoomList } from './designer/ApartmentBar';
import { NameRoomDialog } from './designer/NameRoomDialog';

/** Read-only Scene with apartment overview / focus for public and shared pages. */
export function ReadOnlyApartmentScene() {
  const roomGeometry = useStore((s) => s.roomGeometry);
  const focusedRoomId = useStore((s) => s.focusedRoomId);
  const focusRoom = useStore((s) => s.focusRoom);
  const exitToOverview = useStore((s) => s.exitToOverview);
  const mode = getApartmentMode({ roomGeometry, focusedRoomId });
  const sceneRef = useRef<SceneHandle>(null);
  const [highlightedRoomId, setHighlightedRoomId] = useState<string | null>(null);
  const [namingRoom, setNamingRoom] = useState<ApartmentRoom | null>(null);
  const isApartment = isApartmentPlan(roomGeometry);

  const handleFocusRoom = useCallback(
    (roomId: string) => {
      focusRoom(roomId);
      const room = apartmentRoomById(useStore.getState().roomGeometry, roomId);
      if (!room) return;
      sceneRef.current?.goToFraming(framingForArea(useStore.getState().roomGeometry, room));
    },
    [focusRoom],
  );

  const handleBack = useCallback(() => {
    exitToOverview();
    sceneRef.current?.goToFraming(dollhouseFraming(useStore.getState().roomGeometry));
  }, [exitToOverview]);

  useEffect(() => {
    if (mode !== 'overview') return;
    sceneRef.current?.goToFraming(dollhouseFraming(roomGeometry));
  }, [mode, roomGeometry]);

  // Deep link ?room=
  useEffect(() => {
    if (!isApartment || focusedRoomId) return;
    const param = new URLSearchParams(window.location.search).get('room');
    if (param && apartmentRoomById(roomGeometry, param)?.tagged) {
      handleFocusRoom(param);
    }
  }, [isApartment, roomGeometry, focusedRoomId, handleFocusRoom]);

  useEffect(() => {
    if (typeof window === 'undefined' || !isApartment) return;
    const url = new URL(window.location.href);
    const current = url.searchParams.get('room');
    if (focusedRoomId) {
      if (current === focusedRoomId) return;
      url.searchParams.set('room', focusedRoomId);
    } else if (current) {
      url.searchParams.delete('room');
    } else {
      return;
    }
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  }, [focusedRoomId, isApartment]);

  const overview = useMemo(
    () =>
      mode === 'overview'
        ? {
            highlightedId: highlightedRoomId,
            onHighlight: setHighlightedRoomId,
            onFocusRoom: handleFocusRoom,
            onNameRoom: setNamingRoom,
          }
        : null,
    [mode, highlightedRoomId, handleFocusRoom],
  );

  return (
    <>
      <Scene ref={sceneRef} readOnly apartmentOverview={overview} />
      {mode === 'overview' ? (
        <ApartmentRoomList
          onFocusRoom={handleFocusRoom}
          onNameRoom={setNamingRoom}
          highlightedId={highlightedRoomId}
          onHighlight={setHighlightedRoomId}
        />
      ) : null}
      {mode === 'focused' ? (
        <button
          type="button"
          className="dg-apt-bar__link"
          style={{
            position: 'absolute',
            top: 16,
            left: 16,
            zIndex: 8,
            padding: '8px 12px',
            background: 'rgba(248,243,234,0.94)',
            border: '1px solid var(--ink-0, #ddd)',
            borderRadius: 4,
          }}
          onClick={handleBack}
        >
          ← Back to apartment
        </button>
      ) : null}
      {namingRoom ? (
        <NameRoomDialog
          room={namingRoom}
          onCancel={() => setNamingRoom(null)}
          onNamed={(zoneId) => {
            setNamingRoom(null);
            handleFocusRoom(zoneId);
          }}
        />
      ) : null}
    </>
  );
}
