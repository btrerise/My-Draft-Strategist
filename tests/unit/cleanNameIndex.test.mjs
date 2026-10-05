// getCleanNameToIdIndex and sleeperPosByName (js/mls/players.js): which Sleeper entry a clean name
// resolves to when several share it (refactor 9C). Before 9C the index kept the first entry in the map
// (Sleeper's numeric ids put the oldest first, often a retired namesake) and sleeperPosByName the last.
// Now both use isPreferredSleeperEntry: a fantasy position, then an NFL team, then the lower
// search_rank; a full tie keeps the first entry. getSleeperMetaByName (scout/waivers.js) and the
// rookie badge's name fallback use it too; tests/mls-player-lookup.spec.mjs checks those in the page.
//
// players.js is loaded with its app imports stubbed (helpers/playersEnv.mjs); normalizeName is real.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadPlayers } from './helpers/playersEnv.mjs';
import { normalizeName } from '../../js/shared/names.js';
import { fantasyPosition } from '../../js/mls/constants.js';

const entry = (first, last, position, fantasy_positions, team, search_rank, extra = {}) =>
    ({ first_name: first, last_name: last, position, fantasy_positions, team, search_rank, ...extra });

// The six names 7B found, with the fields this index reads copied from Sleeper's live map (2026-10-04).
const LIVE_COLLISIONS = {
    94: entry('Kyle', 'Williams', 'DT', ['DL'], null, 9999999),
    638: entry('Kyle', 'Williams', 'WR', ['WR'], null, 9999999),
    2212: entry('Josh', 'Allen', 'G', ['OL'], null, 9999999),
    2967: entry('Kaleb', 'Johnson', 'G', ['OL'], null, 9999999),
    4634: entry('Kenneth', 'Walker', 'WR', ['WR'], null, 9999999),
    4961: entry('DJ', 'Moore', 'CB', ['DB'], null, 9999999),
    4983: entry('DJ', 'Moore', 'WR', ['WR'], 'BUF', 49),
    4984: entry('Josh', 'Allen', 'QB', ['QB'], 'BUF', 3),
    7203: entry('Antonio', 'Williams', 'RB', ['RB'], null, 615),
    7437: entry('Kyle', 'Williams', 'WR', ['WR'], null, 9999999),
    8151: entry('Kenneth', 'Walker', 'RB', ['RB'], 'KC', 18),
    12504: entry('Kaleb', 'Johnson', 'RB', ['RB'], 'GB', 173),
    12547: entry('Kyle', 'Williams', 'WR', ['WR'], 'NE', 195),
    13301: entry('Antonio', 'Williams', 'WR', ['WR'], 'WAS', 156),
};

// One name per rule.
const RULES = {
    // Fantasy position beats a team, and a better search_rank.
    101: entry('Pos', 'Rule', 'WR', ['WR'], null, 9999999),
    102: entry('Pos', 'Rule', 'CB', ['DB'], 'CIN', 5),
    // No fantasy_positions: position decides.
    111: entry('Pos', 'Fallback', 'C', undefined, 'NYJ', 9999999),
    112: entry('Pos', 'Fallback', 'K', undefined, null, 9999999),
    // Both fantasy: team beats no team, even against a better search_rank.
    201: entry('Team', 'Rule', 'RB', ['RB'], null, 5),
    202: entry('Team', 'Rule', 'RB', ['RB'], 'NYJ', 9999999),
    // Neither fantasy: team still decides.
    211: entry('Team', 'Lineman', 'OT', ['OL'], null, 10),
    212: entry('Team', 'Lineman', 'G', ['OL'], 'KC', 9999999),
    // Same on both: the lower search_rank wins; a missing rank loses to any number.
    301: entry('Rank', 'Rule', 'WR', ['WR'], 'MIA', 300),
    302: entry('Rank', 'Rule', 'WR', ['WR'], 'DAL', 40),
    311: entry('Rank', 'Missing', 'RB', ['RB'], 'SEA'),
    312: entry('Rank', 'Missing', 'RB', ['RB'], 'TB', 9999999),
    // Full tie: the first entry stays, as before 9C.
    401: entry('Full', 'Tie', 'WR', ['WR'], 'CHI', 120),
    402: entry('Full', 'Tie', 'WR', ['WR'], 'GB', 120),
    403: entry('Full', 'Tie', 'WR', ['WR'], 'MIN', 120),
    // No first name: skipped, as before.
    501: entry('', 'Nameless', 'QB', ['QB'], 'BUF', 1),
    // A team defense (string id, after the numeric ones in the map's order) and a unique name.
    BUF: entry('Buffalo', 'Bills', 'DEF', ['DEF'], 'BUF', 9999999),
    601: entry('Only', 'One', 'G', ['OL'], null, 9999999),
};

// Listed outside the fantasy positions but scored at one (fantasyPosition, constants.js), from Sleeper's
// live map (2026-10-05).
const TWO_WAY = {
    11060: entry('Robert', 'Burns', 'RB', ['RB'], null, 9999999),
    11260: entry('Robert', 'Burns', 'FB', ['RB'], 'CHI', 9999999),
    12530: entry('Travis', 'Hunter', 'DB', ['DB', 'WR'], 'JAX', 103),
    // A namesake listed at a fantasy position but with no team loses to the two-way player on one.
    90001: entry('Travis', 'Hunter', 'WR', ['WR'], null, 9999999),
};

const lookup = (index, name) => index[normalizeName(name)];

