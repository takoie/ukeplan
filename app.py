from flask import Flask, jsonify, request
from flask_cors import CORS
import sqlite3
import os
import json
import sys
import shutil
import datetime
import subprocess
import platform
import re

if getattr(sys, 'frozen', False):
    class NullWriter:
        def write(self, text): pass
        def flush(self): pass
        def isatty(self): return False
    sys.stdout = NullWriter()
    sys.stderr = NullWriter()

app = Flask(__name__)
app.config['TRAP_HTTP_EXCEPTIONS'] = True
CORS(app)

# --- DATABASE & MAPPE OPPSETT ---
def get_app_data_dir():
    app_data = os.getenv('APPDATA') if os.name == 'nt' else os.path.expanduser("~")
    data_dir = os.path.join(app_data, 'UkeplanLager')
    if not os.path.exists(data_dir):
        os.makedirs(data_dir)
    return data_dir

def get_config_file():
    return os.path.join(get_app_data_dir(), 'config.json')

def get_default_db_path():
    return os.path.join(get_app_data_dir(), 'ukeplaner_database.db')

def get_active_db_path():
    config_file = get_config_file()
    if os.path.exists(config_file):
        try:
            with open(config_file, 'r') as f:
                config = json.load(f)
                custom_path = config.get('db_path')
                if custom_path and os.path.exists(custom_path):
                    return custom_path
        except: pass
    return get_default_db_path()

def get_export_dir():
    export_dir = os.path.join(get_app_data_dir(), 'eksport')
    if not os.path.exists(export_dir): os.makedirs(export_dir)
    return export_dir

def init_db(path=None):
    if not path: path = get_active_db_path()
    conn = sqlite3.connect(path)
    cursor = conn.cursor()
    cursor.execute('''CREATE TABLE IF NOT EXISTS planer (id INTEGER PRIMARY KEY AUTOINCREMENT, uke INTEGER NOT NULL, år INTEGER NOT NULL, fag TEXT NOT NULL, tema TEXT, aktivitet TEXT, arbeidskrav TEXT)''')
    cursor.execute('''CREATE TABLE IF NOT EXISTS fag (navn TEXT PRIMARY KEY, dager TEXT, leksedager TEXT)''')
    try:
        cursor.execute("SELECT skoleaar FROM fag LIMIT 1")
    except sqlite3.OperationalError:
        cursor.execute("ALTER TABLE fag ADD COLUMN skoleaar TEXT")
        cursor.execute("UPDATE fag SET skoleaar = '2025/2026' WHERE skoleaar IS NULL")
    conn.commit()
    conn.close()

def safe_json_load(json_str):
    if not json_str or json_str == "null": return []
    try: return json.loads(json_str)
    except: return []

# --- SYSTEM API (INKLUDERT FLYTT) ---

@app.route('/api/system/get-db-path', methods=['GET'])
def api_get_db_path():
    return jsonify({"path": get_active_db_path()})

@app.route('/api/system/set-db-path', methods=['POST'])
def api_set_db_path():
    ny_sti = request.json.get('path')
    if not ny_sti: return jsonify({"error": "Ingen sti"}), 400
    if not os.path.exists(ny_sti):
        try: init_db(ny_sti)
        except Exception as e: return jsonify({"error": str(e)}), 500
    try:
        with open(get_config_file(), 'w') as f: json.dump({"db_path": ny_sti}, f)
        init_db(ny_sti)
        return jsonify({"message": "OK"})
    except Exception as e: return jsonify({"error": str(e)}), 500

@app.route('/api/system/move-db', methods=['POST'])
def api_move_db():
    ny_sti = request.json.get('path')
    if not ny_sti: return jsonify({"error": "Ingen sti"}), 400
    
    current_path = get_active_db_path()
    try:
        # Kopier filen til ny destinasjon
        shutil.copy2(current_path, ny_sti)
        
        # Oppdater config til å peke på ny fil
        with open(get_config_file(), 'w') as f: json.dump({"db_path": ny_sti}, f)
        
        return jsonify({"message": "OK"})
    except Exception as e:
        return jsonify({"error": f"Kunne ikke flytte: {str(e)}"}), 500

@app.route('/api/system/open-export', methods=['GET'])
def open_exp():
    p = get_export_dir()
    try:
        if platform.system() == "Windows": os.startfile(p)
        elif platform.system() == "Darwin": subprocess.Popen(["open", p])
        else: subprocess.Popen(["xdg-open", p])
        return jsonify({"status": "ok"})
    except Exception as e: return jsonify({"error": str(e)}), 500

# --- FAG API ---

