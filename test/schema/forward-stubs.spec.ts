import { describe, it, expect, beforeEach } from 'vitest';
import { getPrisma } from '../setup-prisma';

describe('forward stubs', () => {
  beforeEach(async () => {
    const prisma = getPrisma();
    await prisma.$executeRawUnsafe(
      `TRUNCATE TABLE "MessageTemplate", "WebhookSubscription", "CompanySettings", "ChatFlow", "ChannelConnection", "Company", "Plan" RESTART IDENTITY CASCADE`,
    );
  });

  it('MessageTemplate referencia ChannelConnection stub', async () => {
    const prisma = getPrisma();
    const plan = await prisma.plan.create({ data: { name: 'P' } });
    const company = await prisma.company.create({
      data: { planId: plan.id, name: 'C', slug: 'c' },
    });
    const channel = await prisma.channelConnection.create({
      data: { companyId: company.id, name: 'WhatsApp Principal' },
    });

    const tpl = await prisma.messageTemplate.create({
      data: {
        companyId: company.id,
        channelConnectionId: channel.id,
        externalId: 'ext-1',
        name: 'welcome',
        category: 'UTILITY',
        status: 'APPROVED',
        language: 'pt_BR',
        bodyText: 'Olá {{1}}',
        variables: 1,
        lastSyncedAt: new Date(),
      },
    });

    expect(tpl.channelConnectionId).toBe(channel.id);
  });

  it('CompanySettings.defaultBotChatFlowId aponta para ChatFlow stub e SetNull no delete', async () => {
    const prisma = getPrisma();
    const plan = await prisma.plan.create({ data: { name: 'P' } });
    const company = await prisma.company.create({
      data: { planId: plan.id, name: 'C', slug: 'c' },
    });
    const flow = await prisma.chatFlow.create({
      data: { companyId: company.id, name: 'flow-default' },
    });
    const settings = await prisma.companySettings.create({
      data: { companyId: company.id, defaultBotChatFlowId: flow.id },
    });
    expect(settings.defaultBotChatFlowId).toBe(flow.id);

    await prisma.chatFlow.delete({ where: { id: flow.id } });

    const updated = await prisma.companySettings.findUnique({
      where: { companyId: company.id },
    });
    expect(updated?.defaultBotChatFlowId).toBeNull();
  });

  it('WebhookSubscription.channelConnectionId é opcional e SetNull no delete do channel', async () => {
    const prisma = getPrisma();
    const plan = await prisma.plan.create({ data: { name: 'P' } });
    const company = await prisma.company.create({
      data: { planId: plan.id, name: 'C', slug: 'c' },
    });
    const channel = await prisma.channelConnection.create({
      data: { companyId: company.id, name: 'wpp' },
    });
    const sub = await prisma.webhookSubscription.create({
      data: {
        companyId: company.id,
        name: 'integration-x',
        url: 'https://example.com/hook',
        secret: 'shhh',
        channelConnectionId: channel.id,
        events: ['TICKET_CREATED'],
      },
    });

    await prisma.channelConnection.delete({ where: { id: channel.id } });

    const updated = await prisma.webhookSubscription.findUnique({ where: { id: sub.id } });
    expect(updated?.channelConnectionId).toBeNull();
  });
});
