#!/usr/bin/env python3
"""Build msc2026-reports.json: per-bottle consolidated medals + grounded evaluation
reports aggregated from the real Compify judge votes. NO numeric scores are emitted
(qualitative levels only) to honour the medagliere's no-scores rule.

Inputs : compify-all-data.json (raw {votes, regs}), src/lib/msc2026-data.json (winners)
Outputs: src/lib/msc2026-reports.json (keyed by product_id)
         src/lib/msc2026-data.json (rewritten with product_id added per entry)
"""
import json, collections, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
raw = json.load(open(os.path.join(ROOT, "compify-all-data.json")))
if isinstance(raw, str):
    raw = json.loads(raw)
votes, regs = raw["votes"], raw["regs"]
winners = json.load(open(os.path.join(ROOT, "src/lib/msc2026-data.json")))

SESS = {
    "6939c972a01ad75ff2cc788d": "nihonshu",
    "6939c9b4a01ad75ff2cc78fa": "shochu",
    "6939c9fca01ad75ff2cc7994": "design",
    "69c3105358fb8780cb37ec34": "pairing",
}

# Radar ("keyviat") axes: stable key -> source vote question (subjective 0-100 judgments)
RADAR_KEYS = {
    "design": [
        ("identita", "Identità giapponese"),
        ("originalita", "Originalità del design"),
        ("coerenza", "Coerenza stilistica"),
        ("appeal", "Appeal europeo"),
        ("impatto", "Quanto cattura l'attenzione questa bottiglia?"),
        ("primaimpressione", "Prima impressione"),
        ("leggibilita", "Leggibilità"),
        ("comunicazione", "Comunicazione e posizionamento"),
    ],
    "nihonshu": [
        ("dolcezza", "Dolcezza"), ("acidita", "Acidità"), ("umami", "Umami"),
        ("alcol", "Alcol"), ("corpo", "Corpo"), ("persistenza", "Persistenza"),
    ],
    "shochu": [
        ("dolcezza", "Dolcezza"), ("umami", "Umami"), ("alcol", "Alcol"),
        ("corpo", "Corpo"), ("persistenza", "Persistency"), ("equilibrio", "Equilibrio"),
    ],
    "pairing": [
        ("armonia", "Armonia"),
        ("primoassaggio", "Primo assaggio"),
        ("evoluzione", "Evoluzione Cibo"),
        ("pulizia", "Pulizia del palato"),
        ("match", "Match strutturale"),
        ("perscomb", "Persistenza combinata"),
        ("complessita", "Complessità dell'interazione"),
        ("perscompl", "Persistenza e complessità"),
    ],
}

# Jury averages per radar axis (across ALL votes of the session) — the "media della giuria"
_sess_votes = collections.defaultdict(list)
for _v in raw["votes"]:
    s = SESS.get(_v["session"])
    if s:
        _sess_votes[s].append(_v.get("vote") or {})
JURY = {}
for s, axes in RADAR_KEYS.items():
    JURY[s] = {}
    for kid, vk in axes:
        xs = [v.get(vk) for v in _sess_votes[s] if isinstance(v.get(vk), (int, float)) and not isinstance(v.get(vk), bool)]
        JURY[s][kid] = round(sum(xs) / len(xs)) if xs else 0

def radar_for(session, vs):
    axes = RADAR_KEYS.get(session)
    if not axes:
        return None
    out = []
    for kid, vk in axes:
        xs = [v.get(vk) for v in vs if isinstance(v.get(vk), (int, float)) and not isinstance(v.get(vk), bool)]
        if not xs:
            continue
        out.append({"key": kid, "v": round(sum(xs) / len(xs)), "avg": JURY[session][kid]})
    return out if len(out) >= 3 else None

# reg._id -> reg ; reg._id -> product_id ; product_id -> product meta
reg_by_id = {r["_id"]: r for r in regs}
def prod_of(reg):
    p = reg.get("product")
    return p.get("_id") if isinstance(p, dict) else p
regid_to_prod = {r["_id"]: prod_of(r) for r in regs}

# votes grouped by productRegistration
votes_by_reg = collections.defaultdict(list)
for v in votes:
    votes_by_reg[v["productRegistration"]].append(v.get("vote") or {})

def lvl(vals, scale):
    vals = [x for x in vals if isinstance(x, (int, float))]
    if not vals:
        return None
    a = sum(vals) / len(vals)
    return scale[0] if a < 34 else scale[1] if a < 67 else scale[2]

