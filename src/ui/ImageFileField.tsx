import { useEffect, useRef, useState } from 'react';
import {
  imageFileFromClipboardEvent,
  pasteShortcutLabel,
  readImageFileFromClipboard,
} from '../lib/clipboardImage';

interface ImageFileFieldProps {
  label: string;
  file: File | null;
  disabled?: boolean;
  accept?: string;
  onFile: (file: File | null) => void;
}

function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function ImageFileField({
  label,
  file,
  disabled = false,
  accept = 'image/*',
  onFile,
}: ImageFileFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pasteError, setPasteError] = useState<string | null>(null);
  const [pasteBusy, setPasteBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
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

  const pickFromList = (list: FileList | null) => {
    const next = list?.[0] ?? null;
    if (next && !next.type.startsWith('image/')) {
      setPasteError('Choose an image file (jpg, png, or webp).');
      return;
    }
    applyFile(next);
  };

  return (
    <div className="image-file-field">
      <span className="image-file-field__label">{label}</span>

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        disabled={disabled}
        className="image-file-field__input"
        onChange={(ev) => {
          pickFromList(ev.target.files);
          ev.target.value = '';
        }}
      />

      {file ? (
        <div className={`image-file-field__file${disabled ? ' is-disabled' : ''}`}>
          <div className="image-file-field__thumb" aria-hidden />
          <div className="image-file-field__copy">
            <span className="image-file-field__name">{file.name}</span>
            <span className="image-file-field__meta">
              {[formatBytes(file.size), 'image'].filter(Boolean).join(' · ')}
            </span>
          </div>
          <button
            type="button"
            className="image-file-field__replace"
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
          >
            Replace
          </button>
        </div>
      ) : (
        <button
          type="button"
          className={`image-file-field__drop${dragging ? ' is-dragging' : ''}`}
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          onDragEnter={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!disabled) setDragging(true);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setDragging(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setDragging(false);
            if (disabled) return;
            pickFromList(e.dataTransfer.files);
          }}
        >
          <span className="image-file-field__drop-title">Drop an image or click to browse</span>
          <span className="image-file-field__drop-hint">jpg, png, or webp</span>
        </button>
      )}

      <button
        type="button"
        className="image-file-field__paste"
        disabled={disabled || pasteBusy}
        onClick={() => void handlePasteClick()}
      >
        {pasteBusy ? 'Pasting…' : `Paste from clipboard · ${shortcut}`}
      </button>

      <span className="image-file-field__hint">
        {file ? file.name : `Choose a file, or paste with ${shortcut}.`}
      </span>

      {pasteError ? (
        <div className="image-file-field__error" role="status">
          {pasteError}
        </div>
      ) : null}
    </div>
  );
}
