/**
 * Terms of Service, Privacy Policy and purchase terms shown in the game.
 *
 * This is a starting template, not legal advice: have it reviewed for the
 * countries you publish in before going live. Operator details come from
 * build-time env (VITE_LEGAL_*); unset fields stay visible as [brackets].
 * Bump TERMS_VERSION whenever the text changes in substance: players are
 * then asked to accept again.
 */
export const TERMS_VERSION = '2026-10-31';

const env = (import.meta as { env?: Record<string, string | undefined> }).env ?? {};
const field = (key: string, placeholder: string) => (env[key] && env[key]!.trim()) || placeholder;

export const LEGAL = {
  operator: field('VITE_LEGAL_NAME', '[Operator / company name]'),
  address: field('VITE_LEGAL_ADDRESS', '[Registered address]'),
  email: field('VITE_LEGAL_EMAIL', '[Contact e-mail]'),
  country: field('VITE_LEGAL_COUNTRY', '[Country of the governing law]'),
};

export interface LegalSection {
  title: string;
  paragraphs: string[];
}

export function termsOfService(): LegalSection[] {
  const L = LEGAL;
  return [
    {
      title: '1. Who we are',
      paragraphs: [`Sprintlings ("the Game") is operated by ${L.operator}, ${L.address} ("we", "us"). Contact: ${L.email}.`],
    },
    {
      title: '2. Accepting these terms',
      paragraphs: [
        'By tapping "Accept" you agree to these Terms of Service and confirm that you have read the Privacy Policy. Online races and purchases are only available after you accept.',
        'You must be at least 13 years old, or the minimum age of digital consent in your country if higher, or have the permission of a parent or legal guardian who accepts these terms for you.',
      ],
    },
    {
      title: '3. Your account',
      paragraphs: [
        'When the Game connects to our server it creates a guest account for you, identified by a random token stored in your browser. Clearing your browser data may lose access to that account. Keep your device secure; actions taken with your account are treated as yours.',
      ],
    },
    {
      title: '4. Fair play and online conduct',
      paragraphs: [
        'Race results are checked by our server. Do not cheat, use bots, modify the Game or its traffic, exploit bugs, or disrupt other players. Player names must not be offensive, impersonate others or contain personal data.',
        'We may remove rewards obtained unfairly and suspend or close accounts that break these rules.',
      ],
    },
    {
      title: '5. Virtual items and currency',
      paragraphs: [
        'Coins, gems, cosmetics and other virtual items are a limited, personal, non-transferable licence to use them in the Game. They have no monetary value, cannot be exchanged for real money or sold, and we may adjust the Game economy to keep it fair and balanced.',
      ],
    },
    {
      title: '6. Purchases',
      paragraphs: [
        'Purchases with real money are processed by our payment provider (Stripe). Prices are shown before you pay and include the taxes required in your country.',
        'Items are delivered to your account immediately after payment. If you are a consumer in the EU/EEA or UK, you have a 14-day right of withdrawal for online purchases; by completing a purchase of digital content that is delivered immediately, you expressly request immediate delivery and acknowledge that you lose this right of withdrawal once delivery has started. This does not affect your statutory rights if an item is faulty or not delivered.',
        `If something went wrong with a purchase, contact ${L.email} with the purchase time; we will investigate and fix or refund it where appropriate.`,
      ],
    },
    {
      title: '7. Advertising',
      paragraphs: ['The Game shows advertisements provided by the game portal and its partners, for example between races. Ads never interrupt a race in progress.'],
    },
    {
      title: '8. Availability and changes',
      paragraphs: [
        'We work to keep the Game and its servers running but cannot guarantee uninterrupted availability. We may change, suspend or end the Game or features of it. If we end the Game we will give reasonable notice where purchases are affected.',
        'We may update these terms; if a change is significant we will ask you to accept the new version in the Game.',
      ],
    },
    {
      title: '9. Liability',
      paragraphs: [
        'The Game is provided "as is". To the extent permitted by law we are not liable for indirect losses or for losses caused by events outside our reasonable control. Nothing in these terms limits liability that cannot be limited by law, or your rights as a consumer.',
      ],
    },
    {
      title: '10. Law and disputes',
      paragraphs: [`These terms are governed by the laws of ${L.country}. If you are a consumer, you also keep the protection of the mandatory laws of the country where you live and may bring claims there. EU consumers can also use the EU Online Dispute Resolution platform.`],
    },
  ];
}

export function privacyPolicy(): LegalSection[] {
  const L = LEGAL;
  return [
    {
      title: '1. Controller',
      paragraphs: [`${L.operator}, ${L.address} is responsible for the personal data processed by the Game. Contact for privacy questions: ${L.email}.`],
    },
    {
      title: '2. What we process and why',
      paragraphs: [
        'Game account: a random account id and access token, your chosen player name, progress, items, race results and trophies. Needed to provide the Game (contract).',
        'Online races: your inputs during a race and the resulting race data, shared with the other players in the same race (contract).',
        'Purchases: the item bought, amount, time and the payment status returned by Stripe. We never see or store your card details; Stripe processes them as an independent controller under its own privacy policy (contract, legal obligations for accounting).',
        'Security: IP address and request logs for a short time to prevent abuse and cheating (legitimate interest).',
        'Analytics: anonymous gameplay statistics, only if analytics are enabled in Settings (consent, which you can withdraw there at any time).',
      ],
    },
    {
      title: '3. Advertising',
      paragraphs: [
        'Ads are served by the game portal (GameMonetize) and its advertising partners, which may use cookies or similar technologies and process data such as your IP address and device information under their own privacy policies and consent tools. We do not pass your game account data to advertisers.',
      ],
    },
    {
      title: '4. Storage and retention',
      paragraphs: [
        'Data is stored on our servers and with our hosting and payment providers, who act on our instructions. Account data is kept while your account is active and deleted after 24 months of inactivity; purchase records are kept as long as accounting law requires; security logs for up to 30 days.',
        'If data is transferred outside the EU/EEA we rely on appropriate safeguards such as the European Commission\'s standard contractual clauses.',
      ],
    },
    {
      title: '5. Your rights',
      paragraphs: [
        `You can ask for access to, correction or deletion of your data, restriction of or objection to processing, and a copy of your data (portability). Write to ${L.email} and include your player name; you can find your account id in Profile. You may also complain to your data protection authority.`,
      ],
    },
    {
      title: '6. Children',
      paragraphs: ['The Game is not directed at children under 13. If you believe a child has given us data without permission, contact us and we will delete it.'],
    },
  ];
}
