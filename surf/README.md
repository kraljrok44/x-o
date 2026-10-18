# GLIDEZONE – večigralski surf za CrazyGames

Izvirna spletna igra, navdihnjena s Counter-Strike surfom: drsenje po nagnjenih rampah, zračno
krmiljenje (air-strafe), časovne proge po etapah, večigralski strežnik z glasovanjem za mape,
opazovalni način in trezor nožev (case opening), ki se odpre z ogledom video oglasa.

Vsa geometrija, modeli nožev, skini, zvoki in imena so **izvirni in proceduralno generirani** –
v projektu ni nobenih sredstev iz Counter-Strike ali drugih iger.

## Kaj je v igri

| Področje | Izvedba |
|---|---|
| Fizika | Source-slog gibanja: fiksni korak 100 Hz, trenje, pospeševanje na tleh, air-accelerate (150) z omejitvijo 30, sweep-and-slide trki kvadra s konveksnimi brushi + robni »bevel« ravnini (brez ramp bugov). Deterministična – ista koda teče na strežniku in v brskalniku. |
| Mape | 6 izvirnih map (začetniška → težka), 3–5 etap, zavite rampe na vsaki etapi, enostranske rampe, **skakalni odseki** (vsaj eden na mapo), teleporti, checkpointi, start/cilj cone. Vsako mapo samodejni bot prevozi v testih; test tudi preveri, da skakalnih odsekov ni mogoče preiti brez skakanja. |
| Skakalni odseki | Svetleča ravna steza in nato širok prepad do naslednje rampe. Trenje na stezi pobere hitrost, razen če igralec drži PRESLEDNICO (zaporedni skoki brez trenja) – samo s to hitrostjo preskoči prepad. |
| Lestvica | Skupna lestvica točk (1000 točk na mapo pri par času, več ob hitrejšem času) + najboljši časi za vsako mapo, »vseh časov« in »ta teden« (sezona se ponastavi v ponedeljek ob 9:00 UTC, kot pri CrazyGames). Rekorde shranjuje strežnik, igralci s CrazyGames računom so označeni (CG). |
| Večigralski način | Avtoritativni Node.js strežnik (WebSocket), napovedovanje na klientu + usklajevanje, interpolacija drugih igralcev, zaščita pred speed-hackom (proračun ukazov). |
| Glasovanje | Po 10 minutah na mapi glasovanje (4 mape + »podaljšaj +5 min«), predčasno, ko ≥ 50 % trenutnih igralcev pritisne **V** (rock-the-vote). Prazen strežnik zamenja mapo brez glasovanja. |
| Opazovalni način | Prva oseba (vidiš igralčev nož in hitrost/čas), kamera za igralcem, prosta kamera. **J** vklop/izklop, **LMB/DMB** menjava igralca, **SPACE** način kamere. |
| Trezor nožev | 15 izvirnih modelov × 33 skinov = **428 zbirateljskih predmetov** (izračunano iz matrike združljivosti). Vsak krejt: video oglas → strežnik izbere in **shrani** predmet, ki ga igralec še nima → šele nato animacija odpiranja (preskočljiva). Brez podvajanj, idempotentne zahteve, zaščita pred dvojnim klikom. |
| Nož med igro | Opremljen nož je viden v prvi osebi (animacije: izvlek, nihanje, pregled **F**, zamah **LMB**) in v rokah avatarja za druge igralce. |
| Merek | Samo ena pikica na sredini zaslona. |
| Takojšen začetek | Igra se začne brez menija in brez klika (tipkovnica deluje takoj, miška po prvem kliku). Ob prvem obisku se ob strani pokažejo kontrole. |
| Telefon | Leva četrtina zaslona = A, druga četrtina = D, desna polovica = pogled; prst na desni sam hodi do rampe in skače. |
| Duh rekorda | Strežnik posname pot rekordne vožnje (20 Hz) in jo predvaja sinhrono s tvojo vožnjo kot prosojnega surferja s sledjo (**G**). **H** skrije druge igralce (igralci se med sabo ne zaletavajo). |
| XP in nivoji | Krivulja do nivoja 99: 40 XP prvi prevoz, 80 navaden, 160 osebni rekord, 500 rekord mape; nagrada se podvoji vsakih 14 nivojev; vsak 10. nivo brezplačen krejt (brez oglasa); vojaški čin ob imenu se dvigne vsakih 10 nivojev. |
| CrazyGames | `happytime` ob končani mapi, nov rekord mape v klepetu vseh sob. |
| HUD | Hitrost, čas proge, etapa, osebni rekord, rekord strežnika, preostali čas mape, glasovanje, dogodki, lestvica (**TAB**), fizikalni debug (**F3**). |
| Nastavitve | Občutljivost miške, FOV, glasnosti (glavna/učinki/vmesnik), bloom, nihanje noža, manj gibanja/bliskov, velikost HUD, kakovost, jezik (EN/SL). |

