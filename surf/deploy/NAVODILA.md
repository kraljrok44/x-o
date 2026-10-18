# GLIDEZONE na Oracle strežnik (poleg Fightstorma) in na CrazyGames

Strežnik igre je Node.js (samo paket `ws`, čisti JavaScript), zato deluje na ARM (aarch64) z
obstoječim Node 20. Posluša samo na `127.0.0.1:8081`, ven ga objavi Caddy prek vrat 443, ki so
že odprta. Novih vrat, instanc ali plačljivih storitev ne potrebuješ, ostaneš v Always Free.

| | Fightstorm (ostane kot je) | GLIDEZONE (novo) |
|---|---|---|
| Domena | fightstorm-rok.duckdns.org | **glidezone-rok.duckdns.org** |
| Storitev | fightstorm.service | glidezone.service |
| Vrata (samo lokalno) | 127.0.0.1:8080 | 127.0.0.1:8081 |
| Koda | /opt/fightstorm-server | /opt/glidezone-server |
| Podatki | – | /var/lib/glidezone (profili, noži, rekordi) |
| DuckDNS | /etc/cron.d/fightstorm-duckdns + /etc/fightstorm/duckdns.conf | /etc/cron.d/glidezone-duckdns + /etc/glidezone/duckdns.conf |

## 1. Nova poddomena na DuckDNS

1. Odpri https://www.duckdns.org in se prijavi z **istim računom** kot za Fightstorm.
2. V polje *sub domain* vpiši `glidezone-rok` in klikni **add domain**. En račun ima brezplačno
   do 5 poddomen, token je za vse enak.
3. Če je ime zasedeno, izberi drugo, npr. `glidezone-surf-rok`. Potem povsod spodaj uporabi to ime
   in v ZIP-u za CrazyGames popravi vrstico iz koraka 4.

## 2. Prenos na strežnik (PowerShell, mapa Downloads)

`glidezone-server.zip` in `glidezone-crazygames.zip` shrani v mapo Downloads, nato:

```powershell
cd $HOME\Downloads
scp -o StrictHostKeyChecking=accept-new -i .\ssh-key-2026-10-17.key .\glidezone-server.zip ubuntu@92.5.61.180:~
ssh -i .\ssh-key-2026-10-17.key ubuntu@92.5.61.180
```

## 3. Namestitev (na strežniku)

```bash
rm -rf ~/glidezone-server && unzip -q ~/glidezone-server.zip -d ~ && cd ~/glidezone-server
 sudo bash deploy/add-game.sh glidezone-rok TVOJ_DUCKDNS_TOKEN
```

- Pred `sudo` je **presledek**: tako se ukaz s tokenom ne shrani v zgodovino ukazov (bash history).
- Token najdeš na vrhu strani duckdns.org. Skripta ga ne izpiše; shrani ga v
  `/etc/glidezone/duckdns.conf` (chmod 600) in ga cron bere s `curl -K`.
- Skripta preveri Node in Caddy (ne namešča ju znova), posodobi DuckDNS, namesti igro in
  storitev ter v Caddyfile **doda** samo nov blok. Pred tem naredi varnostno kopijo
  `/etc/caddy/Caddyfile.bak-glidezone-…`, preveri jo s `caddy validate`, ob napaki pa obnovi kopijo.
- Na koncu preveri obe storitvi in `https://glidezone-rok.duckdns.org`, nato izpiše **SUCCESS**.
  Prvi HTTPS certifikat lahko traja minuto ali dve.

## 4. CrazyGames

1. Klient je že nastavljen na strežnik (`client/index.html`):
   ```js
   window.GLIDEZONE_SERVER = 'wss://glidezone-rok.duckdns.org/ws';
   ```
   Če si izbral drugo poddomeno, odpri `index.html` v `glidezone-crazygames.zip` in zamenjaj ime.
   Lahko pa mi napišeš novo ime in pripravim nov ZIP.
2. Na https://developer.crazygames.com izberi **Submit a game**, nato tip **HTML5**, in naloži
   `glidezone-crazygames.zip`. V ZIP-u je `index.html` v korenu, zraven pa `game.js` in `style.css`.
3. Izpolni podatke igre: ime GLIDEZONE, kategorija, kontrole (tipkovnica in miška), in označi, da je
   igra večigralska.
4. V predogledu CrazyGames preveri, da meni pokaže strežnik kot *online* in da krejt odpre oglas.

## 5. Preverjanje, da delujeta obe igri

Na strežniku:
```bash
systemctl is-active fightstorm glidezone      # oba: active
curl -s https://glidezone-rok.duckdns.org/health
curl -sI https://fightstorm-rok.duckdns.org | head -1
```
V brskalniku:
- https://fightstorm-rok.duckdns.org mora delovati kot prej;
- https://glidezone-rok.duckdns.org/health mora vrniti JSON s sobami;
- na https://glidezone-rok.duckdns.org lahko GLIDEZONE preizkusiš tudi neposredno.

## 6. Dnevniki in ponovni zagon (samo GLIDEZONE)

```bash
sudo systemctl status glidezone
sudo journalctl -u glidezone -f              # dnevnik v živo (Ctrl+C za izhod)
sudo journalctl -u glidezone -n 100 --no-pager
sudo systemctl restart glidezone
sudo journalctl -u caddy -n 50 --no-pager    # če HTTPS ne dela
```

## 7. Posodobitev igre kasneje

V PowerShellu prenesi nov `glidezone-server.zip` (isti ukaz `scp` kot zgoraj), nato na strežniku:
```bash
rm -rf ~/glidezone-server && unzip -q ~/glidezone-server.zip -d ~ && cd ~/glidezone-server
sudo bash deploy/update.sh
```
Skripta zamenja samo kodo v `/opt/glidezone-server`. Podatki igralcev v `/var/lib/glidezone`
ostanejo. Če nova različica ne odgovori, se samodejno vrne prejšnja. Fightstorm, Caddy in DuckDNS
ostanejo nespremenjeni.

## Za razvijalca: kako nastaneta ZIP-a

```bash
cd surf && npm install && npm run package    # → release/glidezone-crazygames.zip, release/glidezone-server.zip
```