@app.route('/api/fag', methods=['GET'])
def hent_fag():
    try:
        conn = sqlite3.connect(get_active_db_path(), timeout=10)
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM fag ORDER BY rowid DESC")
        rows = cursor.fetchall(); conn.close()
        result = []
        for r in rows:
            sa = r[3] if len(r) > 3 and r[3] else "2025/2026"
            result.append({"navn": r[0], "dager": safe_json_load(r[1]), "leksedager": safe_json_load(r[2]), "skoleaar": sa})
        return jsonify(result)
    except Exception as e: return jsonify({"error": str(e)}), 500

@app.route('/api/fag', methods=['POST'])
def lagre_nytt_fag():
    data = request.json
    try:
        conn = sqlite3.connect(get_active_db_path(), timeout=10)
        cursor = conn.cursor()
        cursor.execute("INSERT OR REPLACE INTO fag (navn, dager, leksedager, skoleaar) VALUES (?, ?, ?, ?)", 
                       (data['navn'], json.dumps(data.get('dager')), json.dumps(data.get('leksedager')), data.get('skoleaar')))
        conn.commit(); conn.close()
        return jsonify({"message": "OK"})
    except Exception as e: return jsonify({"error": str(e)}), 500

@app.route('/api/fag/endre_navn', methods=['POST'])
def endre_navn_fag():
    data = request.json
    try:
        conn = sqlite3.connect(get_active_db_path(), timeout=10); cur = conn.cursor()
        cur.execute("SELECT 1 FROM fag WHERE navn=?", (data['nyttNavn'],))
        if cur.fetchone(): conn.close(); return jsonify({"error": "Navnet finnes allerede"}), 400
        cur.execute("SELECT dager, leksedager, skoleaar FROM fag WHERE navn=?", (data['gammeltNavn'],))
        cols = cur.fetchone()
        if not cols: conn.close(); return jsonify({"error": "Fant ikke fag"}), 404
        cur.execute("INSERT INTO fag (navn, dager, leksedager, skoleaar) VALUES (?, ?, ?, ?)", (data['nyttNavn'], cols[0], cols[1], cols[2]))
        cur.execute("UPDATE planer SET fag=? WHERE fag=?", (data['nyttNavn'], data['gammeltNavn']))
        cur.execute("DELETE FROM fag WHERE navn=?", (data['gammeltNavn'],))
        conn.commit(); conn.close()
        return jsonify({"message": "OK"})
    except Exception as e: return jsonify({"error": str(e)}), 500

@app.route('/api/fag/slett', methods=['POST'])
def slett_fag():
    try:
        conn = sqlite3.connect(get_active_db_path(), timeout=10)
        conn.execute("DELETE FROM fag WHERE navn=?", (request.json.get('navn'),))
        conn.commit(); conn.close()
        return jsonify({"message": "OK"})
    except Exception as e: return jsonify({"error": str(e)}), 500

# --- EKSPORT / IMPORT ---

@app.route('/api/fag/eksport', methods=['GET'])
def eksport_fag():
    try:
        navn = request.args.get('navn')
        conn = sqlite3.connect(get_active_db_path(), timeout=10); conn.row_factory = sqlite3.Row; cur = conn.cursor()
        cur.execute("SELECT * FROM fag WHERE navn=?", (navn,)); fag = cur.fetchone()
        if not fag: conn.close(); return jsonify({"error": "Fant ikke fag"}), 404
        cur.execute("SELECT * FROM planer WHERE fag=?", (navn,)); planer = cur.fetchall(); conn.close()
        sa = fag['skoleaar'] if 'skoleaar' in fag.keys() and fag['skoleaar'] else "2025/2026"
        data = { "meta": { "navn": fag['navn'], "dager": safe_json_load(fag['dager']), "leksedager": safe_json_load(fag['leksedager']), "skoleaar": sa }, "planer": [dict(r) for r in planer] }
        safe_name = re.sub(r'[\\/*?:"<>|]', "", navn).strip().replace(" ", "_")
        filnavn = f"{safe_name}_{datetime.datetime.now().strftime('%Y-%m-%d')}.json"
        path = os.path.join(get_export_dir(), filnavn)
        with open(path, 'w', encoding='utf-8') as f: json.dump(data, f, ensure_ascii=False, indent=2)
        return jsonify({"message": "OK", "filename": filnavn, "path": path})
    except Exception as e: return jsonify({"error": f"Serverfeil: {str(e)}"}), 500

@app.route('/api/fag/import', methods=['POST'])
def import_fag():
    try:
        d = request.json; meta = d.get('meta')
        if not meta: return jsonify({"error": "Ugyldig fil"}), 400
        navn = meta['navn'] + "-IMPORT"
        conn = sqlite3.connect(get_active_db_path(), timeout=10); cur = conn.cursor()
        cnt = 0; final = navn
        while True:
            cur.execute("SELECT 1 FROM fag WHERE navn=?", (final,)); 
            if not cur.fetchone(): break
            cnt += 1; final = f"{navn}-{cnt}"
        sa = meta.get('skoleaar', '2025/2026')
        cur.execute("INSERT INTO fag (navn, dager, leksedager, skoleaar) VALUES (?,?,?,?)", (final, json.dumps(meta.get('dager')), json.dumps(meta.get('leksedager')), sa))
        for p in d.get('planer', []):
            cur.execute("INSERT INTO planer (uke, år, fag, tema, aktivitet, arbeidskrav) VALUES (?,?,?,?,?,?)", (p['uke'], p['år'], final, p['tema'], p['aktivitet'], p['arbeidskrav']))
        conn.commit(); conn.close()
        return jsonify({"message": "OK", "nyttNavn": final, "antallPlaner": len(d.get('planer', []))})
    except Exception as e: return jsonify({"error": str(e)}), 500

