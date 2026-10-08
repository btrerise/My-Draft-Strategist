// --- STORAGE KEY REGISTRY ---
// Every localStorage key and IndexedDB database the three pages use, in one place. Added in
// refactor chunk 1B. MDS (/), MLS (/lineup/) and T-Score (/t-score/) share one origin and
// therefore one localStorage, so "which app owns this key" is decided by prefix -- see
// isMdsOwnedKey / isMlsOwnedKey below, which drive each app's Backup, Restore and reset.
//
// Since refactor chunk 6A this file is the only place a key name is spelled: js/mds/*,
// js/mls/*, js/shared/* and js/tscore/* read them from KEYS. The exceptions are
// js/boot.js, which can't import and keeps its own copy of the ownership filters
// (tests/unit/bootKeyFilters.test.mjs checks them against this file), and the banner keys
// written as data-storage-key="..." text in index.html and lineup/index.html (listed in
// docs/refactor/LOG.md, 6A). Never rename a key casually -- users' saved data lives under
// these exact strings. A new key must start with its app's prefix, or it silently drops out
// of that app's backups.
//
// Refactor chunk 6B gave each app one prefix (mds_ for Draft Strategist, mls_ for Lineup
// Strategist). The names from before that are in OLD NAMES below, with the rules that turn
// them into today's; js/shared/storage/keyMigration.js uses them.

// --- PREFIXES ---
export const MDS_PREFIX = 'mds_'; // My Draft Strategist
export const MLS_PREFIX = 'mls_'; // My Lineup Strategist

// --- EVERY KEY IN USE, BY OWNER ---
export const KEYS = {
    // My Draft Strategist (/). All start with MDS_PREFIX.
    mds: {
        activeDraftId: 'mds_active_draft_id',
        adpMeta: 'mds_adp_meta',
        avoids: 'mds_avoids',
        byeWarnings: 'mds_bye_warnings',
        darts: 'mds_darts',
        draftId: 'mds_draftId',
        draftSettings: 'mds_draft_settings',
        drafted: 'mds_drafted',
        drafts: 'mds_drafts',
        draftsPremigrationBackup: 'mds_drafts_premigration_backup', // left out of MDS backups (see exportMdsSettings), cleared by Hard Reset
        hideGuideBanner: 'mds_hide_guide_banner',
        hideInstallBanner: 'mds_hide_install_banner',
        hideMlsBanner: 'mds_hide_mls_banner',
        limits: 'mds_limits',
        meta: 'mds_meta',
        mobileCollapsePref: 'mds_mobile_collapse_pref',
        myTeam: 'mds_myTeam',
        players: 'mds_players',
        rawPicks: 'mds_raw_picks',
        stacks: 'mds_stacks',
        storageVersion: 'mds_storage_version',
        targets: 'mds_targets',
        totalPicks: 'mds_total_picks',
        tscore: 'mds_tscore',
        username: 'mds_username',
        showHeadshots: 'mds_show_headshots', // the one MDS key whose name 6B didn't change
        keyNamesVersion: 'mds_key_names_version', // set once keyMigration.js has copied the old names (6B)
    },
    // My Lineup Strategist (/lineup/). All start with MLS_PREFIX.
    mls: {
        activeLeague: 'mls_active_league',
        earlyTeams: 'mls_early_teams',
        leagues: 'mls_leagues',
        locksMap: 'mls_locks_map',
        manualBench: 'mls_manual_bench',
        manualStarters: 'mls_manual_starters',
        market: 'mls_market',
        marketUpdated: 'mls_market_updated',
        ros: 'mls_ros',
        rosUpdated: 'mls_ros_updated',
        sos: 'mls_sos',
        sosUpdated: 'mls_sos_updated', // when SoS was last uploaded or saved, ms (improvements S7)
        sosReversed: 'mls_sos_reversed', // '1' when your SoS files rank 1 = hardest, flipped on import (improvements S7)
        weekly: 'mls_weekly',
        weeklyUpdated: 'mls_weekly_updated',
        autolockOverridesMap: 'mls_autolock_overrides_map',
        bestAvailableCollapsed: 'mls_best_available_collapsed', // '1' while the Dashboard's Best Available card is collapsed (improvements S5)
        bestAvailableDismissed: 'mls_best_available_dismissed', // players dismissed from the Best Available card, per league, this NFL week (improvements S5)
        hasOptimized: 'mls_has_optimized',
        hasSeenRankingsToast: 'mls_has_seen_rankings_toast',
        hideDraftBanner: 'mls_hide_draft_banner',
        hideGuideBanner: 'mls_hide_guide_banner',
        hideSleeperSyncBanner: 'mls_hide_sleeper_sync_banner',
        lineupRankingsStamps: 'mls_lineup_rankings_stamps',
        lineupSettings: 'mls_lineup_settings',
        marketSettings: 'mls_market_settings',
        powerSettings: 'mls_power_settings',
        rankingSetsRos: 'mls_ranking_sets_ros',
        rankingSetsWeekly: 'mls_ranking_sets_weekly',
        showHeadshots: 'mls_show_headshots',
        simSettings: 'mls_sim_settings',
        syncLogs: 'mls_sync_logs',
        tradeSettings: 'mls_trade_settings',
        waiverScanSettings: 'mls_waiver_scan_settings',
        keyNamesVersion: 'mls_key_names_version', // set once keyMigration.js has copied the old names (6B)
    },
    // In neither app's backup.
    shared: {
        // Written by MDS's "Send roster to Lineup Strategist", consumed (and removed) by MLS. A
        // transient hand-off signal, not a setting, so neither app backs it up or restores it.
        handoffRoster: 'shared_handoff_roster',
        sleeperLeagueId: 'shared_sleeper_league_id', // legacy MDS -> MLS league-ID hand-off; MLS only removes it now
    },
    // Written by the T-Score page, in neither app's backup. cache is read back by MDS for its
    // T-Score column.
    tscore: {
        cache: 'tscore_cache',
        cacheUpdated: 'tscore_cache_updated',
        pageCache: 'tscore_page_cache',
        keyNamesVersion: 'tscore_key_names_version', // set once keyMigration.js has copied the old names (6B)
    },
};

