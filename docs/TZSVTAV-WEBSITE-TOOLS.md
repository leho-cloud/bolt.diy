# Műhely-eszközök a meglévő Boltban

Ez a meglévő Bolt alkalmazást bővíti. Nem készül új ügyfélwebhely vagy második építőtelepítés.

## Bekötések

- `website_reference`: a Műhely meglévő Oxylabs-szolgáltatását hívja. A szolgáltatói kulcs a Műhelyben marad; a napi ügyfél- és összkeret, a tartós cache és a nyilvános URL/DNS-ellenőrzés közös. A modell a tényleges képet kapja multimodális eredményként, nem base64 szövegként. Csak a felhasználó által megadott URL használható; kérésenként legfeljebb két külön beolvasás. Megadott URL esetén az ügynök nem kap szerkesztőeszközöket a sikeres beolvasásig. Ha nincs kép, nem állíthatja a minta felhasználását.
- `design_21st_*`: a hivatalos 21st MCP-kapcsolatból dinamikusan felfedezett kereső/generáló eszközök. A serveren nincs kitalált API-paraméterezés. Telepítési, törlési, publikálási, fiók- és számlázási eszközöket nem teszünk elérhetővé. Kérésenként legfeljebb 6 hívás, ebből 2 generáló. Generálás csak külön szerveroldali kapcsolóval. A piactéri elemek licence egyenként ellenőrizendő; a platform továbbértékesítési feltételeit külön rendezni kell. Egy kulcs megléte önmagában nem igazolja a kereskedelmi beágyazási jogot.
- `project_quality_report`: az aktuális böngészős projekt forrásainak szintaxisellenőrzése és a valóban létező build/typecheck/lint parancsok felsorolása. Nem futtat ügyfélkódot a kiszolgálón. Nem állít fordítási, működési vagy látványellenőrzési sikert. Az AI a valós parancsokat a meglévő WebContainerben futtatja; hibánál célzott javítás és új ellenőrzés szükséges.
- Új webes ügynökterv csak friss forrásellenőrzés és a meglévő futtatás/tesztkapu után zárható le. Későbbi módosítás érvényteleníti az ellenőrzést.
- A közös arculatot `.muhely/design.json` alatt kell megőrizni és minden aloldalon újrahasználni. Ez a kiválasztott megjelenés rögzítése, nem kész sablon kötelező ráerőltetése.
- Az összetett webes és referenciás feladatok automatikus OpenRouter-módban a meglévő Műhely minőségi modelljéhez kerülnek. A kézi modellválasztás megmarad.

## Védett beállítások

Műhely DEV:

```text
BOLT_TOOL_BRIDGE_TOKEN=<legalább 32 véletlen karakter>
```

Meglévő Bolt, futásidejű változók (nem VITE_ és nem build argumentum):

```text
MUHELY_TOOL_BRIDGE_URL=https://muhely-dev.builder.tzsvtav.com
MUHELY_TOOL_BRIDGE_TOKEN=<ugyanaz a szűkített szerverkapcsolati titok>
TWENTY_FIRST_API_KEY=<saját 21st-kulcs, ha van>
TWENTY_FIRST_GENERATION_ENABLED=false
```

A 21st-kulcs nélkül a designeszköz nincs aktívként feltüntetve. Fizetős csomag nem indul automatikusan. Az OXY-szolgáltatás továbbra is a meglévő Műhelyben kezelt kulcsot használja. A Bolt OpenRouter-fiókja/kulcsa külön, meglévő szerveroldali konfiguráció; a bridge nem másolja át az AI-kulcsot.

A futtatószkript átadja az új változókat az alkalmazást kiszolgáló Workernek. Titok nem kerül a forrásba, logba, böngészős projektbe vagy klienscsomagba.

## Látványellenőrzés határa

A meglévő Browser Use MCP-eszközökkel az AI a tényleges, JavaScriptet futtató React-előnézetet vizsgálhatja asztali és mobilnézetben. Ez csak akkor működik, ha ez a kapcsolat ténylegesen konfigurált és eléri az előnézetet. Az utasítás önmagában nem bizonyít elvégzett látványellenőrzést. A régi Műhely JavaScript nélküli statikus képernyőképezőjét nem nevezzük át React-ellenőrzőnek. A 21st Design Bug Bot nincs a háttérben bekapcsolva: az külön GitHub/React ellenőrző termék, nem azonos az MCP designkereséssel.

## Telepítési ellenőrzés

Előbb Műhely DEV-frissítés és a bridge token kétoldali konfigurációja, majd a meglévő Bolt frissítése. A hitelesítetlen bridge 401-et, a konfigurálatlan bridge 503-at ad, és egyik esetben sem indít OXY-kérést. Ezután a meglévő projektben `website_tools_status`, tényleges mintabeolvasás, minőségi modellhívás, build és képernyős ellenőrzés szükséges. A felület látható eszközállapotai ne legyenek összekeverve az elkészült oldal minőségével.
