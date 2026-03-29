import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { orgsApi } from '../services/api'
import { Plus, Users, UserMinus, RefreshCw, X } from 'lucide-react'
import ConfirmModal from '../components/ui/ConfirmModal'
import { SpinnerPage, EmptyState } from '../components/ui/Feedback'
import toast from 'react-hot-toast'

const ROLE_COLORS = { admin:'badge-blue', member:'badge-green', viewer:'badge-gray' }
const PORTAL = () => document.getElementById('modal-root') || document.body

function useBodyLock(open) {
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
      return () => { document.body.style.overflow = '' }
    }
  }, [open])
}

function InviteModal({ orgId, onClose, onDone }) {
  const [form, setForm] = useState({ email:'', role:'member' })
  const [loading, setLoading] = useState(false)
  useBodyLock(true)

  const submit = async e => {
    e.preventDefault(); setLoading(true)
    try { await orgsApi.invite(orgId, form); toast.success('Member invited'); onDone(); onClose() }
    catch (err) { toast.error(err.response?.data?.detail || 'Failed to invite') }
    finally { setLoading(false) }
  }

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
         style={{ background:'rgba(0,0,0,0.55)' }}
         onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="relative rounded-2xl w-full max-w-sm animate-fade-in"
           style={{ background:'var(--card)', border:'1px solid var(--border)', boxShadow:'var(--shadow-modal)' }}
           onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4"
             style={{ borderBottom:'1px solid var(--border)' }}>
          <h3 className="font-semibold text-[15px]" style={{ color:'var(--foreground)' }}>Invite Member</h3>
          <button onClick={onClose} className="btn-ghost p-1.5"><X size={16} /></button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <div><label className="label">Email address</label>
            <input className="input" type="email" required value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="user@example.com" /></div>
          <div><label className="label">Role</label>
            <select className="input" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
              <option value="admin">Admin — full access</option>
              <option value="member">Member — create &amp; manage</option>
              <option value="viewer">Viewer — read only</option>
            </select></div>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">Cancel</button>
            <button type="submit" disabled={loading} className="btn-primary flex-1 justify-center">
              {loading ? 'Inviting…' : 'Invite'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    PORTAL()
  )
}

