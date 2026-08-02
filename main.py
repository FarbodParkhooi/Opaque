import eel, os, json, base64, mimetypes, uuid, subprocess, tempfile
from datetime import datetime
from pathlib import Path

class CustomCipher:
    @staticmethod
    def encrypt(data): return data
    @staticmethod
    def decrypt(data): return data

class Vault:
    def __init__(self):
        self.vault_dir = Path(__file__).parent / "vault"
        self.vault_dir.mkdir(parents=True, exist_ok=True)
        self.meta_file = self.vault_dir / "vault.json"
        self.meta = []
        self._load()

    def _load(self):
        if self.meta_file.exists():
            self.meta = json.loads(self.meta_file.read_text(encoding='utf-8'))
        else:
            self._save()

    def get_entry(self, fid):
        return next((m for m in self.meta if m["id"] == fid), None)

    def _save(self):
        self.meta_file.write_text(json.dumps(self.meta, indent=2), encoding='utf-8')

    def get_files(self): return self.meta

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
        entry = next((m for m in self.meta if m["id"] == fid), None)
        if not entry: raise ValueError("File not found")
        enc_path = Path(entry["encryptedPath"])
        if enc_path.exists(): enc_path.unlink()
        self.meta = [m for m in self.meta if m["id"] != fid]
        self._save()

    def decrypt_file(self, fid):
        entry = next((m for m in self.meta if m["id"] == fid), None)
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
        entry = next((m for m in self.meta if m["id"] == fid), None)
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

@eel.expose
def getFiles(): return vault.get_files()

@eel.expose
def selectFiles():
    ps_script = r"""
Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.OpenFileDialog
$dialog.Multiselect = $true
$dialog.Filter = 'All Files (*.*)|*.*'
$dialog.Title = 'Select files to encrypt'
if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { $dialog.FileNames }
"""
    try:
        result = subprocess.run(["powershell.exe", "-NoProfile", "-Command", ps_script],
                                capture_output=True, text=True, timeout=60)
        if result.returncode == 0 and result.stdout.strip():
            return [line.strip() for line in result.stdout.splitlines() if line.strip()]
        return []
    except Exception as e:
        print("File dialog error:", e)
        return []

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
    """Decrypt and save the file to a user-chosen location. Returns True on success."""
    entry = next((m for m in vault._Vault__meta if m["id"] == file_id), None)  
    if not entry:
        raise ValueError("File not found")
    enc_path = Path(entry["encryptedPath"])
    if not enc_path.exists():
        raise FileNotFoundError(str(enc_path))
    
    # Decrypt data
    data = CustomCipher.decrypt(enc_path.read_bytes())
    
    # Use PowerShell save dialog to choose output path, prefilled with original name
    ps_script = f"""
Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.SaveFileDialog
$dialog.FileName = '{entry["originalName"]}'
$dialog.Filter = 'All Files (*.*)|*.*'
$dialog.Title = 'Save decrypted file as'
if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {{
    $dialog.FileName
}}
"""
    try:
        result = subprocess.run(
            ["powershell.exe", "-NoProfile", "-Command", ps_script],
            capture_output=True, text=True, timeout=60
        )
        if result.returncode == 0 and result.stdout.strip():
            output_path = result.stdout.strip()
            Path(output_path).write_bytes(data)
            return True
        return False   # user cancelled
    except Exception as e:
        print("Export file dialog error:", e)
        return False

if __name__ == "__main__":
    eel.init(str(Path(__file__).parent))
    eel.start("ui/index.html", size=(1200, 800), mode="chrome")