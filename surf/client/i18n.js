// Tiny i18n: English (default for the global CrazyGames audience) and Slovenian.

import { settings } from './settings.js';

const STR = {
  en: {
    tagline: 'Multiplayer surf. Hold the ramp, chase the flow.',
    play: 'Play online', practice: 'Practice', spectate: 'Spectate', vault: 'Knife Vault', inventory: 'Inventory', settings: 'Settings',
    name: 'Name', server: 'Server', online: 'online', offline: 'offline', players: 'players', connecting: 'Connecting…',
    offlineMode: 'Server unreachable - playing offline (local inventory).',
    resume: 'Resume', leave: 'Leave to menu', rtv: 'Vote to change map', joinSurf: 'Join the surf', spectateMode: 'Spectate',
    timeLeft: 'Time left', stage: 'Stage', speed: 'u/s', pb: 'PB', best: 'Server best', startZone: 'In start zone', running: 'Running', finished: 'Finished', ready: 'Leave the zone to start',
    voteTitle: 'Next map vote', extend: 'Extend +5 min', voteHint: 'Press 1-5 to vote', changing: 'Changing map to', rtvStatus: 'Map change requests',
    spectating: 'Spectating', freeCam: 'Free camera', firstPerson: 'First person', chase: 'Chase cam', specHint: 'LMB/RMB: next/prev player · SPACE: camera mode · J: join',
    noPlayers: 'Nobody is surfing yet', scoreboard: 'Scoreboard', ping: 'Ping', knife: 'Knife', status: 'Status',
    vaultTitle: 'THE GLIDE VAULT', collected: 'Collected', remaining: 'remaining', openCrate: 'Watch ad & open', openOffline: 'Open',
    vaultRule: 'Every knife + skin can be unlocked only once - no duplicates. The result is saved before the animation plays.',
    complete: 'Collection complete!', completeSub: 'You own every knife in the vault.', added: 'Added to inventory', newTag: 'NEW',
    equip: 'Equip', equipped: 'Equipped', inspect: 'Inspect', toInventory: 'Inventory', openAnother: 'Open another', skip: 'Skip',
    adFailed: 'The ad could not be shown. Please try again later (ad blockers prevent opening).', cooldown: 'Please wait a moment before the next crate',
    retry: 'Something went wrong. Nothing was lost - try again.',
    all: 'All', owned: 'Owned', missing: 'Missing', search: 'Search…', allModels: 'All models', allSkins: 'All skins', sortName: 'Sort: name', sortModel: 'Sort: model',
    locked: 'Locked', close: 'Close', reset: 'Reset view', light: 'Lighting',
    sens: 'Mouse sensitivity', invertY: 'Invert Y', fov: 'Field of view', master: 'Master volume', sfx: 'Effects volume', uiVol: 'Interface volume',
    bloom: 'Glow (bloom)', viewBob: 'Weapon bob', reduceMotion: 'Reduce motion & flashes', hudScale: 'HUD scale', showKeys: 'Show key overlay', quality: 'Graphics quality', language: 'Language',
    debug: 'Physics debug (F3)',
    controls: 'WASD move · SPACE jump · R restart · F inspect · TAB scores · V vote map · J spectate · ENTER chat · ESC menu',
    clickToPlay: 'Click to play', desktopOnly: 'GLIDEZONE needs a keyboard and mouse.',
    howTo: 'How to surf: drop onto a ramp, hold the strafe key towards the ramp (A or D) and steer with the mouse. Never press W on a ramp.',
    difficulty: ['', 'Beginner', 'Easy', 'Medium', 'Hard', 'Expert'], stages: 'stages', linear: 'Linear', staged: 'Staged', checkpoints: 'checkpoints', choose: 'Choose a map',
    login: 'Log in to keep your knives on every device',
    leaderboard: 'Leaderboard', overall: 'Overall', points: 'Points', time: 'Time', allTime: 'All time', thisWeek: 'This week',
    seasonEnds: 'season resets in', mapsDone: 'maps', lbEmpty: 'No times yet - be the first!', lbOffline: 'Leaderboard unavailable right now.',
    pointsHelp: '1000 points per map at par time, more when faster. Sum of your best runs.',
    chatPlaceholder: 'Say something (ENTER send · ESC close · /mute name)', chatIsOff: 'Chat is off', chatHide: 'Turn chat off', chatShow: 'Turn chat on',
    muted: 'Muted', unmuted: 'Unmuted', chatSetting: 'Show chat', checkpoint: 'Checkpoint',
    jumpHint: 'Glowing runways: hold SPACE to bunny-hop - without jumping you lose your speed and miss the next ramp.',
  },
  sl: {
    tagline: 'Večigralski surf. Drži rampo, lovi tok.',
    play: 'Igraj na strežniku', practice: 'Trening', spectate: 'Opazuj', vault: 'Trezor nožev', inventory: 'Inventar', settings: 'Nastavitve',
    name: 'Ime', server: 'Strežnik', online: 'povezan', offline: 'nedosegljiv', players: 'igralcev', connecting: 'Povezujem…',
    offlineMode: 'Strežnik ni dosegljiv - igraš brez povezave (lokalni inventar).',
    resume: 'Nadaljuj', leave: 'Nazaj v meni', rtv: 'Glasuj za menjavo mape', joinSurf: 'Pridruži se surfanju', spectateMode: 'Opazovanje',
    timeLeft: 'Preostali čas', stage: 'Etapa', speed: 'e/s', pb: 'Osebni rekord', best: 'Rekord strežnika', startZone: 'V začetni coni', running: 'Teče', finished: 'Končano', ready: 'Zapusti cono za začetek',
    voteTitle: 'Glasovanje za naslednjo mapo', extend: 'Podaljšaj +5 min', voteHint: 'Pritisni 1-5 za glas', changing: 'Menjava mape na', rtvStatus: 'Zahteve za menjavo',
    spectating: 'Opazuješ', freeCam: 'Prosta kamera', firstPerson: 'Prva oseba', chase: 'Kamera za igralcem', specHint: 'LMB/DMB: naslednji/prejšnji · PRESLEDNICA: način kamere · J: pridruži se',
    noPlayers: 'Nihče še ne surfa', scoreboard: 'Lestvica', ping: 'Ping', knife: 'Nož', status: 'Stanje',
    vaultTitle: 'TREZOR NOŽEV', collected: 'Zbranih', remaining: 'preostalih', openCrate: 'Oglej si oglas in odpri', openOffline: 'Odpri',
    vaultRule: 'Vsak nož s skinom lahko dobiš samo enkrat - brez podvojenih. Rezultat se shrani, preden se predvaja animacija.',
    complete: 'Zbirka je popolna!', completeSub: 'Imaš vse nože iz trezorja.', added: 'Dodano v inventar', newTag: 'NOVO',
    equip: 'Opremi', equipped: 'Opremljen', inspect: 'Ogled noža', toInventory: 'V inventar', openAnother: 'Odpri še enega', skip: 'Preskoči',
    adFailed: 'Oglasa ni bilo mogoče prikazati. Poskusi kasneje (blokator oglasov prepreči odpiranje).', cooldown: 'Počakaj trenutek pred naslednjim krejtom',
    retry: 'Prišlo je do napake. Nič ni izgubljeno - poskusi znova.',
    all: 'Vsi', owned: 'Zbrani', missing: 'Manjkajoči', search: 'Iskanje…', allModels: 'Vsi modeli', allSkins: 'Vsi skini', sortName: 'Razvrsti: ime', sortModel: 'Razvrsti: model',
    locked: 'Zaklenjeno', close: 'Zapri', reset: 'Ponastavi pogled', light: 'Osvetlitev',
    sens: 'Občutljivost miške', invertY: 'Obrni Y', fov: 'Vidno polje', master: 'Glavna glasnost', sfx: 'Glasnost učinkov', uiVol: 'Glasnost vmesnika',
    bloom: 'Sij (bloom)', viewBob: 'Nihanje noža', reduceMotion: 'Manj gibanja in bliskov', hudScale: 'Velikost HUD', showKeys: 'Prikaži tipke', quality: 'Kakovost grafike', language: 'Jezik',
    debug: 'Fizikalni debug (F3)',
    controls: 'WASD gibanje · PRESLEDNICA skok · R ponovno · F ogled noža · TAB lestvica · V glas za mapo · J opazuj · ENTER klepet · ESC meni',
    clickToPlay: 'Klikni za igro', desktopOnly: 'GLIDEZONE potrebuje tipkovnico in miško.',
    howTo: 'Kako surfati: spusti se na rampo, drži stransko tipko proti rampi (A ali D) in usmerjaj z miško. Na rampi nikoli ne pritiskaj W.',
    difficulty: ['', 'Začetniška', 'Lahka', 'Srednja', 'Težka', 'Ekspertna'], stages: 'etap', linear: 'Linearna', staged: 'Po etapah', checkpoints: 'checkpointov', choose: 'Izberi mapo',
    login: 'Prijavi se in ohrani nože na vseh napravah',
    leaderboard: 'Lestvica', overall: 'Skupno', points: 'Točke', time: 'Čas', allTime: 'Vseh časov', thisWeek: 'Ta teden',
    seasonEnds: 'sezona se ponastavi čez', mapsDone: 'map', lbEmpty: 'Še ni časov - bodi prvi!', lbOffline: 'Lestvica trenutno ni na voljo.',
    pointsHelp: '1000 točk na mapo pri par času, več ob hitrejšem času. Seštevek tvojih najboljših voženj.',
    chatPlaceholder: 'Napiši sporočilo (ENTER pošlji · ESC zapri · /mute ime)', chatIsOff: 'Klepet je izklopljen', chatHide: 'Izklopi klepet', chatShow: 'Vklopi klepet',
    muted: 'Utišan', unmuted: 'Ponovno slišan', chatSetting: 'Prikaži klepet', checkpoint: 'Checkpoint',
    jumpHint: 'Svetleče steze: drži PRESLEDNICO za zaporedne skoke - brez skakanja izgubiš hitrost in ne dosežeš naslednje rampe.',
  },
};

export function lang() {
  // English is the default; Slovenian only when chosen in the settings
  if (settings.lang && STR[settings.lang]) return settings.lang;
  return 'en';
}

export function t(key) {
  const L = STR[lang()];
  return L[key] ?? STR.en[key] ?? key;
}
