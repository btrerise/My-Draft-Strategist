// Moved from js/mls/legacy.js (lineup/mls.js before 3A) in refactor chunk 3D: SHARED MARKET SETTINGS,
// TRADE ANALYZER SETTINGS, the simulator's settings toggle, and the apply*SettingsToUI functions
// for those three. The lineup optimizer's setting went to state.js, next to its State field.
import { State } from './state.js';
// --- SHARED MARKET SETTINGS (Scout tab + Roster tab's ROS auto-fetch) ---
// Both tabs have their own copy of these controls (different element IDs, prefixed "ros" on
// the Roster tab) so the user doesn't have to navigate to Scout just to configure them before
// auto-fetching ROS rankings. Single source of truth is State.marketSettings; every control's
// onchange calls updateMarketSetting(), which persists it and re-syncs BOTH tabs' controls so
// they never drift out of sync with each other.
export const updateMarketSetting = function(key, value) {
    State.marketSettings[key] = value;
    localStorage.setItem('mls_market_settings', JSON.stringify(State.marketSettings));
    applyMarketSettingsToUI();
};

// --- TRADE ANALYZER SETTINGS (Waiver Adjustment) ---
export const updateTradeSetting = function(key, value) {
    State.tradeSettings[key] = value;
    localStorage.setItem('mls_trade_settings', JSON.stringify(State.tradeSettings));
    applyTradeSettingsToUI();
};

// Just a persisted toggle -- unlike lineup/trade settings, nothing here needs to trigger a
// re-render on its own; it's only read the next time runMatchupSim actually runs.
export const updateSimSetting = function(key, value) {
    State.simSettings[key] = value;
    localStorage.setItem('mls_sim_settings', JSON.stringify(State.simSettings));
};

export function applySimSettingsToUI() {
    const toggleEl = document.getElementById('waiverInsightsToggle');
    if (toggleEl) toggleEl.checked = !!State.simSettings.waiverInsights;
}

export function applyTradeSettingsToUI() {
    const s = State.tradeSettings;
    const toggleEl = document.getElementById('tradeWaiverAdjustToggle');
    const valueWrap = document.getElementById('tradeWaiverValueWrap');
    const valueEl = document.getElementById('tradeWaiverAdjustValue');
    if (toggleEl) toggleEl.checked = !!s.waiverAdjustment;
    if (valueEl) valueEl.value = s.waiverAdjustmentValue;
    if (valueWrap) valueWrap.style.display = s.waiverAdjustment ? 'block' : 'none';
}

export function applyMarketSettingsToUI() {
    const s = State.marketSettings;
    const instances = [
        { source: 'marketSourceSelect', type: 'marketType', qbs: 'marketQbs', ppr: 'marketPpr', tep: 'marketTep', fcBlock: 'fantasycalcSpecificControls' },
        { source: 'rosMarketSourceSelect', type: 'rosMarketType', qbs: 'rosMarketQbs', ppr: 'rosMarketPpr', tep: 'rosMarketTep', fcBlock: 'rosFantasycalcSpecificControls' }
    ];

    instances.forEach(ids => {
        const sourceEl = document.getElementById(ids.source);
        const typeEl = document.getElementById(ids.type);
        const qbsEl = document.getElementById(ids.qbs);
        const pprEl = document.getElementById(ids.ppr);
        const tepEl = document.getElementById(ids.tep);
        const fcBlock = document.getElementById(ids.fcBlock);

        if (sourceEl) sourceEl.value = s.source;
        if (typeEl) typeEl.value = s.type;
        if (qbsEl) qbsEl.value = s.qbs;
        if (pprEl) pprEl.value = s.ppr;
        if (tepEl) tepEl.checked = s.tep;
        // The PPR dropdown and TEP toggle are FantasyCalc's; it's the only source since
        // refactor 7A removed LeagueLogs, so they always show.
        if (fcBlock) fcBlock.style.display = 'block';
    });

    const brandEl = document.getElementById('attributionBrand');
    const attrLink = document.getElementById('attributionLink');
    if (brandEl) brandEl.innerText = "FantasyCalc";
    if (attrLink) attrLink.href = "https://fantasycalc.com";
}
