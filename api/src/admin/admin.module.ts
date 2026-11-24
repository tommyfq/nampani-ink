import { Module } from '@nestjs/common';
import {
  ArtistsController,
  AuditController,
  OutletsController,
  RevenueSchemesController,
  SettingsController,
  SiteSettingsController,
  UsersController,
} from './admin.controllers';
import { crudController } from './crud.factory';
import { FaqSchema, GallerySchema, PaymentMethodSchema, ReviewSchema, StyleSchema } from './schemas';

const content = ['MANAGER'] as const;

@Module({
  controllers: [
    OutletsController,
    UsersController,
    ArtistsController,
    SiteSettingsController,
    SettingsController,
    RevenueSchemesController,
    AuditController,
    crudController({ path: 'styles', model: 'style', schema: StyleSchema, roles: [...content] }),
    crudController({ path: 'gallery', model: 'galleryItem', schema: GallerySchema, roles: [...content] }),
    crudController({ path: 'faqs', model: 'faq', schema: FaqSchema, roles: [...content] }),
    crudController({ path: 'reviews', model: 'review', schema: ReviewSchema, roles: [...content] }),
    crudController({ path: 'payment-methods', model: 'paymentMethod', schema: PaymentMethodSchema, roles: ['OWNER'] }),
  ],
})
export class AdminModule {}
