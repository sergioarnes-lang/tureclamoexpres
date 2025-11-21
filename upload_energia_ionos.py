import ftplib
import os
from getpass import getpass


def ensure_directory(ftp: ftplib.FTP, path: str) -> None:
    """Create directory if it does not exist."""
    try:
        ftp.cwd(path)
        return
    except ftplib.error_perm:
        parts = [p for p in path.strip('/').split('/') if p]
        current = ''
        for part in parts:
            current += f'/{part}'
            try:
                ftp.cwd(current)
            except ftplib.error_perm:
                ftp.mkd(current)
                ftp.cwd(current)


def upload_file(ftp: ftplib.FTP, local_path: str, remote_dir: str) -> None:
    filename = os.path.basename(local_path)
    ensure_directory(ftp, remote_dir)
    ftp.cwd(remote_dir)
    with open(local_path, 'rb') as file_obj:
        ftp.storbinary(f'STOR {filename}', file_obj)


def main() -> None:
    host = input('Servidor FTP: ').strip()
    user = input('Usuario: ').strip()
    password = getpass('Contraseña: ')
    local_path = input('Ruta local del archivo index.html: ').strip()

    if not os.path.isfile(local_path):
        print('Error: archivo no encontrado')
        return

    try:
        print('Conectando...')
        with ftplib.FTP(host) as ftp:
            ftp.login(user=user, passwd=password)
            print('Conectado y autenticado')
            upload_file(ftp, local_path, '/energia')
            print('Subido correctamente a /energia/')
    except ftplib.all_errors as exc:
        print(f'Error FTP: {exc}')
    except OSError as exc:
        print(f'Error local: {exc}')


if __name__ == '__main__':
    main()
