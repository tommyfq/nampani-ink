/**
 * Creates (or resets) a staff login.
 *   npm run user:create -- --email owner@example.com --name "Owner" --role OWNER
 * The password is read from the PASSWORD environment variable, or generated and printed once.
 */
import '../load-env';
import { PrismaClient, Role } from '@prisma/client';
import { randomBytes } from 'crypto';
import { hashSecret } from '../auth/password';

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  const email = arg('email')?.trim().toLowerCase();
  const name = arg('name') ?? 'Owner';
  const role = (arg('role') ?? 'OWNER') as Role;
  if (!email || !Object.values(Role).includes(role)) {
    throw new Error('Usage: --email <email> [--name <name>] [--role OWNER|MANAGER|FRONT_DESK|ARTIST]');
  }
  const generated = !process.env.PASSWORD;
  const password = process.env.PASSWORD ?? randomBytes(9).toString('base64url');
  if (password.length < 10) throw new Error('PASSWORD must be at least 10 characters');

  const prisma = new PrismaClient();
  const passwordHash = await hashSecret(password);
  const user = await prisma.user.upsert({
    where: { email },
    update: { name, role, passwordHash, isActive: true },
    create: { email, name, role, passwordHash },
  });
  await prisma.$disconnect();
  console.log(`Saved ${user.role} ${user.email}`);
  if (generated) console.log(`Temporary password (shown once): ${password}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
