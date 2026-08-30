import { useState } from 'react'
import { Megaphone, Pencil, Plus, Trash2 } from 'lucide-react'
import type { Announcement, AnnouncementInput } from '@shared/contracts'
import type { ApiError } from '../../api/client'
import { Badge, Banner, Card, EmptyState, Modal, Spinner } from '../../components/ui'
import {
  useAdminAnnouncements,
  useCreateAnnouncement,
  useDeleteAnnouncement,
  useUpdateAnnouncement,
} from './adminApi'

/*
 * Announcements authoring (V2-DESIGN-PLAN.md section 5): a fixed-schema admin
 * write surface. Body is plain text by contract (rendered with line breaks
 * only, never HTML/Markdown); the server enforces requireAdmin + CSRF and
 * audit-logs every mutation. Archive is the primary un-publish action; hard
 * delete sits behind a confirm because it destroys the record.
 */

const TITLE_MAX = 120
const BODY_MAX = 2000

const QUIET_BUTTON =
  'inline-flex items-center gap-1.5 rounded-md border border-hairline bg-paper px-3 py-1.5 text-sm font-medium text-ink transition-colors hover:border-muted disabled:opacity-50'
const PRIMARY_BUTTON =
  'inline-flex items-center gap-2 rounded-md bg-symbol px-4 py-2 text-sm font-semibold text-paper transition-colors disabled:opacity-50'
const DANGER_BUTTON =
  'inline-flex items-center gap-1.5 rounded-md border border-scarlet px-3 py-1.5 text-sm font-medium text-scarlet transition-colors hover:bg-scarlet-20 disabled:opacity-50'
const INPUT =
  'w-full rounded-md border border-hairline bg-paper px-3 py-1.5 text-sm text-ink focus:border-symbol focus:outline-none'

function errorText(err: ApiError): string {
  return `${err.status ? `HTTP ${err.status}: ` : ''}${err.message}`
}

