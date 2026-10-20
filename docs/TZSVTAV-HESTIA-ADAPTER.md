## 2026-10-20 – két elkülönített kiadástár elfogadási tesztje

A helyi fogadóprogram tesztje két külön könyvtárat és két külön domaint használ. Igazolt: A publikálása és visszaállítása B összes mentett fájlját változatlanul hagyja; B kizárólagos kiadásazonosítójára A nem állíthat vissza; kliens domain/base/sshTarget mezője nem írja felül a szerveroldali célkötést; idegen ügyfélre mutató current és kiadástár-symlink tiltott. Ezek valódi fájlrendszeres adaptertesztek, nem két valódi operációsrendszer-fiókkal futó telepítési próbák. A VPS-en külön korábbi olvasásos próbák igazolták a két tesztügyfél írási elkülönítését.

Összesen 7 Python-teszt sikeres. Futtatás: `python3 -m unittest discover -s scripts/hestia -p 'test_*.py'`. CI ugyanezt automatikusan futtatja. A telepített fogadóprogram nem változott, távoli újratelepítés nem szükséges.

Fontos korlát: a Publisher DEV és a Műhely továbbra is egyetlen jóváhagyott tesztcélhoz kötött. A többcélos ügyfél-közzétételhez szerveroldali célnyilvántartás, projektenkénti célkötés, célonként külön hitelesítés és egy második külön engedélyezett élő cél szükséges. A helyi teszt nem jelenti ezek elkészültét. A későbbi általánosítás nem fogadhat kliensből SSH-címet, fájlrendszerutat vagy kiadói kulcsot.

Az alábbi korábbi állapotbejegyzések történetiek: a Műhelyből indított két kiadás és visszaállítás, a külső mentési másolat és az új admin 2FA azóta igazolt a privát AI Builder repó bizonyítékaiban.

# 11. mérföldkő – külön Hestia céladapter

A meglévő publikáló HTTP-szerver új `/api/hestia-publish` útvonala; a Coolify útvonal változatlan. Nem külön publikáló szolgáltatás. A távoli Publisher DEV már 1ef557edcd7f46e1bcb25399b8b59edaadc295af commiton fut, deployment mwf9ji8zpaznjry8rjr1vo3p successful/healthy. A felhasználó külön jóváhagyta az egyetlen tesztwebhelyre korlátozott kulcsot; a távoli kiadás és visszaállítás is igazolt. A Műhely jóváhagyott projektverzióinak bekötése még szükséges. Nem általános ügyfélpublikálás.

## Hozzáférés

Alapértelmezetten tiltott: `HESTIA_PUBLISH_ENABLED=1` szükséges. Külön, legalább 32 bájtos `HESTIA_PUBLISH_KEY` vagy `HESTIA_PUBLISH_KEY_FILE` szerveroldali titok, `x-publish-key` fejlécben. Origin fejléc tiltott. A cél kizárólag kezelő által beállított `HESTIA_DOMAIN`, `HESTIA_SSH_TARGET`, `HESTIA_KEY_FILE`, `HESTIA_KNOWN_HOSTS_FILE`; a kliens nem adhat SSH-célt vagy fájlrendszerutat. StrictHostKeyChecking=yes, nincs automatikus hostkulcs-elfogadás. A konténer openssh-client csomagot kap, a titkos fájlok nem kerülhetnek image-be. A jelenlegi Coolify directory mount nem readonly; az írást root:1000 tulajdon és 0550/0440 módok tiltják a node uid=1000 felől, futásidőben ellenőrizve. Későbbi támogatott readonly mount további védelem. Futásidőben a node usernek olvashatónak kell lenniük.

