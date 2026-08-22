"""FT1-MONITOR 后端入口 (PyInstaller / Nuitka 打包用)

用法:
    ft1-backend.exe [--port 18080] [--host 127.0.0.1]
"""
import sys
import os
import argparse

# PyInstaller 打包后，工作目录可能不是 exe 所在目录，需要修正
# Nuitka standalone: sys.executable 指向编译后的 exe
if getattr(sys, 'frozen', False) or '__compiled__' in globals():
    exe_dir = os.path.dirname(os.path.abspath(sys.executable))
    if os.path.isdir(exe_dir):
        os.chdir(exe_dir)

# 确保 data 目录存在
os.makedirs('data', exist_ok=True)
os.makedirs('logs', exist_ok=True)

import uvicorn
from backend.main import app

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--host', default='127.0.0.1')
    parser.add_argument('--port', type=int, default=18080)
    args = parser.parse_args()
    try:
        uvicorn.run(app, host=args.host, port=args.port)
    except OSError as e:
        print(f"错误: 无法绑定到 {args.host}:{args.port} — {e}")
        print("端口可能已被占用，请使用 --port 指定其他端口")
        sys.exit(1)
