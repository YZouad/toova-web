import { useState } from 'react';
import { parseInspoClipUrl } from '../../lib/inspoClipUrls';
import { submitInspoClip } from '../../lib/shoppingCatalogAdmin';
import { Banner, Button, Field, Input, MonoMeta } from '../kit';
import { Modal } from '../kit/Modal';

export function SaveInspoClipModal({
  open,
  categoryId,
  categoryName,
  userId,
  isAdmin,
  onClose,
  onRequestSignIn,
  onSubmitted,
}: {
  open: boolean;
  categoryId: string;
  categoryName: string;
  userId: string | null;
  isAdmin?: boolean;
  onClose: () => void;
  onRequestSignIn?: () => void;
  onSubmitted?: () => void;
}) {
  const [rawUrl, setRawUrl] = useState('');
  const [title, setTitle] = useState('');
  const [creatorHandle, setCreatorHandle] = useState('');
  const [thumbnailUrl, setThumbnailUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleClose() {
    if (!submitting) onClose();
  }

  async function handleSubmit() {
    if (!userId) {
      onRequestSignIn?.();
      return;
    }
    const parsed = parseInspoClipUrl(rawUrl);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await submitInspoClip({
        categoryId,
        rawUrl,
        title: title.trim() || `${categoryName} review`,
        creatorHandle: creatorHandle.trim() || parsed.inferredCreatorHandle,
        thumbnailUrl: thumbnailUrl.trim() || null,
        userId,
        publishImmediately: isAdmin,
      });
      setRawUrl('');
      setTitle('');
      setCreatorHandle('');
      setThumbnailUrl('');
      onSubmitted?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save link');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={`Add a ${categoryName} Reel or TikTok`}
      meta="Room inspo"
      footer={
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button size="sm" variant="outline" disabled={submitting} onClick={handleClose}>
            Cancel
          </Button>
          <Button size="sm" disabled={submitting} onClick={() => void handleSubmit()}>
            {submitting ? 'Saving…' : 'Save clip'}
          </Button>
        </div>
      }
    >
      <div style={{ display: 'grid', gap: 14 }}>
        {error ? <Banner tone="error">{error}</Banner> : null}
        <Field label="Instagram Reel or TikTok URL">
          <Input
            type="url"
            value={rawUrl}
            onChange={(e) => setRawUrl(e.target.value)}
            placeholder="https://www.tiktok.com/@creator/video/… or https://www.instagram.com/reel/…"
            disabled={submitting}
            autoFocus
          />
        </Field>
        <Field label="Short title / what you liked">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={`e.g. Plush ${categoryName.toLowerCase()} for Twin XL`}
            disabled={submitting}
          />
        </Field>
        <Field label="Creator handle (optional)">
          <Input
            value={creatorHandle}
            onChange={(e) => setCreatorHandle(e.target.value)}
            placeholder="@creator"
            disabled={submitting}
          />
        </Field>
        <Field label="Thumbnail image URL (optional)">
          <Input
            type="url"
            value={thumbnailUrl}
            onChange={(e) => setThumbnailUrl(e.target.value)}
            placeholder="https://…"
            disabled={submitting}
          />
        </Field>
        <MonoMeta size="xs" tone="subtle">
          Links open on Instagram or TikTok. Your clip appears right away for you and goes public once
          approved.
        </MonoMeta>
      </div>
    </Modal>
  );
}