### Malenkost drugačno od originala
- **Flow rings** – svetleči obroči med rampami, ki enkrat na vožnjo dodajo hitrost.
- Samodejni skok (auto-hop) ob držanju preslednice.
- Trezor brez naključnih »skoraj zadetkov« – animacija samo predstavi že shranjen rezultat, vsak predmet dobiš največ enkrat.
- Izvirne družine nožev (Ranger, Lancer, Warden, Crescent, Moth, Flicker, Hook, Tracker, Scimitar, Cleaver, Twin Fangs, Switch, Needle, Raptor, Grizzly) in izvirni skini (Abyss Flow faze, Bloodstone, Jade Flow, Sunset Melt, Candy Marble, Heat Temper, Folded Damascus, Gilded Relic …).

### Mape
Vsaka mapa traja od 1:20 do 2:20 (validacijski bot), težavnost je največ **Tier 3** in je zapisana v imenu (T1/T2/T3).
Elementi:
- **90° obrati z obvezno menjavo strani** – naslednja rampa leži prečno na smer, obstaja samo njena stran, obrnjena proti tebi: v zraku zavij (strafe), pristani in drži drugo tipko. Puščica nad rampo kaže smer.
- **Enostranske rampe** in menjave strani med rampami.
- **Speed check** – dolg prepad z rdečo cono smrti spodaj; tabla nad prepadom in HUD (rdeče/zeleno) kažeta zahtevano hitrost.
- **Okno** – stena čez prepad z eno odprtino na liniji; zadeneš jo s pravo višino in smerjo.
- **Ozek koridor** – ozka enostranska rampa s stekleno streho (headcheck) in zunanjo steno.
- **Drop** – globok padec na široko rampo spodaj.
- Skakalne steze (bunny hop), flow ringi.

| Mapa | Vrsta | Čas bota* | Posebnosti |
|---|---|---|---|
| Aurora Dawn (T1) | po etapah (5) | 1:22 | prvi 90° obrati, veliko okno, nizek speed check (900) |
| Frostbyte (T1) | linearna (5) | 1:30 | enostranske stene, dvojni obrat, okna |
| Jade Sanctum (T2) | linearna (5) | 1:37 | stekleni koridor, drop, speed check 1050/1100 |
| Neon Drift (T2) | po etapah (6) | 1:32 | dvojni obrat, drop, okna, speed checki |
| Ember Core (T2) | linearna (5) | 1:31 | samo enostranske rampe, koridor, speed check 1150 |
| Void Garden (T3) | po etapah (6) | 1:36 | ozke rampe, koridorji, majhna okna, strogi speed checki |
| Skyforge Gauntlet (T3) | linearna (7) | 2:17 | vsi elementi v eni dolgi progi |

\* Validacijski bot vozi enakomerno in ne pospešuje s strafanjem; dober igralec je okoli 15 % hitrejši. Testi preverijo, da bot prevozi vse mape brez padca, da speed check pri 72 % zahtevane hitrosti ne prepusti in pri 115 % prepusti.

### Klepet
- **ENTER** ali **T** odpre klepet, ENTER pošlje, ESC zapre. Klepet je majhen v spodnjem levem kotu, sporočila po nekaj sekundah zbledijo.
- Izklop: gumb »Turn chat off« v vrstici klepeta, ukaz `/hide` ali v nastavitvah. `/mute ime` utiša igralca.
- Moderacija na strežniku (odjemalec je ne more obiti): kletvice in žaljivke (angleščina + slovenščina, tudi zakrite: f.u.c.k, fuuuck, sh1t), povezave, e-pošta, telefonske številke in vabila na druge platforme se odstranijo; omejitev hitrosti pisanja in samodejni 30 s premor ob spamu; neprimerna imena igralcev se zamenjajo.
- Ko kdorkoli odpre krejt (tudi iz menija), se v klepetu vseh strežnikov izpiše, kateri nož je dobil. `rtv` v klepetu zahteva glasovanje za mapo.

## Zagon

Potrebuješ Node.js 20+.

```bash
cd surf
npm install
npm run build      # zgradi klienta v dist/
npm start          # strežnik + statične datoteke na http://localhost:8081
npm run package    # release/glidezone-crazygames.zip + release/glidezone-server.zip
npm test           # 57 testov: fizika, mape (bot prevozi vse), krejti, glasovanje, soba
```

Brez strežnika (npr. ob odprtju `dist/index.html` ali če strežnik ni dosegljiv) igra preklopi v
**offline način**: ista avtoritativna soba teče v brskalniku, inventar se shrani lokalno.

**CrazyGames lestvica:** CrazyGames dovoli eno lestvico na igro, funkcija je na voljo samo povabljenim igram. Ko dobiš API ključ, ga nastavi v `CG_LEADERBOARD_API_KEY`: strežnik bo skupne točke igralcev, prijavljenih s CrazyGames računom, sproti (v paketih do 100) pošiljal na strežniški API CrazyGames. Naslov endpointa lahko po potrebi spremeniš s `CG_LEADERBOARD_URL`. Lestvica v igri deluje tudi brez ključa.

Spremenljivke strežnika: `PORT` (8081), `HOST` (127.0.0.1 – za dostop iz omrežja nastavi `0.0.0.0`), `DATA_DIR` (./data – profili in rekordi), `ALLOWED_ORIGINS`
(npr. `crazygames.com,crazygames.si` – omeji WebSocket povezave), `START_MAP`, `ROOM_NAME`.

