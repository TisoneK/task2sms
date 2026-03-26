import { useState, useEffect } from 'react'
import { datasourcesApi } from '../services/api'
import { Plus, Trash2, Play, Database, RefreshCw, X, ChevronDown, ChevronUp } from 'lucide-react'
import ConfirmModal from '../components/ui/ConfirmModal'
import { EmptyState } from '../components/ui/Feedback'
import { formatDistanceToNow } from 'date-fns'
import toast from 'react-hot-toast'

const TYPE_LABELS = { http: 'HTTP API', postgres: 'PostgreSQL', mysql: 'MySQL', sqlite: 'SQLite', csv_url: 'CSV URL' }
const TYPE_COLORS = { http: 'badge-blue', postgres: 'badge-green', csv_url: 'badge-yellow', mysql: 'badge-blue', sqlite: 'badge-gray' }

function DSModal({ onClose, onSave, initial }) {
  const [form, setForm] = useState(initial || {
    name: '', type: 'http', url: '', http_method: 'GET',
    http_headers: null, json_path: '', auth_type: 'none', auth_value: '',
  })
  const [loading, setLoading] = useState(false)
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      await onSave({ ...form, auth_type: form.auth_type === 'none' ? null : form.auth_type,
                     auth_value: form.auth_value || null, json_path: form.json_path || null })
      onClose()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save')
    } finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-900">{initial ? 'Edit Data Source' : 'New Data Source'}</h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="label">Name</label>
            <input className="input" required value={form.name} onChange={set('name')} placeholder="My API" />
          </div>
          <div>
            <label className="label">Type</label>
            <select className="input" value={form.type} onChange={set('type')}>
              {Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="label">URL</label>
            <input className="input font-mono text-sm" required value={form.url} onChange={set('url')}
              placeholder="https://api.example.com/data" />
          </div>
          {(form.type === 'http') && (
            <div>
              <label className="label">HTTP Method</label>
              <select className="input" value={form.http_method} onChange={set('http_method')}>
                {['GET', 'POST', 'PUT'].map(m => <option key={m}>{m}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="label">JSON Path (optional)</label>
            <input className="input font-mono text-sm" value={form.json_path} onChange={set('json_path')}
              placeholder="data.results" />
            <p className="text-xs text-gray-400 mt-1">Navigate nested JSON — e.g. "data.items"</p>
          </div>
          <div>
            <label className="label">Authentication</label>
            <select className="input" value={form.auth_type} onChange={set('auth_type')}>
              <option value="none">None</option>
              <option value="bearer">Bearer Token</option>
              <option value="apikey">API Key (X-API-Key header)</option>
              <option value="basic">Basic Auth (user:pass)</option>
            </select>
          </div>
          {form.auth_type !== 'none' && (
            <div>
              <label className="label">Auth Value</label>
              <input className="input font-mono text-sm" value={form.auth_value} onChange={set('auth_value')}
                placeholder={form.auth_type === 'basic' ? 'username:password' : 'your-token'} />
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">Cancel</button>
            <button type="submit" disabled={loading} className="btn-primary flex-1 justify-center">
              {loading ? 'Saving…' : initial ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function DataSourcesPage() {
  const [sources, setSources] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [expanded, setExpanded] = useState(null)
  const [fetching, setFetching] = useState(null)

  const load = async () => {
    try {
      const { data } = await datasourcesApi.list()
      setSources(data)
    } catch { toast.error('Failed to load data sources') }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const handleSave = async (form) => {
    if (editing) {
      const { data } = await datasourcesApi.update(editing.id, form)
      setSources(s => s.map(x => x.id === editing.id ? data : x))
      toast.success('Data source updated')
    } else {
      const { data } = await datasourcesApi.create(form)
      setSources(s => [data, ...s])
      toast.success('Data source created')
    }
    setEditing(null)
  }

  const handleFetch = async (ds) => {
    setFetching(ds.id)
    try {
      const { data } = await datasourcesApi.fetch(ds.id)
      setSources(s => s.map(x => x.id === ds.id ? { ...x, last_result: data.result, last_fetched_at: new Date().toISOString() } : x))
      toast.success('Fetched successfully')
      setExpanded(ds.id)
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Fetch failed')
    } finally { setFetching(null) }
  }

  const handleDelete = async () => {
    await datasourcesApi.delete(confirmDelete.id)
    setSources(s => s.filter(x => x.id !== confirmDelete.id))
    toast.success('Data source deleted')
    setConfirmDelete(null)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Data Sources</h1>
          <p className="text-gray-500 text-sm">Connect external APIs and databases</p>
        </div>
        <button onClick={() => { setEditing(null); setShowModal(true) }} className="btn-primary">
          <Plus size={16} /> New Source
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : sources.length === 0 ? (
        <div className="card">
          <EmptyState icon={Database} title="No data sources"
            description="Connect an API or database to trigger conditional SMS based on live data"
            action={<button onClick={() => setShowModal(true)} className="btn-primary inline-flex"><Plus size={15} /> Add source</button>} />
        </div>
      ) : (
        <div className="card divide-y divide-gray-100">
          {sources.map(ds => (
            <div key={ds.id}>
              <div className="flex items-start gap-4 px-5 py-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-gray-900">{ds.name}</p>
                    <span className={TYPE_COLORS[ds.type] || 'badge-gray'}>{TYPE_LABELS[ds.type] || ds.type}</span>
                    {!ds.is_active && <span className="badge-gray">disabled</span>}
                  </div>
                  <p className="text-xs font-mono text-gray-400 mt-0.5 truncate">{ds.url}</p>
                  {ds.json_path && <p className="text-xs text-gray-400">Path: <code className="font-mono">{ds.json_path}</code></p>}
                  {ds.last_fetched_at && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      Last fetched {formatDistanceToNow(new Date(ds.last_fetched_at), { addSuffix: true })}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => handleFetch(ds)} disabled={fetching === ds.id}
                    className="btn-ghost p-2 text-gray-400 hover:text-brand-600 hover:bg-brand-50" title="Fetch now">
                    {fetching === ds.id
                      ? <div className="w-4 h-4 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
                      : <Play size={15} />}
                  </button>
                  {ds.last_result && (
                    <button onClick={() => setExpanded(expanded === ds.id ? null : ds.id)}
                      className="btn-ghost p-2 text-gray-400">
                      {expanded === ds.id ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                    </button>
                  )}
                  <button onClick={() => { setEditing(ds); setShowModal(true) }}
                    className="btn-ghost p-2 text-gray-400 hover:text-brand-600">
                    <span className="text-xs">Edit</span>
                  </button>
                  <button onClick={() => setConfirmDelete(ds)}
                    className="btn-ghost p-2 text-gray-300 hover:text-red-500 hover:bg-red-50">
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
              {expanded === ds.id && ds.last_result && (
                <div className="px-5 pb-4 border-t border-gray-50">
                  <p className="text-xs text-gray-400 mb-2 font-medium">Last Result</p>
                  <pre className="bg-gray-50 rounded-lg p-3 text-xs overflow-auto max-h-48 text-gray-700">
                    {JSON.stringify(ds.last_result, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <DSModal initial={editing}
          onClose={() => { setShowModal(false); setEditing(null) }}
          onSave={handleSave} />
      )}

      <ConfirmModal open={!!confirmDelete} title="Delete data source?"
        message={`"${confirmDelete?.name}" will be permanently deleted.`}
        onConfirm={handleDelete} onCancel={() => setConfirmDelete(null)} />
    </div>
  )
}