/** "5 Sep 2026" from an ISO yyyy-mm-dd day; parsed at UTC noon to dodge TZ drift. */
function shortDay(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function windowLabel(a: Announcement): string {
  if (a.startsAt !== null && a.endsAt !== null) return `${shortDay(a.startsAt)} to ${shortDay(a.endsAt)}`
  if (a.startsAt !== null) return `from ${shortDay(a.startsAt)}`
  if (a.endsAt !== null) return `until ${shortDay(a.endsAt)}`
  return 'no display window'
}

type LifecycleState = 'archived' | 'scheduled' | 'ended' | 'live'

export function lifecycleOf(a: Announcement, todayIso: string): LifecycleState {
  if (a.archived) return 'archived'
  if (a.startsAt !== null && a.startsAt > todayIso) return 'scheduled'
  if (a.endsAt !== null && a.endsAt < todayIso) return 'ended'
  return 'live'
}

function StateBadge({ state }: { state: LifecycleState }) {
  if (state === 'live') return <Badge tone="blue">Live</Badge>
  return <Badge tone="slate">{state.charAt(0).toUpperCase() + state.slice(1)}</Badge>
}

interface FormState {
  title: string
  body: string
  startsAt: string
  endsAt: string
}

const EMPTY_FORM: FormState = { title: '', body: '', startsAt: '', endsAt: '' }

function formOf(a: Announcement): FormState {
  return { title: a.title, body: a.body, startsAt: a.startsAt ?? '', endsAt: a.endsAt ?? '' }
}

function inputOf(form: FormState): AnnouncementInput {
  return {
    title: form.title.trim(),
    body: form.body.trim(),
    startsAt: form.startsAt !== '' ? form.startsAt : null,
    endsAt: form.endsAt !== '' ? form.endsAt : null,
  }
}

function validate(form: FormState): string | null {
  if (form.title.trim() === '') return 'Title is required.'
  if (form.body.trim() === '') return 'Body is required.'
  if (form.title.trim().length > TITLE_MAX) return `Title is limited to ${TITLE_MAX} characters.`
  if (form.body.trim().length > BODY_MAX) return `Body is limited to ${BODY_MAX} characters.`
  if (form.startsAt !== '' && form.endsAt !== '' && form.endsAt < form.startsAt) {
    return 'End date must not be before the start date.'
  }
  return null
}

function Counter({ length, max }: { length: number; max: number }) {
  return (
    <span className={`tnum text-xs ${length > max ? 'text-scarlet' : 'text-ink2'}`}>
      {length}/{max}
    </span>
  )
}

function AnnouncementForm({
  heading,
  initial,
  pending,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  heading: string
  initial: FormState
  pending: boolean
  submitLabel: string
  onSubmit: (form: FormState) => void
  onCancel?: () => void
}) {
  const [form, setForm] = useState<FormState>(initial)
  const [problem, setProblem] = useState<string | null>(null)

  const set = (patch: Partial<FormState>) => {
    setForm(prev => ({ ...prev, ...patch }))
    setProblem(null)
  }

  const submit = () => {
    const bad = validate(form)
    if (bad !== null) {
      setProblem(bad)
      return
    }
    onSubmit(form)
  }

  return (
    <div className="space-y-3">
      <p className="kicker text-ink">{heading}</p>
      <label className="block text-sm text-ink">
        <span className="mb-1 flex items-center justify-between">
          <span className="font-medium">Title</span>
          <Counter length={form.title.length} max={TITLE_MAX} />
        </span>
        <input
          type="text"
          value={form.title}
          maxLength={TITLE_MAX}
          data-testid="announcement-title-input"
          onChange={e => set({ title: e.target.value })}
          className={INPUT}
        />
      </label>
      <label className="block text-sm text-ink">
        <span className="mb-1 flex items-center justify-between">
          <span className="font-medium">Body (plain text; line breaks are kept)</span>
          <Counter length={form.body.length} max={BODY_MAX} />
        </span>
        <textarea
          value={form.body}
          maxLength={BODY_MAX}
          rows={5}
          data-testid="announcement-body-input"
          onChange={e => set({ body: e.target.value })}
          className={INPUT}
        />
      </label>
      <div className="flex flex-wrap gap-4">
        <label className="block text-sm text-ink">
          <span className="mb-1 block font-medium">Show from (optional)</span>
          <input
            type="date"
            value={form.startsAt}
            data-testid="announcement-starts-input"
            onChange={e => set({ startsAt: e.target.value })}
            className={INPUT}
          />
        </label>
        <label className="block text-sm text-ink">
          <span className="mb-1 block font-medium">Show until (optional)</span>
          <input
            type="date"
            value={form.endsAt}
            data-testid="announcement-ends-input"
            onChange={e => set({ endsAt: e.target.value })}
            className={INPUT}
          />
        </label>
      </div>
      {problem !== null && <p className="text-sm text-scarlet">{problem}</p>}
      <div className="flex items-center gap-2">
        <button
          type="button"
          data-testid="announcement-submit"
          onClick={submit}
          disabled={pending}
          className={PRIMARY_BUTTON}
        >
          {pending ? <Spinner /> : <Plus className="h-4 w-4" aria-hidden />}
          {pending ? 'Saving...' : submitLabel}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} disabled={pending} className={QUIET_BUTTON}>
            Cancel
          </button>
        )}
      </div>
    </div>
  )
}

function AnnouncementRow({
  a,
  todayIso,
  busy,
  onEdit,
  onToggleArchived,
  onDelete,
}: {
  a: Announcement
  todayIso: string
  busy: boolean
  onEdit: () => void
  onToggleArchived: () => void
  onDelete: () => void
}) {
  const state = lifecycleOf(a, todayIso)
  return (
    <li data-testid={`announcement-row-${a.id}`} className="border-b border-hairline py-3.5">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="min-w-0 flex-1 text-[15px] font-medium text-ink">{a.title}</span>
        <StateBadge state={state} />
      </div>
      <p className="mt-1 line-clamp-2 whitespace-pre-line text-sm text-ink2">{a.body}</p>
      <div className="tnum mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink2">
        <span>{a.authorEmail}</span>
        <span aria-hidden className="text-muted">
          |
        </span>
        <span>created {shortDay(a.createdAt.slice(0, 10))}</span>
        <span aria-hidden className="text-muted">
          |
        </span>
        <span>{windowLabel(a)}</span>
        <span className="ml-auto flex items-center gap-2">
          <button
            type="button"
            data-testid={`announcement-edit-${a.id}`}
            onClick={onEdit}
            disabled={busy}
            className="inline-flex items-center gap-1 font-medium text-symbol hover:underline disabled:opacity-50"
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden /> Edit
          </button>
          <button
            type="button"
            data-testid={`announcement-archive-${a.id}`}
            onClick={onToggleArchived}
            disabled={busy}
            className="inline-flex items-center gap-1 font-medium text-symbol hover:underline disabled:opacity-50"
          >
            {a.archived ? 'Restore' : 'Archive'}
          </button>
          <button
            type="button"
            data-testid={`announcement-delete-${a.id}`}
            onClick={onDelete}
            disabled={busy}
            aria-label={`Delete ${a.title}`}
            className="inline-flex items-center gap-1 font-medium text-scarlet hover:underline disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden /> Delete
          </button>
        </span>
      </div>
    </li>
  )
}

