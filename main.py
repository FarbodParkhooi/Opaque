import eel, os, json, base64, mimetypes, uuid, tempfile, sys, shutil, threading, time
from datetime import datetime
from pathlib import Path
import tkinter as tk
from tkinter import filedialog

# ------------------------------------------------------------
# Determine web‑files folder (works dev & frozen EXE)
if getattr(sys, 'frozen', False):
    base_dir = Path(sys._MEIPASS)
else:
    base_dir = Path(__file__).parent

# ------------------------------------------------------------
class CustomCipher:
    @staticmethod
    def encrypt(data): return data
    @staticmethod
    def decrypt(data): return data

# ------------------------------------------------------------
# VAULT (encrypted files)
# ------------------------------------------------------------
class Vault:
    def __init__(self):
        if getattr(sys, 'frozen', False):
            exe_dir = Path(sys.executable).parent
        else:
            exe_dir = Path(__file__).parent
        self.vault_dir = exe_dir / "vault"
        self.vault_dir.mkdir(parents=True, exist_ok=True)

        self.meta_file = self.vault_dir / "vault.json"
        self.meta = []
        self._load_meta()

    def _load_meta(self):
        if self.meta_file.exists():
            self.meta = json.loads(self.meta_file.read_text(encoding='utf-8'))
        else:
            self._save_meta()

    def _save_meta(self):
        self.meta_file.write_text(json.dumps(self.meta, indent=2), encoding='utf-8')

    def get_files(self): return self.meta
    def get_entry(self, fid):
        return next((m for m in self.meta if m["id"] == fid), None)

    def encrypt_file(self, path):
        p = Path(path)
        if not p.exists(): raise FileNotFoundError(path)
        fid = str(uuid.uuid4())
        enc_path = self.vault_dir / f"{fid}.enc"
        data = p.read_bytes()
        enc_data = CustomCipher.encrypt(data)
        enc_path.write_bytes(enc_data)
        mime, _ = mimetypes.guess_type(p.name)
        entry = {
            "id": fid,
            "originalName": p.name,
            "mimeType": mime or "application/octet-stream",
            "size": p.stat().st_size,
            "date": datetime.now().isoformat(),
            "encryptedPath": str(enc_path),
            "people": []
        }
        self.meta.append(entry)
        self._save_meta()
        try: os.remove(p)
        except: pass
        return entry

    def delete_file(self, fid):
        entry = self.get_entry(fid)
        if not entry: raise ValueError("File not found")
        enc_path = Path(entry["encryptedPath"])
        if enc_path.exists(): enc_path.unlink()
        self.meta = [m for m in self.meta if m["id"] != fid]
        self._save_meta()

    def decrypt_to_temp(self, fid):
        entry = self.get_entry(fid)
        if not entry: raise ValueError("File not found")
        enc_path = Path(entry["encryptedPath"])
        if not enc_path.exists(): raise FileNotFoundError(str(enc_path))
        data = CustomCipher.decrypt(enc_path.read_bytes())
        suffix = Path(entry["originalName"]).suffix or ".tmp"
        tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
        tmp.write(data)
        tmp.close()
        return tmp.name

    def decrypt_file(self, fid):
        entry = self.get_entry(fid)
        if not entry: raise ValueError("File not found")
        enc_path = Path(entry["encryptedPath"])
        if not enc_path.exists(): raise FileNotFoundError(str(enc_path))
        data = CustomCipher.decrypt(enc_path.read_bytes())
        mime = entry["mimeType"]
        if mime.startswith("text/") or mime in ("application/json","application/xml"):
            try:
                return {"fileName": entry["originalName"], "mimeType": mime, "data": data.decode("utf-8")}
            except: pass
        b64 = base64.b64encode(data).decode("ascii")
        return {"fileName": entry["originalName"], "mimeType": mime, "data": b64}

    def open_file_externally(self, fid):
        entry = self.get_entry(fid)
        if not entry: raise ValueError("File not found")
        enc_path = Path(entry["encryptedPath"])
        if not enc_path.exists(): raise FileNotFoundError(str(enc_path))
        data = CustomCipher.decrypt(enc_path.read_bytes())
        temp_dir = Path(tempfile.gettempdir()) / "opaque_viewer"
        temp_dir.mkdir(exist_ok=True)
        out_path = temp_dir / entry["originalName"]
        out_path.write_bytes(data)
        os.startfile(out_path)

