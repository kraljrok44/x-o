# Wingborne: BASE Flight

3D igra BASE skokov in letenja z wingsuitom (HTML5, three.js). Pripravljena za **CrazyGames** in **GameMonetize**.

## Kaj je v igri

- **Fizika letenja**: vzgon in upor (`F = ½·ρ·C·S·v²`), gostota zraka glede na višino, vztrajnost, napadni kot, nagib, zastoj (stall), veter in sunki. Simulacija teče s fiksnim korakom 120 Hz, zato je enaka pri 60, 144 in 165 Hz.
- **Celoten potek**: priprava na robu (ogled, predogled proge, izbira kamere), tek in skok, prosti pad, razprtje kril, let, padalo (odpiranje, trdo odpiranje), vodenje padala, flare, pristanek. Ob trku ali pristanku v vodi let spodleti.
- **4 svetovi** (proceduralni teren s progo, vklesano v teren):
  - Skyfall Ridge: Alpe, jezero, gozdna jasa
  - Redstone Abyss: kanjon z dvema naravnima lokoma
  - Tidal Edge: obalne pečine, morski stebri, morski lok, plaža
  - Vertical Metropolis: nebotičniki, mostovi med stavbami, park in pristanek na strehi
- **Načini**: Free Flight, Flight Missions (12 misij), Speed Run, Precision Flight, Landing Trials in Replay (premor, previjanje nazaj, hitrost, kamere).
- **Kamere**: Chase, Pilot (čelada), Cinema (samodejni kadri), pri pripravi in ponovitvi še Orbit.
- **Točkovanje** 0–1000 v 7 kategorijah (hitrost, natančnost, bližina terena, stabilnost, trajanje, pristanek, učinkovitost), stopnje Bronze, Silver, Gold, Platinum in Perfect.
- **Napredek**: kovanci, odklepanje svetov in misij, kozmetika v Gear Garage (wingsuit, čelada, padalo, sledi dima). Kozmetika ne vpliva na fiziko.
- **Grafika**: dinamično sonce in sence, nebo z oblaki, 4 časi dneva, 6 vremen (megla, sunki vetra, oblaki, dež), animirana voda, drevesa, ki se zibljejo, ptice, sneg/prah/dež, zabrisanje ob hitrosti, popačenje leče, vinjeta. Kakovost Low/Medium/High (Auto izbere Low na šibkih napravah).
- **Zvok**: ves je proceduralen (WebAudio). Veter se spreminja s hitrostjo, tkanina plapola, vsak svet ima svoj ambient, glasba se prilagaja dogajanju, dodani so učinki.
- **Upravljanje**: tipkovnica (fizične tipke, deluje tudi na AZERTY), miška (vlečenje za pogled), igralni plošček in dotik (virtualna palica in gumbi). Vse tipke in gumbe ploščka je mogoče preslikati.

### Privzete tipke

| Tipka | Funkcija |
|---|---|
| W / ↑ | Spust (dive) |
| S / ↓ | Dvig, pri padalu flare |
| A / D | Zavoj |
| Q / E | Močan nagib (roll) |
| Space / Enter | Skok, razprtje kril, stabilizacija |
| Shift | Stisnjena drža (hitreje) |
| X | Razprta drža (daljši let) |
| F | Padalo |
| C | Kamera |
| R | Ponovni začetek |
| P | Pavza |
| Miška (vleci) | Pogled |

> Navodila določajo za alternativno držo tipko **Ctrl**. CrazyGames pa odsvetuje Ctrl, ker Ctrl+W zapre zavihek, W pa je tipka za spust. Zato je privzeta tipka **X**, v nastavitvah pa jo lahko spremeniš. Tipka Esc se ne uporablja nikjer.

## Zagon in build

```bash
cd wingsuit
npm install           # samo esbuild (za build)
npm run dev           # http://localhost:8080 (razvoj, brez SDK)
npm run build         # dist/crazygames + dist/gamemonetize + ZIP-a
```

Možnosti builda:

- `node build.mjs --cg-ads`: vklopi CrazyGames oglase. Uporabi **samo za Full Launch**, ker oglasi v Basic Launch niso dovoljeni.
- `node build.mjs --gm-id=TVOJ_ID`: vstavi GameMonetize Game ID.

Že zgrajena paketa sta v `release/`.

## Oddaja na CrazyGames

1. Naloži `release/wingborne-crazygames.zip` (HTML5, `index.html` je v korenu).
2. Ime: **Wingborne: BASE Flight** (22 znakov, enako kot v igri).
3. Progress save: **Data Module from the CrazyGames SDK**.
4. Mobile: da, landscape. Multiplayer: ne. Mute audio prek SDK: da.
5. Naslovnice so v `marketing/`: `cover-1920x1080.png`, `cover-800x1200.png`, `cover-800x800.png`.
6. **Videe (16:9 1920×1080 in 2:3 1080×1620, 15–20 s, brez zvoka) moraš posneti sam** na računalniku z grafično kartico. Prvi kader naj bo statična naslovnica.
7. Ko te sprejmejo v Full Launch, zaženi `node build.mjs --cg-ads` in naloži novo verzijo.

