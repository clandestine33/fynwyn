import type { Metadata } from 'next';
import { ActionForm, Field, SubmitButton } from '@/components/ActionForm';
import { getSettings } from '@/server/queries';
import { saveSettingsAction } from '../../actions';
import { pageGuard } from '../guard';

export const metadata: Metadata = { title: 'Settings' };

export default async function Settings() {
  await pageGuard(); // SUPER_ADMIN only
  const s = await getSettings();
  const yn = (name: string, label: string, v: boolean) => <div><label className="label" htmlFor={name}>{label}</label><select id={name} name={name} defaultValue={String(v)} className="input"><option value="true">Yes</option><option value="false">No</option></select></div>;
  return (
    <div className="max-w-3xl">
      <h1 className="mb-1 text-3xl">Campaign settings</h1>
      <p className="mb-4 text-sm text-muted">Bump the terms version when terms change materially; customers accept the version current when they register.</p>
      <div className="card">
        <ActionForm action={saveSettingsAction} resetOnSuccess={false} className="grid gap-x-3 sm:grid-cols-2">
          <Field label="Campaign name" name="campaignName" defaultValue={s.campaignName} required />
          <Field label="Terms version" name="termsVersion" defaultValue={s.termsVersion} required />
          <div className="sm:col-span-2"><Field label="Public brand message" name="brandMessage" defaultValue={s.brandMessage} /></div>
          {yn('registrationOpen', 'Registration open?', s.registrationOpen)}{yn('redemptionOpen', 'Redemption open?', s.redemptionOpen)}
          <Field label="Final redemption deadline" name="finalRedemptionDeadline" type="date" defaultValue={s.finalRedemptionDeadline?.toISOString().slice(0, 10) ?? ''} />
          <Field label="Support email" name="supportEmail" type="email" defaultValue={s.supportEmail ?? ''} />
          <Field label="Support phone" name="supportPhone" defaultValue={s.supportPhone ?? ''} />
          <div className="sm:col-span-2"><label className="label" htmlFor="termsText">Terms text</label><textarea id="termsText" name="termsText" rows={5} defaultValue={s.termsText} className="input" /></div>
          <div className="sm:col-span-2"><label className="label" htmlFor="privacyText">Privacy notice</label><textarea id="privacyText" name="privacyText" rows={4} defaultValue={s.privacyText} className="input" /></div>
          <div className="sm:col-span-2 mt-4"><SubmitButton>Save settings</SubmitButton></div>
        </ActionForm>
      </div>
    </div>
  );
}