# --- PLANER / SØK ---

@app.route('/api/plan', methods=['GET'])
def get_p():
    try:
        conn = sqlite3.connect(get_active_db_path(), timeout=10); conn.row_factory = sqlite3.Row; cur = conn.cursor()
        cur.execute("SELECT * FROM planer WHERE uke=? AND år=? AND fag=?", (request.args.get('uke'), request.args.get('år'), request.args.get('fag')))
        r = cur.fetchone(); conn.close()
        return jsonify(dict(r) if r else None)
    except: return jsonify(None)

@app.route('/api/plan/forrige', methods=['GET'])
def get_prev():
    try:
        u, a, f = int(request.args.get('uke')), int(request.args.get('år')), request.args.get('fag')
        pu, pa = (52, a-1) if u == 1 else (u-1, a)
        conn = sqlite3.connect(get_active_db_path(), timeout=10); conn.row_factory = sqlite3.Row; cur = conn.cursor()
        cur.execute("SELECT * FROM planer WHERE uke=? AND år=? AND fag=?", (pu, pa, f)); r = cur.fetchone(); conn.close()
        if r: d = dict(r); d['visningsUke'] = pu; return jsonify(d)
        return jsonify(None)
    except: return jsonify(None)

@app.route('/api/planer/periode', methods=['GET'])
def hent_planer_periode():
    try:
        conn = sqlite3.connect(get_active_db_path(), timeout=10); conn.row_factory = sqlite3.Row; cur = conn.cursor()
        cur.execute("SELECT * FROM planer WHERE fag=? AND år=? AND uke >= ? AND uke <= ? ORDER BY uke DESC", (request.args.get('fag'), request.args.get('aar'), request.args.get('start'), request.args.get('slutt')))
        rows = cur.fetchall(); conn.close()
        return jsonify([dict(r) for r in rows])
    except Exception as e: return jsonify({"error": str(e)}), 500

@app.route('/api/sok', methods=['GET'])
def sok():
    f, q = request.args.get('fag'), request.args.get('q', '').strip()
    sql = "SELECT * FROM planer WHERE fag=?"; p = [f]
    if q: sql += " AND (tema LIKE ? OR aktivitet LIKE ? OR arbeidskrav LIKE ?)"; wc=f"%{q}%"; p.extend([wc,wc,wc])
    sql += " ORDER BY år DESC, uke DESC"
    try:
        conn = sqlite3.connect(get_active_db_path(), timeout=10); conn.row_factory = sqlite3.Row; cur = conn.cursor()
        cur.execute(sql, tuple(p)); r = cur.fetchall(); conn.close()
        return jsonify([dict(x) for x in r])
    except: return jsonify([])

@app.route('/api/tidslinje', methods=['GET'])
def tl():
    try:
        conn = sqlite3.connect(get_active_db_path(), timeout=10); conn.row_factory = sqlite3.Row; cur = conn.cursor()
        cur.execute("SELECT uke, år, tema FROM planer WHERE fag=? ORDER BY år DESC, uke DESC", (request.args.get('fag'),)); r = cur.fetchall(); conn.close()
        return jsonify([dict(x) for x in r])
    except: return jsonify([])

@app.route('/api/lagre', methods=['POST'])
def save():
    d = request.json
    try:
        conn = sqlite3.connect(get_active_db_path(), timeout=10); cur = conn.cursor()
        cur.execute("SELECT id FROM planer WHERE uke=? AND år=? AND fag=?", (d['uke'], d['år'], d['fag']))
        if cur.fetchone(): cur.execute("UPDATE planer SET tema=?, aktivitet=?, arbeidskrav=? WHERE uke=? AND år=? AND fag=?", (d['tema'], d['aktivitet'], d['arbeidskrav'], d['uke'], d['år'], d['fag']))
        else: cur.execute("INSERT INTO planer (uke, år, fag, tema, aktivitet, arbeidskrav) VALUES (?,?,?,?,?,?)", (d['uke'], d['år'], d['fag'], d['tema'], d['aktivitet'], d['arbeidskrav']))
        conn.commit(); conn.close()
        return jsonify({"message": "OK"})
    except Exception as e: return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    init_db()
    app.run(host='127.0.0.1', port=5000, threaded=True)