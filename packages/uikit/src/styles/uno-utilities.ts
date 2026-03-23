import {unsafeCSS} from 'lit'

// Import processed UnoCSS output as raw CSS text.
// The `?inline` suffix tells Vite to return the CSS as a string
// instead of injecting it into the document.
import unoStyles from './uno.css?inline'

/**
 * UnoCSS-generated utility classes as a Lit CSSResult.
 * Only contains utilities actually used in scanned source files.
 */
export const unoUtilities = unsafeCSS(unoStyles)
