# TZSVTAV AI Builder – ideiglenes projekt-domainek

A közzétételi funkció a **Deploy → Élesítés saját szerverre (TZSVTAV)** menüből indul.
Első lépésben a projektet egy **nyilvános GitHub-tárolóba** tölti fel.
A GitHub sikerablakában a **Közzététel a TZSVTAV szerverére** gomb indítja a Coolify-telepítést.

## Egyszeri DNS-beállítás

A `tzsvtav.com` DNS-zónában:

- **Típus:** A
- **Név:** `*.builder`
- **Érték:** a Coolify reverse proxy publikus IPv4-címe
- **TTL:** 300 vagy Auto

A wildcard rekord lefedi például a `virag-demo.builder.tzsvtav.com` és `led-konfigurator.builder.tzsvtav.com` címeket.
A proxy feladata a HTTPS-tanúsítványok kiadása (Let's Encrypt), ehhez a 80/443 portoknak elérhetőknek kell lenniük. Wildcard tanúsítványhoz DNS-01 challenge szükséges, de egyedi aldomainenként HTTP-01 hitelesítés is működhet.

## Coolify beállítás

1. Coolify: **Keys & Tokens → API tokens** – hozz létre alkalmazás-létrehozási és telepítési jogosultságú API tokent.
2. Olvasd ki a Coolify **project UUID** és **server UUID** azonosítóit.
3. A Coolifyban futó **TZSVTAV AI Builder** alkalmazás **Environment Variables** részébe állítsd be:

| Változó | Érték |
| --- | --- |
| `COOLIFY_API_URL` | A saját Coolify szerver elérési címe, pl. `https://coolify.example.com` (a builder konténeréből is elérhető) |
| `COOLIFY_API_TOKEN` | A Coolify API token |
| `COOLIFY_PROJECT_UUID` | A publikálandó projektek célprojekt-azonosítója |
| `COOLIFY_SERVER_UUID` | A célkiszolgáló UUID |
| `COOLIFY_ENVIRONMENT_NAME` | `production` |
| `COOLIFY_GITHUB_OWNER` | `leho-cloud` |
| `COOLIFY_PUBLISH_KEY` | Erős, egyedi rendszergazdai jelszó, ezt a Publish gombnál kell megadni |

4. Mentsd el a környezeti változókat, majd indítsd újra / telepítsd az AI Builder alkalmazást.

A Coolify API token **csak a szerveren tárolódik**, nem kerül ki a böngészőbe.
A közzétételi API nem aktív, amíg minden kötelező környezeti változó nincs megadva.

## Használat

1. Nyisd meg a projektet az AI Builderben, kattints a **Deploy → Élesítés saját szerverre (TZSVTAV)** gombra.
2. Az előkészített projektet helyezd el nyilvános GitHub-repóban; privát repóhoz később külön GitHub App integráció szükséges.
3. A GitHub-feltöltés utáni ablakban add meg a közzétételi kulcsot, majd indítsd a Coolify-közzétételt.
4. Az indított telepítés állapotát a Coolify felületén ellenőrizd.

**Megjegyzés:** a visszaadott URL nem bizonyítja, hogy a build befejeződött, a DNS felold vagy a HTTPS már kész. Ezeket a Coolify telepítési állapotával és külön HTTP-ellenőrzéssel kell megerősíteni.

**Meglévő domain:** az API újraindítja a telepítést az ugyanazzal a címmel már létező alkalmazásnál, ha a GitHub-repó egyezik. A DNS-rekord csak egyszer szükséges.

**Alkalmazástípus:** a jelenlegi megoldás a nyilvános, GitHub-forrásból Nixpacks-szel épülő alkalmazásokat kezeli. Egyes projektekhez további build/start konfiguráció vagy külön backend/adatbázis szükséges. A megoldás nem biztosít automatikusan adatbázist, külső szolgáltatási kulcsot vagy futásidejű konfigurációt.

**Biztonság:** a tároló a publikus GitHub-telepítéshez nyilvános lesz. Az alkalmazás titkait kizárólag Coolify környezeti változóiban helyezd el.
