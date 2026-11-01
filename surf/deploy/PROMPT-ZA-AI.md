# Navodila za drug AI: postavi novo igro na moj Oracle strežnik

Kopiraj vse pod črto v pogovor z drugim AI in dodaj kodo igre (ZIP ali mapo).

---

Pomagaj mi namestiti mojo igro na obstoječ strežnik, ki že gosti dve igri. Pred vsakim korakom razloži, kaj boš naredil. Ničesar ne izvajaj na strežniku brez mojega ukaza: meni daj ukaze, jaz jih zaženem.

## 1. Strežnik (ne spreminjaj)
- Oracle Cloud **Always Free**, Ubuntu, ARM. Javni IP: **92.5.61.180**, uporabnik **ubuntu**, prijava samo s SSH ključem (ime ključa: ssh-key-2026-10-17.key, na mojem Windows računalniku).
- Nameščena sta že Node.js 20 (NodeSource) in **Caddy** (/etc/caddy/Caddyfile). Ne nameščaj ju znova.
- Caddy je edina javna vstopna točka (443, samodejni HTTPS). Igre poslušajo SAMO na 127.0.0.1.
- **Stroški:** nobenih. Ne ustvarjaj novih instanc, diskov, vrat ali plačljivih storitev. Ne odpiraj vrat v Oracle security listu ali ufw. Ne nadgrajuj sistema (brez do-release-upgrade).
- **Obstoječe igre, ki se jih NE SMEŠ dotikati:**
  | Igra | Storitev | Mape | Vrata | Domena |
  |---|---|---|---|---|
  | Fightstorm | fightstorm.service | /opt/fightstorm-server, /etc/fightstorm | (preveri z `ss -ltnp`) | fightstorm-rok.duckdns.org |
  | FPS Surf | glidezone.service | /opt/glidezone-server, /var/lib/glidezone, /etc/glidezone | 8081 | glidezone-rok.duckdns.org |
- Domene so DuckDNS (brezplačne). Vsaka igra ima svojo poddomeno in svoj blok v Caddyfile.

## 2. Kaj mora igra izpolnjevati
- Če ima strežniški del (Node): posluša na `127.0.0.1` in vratih iz okolja `PORT` (nova igra dobi **8082**, naslednja 8083 …; vedno preveri `ss -ltnp`, da so prosta). Podatke piše samo v mapo iz `DATA_DIR`.
- Ima `GET /health`, ki vrne 200 (JSON). Brez tega skripta ne ve, ali igra teče.
- WebSocket na poti `/ws` (Caddy `reverse_proxy` ga podpira brez dodatnih nastavitev).
- Strežnik ne sme pasti zaradi pokvarjenega sporočila: vsak `JSON.parse`, vsak `handleMessage` in tick zanka v try/catch, `process.on('uncaughtException'/'unhandledRejection')` samo loži.
- Omejitve: največ ~1,5 GB RAM (MemoryMax), brez Dockerja, brez baze, ki bi potrebovala svoja vrata. Podatke hrani v datotekah (JSON) ali SQLite v DATA_DIR.
- Če je igra samo statična (en `index.html`), ne potrebuje Node procesa: Caddy jo streže iz mape (`root * /var/www/<ime>` + `file_server`).
- Igra mora na lokalnem računalniku delovati s `?server=ws://localhost:PORT/ws`, v produkciji pa uporabi `wss://<poddomena>/ws` (razen na localhostu).

