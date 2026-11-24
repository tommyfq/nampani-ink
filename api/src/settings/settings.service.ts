import { Global, Injectable, Module } from '@nestjs/common';
import { PrismaService } from '../db/prisma.service';
import { SETTINGS, SettingKey } from '../admin/schemas';

export type CustomerMessage = 'consultationReminder' | 'dpConfirmation' | 'appointmentReminder' | 'receipt';

/** Reads business settings (saved value, or the default). */
@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async get<T = unknown>(key: SettingKey, outletId?: string): Promise<T> {
    const rows = await this.prisma.setting.findMany({
      where: { key, OR: [{ outletId: null }, ...(outletId ? [{ outletId }] : [])] },
    });
    const row = rows.find((r) => r.outletId === outletId) ?? rows.find((r) => r.outletId === null);
    return (row ? row.value : SETTINGS[key].default) as T;
  }

  /**
   * Whether a WhatsApp message may be sent. Every sender must call this first.
   * Customer messages need the main customer switch AND that message's own switch.
   */
  async canSendWhatsApp(message: CustomerMessage | 'internal'): Promise<boolean> {
    if (message === 'internal') return Boolean(await this.get('whatsapp.internalEnabled'));
    if (!(await this.get<boolean>('whatsapp.customerEnabled'))) return false;
    return Boolean(await this.get(`whatsapp.${message}` as SettingKey));
  }
}

@Global()
@Module({ providers: [SettingsService], exports: [SettingsService] })
export class SettingsModule {}
