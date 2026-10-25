import { RevisePanel, type RevisePanelProps } from '../RevisePanel';

export function MobileReviseSheet(props: Omit<RevisePanelProps, 'compact'>) {
  return <RevisePanel compact {...props} />;
}
