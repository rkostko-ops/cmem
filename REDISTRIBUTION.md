# Redystrybucja / Redistribution notice

To repozytorium (`rkostko-ops/cmem`) to **fork** pakietu **`@colbymchenry/cmem`**
autorstwa **Colby McHenry** (licencja **MIT**).

- **Oryginał** nie jest publicznie dostępny (brak na npm, brak publicznego repo autora);
  pakiet trafił do nas jako artefakt npm (`npm pack`).
- **Nasza zmiana:** poprawka błędu zapytań vec0 knn → `vec_distance_L2()` we wszystkich
  punktach wejścia (`cli`, `consult`, `synthesize`, `server`). Bez tej zmiany `search_lessons`
  zwracało błąd vec0 knn. Wersja: `0.5.4-fork.1`.
- **Dystrybucja jest dist-only** — upstream nie udostępnił źródeł TypeScript; fork patchuje
  skompilowany `dist/` bezpośrednio.

Prawa autorskie do oryginalnego kodu należą do Colby McHenry (patrz `LICENSE`, MIT).
Publikujemy zgodnie z warunkami MIT, z zachowaniem pełnej treści licencji i atrybucji.
Celem jest reprodukowalna instalacja dla zespołu RAS (analogicznie do `rkostko-ops/neuledge`).

Instalacja (źródłem jest tag/Release):
```bash
npm install -g https://github.com/rkostko-ops/cmem/releases/download/v0.5.4-fork.1/colbymchenry-cmem-0.5.4-fork.1.tgz
```
