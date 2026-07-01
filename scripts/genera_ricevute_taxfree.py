#!/usr/bin/env python3
"""
Genera le ricevute MSC 2026 per i giudici "Tax Free" (Compify).
- Template: ~/Desktop/Ricevuta MSC 2026.docx  (campi evidenziati in giallo)
- Output : ~/Desktop/TaxFree/<Cognome>.docx   (uno per persona, dedup)
Decisioni utente: ordine = "Cognome Nome"; indirizzo = split best-effort; duplicati = dedup.
Importi e data restano quelli del template (100/25/125 €, 26/06/2026): NON evidenziati.
"""
import os, re, sys
from docx import Document
from docx.enum.text import WD_COLOR_INDEX

TEMPLATE = os.path.expanduser("~/Desktop/Ricevuta MSC 2026.docx")
OUTDIR   = os.path.expanduser("~/Desktop/TaxFree")

# (idx, Nome, Cognome, Indirizzo, CodiceFiscale)  -- scraped from Compify Tax Free (61)
DATA = [
 (0,"Giovanna","Di Meglio","Via Aldo Moro 16, San Martino Siccomario, 27028, PV","DMGGNN83R57E396E"),
 (1,"Matteo","Lucchese","Via Divisione Acqui 3","LCCMTT82A29B296B"),
 (2,"Marco","Fasola","Piazzale Segrino 6","FSLMRC82L24F205M"),
 (3,"Valerio","Fiori","Corso san Michele del Carso 13, 23900 Lecco","FRIVLR91B12F205M"),
 (4,"Alessandro","Ticci","Via Guareschi 107, 41126 Modena","TCCLSN78S11D612P"),
 (5,"Stefano","Battini","Via Astorri 13","BTTSFN72D24G535T"),
 (6,"Alan","Ugge","Via matteotti, 1/B - 27010 Borgarello (PV)","GGULNA84D02C816K"),
 (7,"higor gustavo","sonaque do nascimento","rogih47@gmail.com","SNQHRG04C05Z602Q"),
 (8,"Paolo","Vittori","Via libertà 69 24050 Zanica Bg","VTTPLA72T22I628Q"),
 (9,"Gianluca Francesco","Pirotta","Via Pusiano 30","PRTGLC74S11F205Z"),
 (10,"Domenico","Di Zillo","Via Osti, 10 - Milano","DZLDNC66H01F205S"),
 (11,"Manuele","Orio","Via Valle Anzasca, 1 Milano 20152","ROIMNL95P21G856E"),
 (12,"Matilde","Darisi","Via amerigo vespucci 23","DRSMLD02S52F205Z"),
 (13,"Sebastiano","Gambacorta","Via napoli 314/a","GMBSST97M17A662K"),
 (14,"Bruno Ermanno","Rondi","Via valleggia 12 14040 Castelnuovo Calcea (AT)","Rndbnr67s29l219f"),
 (15,"Gouseppe","Albaceli","91 Oberalpstraße Andermatt","LBCGPP73A08L736Q"),
 (16,"Massimiliano","Di massimo","Viale dello scalo San Lorenzo 77 (Roma)","DMSMSM99R05H501I"),
 (17,"Giacomo","Gargiulo","Via Montecorbo 1 Massa Lubrense 80061 Napoli","Grggcm92d13i208k"),
 (18,"Brunella","Bettati","Via La Roche 10 10056 OULX","BTTBNL65E48C665X"),
 (19,"Maria Cristina","Reale","Via Dott Ragusa 243","RLEMCR00H45F899V"),
 (20,"Tommaso","Mauro","Via padre Alessandro Valignani 87","Mratms80a06c632v"),
 (21,"Ilaria","Castellaneta","Via casa di giacomo 13 Salerno","CSTLRI91B61H703T"),
 (22,"Simone","Ottuzzi","Via Pavia 31/1","Ttzsmn78e05f754g"),
 (23,"Marco","Cavallotto","Regione sessania 3 monastero bormida AT","Cvlmrc61b21d969r"),
 (24,"Andrea","Piras","Mettlenstrasse 25","Prsndr74a02i851y"),
 (25,"Christina","Ishiba","Piazzale Ferdinando Martini 1, Scala C Piano 7 20137, Milano","SHBCRS00E67Z404T"),
 (26,"MIHO","OBARA","VIA PRELIO, 59","BROMHI71L46Z219C"),
 (27,"Yun Sara","Huang","Via dario niccodemi 8 Milano","Hngysr92t55e734e"),
 (28,"Nini","Castelli","Via Santa Maria delle giummare 57","Cstnni87t55f061s"),
 (29,"HARUNA","SUGAWARA","via tuacolana 1021","SGWHRN95B41Z219U"),
 (30,"Paolo","Dainotto","Via Fornaci 4","DNTPLA76L27L400Q"),
 (31,"Madoka Luisa","Okada","Via don Luigi Sturzo 24, Gorgonzola 20064","KDOMKL77A47E379W"),
 (32,"Gianlucs","Spuntarelli","Via Anagnina, 147A","00046"),
 (33,"Aurora","Altea","Via Chianciano 9","LTARRA95B41H856X"),
 (34,"Angela","Miccio","Via dei platani","Mccngl65l57f030q"),
 (35,"Luca","Balconi","Viale rimembranze 44","BLCLCU80L31A794J"),
 (36,"Antonio Alessandro","Di Cicco","Via privata baveno, 2","Dccnnl87p26d662d"),
 (37,"Alice","Raimondi","Via Corridoni 33, 20020 Busto Garolfo (MI)","RMNLCA96C46E801A"),
 (38,"Alan","Ugge","Via matteotti, 1/B - 27010 Borgarello (PV)","GGULNA84D02C816K"),
 (39,"Federico","Mela","Via cantarane 3 Verona","37129"),
 (40,"Nil","Dilekcan","Via Privata Decemviri, 6","DLKNLI05L67Z243P"),
 (41,"ANGELA","FERRARI","Via Monte Suello 6","FRRNGL78T67B157G"),
 (42,"Milo","Villa","Canonica d’adda via donizetti 30","VLLMLI94B09A794G"),
 (43,"Riccardo","Speranza","Via andrea ponti","Sprrcr80l26d548x"),
 (44,"Mauro","Bonutti","Via del Castello 33","BNTMRA64H02F356Q"),
 (45,"Melissa","Corazza","Via Crespole e Fabbriche, 98","CRZMSS75M55Z404G"),
 (46,"Carlo","Boccolato","Via savio in s.andrea, 333 cesena, 47522","Bcccrl83c04i234l"),
 (47,"Alessia","Basso","Via gaetano donizetti 64 al","Bsslss80e45l304n"),
 (48,"Toru","Wada","St. Johanns-Parkweg 5, 4056 Basel, Switzerland","CHE-351.679.722 MWST"),
 (49,"Selena","Mastromartino","Via Filippo Brunelleschi 5","Mstsln84m50f104q"),
 (50,"Mariano","Pirrò","Via chianciano,9 Milano 20161","PRRMRN94B27F839X"),
 (51,"christopher","habib","via aristotele 6","HBBCRS04E13H264R"),
 (52,"Shou Alessio","Paganotti","via felice casati 39","PGNSLS99R19F205S"),
 (53,"Francesca","Martinazzo","Via Francesco Brioschi 27","MRTFNC83B54D643L"),
 (54,"Giada","Garatti","Via verdi","GRTGDI90T61I577X"),
 (55,"Valentina","Piovillico","Via arrigo boito 13","PVLVNT92L46G482G"),
 (56,"Cristina","Volpi","Via pompeo Marchesi 42","VLPCST75r71L682D"),
 (57,"Camilla","Bonnannini","64 Raddlebarn Road","BNNCLL95R70H501I"),
 (58,"Alessandro","Cesca","Via Rovereto 70/6, 10136, Torino TO","CSCLSN87B27L219R"),
 (59,"Christian","Di michele","Strada virgo potens 2/c","DMCCRE91T01L304L"),
 (60,"Cristina","Volpi","Via Pompeo Marchesi 42","VLPCST75R71L682D"),
]