function CreateOrgModal({ onClose, onDone }) {
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  useBodyLock(true)

  const submit = async e => {
    e.preventDefault(); setLoading(true)
    try { await orgsApi.create({ name }); toast.success('Organization created'); onDone(); onClose() }
    catch (err) { toast.error(err.response?.data?.detail || 'Failed to create') }
    finally { setLoading(false) }
  }

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
         style={{ background:'rgba(0,0,0,0.55)' }}
         onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="relative rounded-2xl w-full max-w-sm animate-fade-in"
           style={{ background:'var(--card)', border:'1px solid var(--border)', boxShadow:'var(--shadow-modal)' }}
           onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4"
             style={{ borderBottom:'1px solid var(--border)' }}>
          <h3 className="font-semibold text-[15px]" style={{ color:'var(--foreground)' }}>Create Organization</h3>
          <button onClick={onClose} className="btn-ghost p-1.5"><X size={16} /></button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <div><label className="label">Organization Name</label>
            <input className="input" required value={name} onChange={e => setName(e.target.value)}
              placeholder="My Team" autoFocus /></div>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">Cancel</button>
            <button type="submit" disabled={loading} className="btn-primary flex-1 justify-center">
              {loading ? 'Creating…' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    PORTAL()
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
  const [confirmRemove, setConfirmRemove] = useState(null)

  const loadOrgs = async () => {
    try {
      const { data } = await orgsApi.list()
      setOrgs(data)
      if (data.length > 0 && !selected) setSelected(data[0])
    } catch { toast.error('Failed to load organizations') }
    finally { setLoading(false) }
  }

  const loadMembers = async org => {
    if (!org) return
    setMembersLoading(true)
    try { const { data } = await orgsApi.members(org.id); setMembers(data) }
    catch { toast.error('Failed to load members') }
    finally { setMembersLoading(false) }
  }

  useEffect(() => { loadOrgs() }, [])
  useEffect(() => { if (selected) loadMembers(selected) }, [selected?.id])

  const handleRoleChange = async (userId, newRole) => {
    try { await orgsApi.updateRole(selected.id, userId, { role: newRole }); toast.success('Role updated'); loadMembers(selected) }
    catch (err) { toast.error(err.response?.data?.detail || 'Failed') }
  }

  const handleRemove = async () => {
    try {
      await orgsApi.remove(selected.id, confirmRemove.user_id)
      toast.success('Member removed'); setConfirmRemove(null); loadMembers(selected)
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed') }
  }

  if (loading) return <SpinnerPage />

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Organizations</h1>
          <p className="page-subtitle">Manage teams and access control</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary">
          <Plus size={15} /> New Org
        </button>
      </div>

      <div className="grid md:grid-cols-3 gap-5">
        {/* Org list */}
        <div className="space-y-2">
          {orgs.length === 0 ? (
            <div className="card">
              <EmptyState icon={Users} title="No organizations"
                description="Create one to collaborate with teammates"
                action={<button onClick={() => setShowCreate(true)} className="btn-primary inline-flex"><Plus size={14} /> Create</button>} />
            </div>
          ) : orgs.map(org => (
            <button key={org.id} onClick={() => setSelected(org)}
              className="card p-4 text-left w-full transition-all"
              style={{
                borderColor: selected?.id === org.id ? 'var(--primary)' : 'var(--border)',
                boxShadow: selected?.id === org.id ? '0 0 0 2px color-mix(in srgb, var(--primary) 20%, transparent)' : '',
              }}>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold text-base shrink-0"
                     style={{ background:'var(--primary)' }}>
                  {org.name[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate" style={{ color:'var(--foreground)' }}>{org.name}</p>
                  <p className="text-xs truncate" style={{ color:'var(--muted-foreground)' }}>/{org.slug}</p>
                </div>
                <span className={ROLE_COLORS[org.role] || 'badge-gray'}>{org.role}</span>
              </div>
            </button>
          ))}
        </div>

        {/* Members panel */}
        {selected && (
          <div className="md:col-span-2 card">
            <div className="flex items-center justify-between px-5 py-4"
                 style={{ borderBottom:'1px solid var(--border)' }}>
              <div>
                <h2 className="font-semibold text-sm" style={{ color:'var(--foreground)' }}>{selected.name}</h2>
                <p className="text-xs" style={{ color:'var(--muted-foreground)' }}>
                  {members.length} member{members.length !== 1 ? 's' : ''}
                </p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => loadMembers(selected)} className="btn-ghost p-2" title="Refresh">
                  <RefreshCw size={14} />
                </button>
                {selected.role === 'admin' && (
                  <button onClick={() => setShowInvite(true)} className="btn-primary text-sm">
                    <Plus size={14} /> Invite
                  </button>
                )}
              </div>
            </div>
            <div className="divide-y" style={{ borderColor:'var(--border)' }}>
              {membersLoading ? (
                <div className="flex justify-center py-10"><div className="spinner" /></div>
              ) : members.length === 0 ? (
                <p className="text-sm text-center py-8" style={{ color:'var(--muted-foreground)' }}>No members yet</p>
              ) : members.map(m => (
                <div key={m.user_id} className="flex items-center gap-4 px-5 py-3">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm shrink-0"
                       style={{ background:'var(--muted)', color:'var(--foreground)' }}>
                    {(m.username || m.email || '?')[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color:'var(--foreground)' }}>
                      {m.full_name || m.username}
                    </p>
                    <p className="text-xs truncate" style={{ color:'var(--muted-foreground)' }}>{m.email}</p>
                  </div>
                  {selected.role === 'admin' ? (
                    <select value={m.role} onChange={e => handleRoleChange(m.user_id, e.target.value)}
                      className="text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2"
                      style={{ border:'1px solid var(--border)', background:'var(--card)', color:'var(--foreground)' }}>
                      <option value="admin">Admin</option>
                      <option value="member">Member</option>
                      <option value="viewer">Viewer</option>
                    </select>
                  ) : (
                    <span className={ROLE_COLORS[m.role] || 'badge-gray'}>{m.role}</span>
                  )}
                  {selected.role === 'admin' && (
                    <button onClick={() => setConfirmRemove(m)} className="btn-ghost p-1.5"
                            style={{ color:'var(--destructive)' }} title="Remove member">
                      <UserMinus size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {showCreate && (
        <CreateOrgModal onClose={() => setShowCreate(false)} onDone={() => loadOrgs()} />
      )}
      {showInvite && (
        <InviteModal orgId={selected.id} onClose={() => setShowInvite(false)} onDone={() => loadMembers(selected)} />
      )}
      <ConfirmModal open={!!confirmRemove} title="Remove member?"
        message={`Remove ${confirmRemove?.username || confirmRemove?.email} from ${selected?.name}?`}
        onConfirm={handleRemove} onCancel={() => setConfirmRemove(null)} />
    </div>
  )
}
