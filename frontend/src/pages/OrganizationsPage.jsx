import { useState, useEffect } from 'react'
import { orgsApi } from '../services/api'
import { Plus, Users, Crown, Eye, UserMinus, RefreshCw, X } from 'lucide-react'
import ConfirmModal from '../components/ui/ConfirmModal'
import { SpinnerPage, EmptyState } from '../components/ui/Feedback'
import toast from 'react-hot-toast'

const ROLE_ICONS = { admin: Crown, member: Users, viewer: Eye }
const ROLE_COLORS = { admin: 'badge-blue', member: 'badge-green', viewer: 'badge-gray' }

function OrgCard({ org, onSelect, selected }) {
  return (
    <button onClick={() => onSelect(org)}
      className={`card p-4 text-left w-full transition-all hover:border-brand-300 ${
        selected?.id === org.id ? 'border-brand-500 ring-2 ring-brand-200' : ''
      }`}>
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-brand-600 flex items-center justify-center text-white font-bold text-lg">
          {org.name[0].toUpperCase()}
        </div>
        <div>
          <p className="font-semibold text-gray-900">{org.name}</p>
          <p className="text-xs text-gray-400">/{org.slug}</p>
        </div>
        <span className={`ml-auto ${ROLE_COLORS[org.role] || 'badge-gray'}`}>{org.role}</span>
      </div>
    </button>
  )
}

function InviteModal({ orgId, onClose, onDone }) {
  const [form, setForm] = useState({ email: '', role: 'member' })
  const [loading, setLoading] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      await orgsApi.invite(orgId, form)
      toast.success('Member invited')
      onDone()
      onClose()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to invite')
    } finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-900">Invite Member</h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="label">Email address</label>
            <input className="input" type="email" required value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="user@example.com" />
          </div>
          <div>
            <label className="label">Role</label>
            <select className="input" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
              <option value="admin">Admin — full access</option>
              <option value="member">Member — create & manage</option>
              <option value="viewer">Viewer — read only</option>
            </select>
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">Cancel</button>
            <button type="submit" disabled={loading} className="btn-primary flex-1 justify-center">
              {loading ? 'Inviting…' : 'Invite'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function OrganizationsPage() {
  const [orgs, setOrgs] = useState([])
  const [selected, setSelected] = useState(null)
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [membersLoading, setMembersLoading] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [showInvite, setShowInvite] = useState(false)
  const [newOrgName, setNewOrgName] = useState('')
  const [confirmRemove, setConfirmRemove] = useState(null)

  const loadOrgs = async () => {
    try {
      const { data } = await orgsApi.list()
      setOrgs(data)
      if (!selected && data.length > 0) setSelected(data[0])
    } catch { toast.error('Failed to load organizations') }
    finally { setLoading(false) }
  }

  const loadMembers = async (org) => {
    if (!org) return
    setMembersLoading(true)
    try {
      const { data } = await orgsApi.members(org.id)
      setMembers(data)
    } catch { toast.error('Failed to load members') }
    finally { setMembersLoading(false) }
  }

  useEffect(() => { loadOrgs() }, [])
  useEffect(() => { if (selected) loadMembers(selected) }, [selected])

  const createOrg = async (e) => {
    e.preventDefault()
    try {
      await orgsApi.create({ name: newOrgName })
      toast.success('Organization created')
      setNewOrgName('')
      setShowCreate(false)
      loadOrgs()
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed') }
  }

  const handleRoleChange = async (userId, newRole) => {
    try {
      await orgsApi.updateRole(selected.id, userId, { role: newRole })
      toast.success('Role updated')
      loadMembers(selected)
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed') }
  }

  const handleRemove = async () => {
    try {
      await orgsApi.remove(selected.id, confirmRemove.user_id)
      toast.success('Member removed')
      setConfirmRemove(null)
      loadMembers(selected)
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed') }
  }

  if (loading) return <SpinnerPage />

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Organizations</h1>
          <p className="text-gray-500 text-sm">Manage teams and access</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary"><Plus size={16} /> New Org</button>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        {/* Org list */}
        <div className="space-y-3">
          {orgs.length === 0 ? (
            <div className="card">
              <EmptyState icon={Users} title="No organizations" description="Create one to collaborate with teammates"
                action={<button onClick={() => setShowCreate(true)} className="btn-primary inline-flex"><Plus size={15} />Create org</button>} />
            </div>
          ) : orgs.map(org => (
            <OrgCard key={org.id} org={org} selected={selected} onSelect={setSelected} />
          ))}
        </div>

        {/* Members panel */}
        {selected && (
          <div className="md:col-span-2 card">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <h2 className="font-semibold text-gray-900">{selected.name}</h2>
                <p className="text-xs text-gray-400">{members.length} member{members.length !== 1 ? 's' : ''}</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => loadMembers(selected)} className="btn-ghost p-2"><RefreshCw size={15} /></button>
                {selected.role === 'admin' && (
                  <button onClick={() => setShowInvite(true)} className="btn-primary text-sm">
                    <Plus size={15} /> Invite
                  </button>
                )}
              </div>
            </div>
            <div className="divide-y divide-gray-50">
              {membersLoading ? (
                <div className="flex justify-center py-10"><div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" /></div>
              ) : members.map(m => {
                const RoleIcon = ROLE_ICONS[m.role] || Users
                return (
                  <div key={m.user_id} className="flex items-center gap-4 px-5 py-3">
                    <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center font-bold text-gray-600 text-sm">
                      {(m.username || m.email || '?')[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">{m.full_name || m.username}</p>
                      <p className="text-xs text-gray-400">{m.email}</p>
                    </div>
                    {selected.role === 'admin' ? (
                      <select
                        value={m.role}
                        onChange={e => handleRoleChange(m.user_id, e.target.value)}
                        className="text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-brand-500"
                      >
                        <option value="admin">Admin</option>
                        <option value="member">Member</option>
                        <option value="viewer">Viewer</option>
                      </select>
                    ) : (
                      <span className={ROLE_COLORS[m.role] || 'badge-gray'}>{m.role}</span>
                    )}
                    {selected.role === 'admin' && (
                      <button onClick={() => setConfirmRemove(m)}
                        className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                        <UserMinus size={15} />
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Create org modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowCreate(false)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Create Organization</h3>
            <form onSubmit={createOrg} className="space-y-4">
              <div>
                <label className="label">Organization Name</label>
                <input className="input" required value={newOrgName}
                  onChange={e => setNewOrgName(e.target.value)} placeholder="My Team" />
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowCreate(false)} className="btn-secondary flex-1 justify-center">Cancel</button>
                <button type="submit" className="btn-primary flex-1 justify-center">Create</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showInvite && (
        <InviteModal orgId={selected.id} onClose={() => setShowInvite(false)}
          onDone={() => loadMembers(selected)} />
      )}

      <ConfirmModal open={!!confirmRemove}
        title="Remove member?"
        message={`Remove ${confirmRemove?.username || confirmRemove?.email} from ${selected?.name}?`}
        onConfirm={handleRemove}
        onCancel={() => setConfirmRemove(null)} />
    </div>
  )
}