CF_RE = re.compile(r'^[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]$')

def valid_cf(cf):
    return bool(CF_RE.match(cf.strip().upper()))

def parse_address(a):
    """Best-effort split: -> (street, 'CAP City (Prov)', confident:bool, note)."""
    a = " ".join(a.strip().split())
    if "@" in a:
        return (a, "", "mancante")
    prov = ""
    # provincia tra parentesi a 2 lettere
    m = re.search(r'\(\s*([A-Za-z]{2})\s*\)', a)
    if m:
        prov = m.group(1).upper()
        a = (a[:m.start()] + " " + a[m.end():]).strip()
        a = " ".join(a.split())
    cap = ""
    before, after = a, ""
    m = re.search(r'(?<!\d)(\d{5})(?!\d)', a)   # CAP italiano = 5 cifre
    if m:
        cap = m.group(1)
        before = a[:m.start()].strip(" ,-")
        after  = a[m.end():].strip(" ,-")
    # provincia in coda (es. "Torino TO", "Zanica Bg")
    if not prov and after:
        mm = re.search(r'(?:^|[\s,])([A-Za-z]{2})$', after)
        if mm:
            prov = mm.group(1).upper()
            after = after[:mm.start()].strip(" ,-")
    # determina citta' e via
    if after:
        city, street = after, before
    else:
        parts = [p.strip() for p in before.split(",") if p.strip()]
        if len(parts) >= 2:
            city, street = parts[-1], ", ".join(parts[:-1])
        else:
            city, street = "", before
    # se la "citta'" inizia con un numero civico, riportalo sulla via
    mc = re.match(r'^(\d+\s*[A-Za-z]?)\s+(.+)$', city)
    if mc:
        street = (street + " " + mc.group(1)).strip()
        city = mc.group(2).strip()
    street = street.strip(" ,-")
    line3 = " ".join(x for x in [cap, city, (f"({prov})" if prov else "")] if x).strip()
    # classifica per il report (il caso "mancante" e' gia' gestito a inizio funzione)
    if not cap and not prov:
        cat = "solo_via"          # nel sistema c'e' solo la via (CAP/citta' assenti)
    elif city[:1].isdigit():
        cat = "sospetto"          # split dubbio da ricontrollare
    else:
        cat = "ok"
    return (street, line3, cat)

