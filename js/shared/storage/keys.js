// --- STORAGE KEY REGISTRY ---
// Every localStorage key and IndexedDB database the three pages use, in one place. Added in
// refactor chunk 1B. MDS (/), MLS (/lineup/) and T-Score (/t-score/) share one origin and
// therefore one localStorage, so "which app owns this key" is decided by prefix -- see
// isMdsOwnedKey / isMlsOwnedKey below, which drive each app's Backup, Restore and reset.
//
// Since refactor chunk 6A this file is the only place a key name is spelled: js/mds/*,
// js/mls/*, js/shared/* and the T-Score page read them from KEYS (the T-Score page's classic
// inline script through window.KEYS, which js/shared/globals.js assigns). The exceptions are
// js/boot.js, which can't import and keeps its own copy of the two ownership filters
// (tests/unit/bootKeyFilters.test.mjs checks them against this file), and the banner keys
// written as data-storage-key="..." text in index.html and lineup/index.html (listed in
// docs/refactor/LOG.md, 6A). Never rename a key casually -- users' saved data lives under
// these exact strings. A new key must start with its app's prefix, or it silently drops out
// of that app's backups.

// --- PREFIXES ---
export const MDS_PREFIX = 'ds_';                 // My Draft Strategist
export const MLS_PREFIXES = ['mds_season_', 'mls_']; // My Lineup Strategist (mds_season_* predates the mls_ prefix)

// --- EVERY KEY IN USE, BY OWNER ---
export const KEYS = {
    // My Draft Strategist (/). All start with MDS_PREFIX except showHeadshots.
    mds: {
        activeDraftId: 'ds_active_draft_id',
        adpMeta: 'ds_adp_meta',
        avoids: 'ds_avoids',
        byeWarnings: 'ds_bye_warnings',
        darts: 'ds_darts',
        draftId: 'ds_draftId',
        draftSettings: 'ds_draft_settings',
        drafted: 'ds_drafted',
        drafts: 'ds_drafts',
        draftsPremigrationBackup: 'ds_drafts_premigration_backup', // left out of MDS backups (see exportMdsSettings), cleared by Hard Reset
        hideGuideBanner: 'ds_hide_guide_banner',
        hideInstallBanner: 'ds_hide_install_banner',
        hideMlsBanner: 'ds_hide_mls_banner',
        limits: 'ds_limits',
        meta: 'ds_meta',
        mobileCollapsePref: 'ds_mobile_collapse_pref',
        myTeam: 'ds_myTeam',
        players: 'ds_players',
        rawPicks: 'ds_raw_picks',
        stacks: 'ds_stacks',
        storageVersion: 'ds_storage_version',
        targets: 'ds_targets',
        totalPicks: 'ds_total_picks',
        tscore: 'ds_tscore',
        username: 'ds_username',
        showHeadshots: 'mds_show_headshots', // MDS setting that doesn't follow the prefix; backed up with MDS
    },
    // My Lineup Strategist (/lineup/). Each starts with one of MLS_PREFIXES.
    mls: {
        activeLeague: 'mds_season_active_league',
        earlyTeams: 'mds_season_early_teams',
        leagues: 'mds_season_leagues',
        locksMap: 'mds_season_locks_map',
        manualBench: 'mds_season_manual_bench',
        manualStarters: 'mds_season_manual_starters',
        market: 'mds_season_market',
        marketUpdated: 'mds_season_market_updated',
        ros: 'mds_season_ros',
        rosUpdated: 'mds_season_ros_updated',
        sos: 'mds_season_sos',
        weekly: 'mds_season_weekly',
        weeklyUpdated: 'mds_season_weekly_updated',
        autolockOverridesMap: 'mls_autolock_overrides_map',
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
    },
    // In neither app's backup.
    shared: {
        // Written by MDS's "Send roster to Lineup Strategist", consumed (and removed) by MLS. A
        // transient hand-off signal, not a setting, so neither app backs it up or restores it.
        handoffRoster: 'mds_handoff_roster',
        sleeperLeagueId: 'shared_sleeper_league_id', // legacy MDS -> MLS league-ID hand-off; MLS only removes it now
    },
    // Written by the T-Score page, in neither app's backup. cache is read back by MDS for its
    // T-Score column.
    tscore: {
        cache: 'mds_tscore_cache',
        cacheUpdated: 'mds_tscore_cache_updated',
        pageCache: 'tscore_page_cache',
    },
};

// --- DYNAMIC KEYS ---
// One MDS player pool per draft profile (see js/mds/storage.js, DRAFT PLAYER-POOL STORAGE).
export const MDS_DRAFT_POOL_PREFIX = 'ds_players_';
export const mdsDraftPoolKey = (draftId) => MDS_DRAFT_POOL_PREFIX + draftId;

// --- KEYS THAT DON'T FOLLOW THEIR APP'S PREFIX ---
// Names kept from 1B; the ownership filters below use them.
export const MDS_SHOW_HEADSHOTS = KEYS.mds.showHeadshots;
export const MDS_HANDOFF_ROSTER = KEYS.shared.handoffRoster;

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

// --- BACKUP / RESTORE OWNERSHIP ---
// The key filters each app's Backup, Restore, Hard Reset / Factory Reset use. Moved here from
// getMdsOwnedKeys() in js/mds.js and getMlsOwnedKeys() in lineup/mls.js, unchanged. js/boot.js's
// rescue backup keeps its own copy of these two filters on purpose: it has to work when no
// module has loaded, so keep it in step by hand if these ever change.
export function isMdsOwnedKey(k) {
    return (k.startsWith(MDS_PREFIX) || k === MDS_SHOW_HEADSHOTS) && k !== MDS_HANDOFF_ROSTER;
}

export function isMlsOwnedKey(k) {
    return (k.startsWith(MLS_PREFIXES[0]) || k.startsWith(MLS_PREFIXES[1]))
        && k !== MDS_HANDOFF_ROSTER;
}
