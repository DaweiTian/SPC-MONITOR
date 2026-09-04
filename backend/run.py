"""spc-monitor 后端入口 (PyInstaller / Nuitka 打包用)

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

# Windows: 隐藏后端进程所有窗口，避免任务栏出现两个图标
if sys.platform == 'win32':
    try:
        import ctypes
        import ctypes.wintypes as wintypes

        _pid = os.getpid()
        _EnumWindows = ctypes.windll.user32.EnumWindows
        _GetWindowThreadProcessId = ctypes.windll.user32.GetWindowThreadProcessId
        _IsWindowVisible = ctypes.windll.user32.IsWindowVisible
        _ShowWindow = ctypes.windll.user32.ShowWindow

        def _hide_pid_windows(hwnd, _lparam):
            pid = wintypes.DWORD()
            _GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
            if pid.value == _pid and _IsWindowVisible(hwnd):
                _ShowWindow(hwnd, 0)  # SW_HIDE
            return True

        _WNDENUMPROC = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
        _EnumWindows(_WNDENUMPROC(_hide_pid_windows), 0)
    except Exception:
        pass  # best-effort; non-critical cosmetic fix

# 确保 data 目录存在
os.makedirs('data', exist_ok=True)
os.makedirs('logs', exist_ok=True)

import uvicorn
from backend.main import app

if __name__ == '__main__':
    from backend.app.core.config import get_server_config
    server_config = get_server_config()

    parser = argparse.ArgumentParser()
    parser.add_argument('--host', default=server_config['host'])
    parser.add_argument('--port', type=int, default=server_config['port'])
    args = parser.parse_args()
    import time as _time
    try:
        # 重试机制：端口可能因 Launcher 重启仍在 TIME_WAIT 状态
        for _attempt in range(5):
            try:
                uvicorn.run(app, host=args.host, port=args.port)
                break
            except OSError as e:
                if '10048' in str(e) or 'Address already in use' in str(e):
                    print(f"端口 {args.port} 被占用，等待释放后重试...")
                    _time.sleep(3)
                    continue
                raise
        else:
            print(f"错误: 端口 {args.port} 多次重试后仍无法绑定")
            sys.exit(1)
    except OSError as e:
        print(f"错误: 无法绑定到 {args.host}:{args.port} — {e}")
        print("端口可能已被占用，请使用 --port 指定其他端口")
        sys.exit(1)