## Objava na CrazyGames

1. **Strežnik**: namestitev na obstoječi Oracle strežnik (poleg Fightstorma) je opisana v
   [`deploy/NAVODILA.md`](deploy/NAVODILA.md) (`deploy/add-game.sh`, posodobitve z `deploy/update.sh`).
2. Klient se poveže na `wss://glidezone-rok.duckdns.org/ws` (`client/index.html`; na localhost
   uporabi isti strežnik, s katerega je naložen, `?server=` v URL-ju pa ga lahko zamenja).
3. `npm run package` in naloži `release/glidezone-crazygames.zip` kot HTML5 igro. Isti ZIP velja
   za **Basic** in **Full** launch: igra ob zahtevi za oglas prebere napako SDK-ja. Koda
   `adsDisabledBasicLaunch` (Basic launch, oglasi izklopljeni) pomeni, da igralec nagrado dobi
   brez oglasa. V Full launchu nagrado da samo do konca ogledan video; vsaka druga napaka
   (`unfilled`, `adblock`, prekinjen oglas, blokiran SDK) pomeni brez nagrade.
4. CrazyGames SDK v3 je že vključen (`index.html`). Uporablja se:
   - `ad.requestAd('rewarded')` – vsak krejt (Basic launch: nagrada brez oglasa; simulirani oglas je samo za localhost);
   - `ad.requestAd('midgame')` – ob naravnem premoru menjave mape, največ 1× na 3 minute (v Basic launchu se ne zahteva več, ko SDK sporoči izklopljene oglase);
   - `game.loadingStart/Stop`, `game.gameplayStart/Stop`, `game.happytime` (ob odprtju krejta);
   - `user.getUser / getUserToken / showAuthPrompt` – prijavljenim igralcem se inventar veže na
     CrazyGames račun (strežnik preveri RS256 žeton z javnim ključem CrazyGames), gostom pa na
     naključni žeton v brskalniku.

## Arhitektura

```
surf/
  shared/            koda, ki teče na strežniku IN v brskalniku
    config.js        vse fizikalne in igralne konstante (en sam vir)
    brush.js         konveksni brushi, bevel ravnine, gradnja ramp
    collision.js     sweep kvadra skozi svet (trace), prostorska mreža
    movement.js      fizika gibanja igralca
    sim.js           korak simulacije + sprožilniki (start, checkpoint, teleport, ring, cilj, padec) + časomer
    maps/            graditelj map in katalog 6 map
    catalog.js       modeli, skini, matrika združljivosti, zbirateljski ID-ji
    crate.js         odpiranje brez podvajanj (transakcija, idempotenca, cooldown)
    vote.js          glasovanje / rock-the-vote / podaljšanje
    room.js          avtoritativna soba (ukazi, posnetki stanja, glasovanje, krejti, rekordi)
    bot.js           bot za validacijo map in ozadje menija
  server/            Node strežnik (HTTP + WebSocket), datotečna shramba, preverjanje CrazyGames žetona
  client/            Three.js klient: igra, napovedovanje, upodabljanje map, noži, skini, viewmodel,
                     avatarji, zvok (WebAudio sinteza), HUD, meniji, trezor, inventar
  test/              node:test testi
  tools/build.mjs    esbuild → dist/
```

Ključne odločitve:
- **Fizika je ena koda** (`shared/`), zato napovedovanje na klientu natančno sovpada s strežnikom.
- **Vizualna in kolizijska geometrija izhajata iz istih podatkov** (brushi), zato ni nevidnih ovir.
- **Rezultat krejta se zapiše pred animacijo**; animacija je čista funkcija časa, preskok ne more spremeniti predmeta.

## Kontrole
`WASD` gibanje · `SPACE` skok · `R` ponovni začetek · `F` ogled noža · `LMB` zamah ·
`TAB` lestvica · `V` glas za menjavo mape · `1–5` glasovanje · `J` opazovalni način ·
`H` skrij igralce · `G` duh rekorda · `Q`/`E` obračanje brez miške · `ESC` meni. (Fizikalni debug samo z `?debug` v URL-ju.)

Surfanje: spusti se na rampo, drži stransko tipko proti rampi (A ali D) in usmerjaj z miško. Na rampi ne pritiskaj W.

## Opombe in naslednji koraki
- Oglasov strežnik ne more preveriti (CrazyGames ne ponuja strežniške potrditve), zato strežnik
  omeji odpiranje na 1 krejt / 20 s. Predmeti niso naprodaj in jih ni mogoče menjati – gre za
  kozmetiko brez denarne vrednosti; pred objavo vseeno preveri trenutna pravila CrazyGames glede
  »loot box« mehanik.
- Shramba je JSON na disku (primerna za en strežnik). Za več strežnikov zamenjaj `server/store-file.js`
  z bazo (npr. Postgres z `UNIQUE(player_id, collectible_id)`).
- Počep ni implementiran (surf ga ne potrebuje); igra je namenjena tipkovnici in miški (mobilne naprave
  dobijo obvestilo).
