import { useState } from 'react'
import { LogOut, ShieldAlert } from 'lucide-react'
import { Banner, Card, Modal, Spinner } from '../../components/ui'
import { useRevokeAllSessions } from './adminApi'

export default function SecurityPanel() {
  const [confirming, setConfirming] = useState(false)
  const revoke = useRevokeAllSessions()

  const onConfirm = () => {
    revoke.mutate(undefined, {
      onSuccess: () => {
        // The server deletes every session including this one and clears the
        // cookie, so the only sensible next stop is the login page.
        window.location.href = '/login'
      },
    })
  }

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-red-600" aria-hidden /> Sessions
        </span>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-slate-600">
          Revoke every active session, including your own. Everyone signs in again. Use this after
          a suspected session leak or when removing someone's access immediately.
        </p>
        <button
          type="button"
          data-testid="sessions-revoke-all"
          onClick={() => setConfirming(true)}
          disabled={revoke.isPending}
          className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-50"
        >
          <LogOut className="h-4 w-4" aria-hidden /> Revoke all sessions
        </button>
        {revoke.error && (
          <Banner kind="error">
            Revoke failed ({revoke.error.status || 'network'}): {revoke.error.message}
          </Banner>
        )}
      </div>

      <Modal
        open={confirming}
        onClose={() => (revoke.isPending ? undefined : setConfirming(false))}
        title="Revoke all sessions?"
        footer={
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={revoke.isPending}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              data-testid="sessions-revoke-all-confirm"
              onClick={onConfirm}
              disabled={revoke.isPending}
              className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            >
              {revoke.isPending && <Spinner />}
              {revoke.isPending ? 'Revoking...' : 'Yes, revoke everything'}
            </button>
          </div>
        }
      >
        <p className="text-sm text-slate-700">
          Every signed-in user, including you, will be logged out immediately and redirected to the
          login page. This cannot be undone.
        </p>
      </Modal>
    </Card>
  )
}