def mode(vals):
    vals = [str(x).strip() for x in vals if isinstance(x, str) and str(x).strip() and str(x).strip().lower() not in ("true", "false")]
    if not vals:
        return None
    return collections.Counter(vals).most_common(1)[0][0]

def topn(lists, n, exclude=()):
    c = collections.Counter()
    for L in lists:
        if isinstance(L, list):
            for x in L:
                x = str(x).strip()
                if x and x.lower() not in exclude:
                    c[x] += 1
        elif isinstance(L, str) and L.strip():
            x = L.strip()
            if x.lower() not in exclude:
                c[x] += 1
    return [w for w, _ in c.most_common(n)]

def comments(votes_list, key, cap=3):
    seen, out = set(), []
    # sort by length desc to favour informative remarks
    cands = sorted((str(v.get(key, "")).strip() for v in votes_list), key=len, reverse=True)
    for c in cands:
        k = c.lower()
        if len(c) < 4 or k in ("true", "false") or k in seen:
            continue
        seen.add(k)
        out.append(c[:240])
        if len(out) >= cap:
            break
    return out

def report_for(session, vs):
    if not vs:
        return None
    if session in ("nihonshu", "shochu"):
        is_sho = session == "shochu"
        prof = []
        for label, key, scale in [
            ("Intensità", "Intensità", ["contenuta", "media", "elevata"]),
            ("Complessità", "Complessità", ["semplice", "media", "elevata"]),
            ("Corpo", "Corpo", ["leggero", "medio", "pieno"]),
            ("Persistenza", "Persistency" if is_sho else "Persistenza", ["breve", "media", "lunga"]),
            ("Dolcezza", "Dolcezza", ["secco", "equilibrato", "morbido"]),
        ]:
            lv = lvl([v.get(key) for v in vs], scale)
            if lv:
                prof.append({"k": label, "v": lv})
        rep = {
            "clarity": mode([v.get("Limpidezza") for v in vs]),
            "color": mode([v.get("Color" if is_sho else "Colore") for v in vs]),
            "profile": prof,
            "aromas": topn([v.get("Aroma tags" if is_sho else "Aromi") for v in vs], 5),
            "palate": topn([v.get("Palate descriptors" if is_sho else "Descrittori palatali") for v in vs], 5),
            "comments": comments(vs, "Final judgment" if is_sho else "Giudizio finale"),
        }
        if is_sho:
            rep["distillation"] = mode([v.get("Metodo di distillazione") for v in vs])
            rep["texture"] = topn([v.get("Texture") for v in vs], 4)
        else:
            foods = ["Lasagne", "Parmigiano Reggiano", "Prosciutto crudo di San Daniele", "Tartufo", "Gelato alla fragola"]
            avg = {}
            for f in foods:
                xs = [v.get(f) for v in vs if isinstance(v.get(f), (int, float))]
                if xs:
                    avg[f] = sum(xs) / len(xs)
            rep["pairing_top"] = [f for f, _ in sorted(avg.items(), key=lambda kv: kv[1], reverse=True)[:2]]
        r = radar_for(session, vs)
        if r:
            rep["radar"] = r
        return rep
    if session == "design":
        prof = []
        for label, key, scale in [
            ("Identità giapponese", "Identità giapponese", ["sobria", "presente", "marcata"]),
            ("Originalità", "Originalità del design", ["essenziale", "equilibrata", "spiccata"]),
            ("Coerenza stilistica", "Coerenza stilistica", ["essenziale", "buona", "elevata"]),
            ("Appeal europeo", "Appeal europeo", ["di nicchia", "buono", "ampio"]),
        ]:
            lv = lvl([v.get(key) for v in vs], scale)
            if lv:
                prof.append({"k": label, "v": lv})
        rep = {
            "messages": topn([v.get("Quali messaggi trasmette il design?") for v in vs], 4),
            "channels": topn([v.get("Canale di vendita") for v in vs], 3),
            "price": mode([v.get("Fascia di prezzo percepita") for v in vs]),
            "profile": prof,
            "comments": comments(vs, "Consiglio al produttore"),
        }
        r = radar_for(session, vs)
        if r:
            rep["radar"] = r
        return rep
    if session == "pairing":
        rep = {
            "harmony": lvl([v.get("Armonia") for v in vs], ["delicato", "armonico", "molto armonico"]),
            "role": mode([v.get("Ruolo del sake") for v in vs]),
            "descriptor": mode([v.get("Descrittori dell'abbinamento") for v in vs]),
            "context": mode([v.get("Contesto gastronomico") for v in vs]),
            "other": comments(vs, "Altri abbinamenti", cap=3),
        }
        r = radar_for(session, vs)
        if r:
            rep["radar"] = r
        return rep
    return None

