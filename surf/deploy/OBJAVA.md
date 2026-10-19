# FPS Surf: končna objava

V `FPS-Surf-objava.zip` so štiri stvari:

| Datoteka | Za kaj |
|---|---|
| `crazygames/fps-surf-crazygames.zip` | Igra za CrazyGames: en sam `index.html` (vse je v njem) |
| `crazygames/media/` | 3 naslovnice in 2 videa za obrazec CrazyGames |
| `server/glidezone-server.zip` | Nova različica strežnika za tvoj Oracle |
| `OBJAVA.md` | Ta navodila |

## 1. Najprej posodobi strežnik (Oracle)

Strežnik **moraš** posodobiti, ker so nove mape, XP, duh rekorda in nova lestvica.

> **Zakaj so bloki izginjali in si padal skozi rampe:** igra je risala nove mape, strežnik pa
> je fiziko še računal po starih. Ko si zapeljal na rampo, ki je strežnik ni poznal, te je
> potegnil dol skozi njo. Igra zdaj ob povezavi primerja geometrijo map s strežnikom. Če se ne
> ujema, se sama preklopi na igro brez povezave in izpiše »Strežnik se posodablja«. Ko je
> strežnik posodobljen, igra spet teče online.

V PowerShellu (mapa Downloads, kjer je ključ in razpakiran `server/glidezone-server.zip`):

```powershell
cd $HOME\Downloads
scp -i .\ssh-key-2026-10-17.key .\glidezone-server.zip ubuntu@92.5.61.180:~
ssh -i .\ssh-key-2026-10-17.key ubuntu@92.5.61.180
```

Na strežniku:

```bash
rm -rf ~/glidezone-server && unzip -q ~/glidezone-server.zip -d ~ && cd ~/glidezone-server
sudo bash deploy/update.sh
```

Na koncu se mora izpisati **SUCCESS**. Preveri še:

```bash
systemctl is-active fightstorm glidezone          # oba: active
curl -s https://glidezone-rok.duckdns.org/health   # JSON mora vsebovati polje "mh"
```

Če v odgovoru ni polja `"mh"`, na strežniku še teče stara različica.

- Fightstorm, Caddy in DuckDNS ostanejo nespremenjeni, posodobi se samo igra (storitev se še
  naprej imenuje `glidezone`, domena ostane `glidezone-rok.duckdns.org`).
- **Noži, inventar in XP igralcev ostanejo.**
- **Rekordi in lestvica se začnejo na novo**, ker so mape nove in stari časi niso več
  primerljivi. Stari podatki ostanejo na disku, igra jih samo ne prikazuje več.
- Če nova različica ne bi odgovorila, `update.sh` sam vrne prejšnjo.
- Dnevnik: `sudo journalctl -u glidezone -n 100 --no-pager`. Ponovni zagon: `sudo systemctl restart glidezone`.

## 2. Naloži igro na CrazyGames

1. developer.crazygames.com, nato **Submit a game**, nato **HTML5**.
2. Naloži `crazygames/fps-surf-crazygames.zip`. V njem je samo `index.html`, vsa igra je
   v tej datoteki.
3. Obrazec:
   - **Game name:** `FPS Surf` (tako se igra zdaj imenuje v igri)
   - **Game engine:** HTML5
   - **Save progress:** *Yes, linked to a game account on the game's backend…*
   - ☑ **The game supports mobile devices**. Zdaj podpira telefon: gumba A in D spodaj levo, joystick
     spodaj desno (gor = naprej, levo/desno = obračanje), skok je samodejen, ko čas teče.
     **Mobile orientation:** LANDSCAPE.
   - ☑ **Online multiplayer**, **"Online with Friends" Lobby Size:** Min `2`, Max `24`.
     Igra podpira vabila: CrazyGames invite gumb in povezavo (`roomId`). Odprta povezava pelje
     naravnost v sobo prijatelja. Ob `isInstantMultiplayer` igra takoj odpre novo sobo za prijatelje.
     Povezavo za vabilo najdeš tudi v meniju pavze (ESC), v glavnem meniju pa je gumb »Igraj s prijatelji«.
   - ☑ **Muting audio through SDK**
