'use server';

import Stripe from 'stripe';
import { stripe } from '@/utils/stripe/config';
import { createClient } from '@/utils/supabase/server';
import { createOrRetrieveCustomer } from '@/utils/supabase/admin';
import {
  getURL,
  getErrorRedirect,
  calculateTrialEndUnixTimestamp
} from '@/utils/helpers';
import { Tables } from '@/types_db';

type Price = Tables<'prices'>;

type CheckoutResponse = {
  errorRedirect?: string;
  sessionId?: string;
};

export async function checkoutWithStripe(
  price: Price,
  redirectPath: string = '/account'
): Promise<CheckoutResponse> {
  try {
    // Get the user from Supabase auth
    const supabase = createClient();
    const {
      error,
      data: { user }
    } = await supabase.auth.getUser();

    if (error || !user) {
      console.error(error);
      throw new Error('Could not get user session.');
    }

    // Retrieve or create the customer in Stripe
    let customer: string;
    try {
      customer = await createOrRetrieveCustomer({
        uuid: user?.id || '',
        email: user?.email || ''
      });
    } catch (err) {
      console.error(err);
      throw new Error('Unable to access customer record.');
    }

    let params: Stripe.Checkout.SessionCreateParams = {
      allow_promotion_codes: true,
      billing_address_collection: 'required',
      customer,
      customer_update: {
        address: 'auto'
      },
      line_items: [
        {
          price: price.id,
          quantity: 1
        }
      ],
      cancel_url: getURL(),
      success_url: getURL(redirectPath)
    };

    console.log(
      'Trial end:',
      calculateTrialEndUnixTimestamp(price.trial_period_days)
    );
    if (price.type === 'recurring') {
      params = {
        ...params,
        mode: 'subscription',
        subscription_data: {
          trial_end: calculateTrialEndUnixTimestamp(price.trial_period_days)
        }
      };
    } else if (price.type === 'one_time') {
      params = {
        ...params,
        mode: 'payment'
      };
    }

    // Create a checkout session in Stripe
    let session;
    try {
      session = await stripe.checkout.sessions.create(params);
    } catch (err) {
      console.error(err);
      throw new Error('Unable to create checkout session.');
    }

    // Instead of returning a Response, just return the data or error.
    if (session) {
      return { sessionId: session.id };
    } else {
      throw new Error('Unable to create checkout session.');
    }
  } catch (error) {
    if (error instanceof Error) {
      return {
        errorRedirect: getErrorRedirect(
          redirectPath,
          error.message,
          'Please try again later or contact a system administrator.'
        )
      };
    } else {
      return {
        errorRedirect: getErrorRedirect(
          redirectPath,
          'An unknown error occurred.',
          'Please try again later or contact a system administrator.'
        )
      };
    }
  }
}

export async function createStripePortal(currentPath: string) {
  try {
    const supabase = createClient();
    const {
      error,
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      if (error) {
        console.error(error);
      }
      throw new Error('Could not get user session.');
    }

    let customer;
    try {
      customer = await createOrRetrieveCustomer({
        uuid: user.id || '',
        email: user.email || ''
      });
    } catch (err) {
      console.error(err);
      throw new Error('Unable to access customer record.');
    }

    if (!customer) {
      throw new Error('Could not get customer.');
    }

    try {
      const { url } = await stripe.billingPortal.sessions.create({
        customer,
        return_url: getURL('/account')
      });
      if (!url) {
        throw new Error('Could not create billing portal');
      }
      return url;
    } catch (err) {
      console.error(err);
      throw new Error('Could not create billing portal');
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error(error);
      return getErrorRedirect(
        currentPath,
        error.message,
        'Please try again later or contact a system administrator.'
      );
    } else {
      return getErrorRedirect(
        currentPath,
        'An unknown error occurred.',
        'Please try again later or contact a system administrator.'
      );
    }
  }
}

export async function processUsageRecord(
  question: string,
  flowiseApiKey: string,
  subscriptionItemId: string,
  usageThreshold: number = 10000
): Promise<{ response?: string; errorRedirect?: string }> {
  try {
    // Step 1: Zeichen im Fragefeld zählen
    const charCount = question.length;

    // Step 2: Überprüfe das Guthaben bei Stripe
    // const usage = await stripe.subscriptionItems.listUsageRecordSummaries(
    //   subscriptionItemId,
    //   {
    //     limit: 1
    //   }
    // );

    // const totalUsed = usage.data[0]?.total_usage || 0;

    // // Prüfen, ob noch genug Token übrig sind
    // if (totalUsed + charCount > usageThreshold) {
    //   return { errorRedirect: 'Guthaben aufgebraucht!' };
    // }

    // // Step 3: Sende die Anfrage an Stripe, um den Usage Record zu aktualisieren
    // await stripe.subscriptionItems.createUsageRecord(subscriptionItemId, {
    //   quantity: charCount,
    //   timestamp: Math.floor(Date.now() / 1000),
    //   action: 'increment'
    // });

    // Step 4: Anfrage an Flowise senden
    const flowiseResponse = await fetch(
      'https://flowise-rfxw.onrender.com/api/v1/prediction/75225840-452c-4330-b639-ccc3f8a99b06',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${flowiseApiKey}` // Flowise API Schlüssel
        },
        body: JSON.stringify({ question })
      }
    );

    if (!flowiseResponse.body) {
      throw new Error('Fehler bei der Kommunikation mit Flowise');
    }

    // Step 5: Stream-Antwort verarbeiten und zusammenführen
    // const reader = flowiseResponse.body.getReader();
    // const decoder = new TextDecoder();
    // let responseText = '';
    // let done = false;

    // while (!done) {
    //   const { value, done: readerDone } = await reader.read();
    //   done = readerDone;
    //   if (value) {
    //     const textChunk = decoder.decode(value);
    //     const matches = textChunk.match(/"data":"([^"]+)"/g);
    //     if (matches) {
    //       for (const match of matches) {
    //         const tokenData = match.match(/"data":"([^"]+)"/);
    //         if (tokenData && tokenData[1]) {
    //           responseText += tokenData[1]; // Füge den extrahierten Text zusammen
    //         }
    //       }
    //     }
    //   }
    // }

    // Step 6: Zähle die Zeichen der Antwort und sende Usage Record an Stripe
    // const responseCharCount = responseText.length;
    // await stripe.subscriptionItems.createUsageRecord(subscriptionItemId, {
    //   quantity: responseCharCount,
    //   timestamp: Math.floor(Date.now() / 1000),
    //   action: 'increment'
    // });

    // Step 7: Endgültige Antwort zurückgeben
    return { response: responseText };
  } catch (error) {
    console.error('Error handling request:', error);
    return { errorRedirect: 'Internal Server Error' };
  }
}
