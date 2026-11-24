import { Body, Controller, Delete, Get, Inject, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Type, UseGuards, UseInterceptors } from '@nestjs/common';
import { Role } from '@prisma/client';
import { ZodObject, ZodRawShape } from 'zod';
import { SessionGuard } from '../auth/session.guard';
import { AuditInterceptor } from '../common/audit.interceptor';
import { Roles } from '../common/auth.decorators';
import { ZodPipe } from '../common/zod.pipe';
import { PrismaService } from '../db/prisma.service';

type Delegate = {
  findMany(args?: object): Promise<unknown[]>;
  findUnique(args: object): Promise<unknown>;
  create(args: object): Promise<{ id: string }>;
  update(args: object): Promise<{ id: string }>;
  delete(args: object): Promise<unknown>;
};

interface CrudOptions<S extends ZodRawShape> {
  path: string;
  model: 'style' | 'galleryItem' | 'faq' | 'review' | 'paymentMethod';
  schema: ZodObject<S>;
  roles: Role[];
  orderBy?: object;
  include?: object;
}

/** Builds a list / create / update / delete controller for a simple table. */
export function crudController<S extends ZodRawShape>(opts: CrudOptions<S>): Type<unknown> {
  const createPipe = new ZodPipe(opts.schema);
  const updatePipe = new ZodPipe(opts.schema.partial());

  @Controller(`admin/${opts.path}`)
  @UseGuards(SessionGuard)
  @UseInterceptors(AuditInterceptor)
  @Roles(...opts.roles)
  class CrudController {
    constructor(@Inject(PrismaService) readonly prisma: PrismaService) {}

    get table(): Delegate {
      return (this.prisma as unknown as Record<string, Delegate>)[opts.model];
    }

    @Get()
    list() {
      return this.table.findMany({ orderBy: opts.orderBy ?? { sort: 'asc' }, include: opts.include });
    }

    @Get(':id')
    async one(@Param('id', ParseUUIDPipe) id: string) {
      const row = await this.table.findUnique({ where: { id }, include: opts.include });
      if (!row) throw new NotFoundException();
      return row;
    }

    @Post()
    create(@Body(createPipe) body: object) {
      return this.table.create({ data: body });
    }

    @Patch(':id')
    async update(@Param('id', ParseUUIDPipe) id: string, @Body(updatePipe) body: object) {
      await this.one(id);
      return this.table.update({ where: { id }, data: body });
    }

    @Delete(':id')
    async remove(@Param('id', ParseUUIDPipe) id: string) {
      await this.one(id);
      await this.table.delete({ where: { id } });
      return { id };
    }
  }

  Object.defineProperty(CrudController, 'name', { value: `Admin_${opts.model}_Controller` });
  return CrudController;
}
