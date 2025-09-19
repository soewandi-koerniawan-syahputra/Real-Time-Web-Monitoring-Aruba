from flask import Flask, jsonify, request
from flask_cors import CORS
import sqlite3
import os
import hashlib

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})  # allow all origins

# DB paths
DB_PATH = r"D:\Project\test\backend\aruba.db"
USERS_DB_PATH = r"D:\Project\test\backend\users.db"

# Mapping from frontend dropdown value → backend profile(s)
PROFILE_MAP = {
    "IDM_aaa_prof": ["IT-IDM_aaa_prof", "IDM_aaa_prof"],
    "ISAKU_aaa_prof": ["ISAKU_aaa_prof", "i.saku_aaa_prof"],
    "K5_aaa_prof": ["K5_aaa_prof"],
    "GUEST_aaa_prof": ["GUEST_aaa_prof"],
    "SUPPORT_aaa_prof": ["SUPPORT_aaa_prof"],
    "A5_aaa_prof": ["A5_aaa_prof"]
}
@app.route("/unwhitelist", methods=["POST"])
def unwhitelist():
    data = request.get_json()
    ip = data.get("ip")

    if not ip:
        return jsonify({"error": "IP is required"}), 400

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("DELETE FROM whitelist WHERE ip = ?", (ip,))
    conn.commit()
    conn.close()

    return jsonify({"message": f"{ip} removed from whitelist"}), 200

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def get_users_db_connection():
    conn = sqlite3.connect(USERS_DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

@app.route('/')
def index():
    return 'Flask backend is running. Try /users to get data.'

@app.route('/users')
def get_users():
    try:
        # Get profile from query params (frontend sends ?profile=IDM_aaa_prof etc.)
        selected_profile = request.args.get("profile", "A5_aaa_prof")
        backend_profiles = PROFILE_MAP.get(selected_profile, [selected_profile])

        conn = get_db_connection()
        cursor = conn.cursor()

        # Fetch IPs from whitelist
        cursor.execute("SELECT ip FROM whitelist")
        whitelisted_ips = set(row["ip"] for row in cursor.fetchall())

        # Fetch edited hostnames
        cursor.execute("SELECT ip, hostname FROM editeduser")
        edited_hostnames = {row["ip"]: row["hostname"] for row in cursor.fetchall()}

        # Query user_table for all matching backend profiles
        placeholders = ",".join("?" * len(backend_profiles))
        query = f"""
        SELECT 
            name,
            ip,
            essid_bssid_phy,
            ap_name,
            age
        FROM user_table
        WHERE profile IN ({placeholders})
        """
        cursor.execute(query, backend_profiles)
        rows = cursor.fetchall()

        results = []
        for row in rows:
            original_hostname = row["name"]
            ip = row["ip"]
            essid_bssid_phy = row["essid_bssid_phy"] or ""
            ap_name = row["ap_name"]
            duration = row["age"]

            # Use edited hostname if available
            hostname = edited_hostnames.get(ip, original_hostname)

            # Extract band
            band = essid_bssid_phy.split("/")[-1].split("-")[0] if "/" in essid_bssid_phy else None

            # Health check
            health = "✅" if ip in whitelisted_ips else "❌"

            # Floor extraction
            floor = None
            if "LT" in ap_name:
                try:
                    floor = int(ap_name.split("LT")[1].split("-")[0])
                except:
                    floor = None

            results.append({
                "hostname": hostname,
                "ip": ip,
                "band": band,
                "ssid": essid_bssid_phy,
                "ap_name": ap_name,
                "connected_at": None,
                "duration": duration,
                "health": health,
                "floor": floor
            })

        conn.close()
        return jsonify(results)
    except Exception as e:
        return jsonify({"error": str(e)})

@app.route('/edit-hostname', methods=['POST'])
def edit_hostname():
    data = request.json
    ip = data.get('ip')
    hostname = data.get('hostname')
    if not ip or not hostname:
        return jsonify({"error": "IP and hostname are required"}), 400

    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS editeduser (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ip TEXT UNIQUE NOT NULL,
                hostname TEXT NOT NULL
            )
        """)
        cursor.execute("""
            INSERT INTO editeduser (ip, hostname) VALUES (?, ?)
            ON CONFLICT(ip) DO UPDATE SET hostname=excluded.hostname
        """, (ip, hostname))
        conn.commit()
        conn.close()
        return jsonify({"message": "Hostname updated successfully"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/add-whitelist', methods=['POST'])
def add_whitelist():
    data = request.get_json()
    ip = data.get('ip')
    if not ip:
        return jsonify({'error': 'IP is required'}), 400
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("INSERT OR IGNORE INTO whitelist (ip) VALUES (?)", (ip,))
        conn.commit()
        conn.close()
        return jsonify({'message': f'IP {ip} added to whitelist.'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/login', methods=['POST'])
def login():
    data = request.json
    username = data.get('username')
    password = data.get('password')

    if not username or not password:
        return jsonify({'error': 'Username and password are required'}), 400

    try:
        conn = get_users_db_connection()
        cursor = conn.cursor()
        hashed_password = hashlib.sha256(password.encode()).hexdigest()
        cursor.execute("SELECT * FROM users WHERE username = ? AND password = ?", (username, hashed_password))
        user = cursor.fetchone()
        conn.close()

        if user:
            return jsonify({
                'message': 'Login successful',
                'username': user['username'],
                'role': user['role']
            }), 200
        else:
            return jsonify({'error': 'Invalid username or password'}), 401
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    print(f"✅ Using database at: {DB_PATH}")
    print(f"✅ Using users database at: {USERS_DB_PATH}")
    print("✅ Does users.db exist?", os.path.exists(USERS_DB_PATH))
    app.run(host='0.0.0.0', debug=True, port=5000)
