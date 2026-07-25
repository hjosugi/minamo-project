// Runtime EN/JA localization for the site home (#267). The page is otherwise
// static markup, so this module only wires the language toggle: detect the
// language, translate every [data-i18n] node, and keep <html lang> in sync.
import { setupPageI18n } from './shared/i18n.js';

setupPageI18n();
