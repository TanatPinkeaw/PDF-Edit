import type { ToolIcon as ToolIconName } from '../lib/tools';

type Props = {
  name: ToolIconName;
};

/** Decorative line icons; the card title carries the meaning. */
export function ToolIcon({ name }: Props) {
  return (
    <svg
      className="tool-icon-art"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {name === 'organize' && (
        <>
          <rect x="4" y="3" width="12" height="16" rx="1.5" />
          <path d="M8 7h4M8 11h4" />
          <path d="M19 8v9M19 17l-2-2M19 17l2-2" />
        </>
      )}
      {name === 'merge' && (
        <>
          <path d="M4 5h5l3 7v7" />
          <path d="M4 19h5l3-7V5" />
          <path d="M17 12h4M21 12l-2-2M21 12l-2 2" />
        </>
      )}
      {name === 'rotate' && (
        <>
          <path d="M20 12a8 8 0 1 1-2.6-5.9" />
          <path d="M20 4v5h-5" />
        </>
      )}
      {name === 'numbers' && (
        <>
          <rect x="3" y="4" width="7" height="7" rx="1" />
          <rect x="14" y="4" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </>
      )}
      {name === 'watermark' && (
        <>
          <path d="M12 3s5 5.4 5 9a5 5 0 0 1-10 0c0-3.6 5-9 5-9z" />
          <path d="M9 15c1 1 2 1.5 3 1.5s2-.5 3-1.5" />
        </>
      )}
      {name === 'lock' && (
        <>
          <rect x="4" y="10" width="16" height="10" rx="2" />
          <path d="M8 10V7a4 4 0 0 1 8 0v3" />
          <path d="M12 14v2" />
        </>
      )}
      {name === 'split' && (
        <>
          <rect x="3" y="4" width="7" height="16" rx="1.5" />
          <path d="M14 3v18" strokeDasharray="2 2" />
          <path d="M20 7l-3 3 3 3" />
        </>
      )}
      {name === 'image' && (
        <>
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <circle cx="9" cy="10" r="1.6" />
          <path d="M4 18l5-4 4 3 3-2 4 3" />
        </>
      )}
      {name === 'jpg-to-pdf' && (
        <>
          <rect x="3" y="4" width="9" height="9" rx="1.5" />
          <path d="M13 11h8v9H6v-4" />
          <path d="M16 15v4M14 17h4" />
        </>
      )}
      {name === 'sign' && (
        <>
          <path d="M4 20c2.5 0 3-1.5 3-4V6a2 2 0 0 1 4 0v7" />
          <path d="M11 9c0-2 4-3 4 1v5c0 2.5 1 3 2 3" />
          <path d="M4 20h16" />
        </>
      )}
      {name === 'crop' && (
        <>
          <path d="M6 2v14a2 2 0 0 0 2 2h14" />
          <path d="M2 6h14a2 2 0 0 1 2 2v14" />
        </>
      )}
      {name === 'compress' && (
        <>
          <path d="M4 9V4h5" />
          <path d="M20 15v5h-5" />
          <path d="M4 4l5 5M20 20l-5-5" />
          <path d="M15 4h5v5M9 20H4v-5" />
        </>
      )}
      {name === 'office' && (
        <>
          <path d="M6 3h8l4 4v14H6z" />
          <path d="M14 3v4h4" />
          <path d="M9 11l1.5 6L12 13l1.5 4L15 11" />
        </>
      )}
      {name === 'soon' && (
        <>
          <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />
          <path d="M18 16l.9 2.1L21 19l-2.1.9L18 22l-.9-2.1L15 19l2.1-.9z" />
        </>
      )}
    </svg>
  );
}
