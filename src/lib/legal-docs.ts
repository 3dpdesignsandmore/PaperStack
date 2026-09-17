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
      { text: 'Last updated: September 16, 2026' },
      {
        text: 'PaperStack was built so that the privacy story is simple enough to state in one line: your documents never leave your device.',
      },
      { text: 'What we collect', heading: true },
      {
        text: 'Nothing. PaperStack collects no personal information, no usage statistics, no crash reports, and no analytics. There are no accounts, no sign-ins, and no servers storing anything about you.',
      },
      { text: 'What is stored, and where', heading: true },
      {
        text: 'Everything the app creates — scans, exported PDFs, tags, recipients, and settings — is stored only in the app\u2019s own storage on your device. On iOS, that storage is included in your device\u2019s normal backups (for example, iCloud backups, if you have them enabled). Removing the app removes its data.',
      },
      {
        text: 'Text recognition (OCR) runs entirely on your device. When you use features that recognize text in your scans, the processing is performed locally by the operating system\u2019s own text-recognition engine. The text never travels anywhere for processing.',
      },
      { text: 'What is transmitted', heading: true },
      {
        text: 'Sending a document. When you choose to send a PDF to someone, the email is handed to your device\u2019s own mail app, or the text message to your device\u2019s own messaging app. PaperStack does not operate any mail or messaging service — from that point on, whatever those apps do is governed by their own policies.',
      },
      {
        text: 'Sharing. When you use the share option, the file is handed directly to your device\u2019s system share sheet.',
      },
      {
        text: 'App updates. If you installed PaperStack from an app store or receive app updates over the air, the update service knows that an update was downloaded, like any other app update. No information about your documents or how you use the app is included.',
      },
      { text: 'Contact', heading: true },
      { text: 'Questions about this policy: [TO FILL: contact address]' },
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
      { text: '[TO FILL: contact address]' },
    ],
  },
};
