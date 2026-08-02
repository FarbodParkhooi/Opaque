import eel, os, json, base64, mimetypes, uuid, tempfile, sys
from datetime import datetime
from pathlib import Path
import tkinter as tk
from tkinter import filedialog

# ------------------------------------------------------------
# Determine the web files folder (works for dev and frozen EXE)
if getattr(sys, 'frozen', False):
    # Running as a PyInstaller bundle
    base_dir = Path(sys._MEIPASS)
else:
    base_dir = Path(__file__).parent

# ------------------------------------------------------------
class CustomCipher:
    @staticmethod
    def encrypt(data): return data
    @staticmethod
    def decrypt(data): return data

class Vault:
    def __init__(self):
        self.vault_dir = Path(__file__).parent / "vault" if not getattr(sys, 'frozen', False) else Path(sys.executable).parent / "vault"
        self.vault_dir.mkdir(parents=True, exist_ok=True)
        self.meta_file = self.vault_dir / "vault.json"
        self.meta = []
        self._load()

    def _load(self):
        if self.meta_file.exists():
            self.meta = json.loads(self.meta_file.read_text(encoding='utf-8'))
        else:
            self._save()

    def _save(self):
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
            "id": fid, "originalName": p.name,
            "mimeType": mime or "application/octet-stream",
            "size": p.stat().st_size,
            "date": datetime.now().isoformat(),
            "encryptedPath": str(enc_path)
        }
        self.meta.append(entry)
        self._save()
        try: os.remove(p)
        except: pass

    def delete_file(self, fid):
        entry = self.get_entry(fid)
        if not entry: raise ValueError("File not found")
        enc_path = Path(entry["encryptedPath"])
        if enc_path.exists(): enc_path.unlink()
        self.meta = [m for m in self.meta if m["id"] != fid]
        self._save()

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

vault = Vault()

# ---------- Exposed functions ----------
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
    if not folder:
        return []
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

# ---------- Start the app ----------
if __name__ == "__main__":
    # Tell Eel the folder containing index.html
    eel.init(str(base_dir))
    # Use a random available port to avoid conflicts
    eel.start("index.html", size=(1200, 800), mode="chrome", port=0)