A teszt célja: tzsvtavproba@168.231.101.221, hosting-proba.tzsvtav.com. A tesztügyfél külön Hestia-felhasználó, hu nyelv és tzsvtav téma. A root kezelői kulcs NEM a publikálói kulcs. Publikálói authorized_keys: restrict + kötött root-tulajdonú Python fogadóprogram; nincs szabad távoli parancs, PTY vagy továbbítás. A fogadóprogram a tesztügyfél jogosultságaival fut, nem rootként. A normál Hestia API/adminjelszót nem használja.

## Formátum és kiadás

Kérés: `{operation: "publish", releaseId, files: [{path, content, sha256}]}`; visszaállítás: `{operation: "rollback", releaseId}`. Kizárólag UTF-8 szöveges statikus fájlok: html/css/js/mjs/json/svg/txt. 2 MiB kérés, legfeljebb 100 fájl és 512 KiB/fájl, kötelező index.html. Nem Node/SSR/PHP és nem bináris feltöltés.

A kiadásazonosító SHA256 a path szerint rendezett `path + NUL + sha256 + LF` sorokból. Minden fájl hashét újraszámolja a fogadó. Tiltott abszolút/rejtett/traversal/duplikált útvonal és symlink. Hiba vagy bizonytalan válasz esetén nincs automatikus újraküldés. Azonos kiadás csak sértetlen nyugtával és fájlokkal aktiválható újra; ismeretlen vagy módosított kiadásra nincs rollback.

A verziók a tesztügyfél `.tzsvtav-releases` könyvtárában maradnak; publikálás nem töröl korábbi kiadást. Flock sorosítja a műveleteket. A public_html állandó szimbolikus link a kiadási könyvtár `current` linkjére; a Hestia domainkönyvtárának r-x védelme megmarad. A current link atomikus rename-mel vált. A bootstrap Hestia-oldal külön megmaradt, de nem nyugtázott kiadás, tehát erre az adapter nem állít vissza.

## Gyorsítótár

A tesztnél az Nginx open_file_cache régi fájlleírót tartott meg. Csak a hosting-proba domain támogatott nginx.conf_* és nginx.ssl.conf_* kiegészítőiben: open_file_cache off, etag off, if_modified_since off, Cache-Control no-store. nginx -t és reload sikeres. Ez tesztprofil; későbbi ügyfélhostingnál verziózott assetnevek és külön HTML/cache stratégia kell.

## Bizonyíték és teszt

2026-10-20: a meglévő publikáló helyi HTTP-szervere → korlátozott SSH → új Hestia VPS → nyilvános HTTPS. 1. kiadás, 2. kiadás, rollback az elsőre; mindhárom lépésnél index.html és style.css SHA256-egyezés. Érvényes TLS, redirect megkerülés nélkül. A nyugta a privát AI Builder repó docs/evidence/hestia-rehearsal-20261020.json fájljában.

20 Node-teszt, 3 Python-teszt. CI 39393636715 success, konténerbuilddel. Python ellenőrzi a valódi helyi fájlrendszeres váltást/visszaállítást, hibás hash/symlink/traversal/hiányzó kiadás tiltását. A Node teszt a jogosultsági és HTTP-kapukat vizsgálja. A `rehearse-hestia.mjs --execute-test` valódi írás, kizárólag tudatos kezelői indításra; CI-ben nem fut. A távoli bizonytalan művelet előtt állapotvizsgálat kötelező.

Távoli próba: 2026-10-20 08:33:53–55 UTC, a DEV konténer HTTP-végpontján két ismert kiadás és rollback, lépésenként 2 HTTPS/hash-egyezés. Külön nyugta az AI Builder docs/evidence/hestia-remote-rehearsal-20261020.json fájlban. A szerveroldalon generált DEV privát kulcs a DEV gépen marad; a hosting authorized_keys from=187.126.2.206 + restrict + forced-command kötést kapott. Következő: mentett Műhely-verziók jogosultságokkal kötött átküldése. A hosting a termékben továbbra sem ready. Külső backup/restore, általános ügyfélhatárok, mobil/admin belépési próba és 2FA még nyitott.