4. Naslovnice: `media/cover-landscape-1920x1080.png`, `media/cover-portrait-800x1200.png`,
   `media/cover-square-800x800.png`.
5. Videa: `media/preview-landscape-1920x1080.mp4` in `media/preview-portrait-1080x1620.mp4`
   (18,5 s, brez zvoka).
6. Isti ZIP velja za Basic in Full launch. V Basic launchu se krejti odpirajo brez oglasa,
   v Full launchu samo po ogledanem oglasu.

### Odgovori v koraku QA

| Vprašanje | Odgovor |
|---|---|
| First gameplay start implemented correctly | Yes: `gameplayStart` ob prvem možnem gibanju, `gameplayStop` v meniju, pavzi, panelih in med oglasom |
| Complies to Gameplay requirements | Yes: takojšen začetek, angleščina privzeto, brez tujih oglasov, povezav ali lastne prijave |
| Runs on all CrazyGames domains | Yes: strežnik sprejme vse domene |
| Browser checks | Yes, ko igra deluje v Chromu in še enem brskalniku |
| Device checks: Mobile | Yes, ko jo preizkusiš prek **Show QR** v ležečem položaju |
| No external ads | Yes |
| Does not offer external login options | Yes |
| In-game mention of Terms & Conditions / Privacy Policy | Yes: »Privacy & Terms« v glavnem meniju, pavzi in nastavitvah |
| Game uses Invite Button correctly | Yes: samo v online sobi, skrije se v meniju in brez povezave |
| IsInstantMultiplayer is supported for party leader | Yes: najprej klikni **Test**, igra se odpre v sobi »Party XXXXXX« |

Igra spoštuje tudi CrazyGames nastavitev **disableChat** (klepet izgine) in **muteAudio**.

## Kaj je novo v tej različici

- **Pregled pred objavo:** strežnik ne pade več ob pokvarjenih sporočilih ali napaki diska, igra ne ostane napol povezana, majhna okna in telefoni brez odrezanih menijev, disableChat, slike map v izbiri map.
- **Igranje s prijatelji:** sobe s povezavo za vabilo in takojšen vstop (zahteva CrazyGames za multiplayer).
- **Popravek padanja skozi rampe:** igra se ne poveže več na strežnik z drugačnimi mapami.
- **Novo ime: FPS Surf.**
- **Jame** (kot pri mesa-tipu map) v petih mapah: kamnit tunel s stalaktiti in svetlečimi kristali.
- **Občutljivost miške** je zdaj nastavljiva neposredno v glavnem meniju in v meniju pavze.
- **Telefon v ležečem položaju:** vsi meniji in paneli so prilagojeni nizkemu zaslonu.
- **Skyforge Gauntlet (T3)** je spet daljši, približno 3:40.

- **Mape do Tier 3**, tier je v imenu, npr. *Aurora Dawn (T1)*. Novi elementi: 90° obrati
  z obvezno menjavo strani, enostranske rampe, speed checki (tabla in HUD kažeta zahtevano
  hitrost), okna, stekleni koridorji in dropi.
- **Takojšen začetek:** igra se začne brez menija in brez klika. Ob prvem obisku se ob strani
  za nekaj sekund pokažejo kontrole.
- **Duh rekorda** s svetlečo sledjo: tipka G. Druge igralce skriješ s tipko H. Igralci se
  med sabo ne zaletavajo.
- **XP in nivoji** po krivulji do 99:
  - nagrade: 40 XP za prvi prevoz, 80 za navaden prevoz, 160 za osebni rekord, 500 za rekord mape;
  - nagrada se podvoji vsakih 14 nivojev;
  - vsak 10. nivo prinese brezplačen krejt;
  - vsakih 10 nivojev se vojaški čin ob imenu dvigne.
- Ob končani mapi se sproži CrazyGames **happytime**, nov rekord mape se objavi v klepetu.
- Grafika: glajenje robov, barvna obdelava in odsevi. Nova nastavitev **Ultra**, privzeto pa
  ostaja enaka hitrost.
- Debug (F3) je za igralce izklopljen.
