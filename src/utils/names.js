const aliases = new Map(Object.entries({
  'atletico mineiro': 'atletico-mg',
  'atletico mg': 'atletico-mg',
  'clube atletico mineiro': 'atletico-mg',
  'athletico paranaense': 'athletico-pr',
  'athletico pr': 'athletico-pr',
  'club athletico paranaense': 'athletico-pr',
  'red bull bragantino': 'bragantino',
  'rb bragantino': 'bragantino',
  'bragantino': 'bragantino',
  'vasco da gama': 'vasco',
  'cr vasco da gama': 'vasco',
  'gremio': 'gremio',
  'gremio fbpa': 'gremio',
  'sao paulo': 'sao-paulo',
  'sao paulo fc': 'sao-paulo',
  'fluminense fc': 'fluminense',
  'flamengo': 'flamengo',
  'cr flamengo': 'flamengo',
  'palmeiras': 'palmeiras',
  'se palmeiras': 'palmeiras',
  'corinthians': 'corinthians',
  'sc corinthians paulista': 'corinthians',
  'internacional': 'internacional',
  'sc internacional': 'internacional',
  'botafogo': 'botafogo',
  'botafogo fr': 'botafogo',
  'bahia': 'bahia',
  'ec bahia': 'bahia',
  'fortaleza': 'fortaleza',
  'fortaleza ec': 'fortaleza',
  'cruzeiro': 'cruzeiro',
  'cruzeiro ec': 'cruzeiro',
  'santos': 'santos',
  'santos fc': 'santos',
  'vitoria': 'vitoria',
  'ec vitoria': 'vitoria',
  'sport recife': 'sport',
  'sport club do recife': 'sport',
  'ceara': 'ceara',
  'ceara sc': 'ceara',
  'juventude': 'juventude',
  'ec juventude': 'juventude',
  'mirassol': 'mirassol',
  'mirassol fc': 'mirassol',
  'coritiba': 'coritiba',
  'coritiba fbc': 'coritiba',
  'chapecoense': 'chapecoense',
  'associacao chapecoense de futebol': 'chapecoense'
}));

export function normalizeName(input = '') {
  const base = input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(fc|sc|ec|ac|afc|club|clube|futebol|football|associacao|sociedade|sport|esporte)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
  return aliases.get(base) || base.replace(/\s+/g, '-');
}

export function sameTeam(a, b) {
  return normalizeName(a) === normalizeName(b);
}
