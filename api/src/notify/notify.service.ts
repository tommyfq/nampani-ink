import { Global, Injectable, Logger, Module, OnModuleInit } from '@nestjs/common';
import { Subject } from 'rxjs';
import webpush from 'web-push';
import { PrismaService } from '../db/prisma.service';
import { SettingsService } from '../settings/settings.service';

/** Something staff screens should react to straight away. */
export interface LiveEvent {
  type: 'request';
  outletId: string;
  bookingId: string;
}

/** Hosts of the browsers' own push services. Subscriptions to anything else are refused. */
const PUSH_HOSTS = [/\.googleapis\.com$/, /\.mozilla\.com$/, /\.notify\.windows\.com$/, /(^|\.)push\.apple\.com$/];

export function isPushEndpoint(endpoint: string) {
  try {
    const u = new URL(endpoint);
    return u.protocol === 'https:' && PUSH_HOSTS.some((re) => re.test(u.hostname));
  } catch {
    return false;
  }
}

/**
 * Staff notifications:
 * - live events for open POS screens (Server-Sent Events)
 * - Web Push to devices that turned notifications on, even when the POS is closed
 *
 * Push needs VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT (mailto:…) in the environment.
 */
@Injectable()
export class NotifyService implements OnModuleInit {
  private readonly logger = new Logger(NotifyService.name);
  readonly live = new Subject<LiveEvent>();
  readonly publicKey = process.env.VAPID_PUBLIC_KEY ?? '';
  private pushReady = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  onModuleInit() {
    const priv = process.env.VAPID_PRIVATE_KEY;
    if (!this.publicKey || !priv) {
      this.logger.warn('VAPID keys are not set: browser notifications are off');
      return;
    }
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:studio@nampani.ink', this.publicKey, priv);
    this.pushReady = true;
  }

  get pushAvailable() {
    return this.pushReady;
  }

  /** A new booking request arrived from the website. Never throws: the request is already saved. */
  async newRequest(booking: { id: string; outletId: string; code: string; customerName: string; summary: string }) {
    this.live.next({ type: 'request', outletId: booking.outletId, bookingId: booking.id });
    try {
      await this.push(booking.outletId, {
        title: 'New booking request',
        body: `${booking.customerName}${booking.summary ? ` · ${booking.summary}` : ''}`,
        url: `/admin/inbox?id=${booking.id}`,
        tag: `request-${booking.id}`,
      });
    } catch (err) {
      this.logger.error(`Push failed: ${(err as Error).message}`);
    }
  }

  /** Sends to every device of front desk, managers and owners who work at this outlet. */
  private async push(outletId: string, payload: { title: string; body: string; url: string; tag: string }) {
    if (!this.pushReady || !(await this.settings.get<boolean>('notify.pushEnabled'))) return 0;
    const devices = await this.prisma.pushSubscription.findMany({
      where: {
        user: {
          isActive: true,
          OR: [{ role: 'OWNER' }, { role: { in: ['MANAGER', 'FRONT_DESK'] }, outlets: { some: { outletId } } }],
        },
      },
    });
    const body = JSON.stringify(payload);
    let sent = 0;
    await Promise.all(
      devices.map(async (d) => {
        try {
          await webpush.sendNotification({ endpoint: d.endpoint, keys: { p256dh: d.p256dh, auth: d.auth } }, body, { TTL: 24 * 3600, urgency: 'high' });
          sent++;
          await this.prisma.pushSubscription.update({ where: { id: d.id }, data: { lastUsedAt: new Date() } });
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode;
          // The browser unsubscribed or the device is gone: forget it.
          if (status === 404 || status === 410) await this.prisma.pushSubscription.delete({ where: { id: d.id } }).catch(() => undefined);
          else this.logger.warn(`Push to a device failed (${status ?? 'network'})`);
        }
      }),
    );
    return sent;
  }
}

@Global()
@Module({ providers: [NotifyService], exports: [NotifyService] })
export class NotifyModule {}