# Group winners by product_id, attach product_id to each entry
# Food Pairing: the data has one non-Magnifica tier (good_with). Split it into Best With (top half by
# pairing score, per food) + Good With (bottom half) so both award levels appear. (Layout split.)
_pair_score = collections.defaultdict(list)
for _v in raw["votes"]:
    if _v["session"] == "69c3105358fb8780cb37ec34":
        _x = (_v.get("vote") or {}).get("Voto complessivo")
        if isinstance(_x, (int, float)) and not isinstance(_x, bool):
            _pair_score[_v["productRegistration"]].append(_x)
_pavg = {k: sum(v) / len(v) for k, v in _pair_score.items()}
_bycat = collections.defaultdict(list)
for e in winners:
    if e["session"] == "pairing" and e["medal"] == "good_with":
        _bycat[e["category"]].append(e)
for _cat, _lst in _bycat.items():
    _lst.sort(key=lambda e: _pavg.get(e["reg_id"], 0), reverse=True)
    _half = (len(_lst) + 1) // 2
    for _i, _e in enumerate(_lst):
        _e["medal"] = "best_with" if _i < _half else "good_with"

prod_meta = {}
medals_by_prod = collections.defaultdict(list)
for e in winners:
    if e["medal"] == "magnifica":
        e["product_id"] = regid_to_prod.get(e["reg_id"])
        continue
    pid = regid_to_prod.get(e["reg_id"])
    e["product_id"] = pid
    if not pid:
        continue
    medals_by_prod[pid].append({
        "session": e["session"], "category": e["category"], "medal": e["medal"],
        "cat_code": e["cat_code"], "reg_id": e["reg_id"],
    })
    if pid not in prod_meta:
        reg = reg_by_id.get(e["reg_id"], {})
        p = reg.get("product") or {}
        comp = p.get("company") or {}
        prod_meta[pid] = {
            "website": comp.get("website") or None,
            "description_jp": (comp.get("description") or "").strip() or None,
            "social": comp.get("social") or [],
            "slug": p.get("slug"),
            "company_slug": comp.get("slug"),
        }

MEDAL_RANK = {"platinum": 0, "double_gold": 1, "gold": 2, "silver": 3, "best_design": 4, "good_design": 5, "best_with": 6, "good_with": 7}

out = {}
for pid, medals in medals_by_prod.items():
    medals = sorted(medals, key=lambda m: MEDAL_RANK.get(m["medal"], 9))
    # reports only for sessions where the bottle WON a medal (positive, marketing-safe)
    won_sessions = []
    for m in medals:
        if m["session"] not in won_sessions:
            won_sessions.append(m["session"])
    reports = {}
    # find this bottle's reg per won-session to pull that session's votes
    bottle_regs = [r for r in regs if prod_of(r) == pid]
    sess_to_regid = {}
    for r in bottle_regs:
        sid = r["session"]["_id"] if isinstance(r.get("session"), dict) else r.get("session")
        s = SESS.get(sid)
        if s:
            sess_to_regid.setdefault(s, r["_id"])
    for s in won_sessions:
        rid = sess_to_regid.get(s)
        rep = report_for(s, votes_by_reg.get(rid, [])) if rid else None
        if rep:
            reports[s] = rep
    out[pid] = {"medals": medals, "reports": reports, **prod_meta.get(pid, {})}

json.dump(out, open(os.path.join(ROOT, "src/lib/msc2026-reports.json"), "w"), ensure_ascii=False, separators=(",", ":"))
json.dump(winners, open(os.path.join(ROOT, "src/lib/msc2026-data.json"), "w"), ensure_ascii=False, separators=(",", ":"))

# Summary
multi = sum(1 for m in medals_by_prod.values() if len({x["session"] for x in m}) > 1)
nrep = sum(len(v["reports"]) for v in out.values())
print(f"bottles: {len(out)} | multi-session medals: {multi} | reports generated: {nrep}")
print(f"reports.json size: {os.path.getsize(os.path.join(ROOT,'src/lib/msc2026-reports.json'))//1024} KB")
# sample
import itertools
for pid, rec in itertools.islice(out.items(), 1):
    print("\nSAMPLE", pid)
    print("medals:", [(m['session'], m['medal']) for m in rec['medals']])
    print("reports keys:", list(rec['reports'].keys()))
    print(json.dumps(rec['reports'], ensure_ascii=False)[:800])
