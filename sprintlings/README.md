# Sprintlings

Izvirna arkadna dirkalna igra z **divjezahodnim** vzdušjem in **pogledom od strani**: štiri risane živali v kavbojskih oblačilih (lisica Rusty, zajec Jackie, medved Bruno, rakun Bandit, bik Buck, volk Lobo) samodejno tečejo od leve proti desni. Igralec skače (drži = višji skok), se spušča skozi lesene ploščadi, izbira zgornjo ali spodnjo pot, pobira zaboje z nagradami in zlate kepe ter nasprotnikom nastavlja dinamit, katran in rakete. Dirka traja 60–90 sekund. Igra je v angleščini in pripravljena za **CrazyGames** in **GameMonetize**; ima tudi samostojno spletno različico z lastnim strežnikom.

Grafika je v celoti narisana v kodi (Canvas2D). Liki so lastne izvedbe v slogu podanih referenčnih slik (antropomorfne živali), ne kopije. Glasba v meniju in zvoki skoka, udarca in odklepanja so posnetki, ki jih je priložil naročnik (z ozadja Pixabay: *tatamusic – game music*, *freesound_community – jump sound*, *universfield – punch impact hit*, *universfield – achievement unlock*; Pixabay Content License dovoljuje komercialno uporabo v igrah brez navedbe vira – pred objavo preveri licenco na strani posameznega posnetka). Ostali zvoki in glasba med dirko so sintetizirani.

## Hitri začetek

```bash
cd sprintlings
npm install
npm run dev          # http://localhost:5173 (razvojni način s TESTNIMI oglasi)
npm run server       # neobvezno: strežnik na http://localhost:8787 (računi, nakupi v sandboxu)
```

Če strežnik teče, se razvojna različica samodejno poveže nanj (napredek in nakupi so potem shranjeni na strežniku). Brez strežnika igra deluje z lokalnim profilom.

| Ukaz | Opis |
| --- | --- |
| `npm run dev` | razvojni strežnik Vite |
| `npm run build` | samostojna različica brez oglasov in nakupov → `dist/standalone` |
| `npm run build:crazygames` | različica za CrazyGames → `dist/crazygames` |
| `npm run build:gamemonetize` | različica za GameMonetize → `dist/gamemonetize` |
| `npm run build:web` | spletna različica za lasten strežnik → `dist/web` |
| `npm run server` | strežnik (JSON datoteka v `server/data`) |
| `npm run server:pg` | strežnik s PostgreSQL (`DATABASE_URL`) |
| `npm test` | enotski, igralni, ekonomski, oglasni in strežniški testi (Vitest) |
| `npm run test:e2e` | testi uporabniškega vmesnika v brskalniku (Playwright) |
| `npm run typecheck` | preverjanje tipov odjemalca in strežnika |

E2E testi potrebujejo Playwright: `npm i -D playwright && npx playwright install chromium`.

Preverjanje prog: `npm run validate:tracks` (vse proge in 30 remiksov s »popolnim« botom) in `npx tsx scripts/segment-check.ts` (vsak odsek posebej, pri vseh fazah časovnih pasti).
Test PostgreSQL se zažene, ko je nastavljen `TEST_DATABASE_URL` (prazna testna baza, npr. `postgres://sprint:sprint@localhost/sprintlings_test`).

## Upravljanje

| Dejanje | Tipkovnica / miška | Dotik | Igralni plošček |
| --- | --- | --- | --- |
| Skok (drži = višji skok) | Space, W, ↑, levi klik | gumb SKOK, tap, poteg navzgor | A |
| Spust skozi ploščad / drsenje / hitrejši padec | S, ↓ (drži) | gumb ▼, poteg navzdol | D-pad / palica navzdol |
| Predmet (powerup) | E, D, →, levi Shift, desni klik | gumb predmeta, poteg naprej | X / RB |
| Posebnost živali | Q, F, ← | okrogel gumb z živaljo | Y / LB |
| Hitri klepet | 1–4 | gumbi Howdy!/Yeehaw!/Oops!/GG! | – |
| Premor | Escape, P | gumb ⏸ | Start |

Tipke je mogoče spremeniti v Nastavitvah. Pritisk skoka točno ob »START« da startni pospešek.

## Objava na portalih

