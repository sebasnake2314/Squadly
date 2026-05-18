export function SquadlyLogo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      <rect width="64" height="64" rx="14" fill="#6c63ff" />
      <circle cx="22" cy="26" r="7" fill="white" opacity="0.9" />
      <circle cx="42" cy="26" r="7" fill="white" opacity="0.7" />
      <circle cx="32" cy="40" r="7" fill="white" opacity="0.5" />
      <path d="M18 50 Q32 40 46 50" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" opacity="0.8" />
    </svg>
  )
}
