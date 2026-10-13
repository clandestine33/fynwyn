import type { Metadata } from 'next';
import { db } from '@/lib/db';
import { ActionForm, Field, SubmitButton } from '@/components/ActionForm';
import { Badge, Table, dateTimeFmt } from '@/components/ui';
import { createStaffAction, updateStaffAction } from '../../actions';
import { pageGuard } from '../guard';

export const metadata: Metadata = { title: 'Staff' };
const ROLES = ['SUPER_ADMIN', 'FINANCE', 'OPERATIONS', 'SUPPORT'];

export default async function Staff() {
  const me = await pageGuard();
  const staff = await db.staffUser.findMany({ orderBy: { createdAt: 'asc' } });
  return (
    <div>
      <h1 className="mb-1 text-3xl">Staff</h1>
      <p className="mb-4 text-sm text-muted">Finance: verify/reverse payments, rewards, credit adjustments. Operations: orders, inventory, rewards. Support: read-only. Changing a role, password or status signs that person out everywhere.</p>
      <Table head={['Name', 'Role', 'Last sign-in', 'Status', 'Edit']}>
        {staff.map((u) => (
          <tr key={u.id}><td className="td"><strong>{u.name}</strong><div className="text-xs text-muted">{u.email}</div></td><td className="td">{u.role.replace('_', ' ').toLowerCase()}</td><td className="td">{u.lastLoginAt ? dateTimeFmt(u.lastLoginAt) : '—'}</td><td className="td"><Badge status={u.active ? 'ACTIVE' : 'CLOSED'} label={u.active ? 'Active' : 'Disabled'} /></td>
            <td className="td">
              <details><summary className="cursor-pointer text-xs underline">Edit</summary>
                <ActionForm action={updateStaffAction} resetOnSuccess={false} className="mt-2 w-60">
                  <input type="hidden" name="id" value={u.id} />
                  <select name="role" defaultValue={u.role} className="input">{ROLES.map((r) => <option key={r} value={r}>{r.replace('_', ' ').toLowerCase()}</option>)}</select>
                  <select name="active" defaultValue={String(u.active)} className="input mt-2" disabled={u.id === me.id}><option value="true">Active</option><option value="false">Disabled</option></select>
                  {u.id === me.id && <input type="hidden" name="active" value="true" />}
                  <input name="password" type="password" placeholder="New password (optional)" minLength={12} autoComplete="new-password" className="input mt-2" />
                  <div className="mt-2"><SubmitButton className="btn btn-secondary btn-sm">Save</SubmitButton></div>
                </ActionForm>
              </details></td></tr>
        ))}
      </Table>
      <div className="card mt-6 max-w-xl"><h2 className="text-xl">Add staff member</h2>
        <ActionForm action={createStaffAction}>
          <Field label="Full name" name="name" required /><Field label="Work email" name="email" type="email" required />
          <label className="label" htmlFor="role">Role</label><select id="role" name="role" defaultValue="SUPPORT" className="input">{ROLES.map((r) => <option key={r} value={r}>{r.replace('_', ' ').toLowerCase()}</option>)}</select>
          <Field label="Temporary password (12+ chars)" name="password" type="password" required minLength={12} autoComplete="new-password" />
          <div className="mt-4"><SubmitButton>Create staff member</SubmitButton></div>
        </ActionForm>
      </div>
    </div>
  );
}