### CrazyGames
1. `npm run build:crazygames`
2. Zapakiraj **vsebino** mape `dist/crazygames` (datoteka `index.html` mora biti v korenu ZIP-a) in jo naloži v CrazyGames Developer Portal.
3. Preizkusi v orodju za predogled/QA na portalu.

Integracija (HTML5 SDK v3): `SDK.init`, `loadingStart/Stop` ob nalaganju, `gameplayStart/Stop` (dirka, premor, cilj), `happytime` ob zmagi, `midgame` oglasi samo na naravnih prekinitvah po rezultatih (nikoli med dirko), `rewarded` samo po izrecnem pritisku in potrditvi, zvok se med oglasom utiša, napredek se shrani v **SDK data modul** (oblak za prijavljene uporabnike), upoštevana je nastavitev `muteAudio`, smerne tipke/preslednica ne drsajo strani. Nakupi s pravim denarjem in zunanje povezave so na portalu izklopljeni.

### GameMonetize
1. Nastavi ID igre: `VITE_GAMEMONETIZE_GAME_ID=<tvoj id> npm run build:gamemonetize` (ali v datoteki `.env.gamemonetize`).
2. Zapakiraj vsebino `dist/gamemonetize` in jo naloži; nato »Verify Game« in »Request activation«.

Dokumentirani SDK ponuja samo vmesne video oglase (`sdk.showBanner()`) in dogodka `SDK_GAME_PAUSE`/`SDK_GAME_START`; ob njiju igra utiša zvok in se ustavi. Oglasi z nagrado niso del dokumentiranega API-ja, zato so gumbi zanje na tem portalu skriti.

> Opomba: SDK-ja sta implementirana po javni dokumentaciji, a v tem okolju ju ni bilo mogoče preizkusiti v živo (omrežje do portalov je bilo blokirano). Pred objavo ju preveri v portalovem testnem orodju.

## Arhitektura

```
src/
  game/        RaceManager (deterministična simulacija), Track, TrackSegment, TrackManager, TrackValidator, RaceReplay, RaceVerifier, RaceResults
  player/      liki, pasivne lastnosti, PlayerMovement (fizika), PlayerStateMachine
  physics/     CollisionLayers, CollisionResolver, GroundDetection, PhysicsWorld
  obstacles/   tipi ovir, register ovir, ročno izdelani odseki (HazardPatterns), sestavljanje prog
  abilities/   5 sposobnosti, projektili, statusni učinki
  ai/          AIController, DifficultyProfile, HazardPlanner (planer s simulacijo naprej)
  economy/     Profile, Wallet, RewardLedger, RewardCalculator, InventoryService, EconomyService
  progression/ ravni/XP, naloge, dosežki, dnevne nagrade, sezonska steza
  shop/        katalog kozmetike, ponudbe trgovine, pravice, odjemalec za nakupe
  ads/         AdProvider, pravila oglasov, potek oglasov z nagrado
  platform/    CrazyGames, GameMonetize, samostojna različica (razvojni testni oglasi so v ločenem modulu)
  persistence/ IndexedDB/localStorage, profil z varnostno kopijo, migracije shem, LocalAuthority, nastavitve
  network/     ServerAuthority (HTTP), MatchmakingClient (WebSocket), protokol
  render/      Canvas2D: liki (CharacterRig + MonsterAnimator), kozmetika, teren in ovire (WorldPainter),
               paralaksno ozadje, delci, stranska kamera, meni, sličice
  audio/       sintetizirani zvočni učinki in proceduralna glasba (Web Audio)
  input/       tipkovnica (spremenljive tipke), miška, dotik, igralni plošček
  ui/          vsi zasloni (DOM), HUD, prevodi EN/SL
  app/         Application, RaceController, StateMachine, SceneManager
server/        Node.js HTTP + WebSocket strežnik (uporablja ISTO kodo simulacije in ekonomije)
tests/         unit, gameplay, economy, ads, purchases, integration, e2e
```

Ključne odločitve:

- **Deterministična simulacija s fiksnim korakom (1/60 s).** Ista koda teče v brskalniku, v AI-planerju in na strežniku. Dirko je mogoče natančno ponoviti iz semena in dnevnika vnosov, zato strežnik nagrade izračuna iz **lastne ponovne simulacije**, nikoli iz rezultata, ki ga sporoči odjemalec.
- **Arkadna 2D-fizika namesto togih teles.** Za odzivno in predvidljivo upravljanje (coyote time 100 ms, medpomnilnik skoka 120 ms, variabilna višina skoka, spust skozi enosmerne ploščadi, stopnice do 0,3 u brez skoka) ter determinizem je igralna fizika lastna. Three.js in Rapier sta bila v prvi (3D) različici; po prehodu na pogled od strani nista več potrebna, zato je igra precej manjša (~85 KB gzip JS).
- **AI tekmeci** uporabljajo isti fizikalni korak in planer, ki preizkusi več kratkih zaporedij dejanj. Težavnost spreminja samo hitrost odločanja, natančnost in pogostost napak. Isti planer z »popolnim« profilom preverja **prehodnost prog**.
- **Proge**: šest ročno izdelanih prog (Dusty Gulch – prerija, Red Rock Run – kanjon, Moonlit Mine – nočni rudnik, Sunset Mesa – sončni zahod, Frosty Pass – zasnežen prelaz, Eagle Ridge – visoke pečine; vsaka ~640–665 u oz. 68–85 s) iz 28 ročno oblikovanih odsekov s pravili sosednosti (prepadi, stopnice, strehe, mize, zgornje poti po deskah, vzmeti, kaktusi, kotaleči se sodi), plus dnevni »Daily Trail«, ki se pred uporabo preveri (in ob neuspehu zamenja). `scripts/segment-check.ts` vsak časovno odvisen odsek preveri pri 16 različnih fazah, da je pošten za vsak čas prihoda.
- **Animacija**: vsak lik je vektorski »rig« (glava z ušesi/rogovi, gobček, oči, srajca, telovnik, ruta, pas, hlače, škornji, rep, sklepne noge in roke). Tek je sinhroniziran s hitrostjo, skoki in pristanki uporabljajo vzmeti za raztezanje/stiskanje, ušesa in rep se pozibavajo glede na pospešek, liki mežikajo, gledajo kamor gredo, menjajo izraze (omotica, strah, veselje) in ob zmagi pokažejo izbrano čustveno gesto obrnjeni proti kameri.
- **Pošteno gibanje**: če v zraku zadeneš rob stopnice tik pod vrhom, te igra dvigne nanj (ne pade več skozi tla); po zadetku sledi kratka utripajoča zaščita, zato te zaporedne ovire (npr. kotaleči se sodi) ne morejo ujeti v zanko.
- **Pasti nasprotnikov** (dinamit, katran, raketa) so namenoma kričečih barv z belim robom, utripajočim rdečim obročem in opozorilnim znakom, da se ne zlijejo z okolico.
- **Skrinje** (Strongbox iz trgovine, sezone ali koledarja) se odprejo z animacijo in zvokom.
- **Plezanje in več nivojev**: v vsak zid, v katerega se zaletiš, se lik samodejno povzpne (počasneje, kot če nanj skočiš). Oblaki so platforme, na katere lahko stopiš; zgornje poti imajo pospeševalnike in se izognejo blatu in kaktusom, zato se skok gor splača. Nizke viseče table zahtevajo drsenje. Novi odseki: cliff_climb, cloud_route, tower_climb, sky_bridge, sign_alley.
- **Sodi**: vsak tekmovalec sproži samo en svoj sod; vidi ga samo on in samo njega lahko zadene.
- **Predmeti potečejo** po 10 sekundah, če jih ne uporabiš (trak na gumbu se prazni).
- **Vidnost ovir**: vse nevarne ovire in pasti tekmecev imajo utripajoč rdeč sij, talne ovire še rumeno-črn trak; ozadje je rahlo zamegljeno, da ospredje izstopa.
- **Posebnosti živali** (lasten gumb s časom ohlajanja, `Q`/`F`/`←`, gamepad Y): Rusty – Quick Getaway (kratek pospešek), Jackie – Double Hop (skok v zraku), Bruno – Iron Hide (ščit 2,5 s), Bandit – Pickpocket (ukrade predmet bližnjemu tekmecu), Buck – Stampede (naskok, ki podre tekmece), Lobo – Howl (upočasni bližnje tekmece). Uporabljajo jih tudi računalniški tekmeci.
- **Predmeti**: Spur Dash, Tin Star Shield, Homing Rocket, Dynamite, Tar Spill ter novi Lasso (takoj omami najbližjega tekmeca spredaj), Thunder Cloud (po opozorilu udari vodilnega) in Bomb (vržena v loku, eksplodira ob pristanku, pusti ožgano sled). Pred raketami se lahko izmakneš z drsenjem.
- **Predstavitev dirke**: odštevanje z imenom proge, navijači na startu in cilju, ime igralca na startu, hitri klepet (`1`–`4` ali gumbi: Howdy!/Yeehaw!/Oops!/GG!, tekmeci odgovarjajo), kill feed, po prihodu v cilj gledanje preostalih tekmecev (gumb Skip).
- **Lestvica**: trofeje (1. +30, 2. +16, 3. −4, 4. −10, odhod −12, Duos zmaga ekipe +24; vadba ne šteje) in šest lig od Tenderfoot do Legend of the West; vsaka žival ima svojo raven (Animal Level, do 20). Rezultati prikažejo Animal Rank in Animal Level, meni pa ligo s pregledom vseh lig. Pred dirko je zaslon »Riding into … in« s karticami igralcev, trofejami, delitvijo VS pri Duos in nasvetom.
- **Tekmovalci se ne zaletavajo drug v drugega** (tečejo drug skozi drugega, kot je običajno v tem žanru), zato te tekmec ne more poriniti v prepad. Tekmeci zunaj zaslona so označeni s puščicami in razdaljo.

