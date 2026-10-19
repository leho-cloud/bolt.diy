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

| Változó                    | Érték                                                                                                        |
| -------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `COOLIFY_API_URL`          | A saját Coolify szerver elérési címe, pl. `https://coolify.example.com` (a builder konténeréből is elérhető) |
| `COOLIFY_API_TOKEN`        | A Coolify API token                                                                                          |
| `COOLIFY_PROJECT_UUID`     | A publikálandó projektek célprojekt-azonosítója                                                              |
| `COOLIFY_SERVER_UUID`      | A célkiszolgáló UUID                                                                                         |
| `COOLIFY_ENVIRONMENT_NAME` | `production`                                                                                                 |
| `COOLIFY_GITHUB_OWNER`     | `leho-cloud`                                                                                                 |
| `COOLIFY_PUBLISH_KEY`      | Erős, egyedi rendszergazdai jelszó, ezt a Publish gombnál kell megadni                                       |

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

## Fejlesztési javítás: forráság és domainvédelem

Ez a kiegészítés a külön `dev/tzsvtav-publisher-guard-20261019` ágon készült; main és az éles telepítés változatlan.

A POST kérés opcionális `branch` mezőt fogad. Ha hiányzik, a korábbi kliensekhez `main` az alapértelmezés; hibás mezőt nem cserélünk le automatikusan. Az új alkalmazás a megadott ágat kapja. Meglévő domainnél az API külön, csak olvasó alkalmazás-részletet kér le, és teljes tulajdonos/repó azonosságot, valamint pontos forráság-egyezést követel. HTTPS és SSH GitHub-cím, .git utótag és kis/nagybetű normalizálható; repónév-részlet soha nem elég. Hiányzó repó/ág, több azonos domain vagy hibás alkalmazáslista mellett nincs létrehozás vagy deploy.

Az API nem állítja át csendben egy meglévő alkalmazás tárolóját vagy ágát. Eltéréskor 409 a válasz; az üzemeltetőnek előbb ellenőriznie kell a célalkalmazást. A domainütközés vizsgálata ugyanannak a hostnak HTTP/HTTPS és záróperjeles alakját is figyelembe veszi. A szolgáltatói átirányítást a hívás nem követi; a nyers szolgáltatói hiba nem kerül a válaszba.

A sikeres válaszban `branch` és `status: queued` szerepel. Ez továbbra sem build-, HTTP- vagy TLS-siker. Bizonytalan hiba után nincs automatikus újrapróbálás: előbb a Coolify állapotát kell ellenőrizni.

Ez nem oldja meg a privát repók hozzáférését vagy egy commitra rögzített kiadás teljes folyamatát. Nyilvános repó létrehozása és privát projekt nyilvánossá tétele nem történik. A Műhely még nem hívja ezt a végpontot; az éles bekötés előtt a futó végpont, a privát hozzáférés, a buildbeállítás és a telepítési állapotkövetés külön ellenőrzendő.

Ellenőrzés Node 24 alatt: `node --test scripts/check-coolify-publish.mjs`. A teszt minden fetch hívást helyi szimulációval helyettesít; nem hív valódi Coolifyt, nem igényel szolgáltatói titkot, és nem telepít semmit. A külön Publisher contract munkafolyamat csak ezt futtatja a fejlesztési ágon, olvasási repójoggal. A meglévő PR-előnézeti telepítések miatt ehhez a szakaszhoz nem nyitunk automatikusan pull requestet.

## Pinned private static source (development only)

The optional request mode `source: private-github-app` requires a full lowercase 40-character `commit` and an explicit `dev/tzsvtav-release-...` branch. Server-side `COOLIFY_GITHUB_APP_UUID` selects the existing Coolify GitHub App integration. Missing configuration rejects the request before Coolify calls. The repository is never made public.

A new application uses `/applications/private-github-app`, static build pack, port 80, root publish directory, the exact `git_commit_sha`, and disabled instant/automatic/preview deployment. Before queueing, an application detail read must confirm exact repository, branch, commit, static configuration and disabled auto deploy. Existing applications with different or unknown values return 409: they are not silently updated. Updating an existing site to a new commit remains a separate, explicit step.

The response exposes only a validated deployment queue UUID in private mode. Missing or ambiguous queue identification is an error, not success. Queueing does not prove a successful build or live HTTP/TLS service. Tests mock all Coolify calls; no production deployment was performed. The installed Coolify version and actual GitHub App access still require live read-only checks before a separately authorized test deployment.

Official API contract used: https://coolify.io/docs/api/endpoints/applications/create-private-github-app-application
