# FPS Surf na GameMonetize

1. V GameMonetize konzoli ustvari igro (Game Management → My games) in kopiraj **game ID** (hash).
2. Zgradi ZIP z vstavljenim ID-jem:
   `GM_ID=TVOJ_ID npm run package` (ali `node tools/build.mjs --single --platform gamemonetize --gm-id TVOJ_ID --out out`
   in `index.html` stisni v ZIP). Rezultat: `release/glidezone-gamemonetize.zip` (samo `index.html` v korenu).
3. Naloži ZIP, klikni **Verify Game**, nato **Request activation**.

Kaj je drugače od CrazyGames različice:
- SDK: `api.gamemonetize.com/sdk.js`; ob videu (SDK_GAME_PAUSE) se igra utiša, po koncu (SDK_GAME_START) spet zvok.
- Oglasi: `sdk.showBanner()` ob menjavi mape (največ enkrat na 3 min) in pred odpiranjem krejta.
  GameMonetize nima nagrajenih oglasov: krejt se odpre, ko se oglas konča (ali ko oglasa ni).
- Brez prijave (le gost), brez vabil in happytime. Strežnik (wss://glidezone-rok.duckdns.org) ostane isti.
