import pty
import os
import sys
import select
import time

print("🌐 Conectando a Hostinger...")

master, slave = pty.openpty()

pid = os.fork()

if pid == 0:
    os.close(master)
    os.dup2(slave, 0)
    os.dup2(slave, 1)
    os.dup2(slave, 2)
    os.close(slave)
    os.execvp("ssh", ["ssh", "-o", "StrictHostKeyChecking=no", "-i", "/Users/diego/.ssh/id_rsa_panel", "-p", "65002", "u211138134@195.35.10.40"])
else:
    os.close(slave)
    
    time.sleep(2)
    os.write(master, b"pwd\n")
    time.sleep(1)
    os.write(master, b"ls -la\n")
    time.sleep(1)
    # pack.threads=1: el hosting compartido a veces no puede crear hilos para
    # resolver deltas ("fatal: unable to create thread: Resource temporarily
    # unavailable"), forzar un solo hilo evita ese error intermitente.
    os.write(master, b"cd domains/crm.ambrizydavalos.com/nodejs && git -c pack.threads=1 fetch --all && git reset --hard origin/main && touch tmp/restart.txt && git log -1 --oneline\n")
    time.sleep(4)
    os.write(master, b"exit\n")
    
    start_time = time.time()
    while time.time() - start_time < 10:
        r, _, _ = select.select([master], [], [], 0.5)
        if r:
            try:
                data = os.read(master, 1024)
                if not data:
                    break
                sys.stdout.write(data.decode('utf-8', errors='ignore'))
                sys.stdout.flush()
            except Exception:
                break
    os.close(master)
