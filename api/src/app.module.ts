import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { BookingsModule } from './bookings/bookings.controller';
import { MessagesModule } from './messages/messages.controller';
import { PaymentsModule } from './payments/payments.controller';
import { OriginMiddleware } from './common/origin.middleware';
import { ScheduleModule } from './schedule/schedule.controller';
import { ContentModule } from './content/content.module';
import { DbModule } from './db/db.module';
import { SettingsModule } from './settings/settings.service';
import { UploadsModule } from './uploads/uploads.module';
import { NotifyModule } from './notify/notify.service';
import { RequestsModule } from './requests/requests.controller';

@Module({
  imports: [
    // Default: 120 requests per minute per visitor; login and uploads have stricter limits.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    DbModule,
    SettingsModule,
    AuthModule,
    ContentModule,
    UploadsModule,
    AdminModule,
    ScheduleModule,
    BookingsModule,
    PaymentsModule,
    MessagesModule,
    NotifyModule,
    RequestsModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(OriginMiddleware).forRoutes('auth', 'admin', 'pos');
  }
}