## Ekonomija in monetizacija

- Valute: **Coins** (igranje), **Gems** (premium; tudi iz dosežkov, ravni, koledarja, sezone), **XP** (ni naprodaj).
- Nagrade po dirki: 25 kovancev za zaključek (tudi zadnje mesto), +20/12/6 za mesta 1–3, bonus za bleščice (omejen), 5 XP + 3 XP za zmago. Vse vrednosti so v `src/config/EconomyConfig.ts`.
- Vsak ekonomski dogodek ima enoličen ID; ponovljena zahteva ne ustvari valute (`RewardLedger`). Strežnik hrani polni revizijski dnevnik.
- Kozmetika nikoli ne vpliva na hitrost, skoke ali hitbox. Liki imajo samo majhne situacijske pasivne lastnosti in se odklenejo s kovanci ali ravnijo (nikoli samo z dragulji).
- Skrinja (Acorn Chest) je samo za kovance; verjetnosti, vsebina in pravilo za podvojene predmete so prikazani pred nakupom. Pravi denar ne kupuje naključnih nagrad.
- Oglasi z nagrado: samo po pritisku in potrditvi, z vnaprej prikazano nagrado in omejitvami (največ 3 dnevno, 1 na dirko, razmik 45 s). Zaprt, preskočen ali neuspešen oglas ne da nagrade.
- Vmesni oglasi: nikoli med dirko, ne v prvih 3 dirkah, največ vsake 3 dirke in ne pogosteje kot vsake 3 minute. Nakup »No Interruptions« odstrani samo vmesne oglase.
- Nakupi s pravim denarjem (samo spletna različica z lastnim strežnikom): checkout pri ponudniku → podpisan webhook → strežnik dodeli (idempotentno po ID-ju transakcije). Obravnavani so preklic, neuspeh, podvojeni webhooki, povračila, obnovitev pravic in plačilo, ki se zaključi, ko je igralec že zaprl igro. Cene prikazuje ponudnik; sandbox cene so vedno označene **TEST**.

## Strežnik

Spremenljivke okolja:

| Spremenljivka | Privzeto | Opis |
| --- | --- | --- |
| `PORT` | 8787 | vrata |
| `STORAGE` | `file` | `memory`, `file` ali `postgres` |
| `DATABASE_URL` | – | povezava PostgreSQL (migracije se izvedejo ob zagonu) |
| `PAYMENT_PROVIDER` | `sandbox` | `sandbox`, `stripe` ali `none` |
| `SANDBOX_WEBHOOK_SECRET` | razvojna vrednost | skrivnost za podpis sandbox webhookov |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_<PRODUCT_ID>` | – | Stripe (npr. `STRIPE_PRICE_GEMS_500=price_...`) |
| `PUBLIC_URL` | `http://localhost:PORT` | javni naslov strežnika |
| `CORS_ORIGINS` | `*` | dovoljeni izvori, ločeni z vejico |
| `VERIFY_IN_WORKERS` | `true` | preverjanje dirk v ločenih nitih |