def clear_hl(run):
    run.font.highlight_color = None

def fill_doc(nome, cognome, indirizzo, cf):
    doc = Document(TEMPLATE)
    full = f"{cognome} {nome}".strip()
    street, capcity, _ = parse_address(indirizzo)
    P = doc.paragraphs
    # P0 R0 nome (intestazione)
    P[0].runs[0].text = full; clear_hl(P[0].runs[0])
    # P1 R0 via
    P[1].runs[0].text = street; clear_hl(P[1].runs[0])
    # P2 R0..R3 -> CAP Citta (Prov) sulla prima, svuota le altre
    P[2].runs[0].text = capcity; clear_hl(P[2].runs[0])
    for ri in (1, 2, 3):
        P[2].runs[ri].text = ""; clear_hl(P[2].runs[ri])
    # P3 R0 "C.F. " (mantieni etichetta), R1 codice fiscale
    clear_hl(P[3].runs[0])
    P[3].runs[1].text = cf.strip(); clear_hl(P[3].runs[1])
    # P16 R5 nome nel corpo
    P[16].runs[5].text = full; clear_hl(P[16].runs[5])
    return doc

def safe_filename(cognome):
    name = cognome.strip()
    name = re.sub(r'[\\/:*?"<>|]', "-", name)
    return name + ".docx"

def main():
    os.makedirs(OUTDIR, exist_ok=True)
    seen = {}
    created, duplicates = [], []
    cf_bad, addr_missing, addr_suspect, addr_solovia = [], [], [], []
    for idx, nome, cognome, indirizzo, cf in DATA:
        key = (cognome.strip().lower(), nome.strip().lower(), cf.strip().lower())
        if key in seen:
            duplicates.append((idx, f"{nome} {cognome}", f"duplicato di riga {seen[key]}"))
            continue
        seen[key] = idx
        doc = fill_doc(nome, cognome, indirizzo, cf)
        # nome file = cognome; suffisso solo se due PERSONE diverse nella stessa run
        # condividono il cognome (idempotente: sovrascrive i file della run precedente)
        fbase = safe_filename(cognome)
        n = 2
        while fbase in created:
            fbase = f"{cognome.strip()}-{n}.docx"; n += 1
        doc.save(os.path.join(OUTDIR, fbase))
        created.append(fbase)
        who = f"{nome} {cognome}"
        if not valid_cf(cf):
            cf_bad.append((idx, who, cf, fbase))
        _, _, cat = parse_address(indirizzo)
        if cat == "mancante":
            addr_missing.append((idx, who, indirizzo, fbase))
        elif cat == "sospetto":
            addr_suspect.append((idx, who, indirizzo, fbase))
        elif cat == "solo_via":
            addr_solovia.append((idx, who, fbase))

    print(f"FILE CREATI: {len(created)} su {len(DATA)} righe ({len(duplicates)} duplicati saltati)")
    print(f"  cartella: {OUTDIR}")
    print("\n=== DUPLICATI SALTATI ===")
    for idx, who, msg in duplicates:
        print(f"  [{idx}] {who}: {msg}")
    print("\n=== CF NON VALIDO (correggere a mano nel file) ===")
    for idx, who, cf, f in cf_bad:
        print(f"  {f:<30} {who}: CF nel sistema = '{cf}'")
    print("\n=== INDIRIZZO MANCANTE (nel sistema c'e' altro, es. email) ===")
    for idx, who, addr, f in addr_missing:
        print(f"  {f:<30} {who}: '{addr}'")
    print("\n=== SPLIT INDIRIZZO DA RICONTROLLARE ===")
    for idx, who, addr, f in (addr_suspect or []):
        print(f"  {f:<30} {who}: '{addr}'")
    if not addr_suspect:
        print("  (nessuno)")
    print(f"\n=== SOLO VIA (CAP/citta' non presenti nel sistema): {len(addr_solovia)} file ===")
    print("  " + ", ".join(f for _, _, f in addr_solovia))

if __name__ == "__main__":
    main()
