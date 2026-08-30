import { useEffect, useState } from 'react'
import { Plus, Save, X } from 'lucide-react'
import { Banner, Card, Spinner } from '../../components/ui'
import { useSaveSettings, useSettings } from './adminApi'

// Validation mirrors the server's zod schema (api/admin.ts settingsSchema):
// units are 1-6 alphanumerics (max 100), member types 1-30 letters/spaces
// starting with a letter (1-20 entries).
const UNIT_RE = /^[0-9A-Za-z]{1,6}$/
const MEMBER_TYPE_RE = /^[A-Za-z][A-Za-z ]{0,29}$/
const MAX_UNITS = 100
const MAX_TYPES = 20

function ChipListEditor({
  label,
  description,
  values,
  onChange,
  validate,
  normalize,
  maxItems,
  minItems,
  placeholder,
  testId,
}: {
  label: string
  description: string
  values: string[]
  onChange: (next: string[]) => void
  validate: (value: string) => string | null
  normalize: (value: string) => string
  maxItems: number
  minItems: number
  placeholder: string
  testId: string
}) {
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)

  const add = () => {
    const value = normalize(draft.trim())
    if (value === '') return
    const problem = validate(value)
    if (problem !== null) {
      setError(problem)
      return
    }
    if (values.includes(value)) {
      setError(`${value} is already in the list`)
      return
    }
    if (values.length >= maxItems) {
      setError(`At most ${maxItems} entries`)
      return
    }
    onChange([...values, value])
    setDraft('')
    setError(null)
  }

  const remove = (value: string) => {
    if (values.length <= minItems) {
      setError(`At least ${minItems} ${minItems === 1 ? 'entry is' : 'entries are'} required`)
      return
    }
    onChange(values.filter(v => v !== value))
    setError(null)
  }

  return (
    <div className="space-y-2">
      <div>
        <div className="font-display text-sm font-semibold text-ink">{label}</div>
        <p className="text-xs text-ink2">{description}</p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {values.length === 0 && <span className="text-xs text-muted">none</span>}
        {values.map(v => (
          <span
            key={v}
            className="tnum inline-flex items-center gap-1 rounded-full border border-hairline px-2.5 py-1 text-xs font-medium text-ink"
          >
            {v}
            <button
              type="button"
              onClick={() => remove(v)}
              aria-label={`Remove ${v}`}
              className="rounded-full p-0.5 text-muted hover:bg-gray20 hover:text-ink"
            >
              <X className="h-3 w-3" aria-hidden />
            </button>
          </span>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={draft}
          data-testid={testId}
          onChange={e => {
            setDraft(e.target.value)
            setError(null)
          }}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add()
            }
          }}
          placeholder={placeholder}
          className="w-48 rounded-md border border-hairline bg-paper px-3 py-1.5 text-sm text-ink focus:border-symbol focus:outline-none"
        />
        <button
          type="button"
          data-testid={`${testId}-add`}
          onClick={add}
          className="inline-flex items-center gap-1 rounded-md border border-hairline bg-paper px-3 py-1.5 text-sm font-medium text-ink transition-colors hover:border-muted"
        >
          <Plus className="h-4 w-4" aria-hidden /> Add
        </button>
      </div>
      {error && <p className="text-xs font-medium text-scarlet">{error}</p>}
    </div>
  )
}

export default function SettingsPanel() {
  const settingsQ = useSettings()
  const save = useSaveSettings()

  const [excludedUnits, setExcludedUnits] = useState<string[]>([])
  const [memberTypes, setMemberTypes] = useState<string[]>([])
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (settingsQ.data && !dirty) {
      setExcludedUnits(settingsQ.data.excludedUnits)
      setMemberTypes(settingsQ.data.memberTypes)
    }
  }, [settingsQ.data, dirty])

  if (settingsQ.isPending) {
    return (
      <div className="flex justify-center py-10">
        <Spinner label="Loading settings..." />
      </div>
    )
  }
  if (settingsQ.error) {
    return (
      <Banner kind="error">
        Could not load settings ({settingsQ.error.status || 'network'}): {settingsQ.error.message}
      </Banner>
    )
  }

  const onSave = () => {
    save.mutate(
      { excludedUnits, memberTypes },
      {
        onSuccess: data => {
          setExcludedUnits(data.excludedUnits)
          setMemberTypes(data.memberTypes)
          setDirty(false)
        },
      },
    )
  }

  return (
    <Card title="Application Settings">
      <div className="space-y-6">
        <Banner kind="info">
          The unit picker exclusion applies immediately. Member type and exclusion effects on
          computed data apply at the next ingest.
        </Banner>

        <ChipListEditor
          label="Excluded units"
          description="Charter unit numbers hidden from the unit picker (their members stay in every member-scoped view, v1 parity)."
          values={excludedUnits}
          onChange={next => {
            setExcludedUnits(next)
            setDirty(true)
          }}
          validate={v => (UNIT_RE.test(v) ? null : 'Unit must be 1-6 letters or digits (e.g. 205)')}
          normalize={v => v}
          maxItems={MAX_UNITS}
          minItems={0}
          placeholder="e.g. 205"
          testId="settings-excluded-input"
        />

        <ChipListEditor
          label="Included member types"
          description="CAPWATCH member types included in the dashboards (uppercased on save). At least one type is required."
          values={memberTypes}
          onChange={next => {
            setMemberTypes(next)
            setDirty(true)
          }}
          validate={v =>
            MEMBER_TYPE_RE.test(v)
              ? null
              : 'Member type must be 1-30 letters and spaces, starting with a letter'
          }
          normalize={v => v.toUpperCase()}
          maxItems={MAX_TYPES}
          minItems={1}
          placeholder="e.g. SENIOR"
          testId="settings-member-types-input"
        />

        <div className="flex items-center gap-3 border-t border-hairline pt-4">
          <button
            type="button"
            data-testid="settings-save"
            onClick={onSave}
            disabled={!dirty || save.isPending}
            className="inline-flex items-center gap-2 rounded-md bg-symbol px-4 py-2 text-sm font-semibold text-paper transition-colors disabled:opacity-50"
          >
            {save.isPending ? <Spinner /> : <Save className="h-4 w-4" aria-hidden />}
            {save.isPending ? 'Saving...' : 'Save settings'}
          </button>
          {!dirty && !save.isPending && settingsQ.data && (
            <span className="text-xs text-ink2">No unsaved changes</span>
          )}
          {save.isSuccess && !dirty && (
            <span className="text-xs font-medium text-ink2">Saved</span>
          )}
        </div>
        {save.error && (
          <Banner kind="error">
            Save failed ({save.error.status || 'network'}): {save.error.message}
          </Banner>
        )}
      </div>
    </Card>
  )
}
