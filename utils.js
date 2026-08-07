// --- SHARED UTILITIES ---

function normalizeName(name) {
    if (!name) return "";
    let n = String(name)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z]/g, '')
        .replace(/(jr|sr|iii|ii|iv|v)$/, ''); 

    const aliasMap = {
        'kennygainwell': 'kennethgainwell',
        'gabedavis': 'gabrieldavis',
        'joshpalmer': 'joshuapalmer',
        'mitchtrubisky': 'mitchelltrubisky',
        'tankdell': 'nathanieldell',
        'hollywoodbrown': 'marquisebrown',
        'scottymiller': 'scottmiller',
        'djchark': 'djcharkjr',
        'jeffwilson': 'jefferywilson',
        'nicholassingleton': 'nicksingleton',
        'kennethwalker': 'kenwalker'
    };

    return aliasMap[n] || n;
}

function isNameMatch(name1, name2) {
    if (!name1 || !name2) return false;
    let n1 = normalizeName(name1);
    let n2 = normalizeName(name2);
    
    if (n1 === n2) return true;

    const aliasMap = {
        'kennygainwell': 'kennethgainwell',
        'gabedavis': 'gabrieldavis',
        'joshpalmer': 'joshuapalmer',
        'mitchtrubisky': 'mitchelltrubisky',
        'tankdell': 'nathanieldell',
        'hollywoodbrown': 'marquisebrown',
        'scottymiller': 'scottmiller',
        'djchark': 'djcharkjr',
        'jeffwilson': 'jefferywilson',
        'nicholassingleton': 'nicksingleton',
        'kennethwalker': 'kenwalker'
    };

    if (aliasMap[n1] === n2 || aliasMap[n2] === n1) return true;
    if (aliasMap[n1] && aliasMap[n1] === aliasMap[n2]) return true;

    return false;
}