Za spletno gradnjo nastavi `VITE_SERVER_URL` na naslov strežnika (privzeto isti izvor).

Glavne poti: `POST /api/auth/guest`, `GET /api/profile`, `POST /api/race/start`, `POST /api/race/finish`, `POST /api/shop/buy`, `POST /api/quests/claim`, `POST /api/daily/claim`, `POST /api/season/claim`, `POST /api/ads/reward`, `GET /api/purchases/offers`, `POST /api/purchases/checkout`, `GET /api/purchases/:id`, `POST /api/purchases/restore`, `POST /api/purchases/webhook/:provider`, `GET /api/ledger`, WebSocket `/ws`.

## Razvojne faze

| Faza | Stanje |
| --- | --- |
| A – igriv prototip | ✅ |
| B – kakovost igranja (ovire, sposobnosti, animacije, zvok, uravnoteženje) | ✅ (uravnoteženje je začetno; potrebno je testiranje z igralci) |
| C – osnovna ekonomija (Coins, XP, nagrade, inventar, trgovina) | ✅ |
| D – napredovanje (naloge, dosežki, dnevne nagrade, sezona) | ✅ |
| E – monetizacija | ✅ za CrazyGames/GameMonetize oglase in lasten strežnik s sandbox plačili; glej omejitve |
| F – spletno večigralstvo | 🟡 strežnik (čakalna vrsta, avtoritativna soba, posnetki stanja) in odjemalec obstajata in sta testirana, **v uporabniškem vmesniku še nista na voljo** |
| G – optimizacija in izdaja | 🟡 grafične nastavitve Low/Medium/High, deljenje kode, e2e testi; potrebno je testiranje zmogljivosti na pravih napravah |

## Izrecno neimplementirano ali nepreverjeno

- **Spletne dirke v UI**: strežniška soba in `MatchmakingClient` obstajata, a odjemalec še nima prikaza dirke iz strežniških posnetkov in napovedovanja vnosov. Igra zato ponuja samo dirke proti računalniškim tekmecem.
- **Stripe**: ponudnik je napisan po dokumentiranem API-ju, a ni bil preizkušen z resničnim računom Stripe (preizkusi v testnem načinu Stripe pred uporabo).
- **Nakupi na CrazyGames** (njihova integracija Xsolla) niso povezani; nakupi so na portalih izklopljeni.
- **Oglasi z nagrado na strežniku**: portali ne ponujajo potrditve strežnik–strežnik, zato strežnik zaupa povratnemu klicu SDK-ja, a uveljavlja omejitve in enkratne žetone.
- **Lokalni profil** (portali, samostojna različica) ni zaščiten pred spreminjanjem na napravi; dirke se sicer preverijo s ponovno simulacijo, a na napravi. Uporabniški vmesnik to jasno navaja. Nakupi s pravim denarjem zato prek lokalnega profila nikoli niso ponujeni.
- **Prijava z računom** (OAuth, povezava računa portala): samo gostujoči računi z žetonom.
- **Analitika**: strežnik dogodke samo sprejme in prešteje; brez soglasja se nič ne pošlje.
- **Zmogljivost** je bila v tem okolju merjena samo v brezglavem Chromiumu s programskim rasterizatorjem (~45–50 sličic/s pri 1280×720); na napravah z grafičnim pospeševanjem je pričakovano 60. Simulacija s tremi AI tekmeci porabi okoli 0,2–0,7 ms na korak na CPU.
- **Jezik**: igra je samo v angleščini (slovenski prevod je bil na željo odstranjen).
- **Sezona 2** ima samo osnovne (generirane) nagrade.
- **Klani, prijatelji, klepet med igralci, zabave (party) in prave spletne Duos tekme** niso izvedljivi brez delujočega spletnega strežnika za igralce v živo; partner in tekmeci v Duos so računalniški. Trofeje tekmecev v predsobi so samo prikaz.

## Licenca in viri

Koda je del tega repozitorija. Uporabljene knjižnice: Fredoka in Rye (SIL Open Font License, prek @fontsource), ws (MIT), pg (MIT). Grafika je v celoti narisana v kodi; zvočni posnetki so v `src/assets/audio`.
