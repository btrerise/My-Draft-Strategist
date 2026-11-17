// The saved Sleeper player file keeps only the fields in js/shared/api/playerMapSlim.js (improvements F26). A field the
// code reads but the list leaves out would be missing on every player, silently, so this fails when js/ reads one of
// Sleeper's fields that isn't kept. Checked by name: Sleeper's distinctive field names (with an underscore, or not a
// plain English word); plain words (height, weight, number, status, team, metadata, sport, college, hashtag,
// competitions…) also mean other things in the code, so they can't be told apart this way.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PLAYER_FIELDS, slimPlayerMap } from '../../js/shared/api/playerMapSlim.js';

// Every field of a player in api.sleeper.app/v1/players/nfl (November 2026).
const SLEEPER_FIELDS = ['active', 'age', 'birth_city', 'birth_country', 'birth_date', 'birth_state', 'college',
    'competitions', 'depth_chart_order', 'depth_chart_position', 'espn_id', 'fantasy_data_id', 'fantasy_positions',
    'first_name', 'full_name', 'gsis_id', 'hashtag', 'height', 'high_school', 'injury_body_part', 'injury_notes',
    'injury_start_date', 'injury_status', 'kalshi_id', 'last_name', 'metadata', 'news_updated', 'number', 'oddsjam_id',
    'opta_id', 'pandascore_id', 'player_id', 'player_shard', 'position', 'practice_description',
    'practice_participation', 'rotowire_id', 'rotoworld_id', 'search_first_name', 'search_full_name',
    'search_last_name', 'search_rank', 'sport', 'sportradar_id', 'stats_id', 'status', 'swish_id', 'team', 'team_abbr',
    'team_changed_at', 'weight', 'yahoo_id', 'years_exp'];
const DISTINCTIVE = SLEEPER_FIELDS.filter(f => f.includes('_'));

const JS = fileURLToPath(new URL('../../js', import.meta.url));
const files = (dir) => readdirSync(dir).flatMap(n => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : (p.endsWith('.js') ? [p] : []);
});

test('every Sleeper player field the code reads is kept', () => {
    const dropped = DISTINCTIVE.filter(f => !PLAYER_FIELDS.includes(f));
    const read = [];
    for (const file of files(JS)) {
        if (file.endsWith('playerMapSlim.js')) continue;
        const src = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
        for (const f of dropped) {
            if (new RegExp(`\\.${f}\\b|\\[['"]${f}['"]\\]|\\b${f}\\s*[,}:]`).test(src)) read.push(`${file.slice(JS.length + 1)}: ${f}`);
        }
    }
    assert.deepEqual(read, [], 'Add these to PLAYER_FIELDS (and bump PLAYER_FIELDS_VERSION) in js/shared/api/playerMapSlim.js');
});

test('slimPlayerMap keeps the listed fields of every player, and nothing else', () => {
    const raw = {
        '4046': { player_id: '4046', first_name: 'Patrick', last_name: 'Mahomes', position: 'QB', team: 'KC', injury_status: null,
            college: 'Texas Tech', height: '74', espn_id: 3139477, metadata: { x: 1 }, fantasy_positions: ['QB'] },
        'KC': { player_id: 'KC', first_name: 'Kansas City', last_name: 'Chiefs', position: 'DEF', team: 'KC' },
    };
    assert.deepEqual(slimPlayerMap(raw), {
        '4046': { player_id: '4046', first_name: 'Patrick', last_name: 'Mahomes', position: 'QB', team: 'KC', injury_status: null, fantasy_positions: ['QB'] },
        'KC': { player_id: 'KC', first_name: 'Kansas City', last_name: 'Chiefs', position: 'DEF', team: 'KC' },
    });
});
