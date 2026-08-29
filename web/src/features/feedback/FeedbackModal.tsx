import { useState } from 'react'
import { CheckCircle2 } from 'lucide-react'
import type { FeedbackCategory, FeedbackResponse } from '@shared/contracts'
import { ApiError, submitFeedback } from '../../api/client'
import { Banner, Modal, Spinner } from '../../components/ui'

/** Server caps (server/src/api/feedback.ts feedbackSchema; contracts.ts). */
export const FEEDBACK_TITLE_MAX = 200
export const FEEDBACK_BODY_MAX = 5000

const CATEGORIES: readonly { value: FeedbackCategory; label: string }[] = [
  { value: 'bug', label: 'Bug report' },
  { value: 'feature', label: 'Feature request' },
  { value: 'question', label: 'Question' },
  { value: 'other', label: 'Other' },
]

/** The GitHub mirror is fire-and-forget server-side; show the number only if a response carries one. */
function githubIssueOf(res: FeedbackResponse): number | null {
  const issue = (res as { githubIssue?: unknown }).githubIssue
  return typeof issue === 'number' ? issue : null
}

function submitErrorMessage(err: unknown): string {
  if (err instanceof ApiError && err.status === 429) {
    return 'Feedback is rate limited (5 messages per hour per person). Please wait a while and try again.'
  }
  if (err instanceof Error && err.message) return err.message
  return 'Could not send feedback. Please try again.'
}

function counterClass(length: number, max: number): string {
  return length >= max ? 'text-red-600' : 'text-slate-400'
}

export default function FeedbackModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [category, setCategory] = useState<FeedbackCategory>('bug')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<FeedbackResponse | null>(null)

  const close = () => {
    // Keep an unsent draft across accidental closes; clear everything once sent.
    if (result) {
      setCategory('bug')
      setTitle('')
      setBody('')
      setResult(null)
    }
    setError(null)
    onClose()
  }

  const onSubmit = async () => {
    setSubmitting(true)
    setError(null)
    try {
      const res = await submitFeedback({ category, title: title.trim(), body: body.trim() })
      setResult(res)
    } catch (err) {
      setError(submitErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  const canSubmit = !submitting && title.trim().length > 0 && body.trim().length > 0

  return (
    <Modal
      open={open}
      onClose={close}
      title="Send feedback"
      footer={
        result === null ? (
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={close}
              data-testid="feedback-cancel"
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void onSubmit()}
              disabled={!canSubmit}
              data-testid="feedback-submit"
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting && <Spinner className="text-white" />}
              {submitting ? 'Sending...' : 'Send feedback'}
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-end">
            <button
              type="button"
              onClick={close}
              data-testid="feedback-done"
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Done
            </button>
          </div>
        )
      }
    >
      {result !== null ? (
        <div data-testid="feedback-success" className="flex flex-col items-center gap-2 py-4 text-center">
          <CheckCircle2 className="h-10 w-10 text-green-600" aria-hidden />
          <div className="text-sm font-bold text-slate-800">Feedback sent. Thank you!</div>
          <div className="text-sm text-slate-500">
            Recorded as feedback #{result.id}
            {githubIssueOf(result) !== null && <> and filed as GitHub issue #{githubIssueOf(result)}</>}.
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {error && (
            <Banner kind="error" className="text-sm">
              <span data-testid="feedback-error">{error}</span>
            </Banner>
          )}
          <div>
            <label htmlFor="feedback-category" className="mb-1 block text-xs font-semibold text-slate-600">
              Category
            </label>
            <select
              id="feedback-category"
              data-testid="feedback-category"
              value={category}
              onChange={e => setCategory(e.target.value as FeedbackCategory)}
              className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
            >
              {CATEGORIES.map(c => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label htmlFor="feedback-title" className="text-xs font-semibold text-slate-600">
                Title
              </label>
              <span className={`text-xs ${counterClass(title.length, FEEDBACK_TITLE_MAX)}`}>
                {title.length}/{FEEDBACK_TITLE_MAX}
              </span>
            </div>
            <input
              id="feedback-title"
              data-testid="feedback-title"
              type="text"
              value={title}
              maxLength={FEEDBACK_TITLE_MAX}
              onChange={e => setTitle(e.target.value)}
              placeholder="One-line summary"
              className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label htmlFor="feedback-body" className="text-xs font-semibold text-slate-600">
                Details
              </label>
              <span className={`text-xs ${counterClass(body.length, FEEDBACK_BODY_MAX)}`}>
                {body.length}/{FEEDBACK_BODY_MAX}
              </span>
            </div>
            <textarea
              id="feedback-body"
              data-testid="feedback-body"
              value={body}
              maxLength={FEEDBACK_BODY_MAX}
              onChange={e => setBody(e.target.value)}
              rows={6}
              placeholder="What happened, what you expected, or what you would like to see"
              className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>
          <p className="text-xs text-slate-500">
            Your name and email are recorded with the feedback so we can follow up.
          </p>
        </div>
      )}
    </Modal>
  )
}
