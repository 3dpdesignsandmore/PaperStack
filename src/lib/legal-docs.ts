/**
 * The legal documents' text, split from the /legal/[doc] screen by the
 * repo's own rule (no duplicated definitions — the Settings About rows
 * and the route itself both key off these ids). The text lives here
 * rather than in a .md bundle import because Metro has no markdown
 * loader and these are short static paragraphs — a plain array with
 * heading flags is the entire format. Update copy in place; the shape
 * is what the renderer in src/app/legal/[doc].tsx consumes.
 */

/** One rendered block of a legal document. */
export interface LegalParagraph {
  /** The text. */
  text: string;
  /** Render as a section heading instead of body copy. */
  heading?: boolean;
}

/** A bundled legal document. */
export interface LegalDoc {
  /** Short title for the screen header. */
  title: string;
  /** Paragraphs in order. */
  paragraphs: LegalParagraph[];
}

/** The route's [doc] segment values. */
export type LegalDocId = 'privacy' | 'terms';

export const LEGAL_DOCS: Record<LegalDocId, LegalDoc> = {
  privacy: {
    title: 'Privacy Policy',
    paragraphs: [
      { text: 'Privacy Policy', heading: true },
      { text: 'Last updated: October 28, 2026' },
      {
        text: 'PaperStack is made by 3DP Designs and More, a small business in Grand Blanc, Michigan. It was built so that the privacy story is simple enough to state in one line: your documents never leave your device unless you send or share them yourself.',
      },
      { text: 'What we collect', heading: true },
      {
        text: 'Nothing. PaperStack has no accounts, no sign-ins and no servers of its own, and it contains no analytics, advertising or tracking code. We never receive your scans, the text in them, or any information about how you use the app.',
      },
      { text: 'What is stored, and where', heading: true },
      {
        text: 'Everything the app creates — scans, exported PDFs, tags, recipients, and settings — is stored only in the app\u2019s own storage on your device. Recipients are names and addresses you type in yourself; PaperStack does not read your device\u2019s contacts.',
      },
      {
        text: 'Device backups. Like other apps, the app\u2019s storage is included in your device\u2019s own backups if you have them turned on: iCloud Backup on iPhone, and Google\u2019s Android backup on Android. Android limits each app\u2019s backup to a fixed size, so a large library may only be partly backed up. Those backups belong to your Apple or Google account and are governed by their policies; we have no access to them.',
      },
      {
        text: 'Images that arrive through your device\u2019s system share sheet are treated the same as camera scans: stored on your device, processed locally, never uploaded.',
      },
      {
        text: 'Diagnostic log. If you turn on diagnostic logging — a manual, opt-in setting — the app keeps a small technical log of its own activity on your device, containing no identifiers. It is never transmitted automatically; you can export it as a file yourself if you choose to share it with support, and you can clear it at any time.',
      },
      {
        text: 'Because PaperStack has no service of its own to break into, the security of your documents is the security of your device itself — the same lock screen and encryption that protect the rest of your phone protect your scans.',
      },
      { text: 'Permissions the app asks for', heading: true },
      {
        text: 'Camera \u2014 to scan documents and receipts. Nothing is recorded except the pages you choose to keep.',
      },
      {
        text: 'Photos \u2014 only when you choose to add an existing photo as a document. The app sees only the photos you pick.',
      },
      {
        text: 'PaperStack does not ask for your location, contacts, microphone or any other permission.',
      },
      { text: 'Scanning and text recognition', heading: true },
      {
        text: 'Scanning pages and recognizing the text in them happens entirely on your device. Your images and their text are never uploaded for processing.',
      },
      {
        text: 'On iPhone, this is done by Apple\u2019s built-in document scanner and text-recognition engine.',
      },
      {
        text: 'On Android, it is done by Google\u2019s ML Kit, which runs on the device through Google Play services. ML Kit does not send your images or recognized text anywhere, but as part of how Google provides it, it may contact Google to download updates to its recognition models and send Google anonymous technical metrics about how the scanning and recognition features perform (for example, device type and how long processing took). This is collected by Google under ML Kit\u2019s terms (developers.google.com/ml-kit/terms); we don\u2019t receive it.',
      },
      { text: 'What is transmitted', heading: true },
      {
        text: 'Sending a document. When you choose to send a PDF to someone, the email is handed to your device\u2019s own mail app, or the text message to your device\u2019s own messaging app. PaperStack does not operate any mail or messaging service — from that point on, whatever those apps do is governed by their own policies.',
      },
      {
        text: 'Sharing. When you use the share option, the file is handed directly to your device\u2019s system share sheet.',
      },
      {
        text: 'App updates. PaperStack receives updates from the App Store or Google Play, and may also download small updates directly through Expo, the service the app is built with. Checking for an update involves the usual technical details any download does — your device\u2019s network address, its platform and the app version. No information about your documents or how you use the app is included.',
      },
      {
        text: 'Crash reports from your device. PaperStack itself sends no crash reports. If you have allowed your iPhone or Android device to share diagnostics with app developers, Apple or Google may pass us anonymous crash data under their own policies. You can turn that off in your device\u2019s settings.',
      },
      { text: 'Deleting your data', heading: true },
      {
        text: 'Because there is no account and nothing is stored on our side, there is nothing for us to delete. Deleting a document in the app removes it from the app, and removing the app removes all of its data from your device. Copies you have sent, shared or saved elsewhere — and your own device backups — stay where you put them.',
      },
      { text: 'Children', heading: true },
      {
        text: 'PaperStack collects no information from anyone, including children under 13.',
      },
      { text: 'Changes to this policy', heading: true },
      {
        text: 'If a future version of PaperStack changes anything described here, we\u2019ll update this page and the date at the top.',
      },
      { text: 'Contact', heading: true },
      { text: 'Questions about this policy: support@3dpdesignsandmore.com' },
    ],
  },
  terms: {
    title: 'Terms of Use',
    paragraphs: [
      { text: 'Terms of Use', heading: true },
      { text: 'Last updated: September 16, 2026' },
      { text: 'Acceptance', heading: true },
      {
        text: 'By using PaperStack you agree to these terms. If you do not agree, do not use the app.',
      },
      { text: 'The service', heading: true },
      {
        text: 'PaperStack is a document scanner: it captures scans with your device\u2019s camera, organizes them, combines multiple scans into shared pages, and exports or sends them as PDF files. All processing and storage happen on your device; there is no cloud service operated as part of the app.',
      },
      { text: 'No warranty', heading: true },
      {
        text: 'The app is provided as is, without warranty of any kind. Among other things:',
      },
      {
        text: 'Text recognition (OCR) is not guaranteed to be accurate. Recognized text may contain errors. Do not rely on OCR output as the authoritative text of any document; verify against the original scan or the paper original.',
      },
      {
        text: 'PDF output may differ from the original. Combination, compression, and export can affect image quality and layout fidelity.',
      },
      {
        text: 'The app is not a substitute for retaining the original documents.',
      },
      { text: 'Your data is your responsibility', heading: true },
      {
        text: 'PaperStack stores everything on your device only. That means you are responsible for retaining your own records — if the device is lost, reset, or the app is deleted, any scans that were not backed up elsewhere are gone. Use your device\u2019s normal backup mechanisms (for example, iCloud backups of the app\u2019s storage) if you want copies.',
      },
      { text: 'Liability', heading: true },
      {
        text: 'To the maximum extent permitted by law, the developers of PaperStack are not liable for any loss of data, documents, or profits arising from use of the app, including failures of OCR accuracy, PDF fidelity, or the on-device storage described above.',
      },
      { text: 'Changes', heading: true },
      {
        text: 'These terms may change with app updates. Continued use after an update means you accept the updated terms.',
      },
      { text: 'Contact', heading: true },
      { text: 'Questions about these terms: support@3dpdesignsandmore.com' },
    ],
  },
};
