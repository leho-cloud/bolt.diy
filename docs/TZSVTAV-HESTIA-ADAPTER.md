# 11. mérföldkő – külön Hestia céladapter

A meglévő publikáló HTTP-szerver új `/api/hestia-publish` útvonala; a Coolify útvonal változatlan. Nem külön publikáló szolgáltatás. A telepített távoli Publisher DEV még a korábbi commitot futtatja; ez az adapter egyelőre a helyi példányon tesztelt. Távoli bekapcsolás és a Műhely jóváhagyott projektverzióinak bekötése még szükséges. Nem általános ügyfélpublikálás.

## Hozzáférés

Alapértelmezetten tiltott: `HESTIA_PUBLISH_ENABLED=1` szükséges. Külön, legalább 32 bájtos `HESTIA_PUBLISH_KEY` szerveroldali titok, `x-publish-key` fejlécben. Origin fejléc tiltott. A cél kizárólag kezelő által beállított `HESTIA_DOMAIN`, `HESTIA_SSH_TARGET`, `HESTIA_KEY_FILE`, `HESTIA_KNOWN_HOSTS_FILE`; a kliens nem adhat SSH-célt vagy fájlrendszerutat. StrictHostKeyChecking=yes, nincs automatikus hostkulcs-elfogadás. A konténer openssh-client csomagot kap, a titkos fájlokat csak olvasható mountként kell átadni, nem image-be másolva. Futásidőben a node usernek olvashatónak kell lenniük.

A teszt célja: tzsvtavproba@168.231.101.221, hosting-proba.tzsvtav.com. A tesztügyfél külön Hestia-felhasználó, hu nyelv és tzsvtav téma. A root kezelői kulcs NEM a publikálói kulcs. Publikálói authorized_keys: restrict + kötött root-tulajdonú Python fogadóprogram; nincs szabad távoli parancs, PTY vagy továbbítás. A fogadóprogram a tesztügyfél jogosultságaival fut, nem rootként. A normál Hestia API/adminjelszót nem használja.

## Formátum és kiadás

Kérés: `{operation: "publish", releaseId, files: [{path, content, sha256}]}`; visszaállítás: `{operation: "rollback", releaseId}`. Kizárólag UTF-8 szöveges statikus fájlok: html/css/js/mjs/json/svg/txt. 2 MiB kérés, legfeljebb 100 fájl és 512 KiB/fájl, kötelező index.html. Nem Node/SSR/PHP és nem bináris feltöltés.

A kiadásazonosító SHA256 a path szerint rendezett `path + NUL + sha256 + LF` sorokból. Minden fájl hashét újraszámolja a fogadó. Tiltott abszolút/rejtett/traversal/duplikált útvonal és symlink. Hiba vagy bizonytalan válasz esetén nincs automatikus újraküldés. Azonos kiadás csak sértetlen nyugtával és fájlokkal aktiválható újra; ismeretlen vagy módosított kiadásra nincs rollback.

A verziók a tesztügyfél `.tzsvtav-releases` könyvtárában maradnak; publikálás nem töröl korábbi kiadást. Flock sorosítja a műveleteket. A public_html állandó szimbolikus link a kiadási könyvtár `current` linkjére; a Hestia domainkönyvtárának r-x védelme megmarad. A current link atomikus rename-mel vált. A bootstrap Hestia-oldal külön megmaradt, de nem nyugtázott kiadás, tehát erre az adapter nem állít vissza.

## Gyorsítótár

A tesztnél az Nginx open_file_cache régi fájlleírót tartott meg. Csak a hosting-proba domain támogatott nginx.conf_* és nginx.ssl.conf_* kiegészítőiben: open_file_cache off, etag off, if_modified_since off, Cache-Control no-store. nginx -t és reload sikeres. Ez tesztprofil; későbbi ügyfélhostingnál verziózott assetnevek és külön HTML/cache stratégia kell.

## Bizonyíték és teszt

2026-10-20: a meglévő publikáló helyi HTTP-szervere → korlátozott SSH → új Hestia VPS → nyilvános HTTPS. 1. kiadás, 2. kiadás, rollback az elsőre; mindhárom lépésnél index.html és style.css SHA256-egyezés. Érvényes TLS, redirect megkerülés nélkül. A nyugta a privát AI Builder repó docs/evidence/hestia-rehearsal-20261020.json fájljában.

19 Node-teszt, 3 Python-teszt. Python ellenőrzi a valódi helyi fájlrendszeres váltást/visszaállítást, hibás hash/symlink/traversal/hiányzó kiadás tiltását. A Node teszt a jogosultsági és HTTP-kapukat vizsgálja. A `rehearse-hestia.mjs --execute-test` valódi írás, kizárólag tudatos kezelői indításra; CI-ben nem fut. A távoli bizonytalan művelet előtt állapotvizsgálat kötelező.

Következő: távoli fejlesztői publikálóba kontrollált kiadás, kulcsmountok és célbeállítások; majd mentett Műhely-verziók engedélyezett átküldése. A hosting a termékben továbbra sem ready. Külső backup/restore, általános ügyfélhatárok, mobil/admin belépési próba és 2FA még nyitott.
