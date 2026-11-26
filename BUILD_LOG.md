# BUILD_LOG — Langit Nusantara (best-flight-game-20261126-0057)

Bounty: Make the best flight game — https://make.fun/bounty/best-flight-game-20261126-0057
Hadiah: $500 total (1st $100, 50 tempat dibayar). Entry gratis, escrow USDC $500 terdanai.
Deadline: Sabtu 28 Nov 2026 07:57 WIB (00:57 UTC). Dibuka 26 Nov 2026 01:05 UTC.
Semua waktu di bawah ini WIB (Asia/Jakarta).

## 2026-11-26 08:08 WIB — Baca aturan
- Baca ~/workspace/bounty-work/entries/best-cooking-game-20261125/ (main.ts, game/, tools/, BUILD_LOG.md) sebagai pola entri yang sudah terbukti.
- Unduh kit resmi /c/best-flight-game-20261126-0057/kit; baca RULES.txt (473 baris). Beda penting dari bounty masak: blind rounds (tidak ada rank live sampai hasil), 48 jam, 50 tempat dibayar, 200 kursi final heat.
- Verifikasi halaman bounty via crawl 26 Nov 01:06 UTC: escrow $500 terkunci sejak 01:05:24 UTC, entry gratis, deadline 28 Nov 00:57 UTC.
- Keputusan desain: game terbang orisinal "Langit Nusantara" — pesawat prop "Elang Laut" mengelilingi kepulauan fiksi Indonesia (Pulau Karang, Pulau Api, Pulau Hijau + 4 pulau kecil), 6 ring emas lalu mendarat di runway Karang Field. Renderer perspektif tulisan sendiri di Canvas 2D (mesh heightfield), tanpa library eksternal.

## 2026-11-26 08:10–08:40 WIB — Tulis game (orisinal, dari nol)
- game/src/config.js — tuning, palet, pulau, runway, ring.
- game/src/random.js — mulberry32 + helper sudut.
- game/src/world.js — heightfield Gaussian + plateau lapangan terbang, warna terrain (band halus + jitter per sel), ring + normal arah, awan & kilau laut (seeded).
- game/src/physics.js — model terbang arcade (pitch/roll/throttle, stall, banked turn, fuel), deteksi ring (lintas bidang + jarak dekat), landing/crash, co-pilot autopilot (line-up ring, terrain floor, final 2 fase + flare).
- game/src/audio.js — suara sintesis WebAudio (mesin, angin, ring, touchdown, crash, fanfare).
- game/src/draw.js — kamera perspektif (chase look-at + kokpit), langit/matahari, laut, mesh terrain, runway + marking + lampu + windsock + hangar, ring, awan, pesawat chase, hidung kokpit.
- game/src/render.js — HUD (ALT/SPD/HDG + compass tape, throttle, fuel, skor, ring, timer, penunjuk ring), panel instrumen kokpit (attitude, altimeter, airspeed, heading, throttle lever, lampu warning), layar title/pause/crash/landed.
- game/src/input.js — keyboard + mouse drag steering.
- game/src/shots.js — staging deterministik 4 scene (cover/rings/cockpit/land), simulasi dibekukan.
- game/src/main.js — boot + loop fixed-step 1/60, ?seed=N, ?shot=..., window.__langitNusantara untuk play-test.
- main.ts — ditulis sendiri mengikuti pola starter/kit: cp game/ + screenshots/ ke /output, tulis dossier.json via buildDossier.
- tools/take-shots.mjs, tools/playtest.mjs — mengikuti pola entri cooking game (CDP + headless Chromium).

## 2026-11-26 08:40–09:10 WIB — Screenshot putaran 1–3 + perbaikan visual
- Putaran 1: game jalan, tapi (1) runway di lereng bukit (pendekatan terhalang), (2) terrain kotak-kotak dan pucat (bug shadeColor: mixHex mengembalikan string rgb() lalu di-parse sebagai hex → NaN → fillStyle lama terpakai), (3) bayangan pesawat raksasa, (4) plane hilang di shot land (kamera chase menempel terrain).
- Perbaikan: plateau lapangan terbang (elips 750x300, pusat -150,200) + runway strip rata persis 2 m; shadeColor/mixHex dirombak ke array RGB; mesh 44 kolom + 26 baris + band warna halus + jitter; kamera chase look-at (selalu membidik titik di depan pesawat, clamp naik maks 12 m di atas pesawat); bayangan diskalakan dari ukuran pesawat di layar; label runway & lampu dibatasi ukurannya; windsock disembunyikan bila terlalu dekat.
- Putaran 2: chase view blank (dark blue) — bug TDZ: `let h` dideklarasi setelah cabang yang menggunakannya di makeCamera. Dipindah ke atas cabang.
- Putaran 3: terrain hijau benar, tapi (1) "27" raksasa & windsock raksasa di shot land, (2) plane terpotong bawah, (3) ring tersembunyi di balik pesawat di cover. Perbaikan: cap font/lampu, lookAt +4 m, cover di-staging ulang (ring di kiri pesawat).
- Putaran 4: cover & land bagus; land masih ada elips gelap di horizon — diselidiki via varian tanpa awan: ternyata itu puncak bukit pulau di seberang horizon (terrain asli, bukan artefak). Diterima.

## 2026-11-26 09:10–09:40 WIB — Play-test & perbaikan autopilot
- Play-test 1 GAGAL: co-pilot terbang lurus ke timur, 0 ring, kehabisan bahan bakar lalu jatuh ke laut. Akar: arah belok terbalik (heading -= roll; harus +=) dan kompas salah 90° (heading 0 = timur, harus 090° E). Perbaikan: heading += roll; headingDeg +90°; jarum heading dial diperbaiki; radius ring "through" 0,75x; fuelDrain 0,22 → 0,16.
- Play-test 2: 6/6 ring dalam 206 dtk, tapi crash di final approach ("Menabrak daratan" di (-551,58,250)): pendekatan terlalu rendah melewati rim plateau. Perbaikan: plateau diperlebar ke barat + terrain floor di autopilot.
- Play-test 3: 6/6 ring, tapi pesawat mengorbit di atas runway 742 dtk tanpa mendarat: terrain floor 38 m menghalangi descent. Perbaikan: floorMargin jadi parameter (4 m di final, lalu useFloor=false di final).
- Play-test 4: 6/6 ring, tapi pesawat mengorbit fix (-800,140,200): kondisi "lined up" tanpa latch — begitu x > -450, target kembali ke fix. Perbaikan: latch onFinal + missed-approach di x > 650.
- Play-test 5: crash di (270,5,175) heading -44°: target final (200,5,200) terlalu dekat — pesawat melewatinya lalu berbalik sambil menyentuh tanah. Perbaikan: target final (600,5,200).
- Play-test 6: crash di (317,27,206): glide slope terlalu landai — pesawat mencapai tanah di luar ujung runway (terrain naik curam). Perbaikan: final 2 fase (turun ke threshold 20 m, lalu flare -2,5 m/s dengan targetVs).
- Play-test 7 LULUS: takeoff → 6/6 ring → landing di (-84,4,197), heading 0°, skor 2.098, waktu 201 dtk, fuel isi ulang 100, 0 console error, 11 request lokal saja.

## 2026-11-26 09:40 WIB — Verifikasi gate + repo (menyusul di bawah)
