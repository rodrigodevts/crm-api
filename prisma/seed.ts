import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const superAdminEmail = process.env.SEED_SUPER_ADMIN_EMAIL ?? 'super@digichat.local';
  const superAdminPassword = process.env.SEED_SUPER_ADMIN_PASSWORD ?? 'changeme-only-for-dev';

  if (!process.env.SEED_SUPER_ADMIN_PASSWORD) {
    console.warn(
      '[seed] SEED_SUPER_ADMIN_PASSWORD não definida — usando fallback de dev. NÃO use em produção.',
    );
  }

  const plan = await prisma.plan.upsert({
    where: { name: 'Default' },
    update: { active: true },
    create: {
      name: 'Default',
      description: 'Plano padrão MVP',
      active: true,
    },
  });
  console.log(`✓ Plan "${plan.name}" garantido (id=${plan.id})`);

  const company = await prisma.company.upsert({
    where: { slug: 'exemplo' },
    update: { planId: plan.id, active: true },
    create: {
      planId: plan.id,
      name: 'DigiChat — Empresa Exemplo',
      slug: 'exemplo',
      active: true,
      timezone: 'America/Sao_Paulo',
    },
  });
  console.log(`✓ Company "${company.slug}" garantida (id=${company.id})`);

  const settings = await prisma.companySettings.upsert({
    where: { companyId: company.id },
    update: {},
    create: { companyId: company.id },
  });
  console.log(`✓ CompanySettings garantido (id=${settings.id})`);

  const passwordHash = await bcrypt.hash(superAdminPassword, 12);

  const normalizedEmail = superAdminEmail.toLowerCase();

  const superAdmin = await prisma.user.upsert({
    where: { companyId_email: { companyId: company.id, email: normalizedEmail } },
    update: {
      passwordHash,
      role: 'SUPER_ADMIN',
    },
    create: {
      companyId: company.id,
      name: 'Super Admin',
      email: normalizedEmail,
      passwordHash,
      role: 'SUPER_ADMIN',
    },
  });
  console.log(`✓ SUPER_ADMIN ${superAdmin.email} garantido (id=${superAdmin.id})`);
}

main()
  .catch((error) => {
    console.error('[seed] erro:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
