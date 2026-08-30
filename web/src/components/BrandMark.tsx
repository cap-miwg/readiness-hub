import { useState } from 'react'
import clsx from 'clsx'

/*
 * Deployment logo slot (V2-DESIGN-PLAN.md D12). Deployments volume-mount the
 * official mark from the Brand Portal at /brand/logo (BRAND_LOGO_FILE); the
 * repo never ships the trademarked CAP seal. When the mount is absent or the
 * request fails, the bundled neutral roundel placeholder renders instead.
 */
export default function BrandMark({ className }: { className?: string }) {
  const [failed, setFailed] = useState(false)

  if (failed) {
    return (
      <svg
        width="28"
        height="28"
        viewBox="0 0 28 28"
        aria-hidden
        className={clsx('shrink-0', className)}
      >
        <circle cx="14" cy="14" r="12.25" fill="none" stroke="var(--cap-symbol-blue)" strokeWidth="1.5" />
        <path d="M14 7.2 L20.2 19.6 H7.8 Z" fill="var(--cap-symbol-blue)" />
      </svg>
    )
  }

  return (
    <img
      src="/brand/logo"
      alt=""
      className={clsx('h-7 w-7 shrink-0 object-contain', className)}
      onError={() => setFailed(true)}
    />
  )
}