// --- DYNAMIC KEYS ---
// One MDS player pool per draft profile (see js/mds/storage.js, DRAFT PLAYER-POOL STORAGE).
export const MDS_DRAFT_POOL_PREFIX = 'mds_players_';
export const mdsDraftPoolKey = (draftId) => MDS_DRAFT_POOL_PREFIX + draftId;

// Every key above as a flat list per owner. Dynamic keys are listed with a <placeholder>.
export const STORAGE_KEYS = {
    mds: [...Object.values(KEYS.mds), mdsDraftPoolKey('<draftId>')],
    mls: Object.values(KEYS.mls),
    unowned: [...Object.values(KEYS.shared), ...Object.values(KEYS.tscore)],
};

// IndexedDB databases (not part of any backup -- both are re-fetchable caches).
export const IDB_DATABASES = {
    lineupStrategist: { name: 'LineupStrategistDB', stores: ['sleeperData'] }, // js/shared/storage/idb.js
    sleeperPlayerMap: { name: 'mls_sleeper_cache', stores: ['players'] },      // js/shared/api/sleeper.js (read by both apps since 2C)
};

// --- OLD NAMES (before refactor chunk 6B) ---
// Until 6B, MDS's keys started with ds_, MLS's with mds_season_ or mls_, and the hand-off and
// T-Score cache keys with mds_. This is the permanent old -> new table: keyMigration.js copies
// a browser's old keys to their new names on load, and Restore renames the keys in old backup
// files. The old keys stay in localStorage until a later release deletes them (LOG, 6B), so the
// filters below still have to tell them apart from today's mds_ keys. Apart from js/boot.js,
// this is the only place an old name is spelled.
export const LEGACY_MDS_PREFIX = 'ds_';
export const LEGACY_MLS_PREFIX = 'mds_season_';
export const LEGACY_KEY_RENAMES = {
    // Whole names, checked first.
    exact: {
        mds_handoff_roster: KEYS.shared.handoffRoster,
        mds_tscore_cache: KEYS.tscore.cache,
        mds_tscore_cache_updated: KEYS.tscore.cacheUpdated,
    },
    // Then prefixes: the rest of the name stays (ds_players_<draftId> -> mds_players_<draftId>).
    prefixes: [
        [LEGACY_MDS_PREFIX, MDS_PREFIX],
        [LEGACY_MLS_PREFIX, MLS_PREFIX],
    ],
};

// The new name of an old key. Any other key, a current name included, comes back unchanged.
export function renamedKey(k) {
    if (Object.prototype.hasOwnProperty.call(LEGACY_KEY_RENAMES.exact, k)) return LEGACY_KEY_RENAMES.exact[k];
    for (const [from, to] of LEGACY_KEY_RENAMES.prefixes) {
        if (k.startsWith(from)) return to + k.slice(from.length);
    }
    return k;
}

export const isLegacyKey = (k) => renamedKey(k) !== k;

// --- BACKUP / RESTORE OWNERSHIP ---
// The key filters each app's Backup, Restore, Hard Reset / Factory Reset use. Moved here from
// getMdsOwnedKeys() and getMlsOwnedKeys() (now js/mds/backup.js and js/mls/backup.js) in 1B. js/boot.js's
// rescue backup keeps its own copy of the *OrLegacy* filters on purpose: it has to work when no
// module has loaded, so keep it in step by hand if these ever change
// (tests/unit/bootKeyFilters.test.mjs checks it).
//
// isMdsOwnedKey / isMlsOwnedKey: the app's keys under today's names -- what Backup exports. MLS's
// old mds_season_* keys and the old hand-off and T-Score names also start with mds_, so MDS's
// filter has to leave every old name out.
export function isMdsOwnedKey(k) {
    return k.startsWith(MDS_PREFIX) && !isLegacyKey(k);
}

export function isMlsOwnedKey(k) {
    return k.startsWith(MLS_PREFIX);
}

// The app's keys under today's names or their old ones -- what Restore, Hard Reset and Factory
// Reset clear, so an old copy can't outlive a reset.
export const isMdsOwnedOrLegacyKey = (k) => isMdsOwnedKey(k) || k.startsWith(LEGACY_MDS_PREFIX);
export const isMlsOwnedOrLegacyKey = (k) => isMlsOwnedKey(k) || k.startsWith(LEGACY_MLS_PREFIX);
