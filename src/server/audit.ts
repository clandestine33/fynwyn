import { db } from '@/lib/db';
import { clientIp } from '@/lib/session';
import type { Prisma, StaffUser } from '@prisma/client';

export async function audit(staff: Pick<StaffUser, 'id' | 'email'> | null, action: string, entity?: string, entityId?: string, meta?: Prisma.InputJsonValue) {
  await db.auditLog.create({ data: { staffId: staff?.id, staffEmail: staff?.email, action, entity, entityId, meta, ip: clientIp() } });
}
