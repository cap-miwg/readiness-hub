import { PageHeader } from './ui'

/**
 * Route stub for the user-menu Settings entry (shell spec, V2-DESIGN-PLAN.md
 * section 4). Personal settings land with a later PR in the v2 series; the
 * shell links here today so the menu item is honest, not dead.
 */
export default function SettingsStub() {
  return (
    <div>
      <PageHeader title="Settings" subtitle="Personal settings for your Readiness Hub account" />
      <p className="max-w-[62ch] text-[15px] text-ink2">
        There are no personal settings yet. Deployment-wide settings live on the Admin page for
        administrators. This page will grow display and notification preferences in a later
        release.
      </p>
    </div>
  )
}
