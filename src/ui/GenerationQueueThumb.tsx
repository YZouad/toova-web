import { useEffect, useState } from 'react';
import { signModelObjectPath } from '../lib/modelStorage';
import type { GenerationQueueItem } from '../lib/generationQueue';

type Props = {
  item: GenerationQueueItem;
  className?: string;
};

export function GenerationQueueThumb({ item, className }: Props) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;

    void (async () => {
      if (item.sourceFile) {
        objectUrl = URL.createObjectURL(item.sourceFile);
        if (!cancelled) setSrc(objectUrl);
        return;
      }
      if (item.sourcePath) {
        const signed = await signModelObjectPath(item.sourcePath);
        if (!cancelled && signed) setSrc(signed);
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [item.jobId, item.sourceFile, item.sourcePath]);

  if (!src) {
    return <span className={className ?? 'generation-queue-thumb generation-queue-thumb--empty'} aria-hidden />;
  }

  return <img className={className ?? 'generation-queue-thumb'} src={src} alt="" />;
}