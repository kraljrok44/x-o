# GLIDEZONE: končna objava

V `GLIDEZONE-objava.zip` so štiri stvari:

| Datoteka | Za kaj |
|---|---|
| `crazygames/glidezone-crazygames.zip` | Igra za CrazyGames: en sam `index.html` (vse je v njem) |
| `crazygames/media/` | 3 naslovnice in 2 videa za obrazec CrazyGames |
| `server/glidezone-server.zip` | Nova različica strežnika za tvoj Oracle |
| `OBJAVA.md` | Ta navodila |

## 1. Najprej posodobi strežnik (Oracle)

Strežnik **moraš** posodobiti, ker so nove mape, XP, duh rekorda in nova lestvica. Brez tega
se igra na CrazyGames poveže na staro različico.

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
curl -s https://glidezone-rok.duckdns.org/health   # JSON z mapo "surf_aurora_dawn"
```

- Fightstorm, Caddy in DuckDNS ostanejo nespremenjeni, posodobi se samo GLIDEZONE.
- **Noži, inventar in XP igralcev ostanejo.**
- **Rekordi in lestvica se začnejo na novo**, ker so mape nove in stari časi niso več
  primerljivi. Stari podatki ostanejo na disku, igra jih samo ne prikazuje več.
- Če nova različica ne bi odgovorila, `update.sh` sam vrne prejšnjo.
- Dnevnik: `sudo journalctl -u glidezone -n 100 --no-pager`. Ponovni zagon: `sudo systemctl restart glidezone`.

## 2. Naloži igro na CrazyGames

1. developer.crazygames.com, nato **Submit a game**, nato **HTML5**.
2. Naloži `crazygames/glidezone-crazygames.zip`. V njem je samo `index.html`, vsa igra je
   v tej datoteki.
3. Obrazec:
   - **Game name:** `GLIDEZONE`
   - **Game engine:** HTML5
   - **Save progress:** *Yes, linked to a game account on the game's backend…*
   - ☑ **The game supports mobile devices**. Zdaj podpira telefon: leva četrtina zaslona je
     A, druga četrtina D, desna polovica pogled. Prst na desni sam hodi do rampe in skače.
   - ☑ **Online multiplayer**
   - ☑ **Muting audio through SDK**
4. Naslovnice: `media/cover-landscape-1920x1080.png`, `media/cover-portrait-800x1200.png`,
   `media/cover-square-800x800.png`.
5. Videa: `media/preview-landscape-1920x1080.mp4` in `media/preview-portrait-1080x1620.mp4`
   (18,5 s, brez zvoka).
6. Isti ZIP velja za Basic in Full launch. V Basic launchu se krejti odpirajo brez oglasa,
   v Full launchu samo po ogledanem oglasu.

## Kaj je novo v tej različici

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
