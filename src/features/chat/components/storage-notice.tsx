import type { StorageNotice as Notice } from '../hooks/use-chat';

const TEXT: Record<Notice, string> = {
  unavailable:
    "Your browser is blocking storage, so this conversation won't be saved when you close Compass.",
  full: "Your browser's storage is full, so this conversation won't be saved when you close Compass.",
  reset: "Your previous conversation couldn't be restored, so Compass started a new one.",
};

interface StorageNoticeProps {
  notice: Notice | null;
}

export function StorageNotice({ notice }: StorageNoticeProps) {
  // The live region stays mounted so screen readers announce the text when it appears.
  return (
    <p role="status" className={notice ? 'storage-notice' : 'visually-hidden'}>
      {notice ? TEXT[notice] : ''}
    </p>
  );
}
