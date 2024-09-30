import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const json = await req.json();
    const { question } = json;

    if (typeof question !== 'string' || question.length === 0) {
      return NextResponse.json({ error: 'Invalid question' }, { status: 400 });
    }

    const flowiseApiKey = process.env.FLOWISE_API_KEY;

    if (!flowiseApiKey) {
      return NextResponse.json(
        { error: 'Missing configuration' },
        { status: 500 }
      );
    }

    const userId = 'userid'; // Verwende hier die tatsächlich benötigte sessionId

    const body = JSON.stringify({
      ...json,
      overrideConfig: {
        ...json?.overrideConfig,
        sessionId: !json?.overrideConfig?.sessionId
          ? userId
          : json.overrideConfig.sessionId
      }
    });

    const flowiseResponse = await fetch(
      'https://flowise-rfxw.onrender.com/api/v1/prediction/75225840-452c-4330-b639-ccc3f8a99b06',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${flowiseApiKey}`
        },
        body
      }
    );

    if (!flowiseResponse.ok) {
      const errorResponseBody = await flowiseResponse.text();
      return NextResponse.json(JSON.parse(errorResponseBody), {
        status: flowiseResponse.status
      });
    }

    const flowiseData = await flowiseResponse.json();
    // console.log('+++ Flowise Response:', flowiseData.sessionId);

    // Hier kannst du die erhaltene sessionId aus der Flowise-Antwort speichern oder weiterverarbeiten
    // const newSessionId = flowiseData.sessionId; // Dies könnte für die nächste Anfrage verwendet werden

    return NextResponse.json(flowiseData);
  } catch (error) {
    console.error('Error handling chat request:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
