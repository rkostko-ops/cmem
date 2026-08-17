Jasne — cały mechanizm tego repo sprowadza się do lokalnego systemu pamięci dla Claude Code, który robi trzy rzeczy naraz: zbiera sesje, zamienia je w przeszukiwalną bazę wiedzy, a potem wystawia to zarówno jako CLI, jak i serwer MCP.

1. Warstwa danych

Rdzeniem jest SQLite w ~/.cmem/sessions.db. W tej bazie trzymane są surowe sesje i ich wiadomości, embeddingi sesji, ulubione sesje i foldery, kolejka do syntezy, lekcje wyciągnięte z rozmów, feedback do lekcji, kolejność projektów, stan embeddingów i powiązania injection.

To znaczy, że repo nie opiera się na zewnętrznym backendzie — cała pamięć jest lokalna, a SQLite pełni rolę trwałego magazynu i indeksu semantycznego.

2. Skąd biorą się sesje

System skanuje katalog ~/.claude/projects oraz ~/.claude/sessions, szuka plików .jsonl, parsuje je i zamienia na rekordy sesji. Dodatkowo rozpoznaje sesje sidechain, sesje meta, sesje automatyczne po tytule albo metadanych, oraz subagent messages w katalogach subagents.

Każda sesja dostaje id, tytuł, summary, daty, project path, źródłowy plik, raw data i listę wiadomości.

3. Indeksowanie i wyszukiwanie sesji

Po wczytaniu sesji system generuje embeddingi przez model nomic-ai/nomic-embed-text-v1.5 z @xenova/transformers. Tekst wejściowy jest ucinany do 8000 znaków, a embedding ma 768 wymiarów.

Wyszukiwanie działa tak: zapytanie użytkownika jest embedowane, baza porównuje embedding zapytania z embeddingami sesji przez vec_distance_L2, a wyniki są zwracane według najmniejszej odległości.

Czyli semantyczne wyszukiwanie nie opiera się na słowach kluczowych, tylko na znaczeniu.

4. Interfejs CLI

dist/cli.js jest głównym wejściem. Jeśli trzeba, uruchamia setup, a potem albo startuje interaktywny terminalowy UI w Ink, albo wykonuje jedną z komend: save, list, search, restore, delete, purge, stats, watch, mcp, synthesize, gui.

W praktyce CLI jest operacyjnym centrum całego systemu. To przez nie użytkownik przegląda historię, zarządza nią, czyści stare sesje, odpala MCP server i uruchamia syntezę lekcji.

5. Mechanizm backupów i purge

Repo robi też lokalne kopie bezpieczeństwa plików sesji w ~/.cmem/backups. Backupy są organizowane według nazwy projektu i nazwy pliku sesji.

Przy purge: system liczy, ile starych sesji można usunąć, pomija ulubione sesje, usuwa rekordy z bazy, usuwa embeddingi i embedding state, usuwa też odpowiednie backupy, czyści puste katalogi.

To oznacza, że usuwanie nie jest tylko kasowaniem rekordów, ale pełnym czyszczeniem lokalnej pamięci.

6. Mechanizm lekcji

Drugim filarem repo są lessons. To nie są sesje, tylko skondensowana wiedza z sesji. Każda lekcja ma kategorię, tytuł, trigger context, insight, reasoning, confidence, licznik użyć i walidacji oraz flagę archived.

Lekcje można tworzyć ręcznie, zapisywać z syntezy, edytować, archiwizować, usuwać, walidować i odrzucać.

Po zapisaniu lub aktualizacji lekcji generowany jest embedding, a potem lekcja może być wyszukana semantycznie po projekcie.

7. Synteza lekcji z sesji

To jest najbardziej inteligentny mechanizm w repo. Kolejka synthesis_queue zbiera sesje do przetworzenia. Potem processSynthesisQueue(): bierze pending sesje, oznacza je jako processing, pobiera sesję i wiadomości, uruchamia Claude CLI headless, prosi model o wyciągnięcie reusable lessons, parsuje odpowiedź jako JSON, deduplikuje lekcje przez embedding similarity, zapisuje nowe lekcje do bazy i oznacza zadanie jako completed albo failed.

Prompt jest bardzo ważny: model ma wyciągać tylko rzeczy naprawdę reusable, w kategoriach takich jak architecture decision, anti-pattern, bug pattern, project convention, dependency knowledge, domain knowledge i workflow.

Czyli synteza nie jest zwykłym streszczeniem rozmowy, tylko transformacją historii w bazę reguł i praktyk.

8. MCP server

Dist/mcp/server.js wystawia cały system jako zestaw narzędzi MCP. Dzięki temu Claude Code może nie tylko czytać pamięć, ale też aktywnie z niej korzystać. Dostępne narzędzia obejmują wyszukiwanie sesji, listowanie sesji, pobieranie pełnej sesji, pobieranie kontekstu, search-and-summarize, wyszukiwanie lekcji, pobieranie lekcji, zapisywanie lekcji, walidację i odrzucanie lekcji.

To znaczy, że repo działa jak lokalny knowledge layer dla modeli: model może sam znaleźć historię, przeczytać ją, wydobyć wiedzę i ją zapisać.

9. Jak przepływa dane

Najprościej wygląda to tak:
1. Claude Code tworzy sesję w ~/.claude.
2. CLI skanuje pliki sesji i zapisuje je do SQLite.
3. Sesje są embedowane i indeksowane semantycznie.
4. Użytkownik szuka sesji przez CLI albo MCP.
5. Wybrane sesje trafiają do kolejki syntezy.
6. Claude CLI wyciąga z nich lekcje.
7. Lekcje są deduplikowane, zapisywane i embedowane.
8. MCP wystawia te lekcje i sesje jako narzędzia dla kolejnych rozmów.

To tworzy zamkniętą pętlę pamięci: sesja → indeks → synteza → lekcja → ponowne użycie.

10. Co tu jest kluczowe

Najważniejsza idea repo to rozdzielenie dwóch poziomów pamięci: raw memory, czyli pełne sesje i wiadomości, oraz semantic memory, czyli lekcje, streszczenia i embeddingi.

Raw memory daje pełny kontekst i możliwość powrotu do źródła. Semantic memory daje szybkie przypominanie sobie ważnych reguł bez przeglądania całej historii.

11. Ograniczenia i konsekwencje

Mechanizm jest mocny, ale ma kilka konsekwencji: zależy od lokalnych plików Claude Code, embeddingi i synteza wymagają modelu i mogą się nie wykonać bez środowiska, parsowanie odpowiedzi Claude do JSON jest kruche, deduplikacja lekcji jest heurystyczna, a wszystko jest lokalne, więc skala i wydajność zależą od maszyny użytkownika.

Mimo tego projekt jest spójny: to lokalna, praktyczna pamięć operacyjna dla pracy z Claude Code, a nie klasyczny backendowy system pamięci.