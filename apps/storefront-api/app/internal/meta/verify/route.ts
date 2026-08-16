import { NextRequest, NextResponse } from 'next/server';

import { sendMetaEvent } from '@bric/storefront-core/meta';

import { getMetaRequestContext, isAllowedMetaSourceUrl } from '../../../../lib/meta-request';

export async function POST(request: NextRequest) {
  const configuredToken = process.env.STOREFRONT_API_DEPLOY_TOKEN?.trim();
  const suppliedToken = request.headers
    .get('authorization')
    ?.replace(/^Bearer\s+/i, '')
    .trim();
  if (!configuredToken || suppliedToken !== configuredToken) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }
  const testEventCode = process.env.META_TEST_EVENT_CODE?.trim();
  if (!testEventCode) {
    return NextResponse.json({ error: 'META_TEST_EVENT_CODE is not configured.' }, { status: 503 });
  }
  const body = (await request.json().catch(() => null)) as {
    eventId?: unknown;
    eventSourceUrl?: unknown;
  } | null;
  if (
    typeof body?.eventId !== 'string' ||
    typeof body.eventSourceUrl !== 'string' ||
    !isAllowedMetaSourceUrl(body.eventSourceUrl)
  ) {
    return NextResponse.json({ error: 'Invalid verification request.' }, { status: 400 });
  }
  const result = await sendMetaEvent(
    {
      eventName: 'PageView',
      eventId: body.eventId,
      eventTime: new Date(),
      eventSourceUrl: body.eventSourceUrl,
      userData: {
        client_ip_address: getMetaRequestContext(request).clientIpAddress ?? '127.0.0.1',
        client_user_agent: 'BricMetaDeployVerification/2.0',
      },
      customData: {},
    },
    { testEventCode },
  );
  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        status: result.status,
        error: result.message,
        code: result.code,
        subcode: result.subcode,
        fbtraceId: result.fbtraceId,
      },
      { status: 502 },
    );
  }
  return NextResponse.json({
    ok: true,
    eventsReceived: result.eventsReceived,
    fbtraceId: result.fbtraceId,
  });
}
