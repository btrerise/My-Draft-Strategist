// Refactor chunk 6B: copies this browser's storage keys from their pre-6B names to today's
// (js/shared/storage/keyMigration.js) before any other module reads storage. main.js imports
// this file first; keep it first.
import { migrateKeyNames } from '../shared/storage/keyMigration.js';

migrateKeyNames('mls');
