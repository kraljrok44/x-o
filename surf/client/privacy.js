// Privacy policy and terms shown in the game (main menu, pause menu, settings).
// Keep it in sync with what the server actually stores (server/store-file.js, shared/room.js).

export const PRIVACY_UPDATED = '2026-10-18';

const en = `
<h3>Privacy Policy</h3>
<p>FPS Surf is a browser game. This policy explains which data the game uses and why. Last updated: ${PRIVACY_UPDATED}.</p>
<h4>What we store</h4>
<ul>
  <li><b>Player identity:</b> if you are logged in on CrazyGames, the game receives your CrazyGames user ID and username through the CrazyGames SDK. Guests get a random identifier that is stored in the browser; the server only keeps a hash of it.</li>
  <li><b>Game progress:</b> your knife collection, equipped knife, XP, level, map times, records and leaderboard points. Record runs are saved as a replay path (positions only) so other players can race your ghost.</li>
  <li><b>Settings:</b> sensitivity, graphics, sound and similar settings are stored only in your browser (local storage).</li>
</ul>
<h4>What we do not store</h4>
<ul>
  <li>Chat messages are filtered and passed to the players in your room, but they are not saved.</li>
  <li>No e-mail address, real name, location, contacts or payment data is collected.</li>
  <li>The game shows no third-party ads and uses no tracking or analytics of its own.</li>
</ul>
<h4>How the data is used</h4>
<p>Only to run the game: to keep your progress, show leaderboards, records and your name to other players, and to match you into multiplayer rooms. Data is not sold or shared with third parties.</p>
<h4>Where the data is kept</h4>
<p>Progress is stored on the game's own server. Connections are encrypted (HTTPS / WSS). Your IP address is used only to keep the connection open and is not stored by the game.</p>
<h4>CrazyGames</h4>
<p>When you play on CrazyGames, CrazyGames processes data (account, ads, analytics) under its own privacy policy: <a href="https://www.crazygames.com/privacy-policy" target="_blank" rel="noopener">crazygames.com/privacy-policy</a>.</p>
<h4>Your choices</h4>
<p>Playing as a guest keeps everything tied to this browser; clearing the site data removes the local identifier and settings. You can ask for your stored progress to be deleted through the game's page on CrazyGames.</p>
<h3>Terms of use</h3>
<ul>
  <li>The game is provided free of charge, as is, without guarantees of availability.</li>
  <li>Be respectful in chat. Cheating, exploiting bugs, offensive names or messages can lead to removal from rooms or reset of progress.</li>
  <li>Knives and other items are cosmetic, have no monetary value and cannot be traded or exchanged for money.</li>
</ul>`;

const sl = `
<h3>Politika zasebnosti</h3>
<p>FPS Surf je igra v brskalniku. Ta politika pojasnjuje, katere podatke igra uporablja in zakaj. Zadnja posodobitev: ${PRIVACY_UPDATED}.</p>
<h4>Kaj shranjujemo</h4>
<ul>
  <li><b>Identiteta igralca:</b> če si prijavljen na CrazyGames, igra prek CrazyGames SDK prejme tvoj CrazyGames ID in uporabniško ime. Gostje dobijo naključni identifikator, ki je shranjen v brskalniku; strežnik hrani samo njegov hash.</li>
  <li><b>Napredek v igri:</b> zbirka nožev, izbrani nož, XP, nivo, časi na mapah, rekordi in točke na lestvici. Rekordne vožnje so shranjene kot pot (samo položaji), da lahko drugi tekmujejo s tvojim duhom.</li>
  <li><b>Nastavitve:</b> občutljivost, grafika, zvok in podobno so shranjeni samo v tvojem brskalniku (local storage).</li>
</ul>
<h4>Česa ne shranjujemo</h4>
<ul>
  <li>Sporočila v klepetu so filtrirana in poslana igralcem v tvoji sobi, a se ne shranjujejo.</li>
  <li>Ne zbiramo e-poštnega naslova, pravega imena, lokacije, stikov ali plačilnih podatkov.</li>
  <li>Igra ne prikazuje oglasov tretjih oseb in nima lastnega sledenja ali analitike.</li>
</ul>
<h4>Za kaj se podatki uporabljajo</h4>
<p>Samo za delovanje igre: za shranjevanje napredka, prikaz lestvic, rekordov in tvojega imena drugim igralcem ter za razporejanje v sobe. Podatkov ne prodajamo in jih ne delimo s tretjimi osebami.</p>
<h4>Kje so podatki</h4>
<p>Napredek je shranjen na lastnem strežniku igre. Povezave so šifrirane (HTTPS / WSS). IP naslov se uporablja samo za vzdrževanje povezave in ga igra ne shranjuje.</p>
<h4>CrazyGames</h4>
<p>Ko igraš na CrazyGames, CrazyGames obdeluje podatke (račun, oglasi, analitika) po svoji politiki zasebnosti: <a href="https://www.crazygames.com/privacy-policy" target="_blank" rel="noopener">crazygames.com/privacy-policy</a>.</p>
<h4>Tvoje možnosti</h4>
<p>Če igraš kot gost, je vse vezano na ta brskalnik; z izbrisom podatkov strani izbrišeš lokalni identifikator in nastavitve. Izbris shranjenega napredka lahko zahtevaš prek strani igre na CrazyGames.</p>
<h3>Pogoji uporabe</h3>
<ul>
  <li>Igra je brezplačna in na voljo takšna, kot je, brez zagotovila o razpoložljivosti.</li>
  <li>V klepetu bodi spoštljiv. Goljufanje, izkoriščanje napak, žaljiva imena ali sporočila lahko vodijo do odstranitve iz sob ali ponastavitve napredka.</li>
  <li>Noži in drugi predmeti so kozmetični, nimajo denarne vrednosti in jih ni mogoče prodati ali zamenjati za denar.</li>
</ul>`;

export const PRIVACY = { en, sl };
