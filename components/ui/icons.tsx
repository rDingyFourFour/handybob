import type { SVGProps } from "react";

const baseIconProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function HomeOutlineIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...baseIconProps} {...props}>
      <path d="M3 12.5 12 4l9 8.5" />
      <path d="M16 21V13h-8v8" />
      <path d="M7 10.5h10" />
    </svg>
  );
}

export function JobsOutlineIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...baseIconProps} {...props}>
      <rect x="5" y="8" width="14" height="9" rx="1.5" />
      <path d="M9 8V6.5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2V8" />
      <path d="M7 12.5h10" />
    </svg>
  );
}

export function MessagesOutlineIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...baseIconProps} {...props}>
      <path d="M4 6.5h16v9a2.5 2.5 0 0 1-2.5 2.5H8.5L4 21V6.5Z" />
      <path d="M7 9h10" />
      <path d="M7 12.5h6" />
    </svg>
  );
}

export function MoreOutlineIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...baseIconProps} {...props}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="9.25" cy="12" r="1.1" />
      <circle cx="14.75" cy="12" r="1.1" />
      <circle cx="12" cy="12" r="1.1" />
    </svg>
  );
}