# ------------------------------------------------------------
# PEOPLE MANAGER (stores people_data.json, runs AI)
# ------------------------------------------------------------
class PeopleManager:
    def __init__(self, vault: Vault):
        self.vault = vault
        self.data_file = vault.vault_dir / "people_data.json"
        self.data = {}
        self._load()
        self._running = True
        self._thread = threading.Thread(target=self._background_worker, daemon=True)
        self._thread.start()

    def _load(self):
        if self.data_file.exists():
            self.data = json.loads(self.data_file.read_text(encoding='utf-8'))
        else:
            self.data = {"read_files": [], "people": {}}
            self._save()

    def _save(self):
        self.data_file.write_text(json.dumps(self.data, indent=2), encoding='utf-8')

    def _background_worker(self):
        while self._running:
            try:
                unprocessed = [e for e in self.vault.meta if e["id"] not in self.data["read_files"]
                               and e["mimeType"].startswith(("image/", "video/"))]
                for entry in unprocessed:
                    self.process_media(entry["id"])
            except Exception as e:
                print(f"[Background] Error: {e}")
            time.sleep(5)

    def process_media(self, media_id: str):
        print(f"[AI] Processing media {media_id}...")
        entry = self.vault.get_entry(media_id)
        if not entry: return
        tmp_path = self.vault.decrypt_to_temp(media_id)
        try:
            faces = extract_faces(tmp_path)
            if not faces:
                print("[AI] No faces found.")
                self.data["read_files"].append(media_id)
                self._save()
                return
            known_people = {pid: pdata for pid, pdata in self.data["people"].items()}
            for embedding in faces:
                pid = match_face(embedding, known_people)
                if pid is None:
                    pid = str(uuid.uuid4())
                    name = f"Person {len(self.data['people']) + 1}"
                    self.data["people"][pid] = {
                        "name": name,
                        "embedding": embedding,
                        "media_ids": []
                    }
                if media_id not in self.data["people"][pid]["media_ids"]:
                    self.data["people"][pid]["media_ids"].append(media_id)
                entry_people = entry.setdefault("people", [])
                if pid not in entry_people:
                    entry_people.append(pid)
                    self.vault._save_meta()
        finally:
            try: os.unlink(tmp_path)
            except: pass
        self.data["read_files"].append(media_id)
        self._save()
        print(f"[AI] Done processing media {media_id}")

    def get_people_data(self):
        result = []
        for pid, pdata in self.data["people"].items():
            thumb = None
            if pdata.get("media_ids"):
                mid = pdata["media_ids"][0]
                try:
                    data = self.vault.decrypt_file(mid)
                    thumb = f"data:{data['mimeType']};base64,{data['data']}" if data else None
                except: pass
            result.append({
                "id": pid,
                "name": pdata["name"],
                "faceThumbnail": thumb,
                "mediaCount": len(pdata.get("media_ids", []))
            })
        return result

    def rename_person(self, person_id: str, new_name: str):
        if person_id in self.data["people"]:
            self.data["people"][person_id]["name"] = new_name
            self._save()

    def get_media_for_person(self, person_id: str):
        media_ids = self.data["people"].get(person_id, {}).get("media_ids", [])
        return [entry for entry in self.vault.meta if entry["id"] in media_ids]

# ------------------------------------------------------------
# YOUR AI FUNCTIONS (IMPLEMENT THESE)
# ------------------------------------------------------------
def extract_faces(file_path: str) -> list:
    return []

def match_face(embedding, known_people: dict) -> str | None:
    return None

# ------------------------------------------------------------
# EEL EXPOSED FUNCTIONS
# ------------------------------------------------------------
vault = Vault()
people_mgr = PeopleManager(vault)

@eel.expose
def getFiles(): return vault.get_files()

@eel.expose
def selectFiles():
    root = tk.Tk()
    root.withdraw()
    root.attributes('-topmost', True)
    paths = filedialog.askopenfilenames(title="Select files to encrypt")
    root.destroy()
    return list(paths)

@eel.expose
def selectFolder():
    root = tk.Tk()
    root.withdraw()
    root.attributes('-topmost', True)
    folder = filedialog.askdirectory(title="Select folder to encrypt")
    root.destroy()
    if not folder: return []
    files = [str(p) for p in Path(folder).rglob('*') if p.is_file()]
    return files

@eel.expose
def encryptFile(file_path): vault.encrypt_file(file_path)

@eel.expose
def deleteFile(file_id): vault.delete_file(file_id)

@eel.expose
def decryptFile(file_id): return vault.decrypt_file(file_id)

@eel.expose
def openFileExternally(file_id): vault.open_file_externally(file_id)

@eel.expose
def exportFile(file_id):
    entry = vault.get_entry(file_id)
    if not entry: raise ValueError("File not found")
    enc_path = Path(entry["encryptedPath"])
    if not enc_path.exists(): raise FileNotFoundError(str(enc_path))
    data = CustomCipher.decrypt(enc_path.read_bytes())
    root = tk.Tk()
    root.withdraw()
    root.attributes('-topmost', True)
    out_path = filedialog.asksaveasfilename(
        initialfile=entry["originalName"],
        title="Save decrypted file as",
        filetypes=[("All files", "*.*")]
    )
    root.destroy()
    if out_path:
        Path(out_path).write_bytes(data)
        return True
    return False

# --- People API ---
@eel.expose
def getPeopleData():
    return people_mgr.get_people_data()

@eel.expose
def renamePerson(person_id, new_name):
    people_mgr.rename_person(person_id, new_name)

@eel.expose
def getMediaForPerson(person_id):
    return people_mgr.get_media_for_person(person_id)

@eel.expose
def processNow():
    unprocessed = [e for e in vault.meta if e["id"] not in people_mgr.data["read_files"]
                   and e["mimeType"].startswith(("image/", "video/"))]
    for entry in unprocessed:
        people_mgr.process_media(entry["id"])

# --- Theme persistence ---
@eel.expose
def saveTheme(theme_id):
    theme_file = vault.vault_dir / "theme.json"
    theme_file.write_text(theme_id)

@eel.expose
def getSavedTheme():
    theme_file = vault.vault_dir / "theme.json"
    if theme_file.exists():
        return theme_file.read_text().strip()
    return "dark"

# ------------------------------------------------------------
# START
# ------------------------------------------------------------
if __name__ == "__main__":
    eel.init(str(base_dir))
    eel.start("ui/index.html", size=(1200, 800), mode="chrome", port=0)