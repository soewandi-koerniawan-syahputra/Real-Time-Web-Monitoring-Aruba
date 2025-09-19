import requests
import sqlite3

# Aruba Controller settings — multiple controllers
ARUBA_CONTROLLERS = [
    "https://172.20.254.200:4343",
    "https://172.20.239.200:4343"
]
USERNAME = "admin"
PASSWORD = "P@ssw0rd.1"

# SQLite DB path
DB_PATH = "aruba.db"

# Disable SSL warnings
requests.packages.urllib3.disable_warnings()


def login_to_aruba(aruba_url):
    login_url = f"{aruba_url}/v1/api/login"
    payload = {
        "username": USERNAME,
        "password": PASSWORD
    }
    session = requests.Session()
    response = session.post(login_url, data=payload, verify=False)
    result = response.json().get("_global_result", {})
    if result.get("status") != "0":
        raise Exception(f"Login failed for {aruba_url}")

    csrf_token = result.get("X-CSRF-Token")
    uid_aruba = result.get("UIDARUBA")
    return session, csrf_token, uid_aruba


def run_cli_command(session, csrf_token, uid, command, aruba_url):
    cli_url = f"{aruba_url}/v1/configuration/showcommand"
    headers = {
        "X-CSRF-Token": csrf_token
    }
    params = {
        "command": command,
        "UIDARUBA": uid
    }
    response = session.get(cli_url, headers=headers, params=params, verify=False)
    return response.json()


def fetch_and_store_user_table():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Optional: Backup existing data
    cursor.execute("DROP TABLE IF EXISTS user_table_backup")
    cursor.execute("CREATE TABLE user_table_backup AS SELECT * FROM user_table")

    # Clear main table
    cursor.execute("DELETE FROM user_table")
    conn.commit()

    total_inserted = 0

    for aruba_url in ARUBA_CONTROLLERS:
        try:
            print(f"\n[INFO] Connecting to Aruba: {aruba_url}")
            session, csrf_token, uid = login_to_aruba(aruba_url)
            result = run_cli_command(session, csrf_token, uid, "show user-table verbose", aruba_url)

            users = result.get("Users", [])
            print(f"[INFO] {aruba_url} — fetched {len(users)} users.")

            for i, user in enumerate(users):
                try:
                    ap_name = user.get("AP name", "N/A")
                    age = user.get("Age(d:h:m)", "")
                    essid_bssid_phy = user.get("Essid/Bssid/Phy", "")
                    forward_mode = user.get("Forward mode", "")
                    ip = user.get("IP", "")
                    mac = user.get("MAC", "")
                    name = user.get("Name", "")
                    profile = user.get("Profile", "")
                    roaming = user.get("Roaming", "")
                    role = user.get("Role", "")
                    type_ = user.get("Type", "")
                    user_type = user.get("User Type", "")

                    cursor.execute('''
                        INSERT OR REPLACE INTO user_table (
                            ap_name, age, essid_bssid_phy, forward_mode, ip,
                            mac, name, profile, roaming, role, type, user_type
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ''', (
                        ap_name, age, essid_bssid_phy, forward_mode, ip,
                        mac, name, profile, roaming, role, type_, user_type
                    ))

                    total_inserted += 1

                except Exception as insert_error:
                    print(f"[ERROR] Failed to insert user {i} from {aruba_url}: {insert_error}")

        except Exception as e:
            print(f"[ERROR] Failed to fetch from {aruba_url}: {e}")

    conn.commit()
    conn.close()

    print(f"\n✅ User table updated successfully. Total inserted: {total_inserted}")


if __name__ == "__main__":
    fetch_and_store_user_table()
