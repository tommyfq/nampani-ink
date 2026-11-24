'use client';

import { notFound } from 'next/navigation';
import { ResourcePage } from '@/components/ResourcePage';
import { RESOURCES } from '@/lib/resources';

export default function Page({ params }: { params: { resource: string } }) {
  const resource = RESOURCES[params.resource];
  if (!resource) notFound();
  return <ResourcePage resource={resource} />;
}
