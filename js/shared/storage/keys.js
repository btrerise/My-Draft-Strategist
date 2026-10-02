// --- STORAGE KEY REGISTRY ---
// Every localStorage key and IndexedDB database the three pages use, in one place. Added in
// refactor chunk 1B. MDS (/), MLS (/lineup/) and T-Score (/t-score/) share one origin and
// therefore one localStorage, so "which app owns this key" is decided by prefix -- see
// isMdsOwnedKey / isMlsOwnedKey below, which drive each app's Backup, Restore and reset.
//
// This is a list, not (yet) the source of truth for call sites: mds.js, mls.js, the banner
// helpers and the T-Score page still spell their keys inline. Never rename a key here or
// there -- users' saved data lives under these exact strings. A new key must start with its
// app's prefix, or it silently drops out of that app's backups.

// --- PREFIXES ---
export const MDS_PREFIX = 'ds_';                 // My Draft Strategist
export const MLS_PREFIXES = ['mds_season_', 'mls_']; // My Lineup Strategist (mds_season_* predates the mls_ prefix)

// --- KEYS THAT DON'T FOLLOW THEIR APP'S PREFIX ---
export const MDS_SHOW_HEADSHOTS = 'mds_show_headshots'; // MDS setting; backed up with MDS
// Written by MDS's "Send roster to Lineup Strategist", consumed (and removed) by MLS. A transient
// hand-off signal, not a setting, so neither app backs it up or restores it.
export const MDS_HANDOFF_ROSTER = 'mds_handoff_roster';

// --- EVERY KEY IN USE, BY OWNER ---
// Dynamic keys are listed as their prefix plus a <placeholder>.
export const STORAGE_KEYS = {
    mds: [
        'ds_active_draft_id', 'ds_adp_meta', 'ds_avoids', 'ds_bye_warnings', 'ds_darts',
        'ds_draftId', 'ds_draft_settings', 'ds_drafted', 'ds_drafts',
        'ds_drafts_premigration_backup', // left out of MDS backups (see exportMdsSettings), cleared by Hard Reset
        'ds_hide_guide_banner', 'ds_hide_install_banner', 'ds_hide_mls_banner',
        'ds_limits', 'ds_meta', 'ds_mobile_collapse_pref', 'ds_myTeam',
        'ds_players', 'ds_players_<draftId>', 'ds_raw_picks', 'ds_stacks', 'ds_storage_version',
        'ds_targets', 'ds_total_picks', 'ds_tscore', 'ds_username',
        MDS_SHOW_HEADSHOTS,
    ],
    mls: [
        'mds_season_active_league', 'mds_season_early_teams', 'mds_season_leagues',
        'mds_season_locks_map', 'mds_season_manual_bench', 'mds_season_manual_starters',
        'mds_season_market', 'mds_season_market_updated', 'mds_season_ros',
        'mds_season_ros_updated', 'mds_season_sos', 'mds_season_weekly',
        'mds_season_weekly_updated',
        'mls_autolock_overrides_map', 'mls_has_optimized', 'mls_has_seen_rankings_toast',
        'mls_hide_draft_banner', 'mls_hide_guide_banner', 'mls_hide_sleeper_sync_banner',
        'mls_lineup_rankings_stamps', 'mls_lineup_settings', 'mls_market_settings',
        'mls_power_settings', 'mls_ranking_sets_ros', 'mls_ranking_sets_weekly',
        'mls_show_headshots', 'mls_sim_settings', 'mls_sync_logs', 'mls_trade_settings',
        'mls_waiver_scan_settings',
    ],
    // In neither app's backup. The T-Score keys are written by the T-Score page
    // (mds_tscore_cache is read back by MDS for its T-Score column).
    unowned: [
        MDS_HANDOFF_ROSTER,
        'shared_sleeper_league_id', // legacy MDS -> MLS league-ID hand-off; MLS only removes it now
        'mds_tscore_cache', 'mds_tscore_cache_updated',
        'tscore_page_cache',
    ],
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
