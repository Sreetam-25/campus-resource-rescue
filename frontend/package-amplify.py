import os
import zipfile

dist_dir = os.path.abspath('dist')
zip_path = os.path.abspath('dist.zip')

print(f"Packaging {dist_dir} into {zip_path} with POSIX paths...")

with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as z:
    for root, dirs, files in os.walk(dist_dir):
        for file in files:
            full_path = os.path.join(root, file)
            # Guarantee forward slash '/' relative path
            rel_path = os.path.relpath(full_path, dist_dir).replace('\\', '/')
            z.write(full_path, rel_path)

print("Verifying ZIP archive entries:")
with zipfile.ZipFile(zip_path, 'r') as z:
    for info in z.infolist():
        print(f"  {info.filename} ({info.file_size} bytes)")
        if '\\' in info.filename:
            raise RuntimeError(f"Found Windows backslash in zip entry: {info.filename}")

print("Package verified successfully. All entries use POSIX forward-slash paths.")
