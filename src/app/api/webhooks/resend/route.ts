import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const event = body as {
      type: string;
      data: {
        email_id?: string;
        created_at?: string;
        to?: string[];
        subject?: string;
      };
    };

    if (!event?.type || !event?.data?.email_id) {
      return NextResponse.json({ received: true });
    }

    const { PrismaClient } = await import("@prisma/client");
    const prisma = new PrismaClient();

    const where = { providerMessageId: event.data.email_id };

    switch (event.type) {
      case "email.delivered":
        await prisma.emailRecipient.updateMany({
          where,
          data: { deliveredAt: new Date(), deliveryStatus: "DELIVERED" },
        });
        break;

      case "email.bounced":
        await prisma.emailRecipient.updateMany({
          where,
          data: { bouncedAt: new Date(), deliveryStatus: "BOUNCED" },
        });
        break;

      case "email.opened":
        await prisma.emailRecipient.updateMany({
          where: { ...where, openedAt: null },
          data: { openedAt: new Date(), deliveryStatus: "OPENED" },
        });
        break;

      case "email.clicked":
        await prisma.emailRecipient.updateMany({
          where: { ...where, clickedAt: null },
          data: { clickedAt: new Date(), deliveryStatus: "CLICKED" },
        });
        break;

      default:
        break;
    }

    await prisma.$disconnect();
    return NextResponse.json({ received: true });
  } catch {
    return NextResponse.json({ received: true }, { status: 200 });
  }
}
