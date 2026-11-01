# Druga igra na istem Oracle strežniku

Strežnik (Oracle Always Free, 92.5.61.180) že gosti Fightstorm in FPS Surf. Vsaka igra je svoja
storitev na svojih vratih (127.0.0.1), pred njimi pa je Caddy, ki ima za vsako igro svojo poddomeno
in samodejni HTTPS. Nova vrata navzven se NE odpirajo, stroškov ni.

| Igra | Storitev | Vrata (samo 127.0.0.1) | Poddomena |
|---|---|---|---|
| Fightstorm | fightstorm | (obstaja, ne dotikaj se) | fightstorm-rok.duckdns.org |
| FPS Surf | glidezone | 8081 | glidezone-rok.duckdns.org |
| **Nova igra** | `<ime>` | **8082** | `<ime>-rok.duckdns.org` |

## Koraki
1. **DuckDNS** (duckdns.org): dodaj novo poddomeno (npr. `mojaigra-rok`) z IP 92.5.61.180. Token ostane tvoj:
   ne pošiljaj ga v chat, vpiši ga samo v ukaz na strežniku.
2. **Igra mora teči kot Node proces**, ki posluša na `127.0.0.1:8082` (vrata iz okolja `PORT`),
   ima `/health`, ki vrne 200, in podatke piše v mapo iz `DATA_DIR`. Če je igra samo statična stran
   (en `index.html`), je dovolj mapa, ki jo streže Caddy (glej spodaj).
3. **Namestitev:** naredi `deploy/add-game.sh` po vzoru FPS Surf (kopija z `GAME=<ime>`, `PORT=8082`,
   novim uporabnikom, mapama `/opt/<ime>-server` in `/var/lib/<ime>`, lastnim `.service`,
   DuckDNS cronom in dodanim Caddy blokom). Zaženi: `sudo bash deploy/add-game.sh <poddomena> <token>`.
4. **Preveri:** `systemctl is-active fightstorm glidezone <ime>` (vse active) in
   `curl https://<poddomena>/health`.
5. **Klient:** v igri nastavi naslov strežnika na `wss://<poddomena>/ws` (ali `https://` za API).
6. **Posodobitve:** enak `update.sh` kot pri FPS Surf (menja samo to storitev, ob napaki vrne staro).

Če je nova igra le statična, v Caddyfile (varnostna kopija, `caddy validate`, `systemctl reload caddy`):
```
<poddomena>.duckdns.org {
	encode gzip
	root * /var/www/<ime>
	file_server
}
```

## Prompt za drug LLM (kopiraj v celoti, spodaj dodaj kodo igre)

```
Namesti mojo igro na obstoječ Oracle Cloud strežnik, ki že gosti dve igri. Delaj samo to, kar je
naštetega, in vsak korak razloži, preden ga predlagaš.

STANJE STREŽNIKA
- Ubuntu na Oracle Always Free (ARM), javni IP 92.5.61.180, uporabnik ubuntu (SSH s ključem).
- Node.js 20 (NodeSource) in Caddy sta že nameščena. Ne nameščaj ju znova, ne nadgrajuj sistema
  (brez do-release-upgrade), ne odpiraj novih vrat, ne ustvarjaj plačljivih virov.
- Caddy (/etc/caddy/Caddyfile) je javna vstopna točka (443) in z reverse_proxy kaže na igre, ki
  poslušajo samo na 127.0.0.1. Vsaka igra ima svojo DuckDNS poddomeno z lastnim HTTPS certifikatom.
- Obstoječe igre, ki se jih NE SMEŠ dotikati:
  * Fightstorm: fightstorm.service, /opt/fightstorm-server, /etc/fightstorm, njegov Caddy blok,
    poddomena fightstorm-rok.duckdns.org.
  * FPS Surf: glidezone.service, /opt/glidezone-server, /var/lib/glidezone, vrata 127.0.0.1:8081,
    poddomena glidezone-rok.duckdns.org (WebSocket na /ws, /health vrne JSON).
- Vzorec namestitve je v skripti deploy/add-game.sh in deploy/update.sh v projektu FPS Surf:
  poseben sistemski uporabnik brez lupine, koda v /opt/<ime>-server, podatki v /var/lib/<ime>,
  systemd enota z NoNewPrivileges, PrivateTmp, ProtectSystem=strict, ReadWritePaths=/var/lib/<ime>,
  MemoryMax, Restart=always, okolje PORT/HOST=127.0.0.1/DATA_DIR, DuckDNS posodobitev prek
  /etc/cron.d + conf z chmod 600 (token se nikoli ne izpiše), Caddy blok dodan z varnostno kopijo,
  `caddy validate` in obnovitev ob napaki, na koncu preverjanje `https://<poddomena>/health`.

NOVA IGRA
- Ime (storitev/mape): <IME>
- Poddomena: <POD>-rok.duckdns.org
- Vrata na 127.0.0.1: 8082 (preveri z `ss -ltnp`, da so prosta)
- Tip: <Node strežnik z WebSocketom / statična stran / drugo>
- Zagonski ukaz: <npr. node server/index.js>
- Koda igre: <priložena ali povezava>

NALOGA
1. Preglej kodo igre in ugotovi, kako se zažene, katera vrata uporablja, kam piše podatke in ali ima
   /health. Prilagodi samo toliko, da bere PORT, HOST in DATA_DIR iz okolja, posluša le na 127.0.0.1
   in ima /health, ki vrne 200.
2. Naredi deploy/add-game.sh in deploy/update.sh po vzoru zgoraj (idempotentni, z jasnimi napakami,
   ne spreminjata drugih storitev). Token za DuckDNS skripta prejme kot argument in ga ne izpiše.
3. Napiši navodila po korakih za začetnika (Windows PowerShell: scp s ključem, ssh, ukazi na strežniku)
   in preverjanja: `systemctl is-active fightstorm glidezone <IME>`, `curl https://<POD>-rok.duckdns.org/health`.
4. V klientu nastavi naslov strežnika na wss://<POD>-rok.duckdns.org/ws (razen na localhostu).
5. Na koncu izpiši seznam datotek, ki sem jih spremenil, in ukaze, ki jih moram zagnati.
Ne predlagaj Dockerja, novih vrat, novih instanc ali sprememb obstoječih storitev.
```
