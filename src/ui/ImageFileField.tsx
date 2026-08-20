import { useEffect, useRef, useState } from 'react';
import {
  imageFileFromClipboardEvent,
  pasteShortcutLabel,
  readImageFileFromClipboard,
} from '../lib/clipboardImage';
import { Button } from './kit/Button';

interface ImageFileFieldProps {
  label: string;
  file: File | null;
  disabled?: boolean;
  accept?: string;
  onFile: (file: File | null) => void;
}

export function ImageFileField({
  label,
  file,
  disabled = false,
  accept = 'image/*',
  onFile,
}: ImageFileFieldProps) {
  const [pasteError, setPasteError] = useState<string | null>(null);
  const [pasteBusy, setPasteBusy] = useState(false);
  const onFileRef = useRef(onFile);
  onFileRef.current = onFile;
  const shortcut = pasteShortcutLabel();

  useEffect(() => {
    if (disabled) return;

    function onPaste(event: ClipboardEvent) {
      const image = imageFileFromClipboardEvent(event);
      if (!image) return;
      event.preventDefault();
      setPasteError(null);
      onFileRef.current(image);
    }

    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [disabled]);

  const applyFile = (next: File | null) => {
    setPasteError(null);
    onFile(next);
  };

  const handlePasteClick = async () => {
    if (disabled || pasteBusy) return;
    setPasteError(null);
    setPasteBusy(true);
    try {
      const image = await readImageFileFromClipboard();
      if (!image) {
        setPasteError(
          `No image on the clipboard. Copy a screenshot or image, then press ${shortcut}.`,
        );
        return;
      }
      onFile(image);
    } catch {
      setPasteError(`Could not read the clipboard. Press ${shortcut} to paste instead.`);
    } finally {
      setPasteBusy(false);
    }
  };

  return (
    <div className="import-modal-field">
      <span>{label}</span>
      <div className="import-modal-image-source">
        <input
          type="file"
          accept={accept}
          disabled={disabled}
          onChange={(ev) => applyFile(ev.target.files?.[0] ?? null)}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled || pasteBusy}
          onClick={() => void handlePasteClick()}
        >
          {pasteBusy ? 'Pasting…' : 'Paste from clipboard'}
        </Button>
      </div>
      <small className="import-modal-image-source-hint">
        {file
          ? file.name
          : `Choose a file, or paste with ${shortcut}.`}
      </small>
      {pasteError ? (
        <div className="import-modal-error" role="status">
          {pasteError}
        </div>
      ) : null}
    </div>
  );
}
