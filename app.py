from flask import Flask, jsonify, request
from flask_cors import CORS
import sqlite3
import os
import json
import sys

# --- FIX FOR "OSError: Invalid argument" (NO-CONSOLE) ---
if getattr(sys, 'frozen', False):
    class NullWriter:
        def write(self, text): pass
        def flush(self): pass
        def isatty(self): return False
    sys.stdout = NullWriter()
    sys.stderr = NullWriter()
# --------------------------------------------------------

app = Flask(__name__)
app.config['TRAP_HTTP_EXCEPTIONS'] = True
try:
    cli = sys.modules['flask.cli']
    cli.show_server_banner = lambda *x: None
except Exception: pass

CORS(app)

DB_FILE = 'ukeplaner_database.db'

def init_db():
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS planer (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            uke INTEGER NOT NULL,
            år INTEGER NOT NULL,
            fag TEXT NOT NULL,
            tema TEXT,
            aktivitet TEXT,
            arbeidskrav TEXT
        )
    ''')
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS fag (
            navn TEXT PRIMARY KEY,
            dager TEXT,
            leksedager TEXT
        )
    ''')
    conn.commit()
    conn.close()

# --- FAG ---
@app.route('/api/fag', methods=['GET'])
def hent_fag():
    try:
        conn = sqlite3.connect(DB_FILE, timeout=10)
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM fag")
        rows = cursor.fetchall()
        conn.close()
        result = []
        for r in rows:
            dager = json.loads(r[1]) if r[1] else []
            leksedager = json.loads(r[2]) if r[2] else []
            result.append({"navn": r[0], "dager": dager, "leksedager": leksedager})
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/fag', methods=['POST'])
def lagre_nytt_fag():
    data = request.json
    navn = data.get('navn')
    dager = json.dumps(data.get('dager'))
    leksedager = json.dumps(data.get('leksedager'))
    try:
        conn = sqlite3.connect(DB_FILE, timeout=10)
        cursor = conn.cursor()
        cursor.execute("INSERT OR REPLACE INTO fag (navn, dager, leksedager) VALUES (?, ?, ?)", (navn, dager, leksedager))
        conn.commit()
        conn.close()
        return jsonify({"message": "Fag lagret"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/fag/slett', methods=['POST'])
def slett_fag():
    navn = request.json.get('navn')
    try:
        conn = sqlite3.connect(DB_FILE, timeout=10)
        cursor = conn.cursor()
        cursor.execute("DELETE FROM fag WHERE navn=?", (navn,))
        conn.commit()
        conn.close()
        return jsonify({"message": "Fag slettet"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# --- PLANER ---
@app.route('/api/plan', methods=['GET'])
def hent_plan():
    uke = request.args.get('uke')
    år = request.args.get('år')
    fag = request.args.get('fag')
    try:
        conn = sqlite3.connect(DB_FILE, timeout=10)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM planer WHERE uke=? AND år=? AND fag=?", (uke, år, fag))
        row = cursor.fetchone()
        conn.close()
        return jsonify(dict(row) if row else None)
    except Exception as e:
        return jsonify(None)

@app.route('/api/plan/forrige', methods=['GET'])
def hent_forrige_plan():
    try:
        uke = int(request.args.get('uke'))
        år = int(request.args.get('år'))
        fag = request.args.get('fag')
        if uke == 1:
            prev_uke = 52
            prev_år = år - 1
        else:
            prev_uke = uke - 1
            prev_år = år
        conn = sqlite3.connect(DB_FILE, timeout=10)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM planer WHERE uke=? AND år=? AND fag=?", (prev_uke, prev_år, fag))
        row = cursor.fetchone()
        conn.close()
        if row:
            data = dict(row)
            data['visningsUke'] = prev_uke 
            return jsonify(data)
        else:
            return jsonify(None)
    except Exception as e:
        return jsonify(None)

# --- NYE FUNKSJONER (SØK & TIDSLINJE) ---

@app.route('/api/sok', methods=['GET'])
def sok_arkiv():
    fag = request.args.get('fag')
    fritekst = request.args.get('q', '').strip()
    
    query = "SELECT * FROM planer WHERE fag=?"
    params = [fag]
    
    # Hvis bruker har skrevet et søkeord
    if fritekst:
        query += " AND (tema LIKE ? OR aktivitet LIKE ? OR arbeidskrav LIKE ?)"
        wildcard = f"%{fritekst}%"
        params.extend([wildcard, wildcard, wildcard])
    
    # Sorterer nyeste først
    query += " ORDER BY år DESC, uke DESC"
    
    try:
        conn = sqlite3.connect(DB_FILE, timeout=10)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute(query, tuple(params))
        rows = cursor.fetchall()
        conn.close()
        
        return jsonify([dict(row) for row in rows])
    except Exception as e:
        return jsonify([])

@app.route('/api/tidslinje', methods=['GET'])
def hent_tidslinje():
    fag = request.args.get('fag')
    try:
        conn = sqlite3.connect(DB_FILE, timeout=10)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        # Henter bare nødvendig info for listen
        cursor.execute("SELECT uke, år, tema FROM planer WHERE fag=? ORDER BY år DESC, uke DESC", (fag,))
        rows = cursor.fetchall()
        conn.close()
        return jsonify([dict(row) for row in rows])
    except Exception as e:
        return jsonify([])

# ----------------------------------------

@app.route('/api/lagre', methods=['POST'])
def lagre_plan():
    data = request.json
    try:
        conn = sqlite3.connect(DB_FILE, timeout=10)
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM planer WHERE uke=? AND år=? AND fag=?", (data['uke'], data['år'], data['fag']))
        if cursor.fetchone():
            cursor.execute("UPDATE planer SET tema=?, aktivitet=?, arbeidskrav=? WHERE uke=? AND år=? AND fag=?", 
                           (data['tema'], data['aktivitet'], data['arbeidskrav'], data['uke'], data['år'], data['fag']))
        else:
            cursor.execute("INSERT INTO planer (uke, år, fag, tema, aktivitet, arbeidskrav) VALUES (?, ?, ?, ?, ?, ?)", 
                           (data['uke'], data['år'], data['fag'], data['tema'], data['aktivitet'], data['arbeidskrav']))
        conn.commit()
        conn.close()
        return jsonify({"message": "Lagret"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    init_db()
    app.run(host='127.0.0.1', port=5000, threaded=True)