### Kako igra izpolnjuje zahteve CrazyGames

| Zahteva | Rešitev |
|---|---|
| Velikost < 50 MB, relativne poti | ZIP ima ~200 KB, 4 datoteke, samo relativne poti |
| SDK v3 v `<head>`, `init()` pred uporabo | `platform.js`: `await SDK.init()` ob nalaganju |
| `gameplayStart/Stop` | start ob pripravi in letu; stop ob pavzi, meniju, rezultatih, replayu in skritem zavihku |
| `loadingStart/Stop` | med gradnjo sveta |
| Delovanje brez SDK (`environment === 'disabled'`) | vse funkcije SDK imajo varno nadomestilo |
| Data module | shranjevanje prek `SDK.data`, sicer localStorage |
| User module | prikaz imena in avatarja, Auth listener, majhen gumb "Log in" zgoraj desno (ne glavni) |
| `muteAudio` in poslušalec nastavitev | upoštevano, ima prednost pred nastavitvami v igri |
| `happytime` redko | samo ob novem osebnem rekordu ali rangu Perfect |
| `reportGameCompletedPercentage`, `setGameContext` | ✓ |
| Nov igralec takoj v igri (največ 1 klik) | ob prvem zagonu se odpre misija 1, do skoka je en klik ali tipka |
| Kratko uvajanje med igro, ki se da preskočiti | namigi med letom in gumb "Skip tutorial" |
| Prikaz kontrol | pri pripravi, v pavzi, v namigih; oznake se prilagodijo napravi |
| Brez Esc in Ctrl+W, podpora AZERTY | `event.code`, oznake prek `keyboard.getLayoutMap()` |
| Miška, tipkovnica, dotik | ✓, dodan tudi igralni plošček |
| Ležeči način, brez zaklepanja orientacije | ✓ |
| `user-select: none` | na `body` |
| Safe area | `viewport-fit=cover` in `env(safe-area-inset-*)` |
| iOS AudioContext | `resume()` ob `touchend` in `click` |
| Brez lastnega gumba za celozaslonski način in brez zunanjih povezav | ✓ |
| Fizika enaka pri 60/144/165 Hz | fiksni korak 120 Hz z interpolacijo |
| Chromebook s 4 GB | samodejno Low (≤ 4 jedra ali ≤ 4 GB RAM ali dotik) |
| Berljivost pri 800×450 … 1920×1080 | odziven HUD (`clamp`, `vmin`), preizkušeno pri 800×450, 1216×684 in 1280×720 |
| Midgame oglas samo na logičnih točkah | po pristanku ali trku, preden se pokažejo rezultati; nikoli ob kliku na meni |
| Igra ustavljena, UI zaklenjen, zvok utišan ob `adStarted` | ✓, `adError` igra obdela in nadaljuje |
| Rewarded | "Double coins" samo na zaslonu rezultatov, z ikono videa; ob napaki ni nagrade in se prikaže sporočilo; z adblockom je gumb skrit |
| Basic Launch brez oglasov | privzeti build ima oglase izklopljene |
| PEGI 12 | brez krvi in nasilja |
| Zasebnost | igra ne zbira osebnih podatkov |

## Oddaja na GameMonetize

1. Ustvari igro na GameMonetize, kopiraj **Game ID** in zaženi `node build.mjs --gm-id=TVOJ_ID`.
2. Naloži `dist/wingborne-gamemonetize.zip`.
3. Oglas (`sdk.showBanner()`) se pokaže med leti, po pristanku ali trku. Ob `SDK_GAME_PAUSE` se igra ustavi in utiša, ob `SDK_GAME_START` nadaljuje.
4. Sličica: `marketing/gm-thumb-512x384.png`.

## Struktura

```
wingsuit/
├── index.html, css/style.css
├── build.mjs                 # paketa za CrazyGames in GameMonetize
├── js/
│   ├── main.js               # zagon
│   ├── game.js               # CORE: seje, fiksni korak, rezultati, replay
│   ├── flight.js             # PILOT: aerodinamični model, padalo, pristanek, trki
│   ├── pilot.js              # PILOT: model, animacije, dinamične membrane kril, padalo
│   ├── camera.js             # VIEW: Chase / Pilot / Cinema / Orbit
│   ├── maps.js               # WORLDS: 4 svetovi, proge, cone pristanka
│   ├── world.js              # WORLD: teren, voda, rastlinje, kanjonski loki, mesto, kolizije
│   ├── sky.js                # WORLD: nebo, čas dneva, vreme, delci
│   ├── gameplay.js           # GAMEPLAY: vrata, misije, točkovanje, replay, kozmetika
│   ├── audio.js              # AUDIO: veter, ambient, glasba, učinki
│   ├── ui.js                 # INTERFACE: meniji, HUD, rezultati, garaža, nastavitve, dotik
│   ├── input.js, platform.js, save.js, postfx.js, util.js
│   └── lib/three.module.min.js (r170, MIT)
├── marketing/                # naslovnice
└── release/                  # že zgrajena ZIP-a
```
