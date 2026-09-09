export { TERMS_VERSION, PRIVACY_VERSION, CHILD_SAFETY_VERSION, needsLegalAcceptance } from './documents';
export type { LegalDocument, LegalSection } from './documents';
export { TERMS_DOCUMENT } from './terms';
export { PRIVACY_DOCUMENT } from './privacy';
export { CHILD_SAFETY_DOCUMENT } from './childSafety';

import { CHILD_SAFETY_DOCUMENT } from './childSafety';
import { PRIVACY_DOCUMENT } from './privacy';
import { TERMS_DOCUMENT } from './terms';
import type { LegalDocument } from './documents';

export function getLegalDocument(id: LegalDocument['id']): LegalDocument {
  switch (id) {
    case 'terms':
      return TERMS_DOCUMENT;
    case 'privacy':
      return PRIVACY_DOCUMENT;
    case 'child-safety':
      return CHILD_SAFETY_DOCUMENT;
  }
}