export default function AnnouncementsPanel() {
  const listQ = useAdminAnnouncements()
  const create = useCreateAnnouncement()
  const update = useUpdateAnnouncement()
  const remove = useDeleteAnnouncement()

  const [editing, setEditing] = useState<Announcement | null>(null)
  const [deleting, setDeleting] = useState<Announcement | null>(null)

  const todayIso = new Date().toISOString().slice(0, 10)
  const busy = create.isPending || update.isPending || remove.isPending
  const mutationError = create.error ?? update.error ?? remove.error

  const announcements = listQ.data?.announcements ?? []

  const onCreate = (form: FormState) => {
    create.mutate(inputOf(form), { onSuccess: () => setEditing(null) })
  }

  const onSaveEdit = (a: Announcement) => (form: FormState) => {
    // archived is intentionally omitted: editing content never un-archives.
    update.mutate({ id: a.id, input: inputOf(form) }, { onSuccess: () => setEditing(null) })
  }

  const onToggleArchived = (a: Announcement) => {
    // Archive is the primary un-publish action: PUT the record back with
    // archived flipped (the endpoint is a full replace plus the flag).
    update.mutate({
      id: a.id,
      input: {
        title: a.title,
        body: a.body,
        startsAt: a.startsAt,
        endsAt: a.endsAt,
        archived: !a.archived,
      },
    })
  }

  const onConfirmDelete = () => {
    if (deleting === null) return
    remove.mutate(deleting, { onSuccess: () => setDeleting(null) })
  }

  return (
    <div className="space-y-4">
      <Card title="New announcement">
        {editing === null ? (
          <AnnouncementForm
            key="create"
            heading="Shown to every signed-in member on Home while the window is open"
            initial={EMPTY_FORM}
            pending={create.isPending}
            submitLabel="Publish announcement"
            onSubmit={onCreate}
          />
        ) : (
          <AnnouncementForm
            key={`edit-${editing.id}`}
            heading={`Editing announcement ${editing.id}`}
            initial={formOf(editing)}
            pending={update.isPending}
            submitLabel="Save changes"
            onSubmit={onSaveEdit(editing)}
            onCancel={() => setEditing(null)}
          />
        )}
      </Card>

      {mutationError && <Banner kind="error">Announcement change failed. {errorText(mutationError)}</Banner>}

      {listQ.isPending && (
        <div className="flex justify-center py-10">
          <Spinner label="Loading announcements..." />
        </div>
      )}
      {listQ.error && (
        <Banner kind="error">
          Could not load announcements ({listQ.error.status || 'network'}): {listQ.error.message}
        </Banner>
      )}

      {listQ.data &&
        (announcements.length === 0 ? (
          <EmptyState
            icon={Megaphone}
            title="No announcements yet"
            message="Announcements publish to the Home page for every signed-in member."
            diagnostic="GET /api/admin/announcements returned 0 announcements"
          />
        ) : (
          <div>
            <p className="kicker text-ink">All announcements</p>
            <ol className="mt-2 list-none border-t border-hairline">
              {announcements.map(a => (
                <AnnouncementRow
                  key={a.id}
                  a={a}
                  todayIso={todayIso}
                  busy={busy}
                  onEdit={() => setEditing(a)}
                  onToggleArchived={() => onToggleArchived(a)}
                  onDelete={() => setDeleting(a)}
                />
              ))}
            </ol>
          </div>
        ))}

      <Modal
        open={deleting !== null}
        onClose={() => (remove.isPending ? undefined : setDeleting(null))}
        title="Delete announcement?"
        footer={
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setDeleting(null)}
              disabled={remove.isPending}
              className={QUIET_BUTTON}
            >
              Cancel
            </button>
            <button
              type="button"
              data-testid="announcement-delete-confirm"
              onClick={onConfirmDelete}
              disabled={remove.isPending}
              className={DANGER_BUTTON}
            >
              {remove.isPending ? <Spinner /> : <Trash2 className="h-4 w-4" aria-hidden />}
              {remove.isPending ? 'Deleting...' : 'Delete permanently'}
            </button>
          </div>
        }
      >
        <p className="text-sm text-ink">
          {deleting !== null ? `"${deleting.title}" ` : 'This announcement '}
          will be removed permanently. Archiving is usually the right way to take an announcement
          down; deletion is for mistakes.
        </p>
      </Modal>
    </div>
  )
}