test('the six names 7B found resolve to the active fantasy player', async () => {
    const { mod } = await loadPlayers(LIVE_COLLISIONS);
    const index = await mod.getCleanNameToIdIndex();
    assert.equal(lookup(index, 'Josh Allen'), '4984');
    assert.equal(lookup(index, 'DJ Moore'), '4983');
    assert.equal(lookup(index, 'D.J. Moore'), '4983');
    assert.equal(lookup(index, 'Kenneth Walker III'), '8151');
    assert.equal(lookup(index, 'Kaleb Johnson'), '12504');
    assert.equal(lookup(index, 'Kyle Williams'), '12547');
    assert.equal(lookup(index, 'Antonio Williams'), '13301');
});

test('each preference rule, and a full tie keeps the first entry', async () => {
    const { mod } = await loadPlayers(RULES);
    const index = await mod.getCleanNameToIdIndex();
    assert.equal(lookup(index, 'Pos Rule'), '101', 'fantasy position beats a team and a better rank');
    assert.equal(lookup(index, 'Pos Fallback'), '112', 'position when fantasy_positions is missing');
    assert.equal(lookup(index, 'Team Rule'), '202', 'both fantasy: team beats no team');
    assert.equal(lookup(index, 'Team Lineman'), '212', 'neither fantasy: team beats no team');
    assert.equal(lookup(index, 'Rank Rule'), '302', 'lower search_rank wins');
    assert.equal(lookup(index, 'Rank Missing'), '312', 'a missing search_rank loses to a number');
    assert.equal(lookup(index, 'Full Tie'), '401', 'full tie keeps the first entry');
    assert.equal(lookup(index, 'Buffalo Bills'), 'BUF');
    assert.equal(lookup(index, 'Only One'), '601', 'a unique name keeps its only entry, lineman or not');
    assert.equal(lookup(index, 'Nameless'), undefined, 'an entry with no first name is skipped');
    // Return shape: clean name -> one id string.
    assert.ok(Object.values(index).every(id => typeof id === 'string'));
    assert.equal(Object.keys(index).length, 9);
});

test('sleeperPosByName gives the position of the player the index picks, for every name', async () => {
    for (const map of [LIVE_COLLISIONS, RULES, TWO_WAY]) {
        const { mod } = await loadPlayers(map);
        const index = await mod.getCleanNameToIdIndex();
        await mod.ensureSleeperPosByName();
        assert.deepEqual(Object.keys(mod.sleeperPosByName).sort(), Object.keys(index).sort());
        for (const [clean, id] of Object.entries(index)) {
            assert.equal(mod.sleeperPosByName[clean], fantasyPosition(map[id]) || 'UNK', clean);
        }
    }
    // Before 9C the last entry in the map won here: with the CB after the WR, DJ Moore was a 'CB'.
    const { mod } = await loadPlayers({ 4983: LIVE_COLLISIONS[4983], 9000: LIVE_COLLISIONS[4961] });
    await mod.ensureSleeperPosByName();
    assert.equal(mod.sleeperPosByName[normalizeName('DJ Moore')], 'WR');
});

test('a two-way player or fullback counts as his fantasy position, in the index and the position lookup', async () => {
    const { mod } = await loadPlayers(TWO_WAY);
    const index = await mod.getCleanNameToIdIndex();
    await mod.ensureSleeperPosByName();
    assert.equal(lookup(index, 'Travis Hunter'), '12530');
    assert.equal(mod.sleeperPosByName.travishunter, 'WR');
    // The CHI fullback, scored at RB, beats the teamless RB (both fantasy, so the team decides).
    assert.equal(lookup(index, 'Robert Burns'), '11260');
    assert.equal(mod.sleeperPosByName.robertburns, 'RB');
});

test('isPreferredSleeperEntry is strict: an entry never beats itself or its equal', async () => {
    const { mod } = await loadPlayers({});
    const qb = LIVE_COLLISIONS[4984];
    assert.equal(mod.isPreferredSleeperEntry(qb, qb), false);
    assert.equal(mod.isPreferredSleeperEntry({ ...qb }, qb), false);
    assert.equal(mod.isPreferredSleeperEntry(qb, LIVE_COLLISIONS[2212]), true);
    assert.equal(mod.isPreferredSleeperEntry(LIVE_COLLISIONS[2212], qb), false);
});

test('a later entry only replaces the kept one when it is strictly better, whatever the map order', async () => {
    // Same players as the Josh Allen pair, with the QB first: still the QB.
    const { mod } = await loadPlayers({ 4984: LIVE_COLLISIONS[4984], 9000: LIVE_COLLISIONS[2212] });
    assert.equal(lookup(await mod.getCleanNameToIdIndex(), 'Josh Allen'), '4984');
});

test('the index is built once per session; a failed load is retried', async () => {
    const { mod, env } = await loadPlayers(LIVE_COLLISIONS);
    const first = mod.getCleanNameToIdIndex();
    assert.equal(mod.getCleanNameToIdIndex(), first);
    await first;
    assert.equal(await mod.getCleanNameToIdIndex(), await first);
    assert.equal(env.fetches, 1);

    const failing = await loadPlayers(null);
    failing.env.getMap = async () => { failing.env.fetches++; throw new Error('offline'); };
    await assert.rejects(failing.mod.getCleanNameToIdIndex(), /offline/);
    failing.env.getMap = async () => { failing.env.fetches++; return LIVE_COLLISIONS; };
    assert.equal(lookup(await failing.mod.getCleanNameToIdIndex(), 'Josh Allen'), '4984');
    assert.equal(failing.env.fetches, 2);
});