## 3. Vzorec namestitve (ponovi ga za novo igro)
Po vzoru skript `deploy/add-game.sh` in `deploy/update.sh` iz projekta FPS Surf:
1. Sistemski uporabnik brez lupine (`useradd --system --shell /usr/sbin/nologin <ime>`).
2. Koda v `/opt/<ime>-server`, podatki v `/var/lib/<ime>` (lastnik uporabnik igre, chmod 750).
3. Systemd enota `/etc/systemd/system/<ime>.service`: `User=<ime>`, `WorkingDirectory`, `Environment=PORT=<vrata> HOST=127.0.0.1 DATA_DIR=/var/lib/<ime> NODE_ENV=production`, `Restart=always`, `NoNewPrivileges=true`, `PrivateTmp=true`, `ProtectSystem=strict`, `ProtectHome=true`, `ReadWritePaths=/var/lib/<ime>`, `MemoryMax=1500M`.
4. DuckDNS: poddomena + cron v `/etc/cron.d/<ime>-duckdns` (vsakih 5 min) z datoteko `/etc/<ime>/duckdns.conf` (chmod 600). **Token se nikoli ne izpiše** in se ne pošilja v klepet: skripta ga dobi kot argument, ki ga vpišem sam.
5. Caddy: samo DODAJ nov blok (najprej varnostna kopija, `caddy validate`, `systemctl reload caddy`, ob napaki obnovi kopijo):
   ```
   <poddomena>.duckdns.org {
   	encode gzip
   	reverse_proxy 127.0.0.1:<vrata>
   }
   ```
6. Preveri: `systemctl is-active fightstorm glidezone <ime>` (vsi `active`) in `curl https://<poddomena>/health`.
7. `update.sh`: kopira novo kodo v `<ime>-server.new`, zamenja, restart, preveri /health, ob napaki samodejno vrne `<ime>-server.prev`. Podatki igralcev ostanejo.

## 4. Kako naložim in zaženem (Windows PowerShell)
```powershell
cd $HOME\Downloads
scp -i "POT\DO\ssh-key-2026-10-17.key" ".\<ime>-server.zip" ubuntu@92.5.61.180:~/<ime>-server.zip
ssh -i "POT\DO\ssh-key-2026-10-17.key" ubuntu@92.5.61.180
```
Na strežniku:
```bash
ls -l ~/<ime>-server.zip            # preveri velikost (brskalnik včasih shrani kot "... (1).zip")
rm -rf ~/<ime>-server && unzip -q ~/<ime>-server.zip -d ~ && cd ~/<ime>-server
sudo bash deploy/add-game.sh <poddomena> <duckdns-token>     # prvič
sudo bash deploy/update.sh                                    # vsakič kasneje
```
Na koncu mora pisati SUCCESS. ZIP mora vsebovati `node_modules` (samo čisti JS, brez nativnih modulov: deluje na ARM) ali pa strežnik požene `npm ci --omit=dev`.

## 5. Kaj naj mi AI odda
1. Seznam datotek, ki jih je spremenil, in zakaj.
2. `deploy/add-game.sh` in `deploy/update.sh` za to igro (idempotentni, z jasnimi napakami v slovenščini).
3. Ukaz za izdelavo ZIP-a in ukaze za namestitev (točno tiste iz 4. točke z mojimi imeni).
4. Preizkus: `curl` na /health, preizkus WebSocketa (npr. s `wscat` ali kratko Node skripto) in zagon dveh odjemalcev.
5. Opozorila (npr. če je vrata že kaj zasedlo ali če igra potrebuje več kot 1,5 GB).

## 6. Če igra gre na portale (CrazyGames, GameMonetize …)
- CrazyGames: en `index.html` z vsem vključenim (JS, CSS), SDK `https://sdk.crazygames.com/crazygames-sdk-v3.js` (init → loadingStart/Stop → gameplayStart/Stop), takojšen začetek brez menija, disableChat in muteAudio, invite gumb in `updateRoom` če je multiplayer, politika zasebnosti v igri, podpora telefonu (ležeče). Strežnik mora sprejeti vse domene (ALLOWED_ORIGINS prazen).
- GameMonetize: njihov `sdk.js` s `SDK_OPTIONS` in game ID, oglasi z `sdk.showBanner()`. **Zavračajo igre, narejene z AI**, zato pred oddajo vprašaj podporo.
- Igra mora ob nedosegljivem strežniku preklopiti na igranje brez povezave, ne obviseti na »connecting«.
- Preveri pred oddajo: brez napak v konzoli, deluje v Chromu in še enem brskalniku, deluje na telefonu, nobenih zunanjih povezav in oglasov tretjih oseb.
