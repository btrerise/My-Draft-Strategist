// Refactor chunk 6B: copies this browser's storage keys from their pre-6B names to today's
// (js/shared/storage/keyMigration.js) before any other module reads storage, and since 6C
// deletes the old copies. main.js imports this file first; keep it first.
import { migrateKeyNames, deleteOldKeyNames } from '../shared/storage/keyMigration.js';

migrateKeyNames('mls');
deleteOldKeyNames('mls');
