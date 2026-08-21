# -*- mode: python ; coding: utf-8 -*-
# FT1-MONITOR 后端 PyInstaller 打包配置

import os

block_cipher = None
project_root = os.path.dirname(os.path.abspath(SPEC))

a = Analysis(
    [os.path.join(project_root, 'run.py')],
    pathex=[project_root],
    binaries=[],
    datas=[
        # 如果有静态数据文件需要打包，在这里添加
        # (os.path.join(project_root, 'data'), 'data'),
    ],
    hiddenimports=[
        'uvicorn.logging',
        'uvicorn.loops',
        'uvicorn.loops.auto',
        'uvicorn.protocols',
        'uvicorn.protocols.http',
        'uvicorn.protocols.http.auto',
        'uvicorn.protocols.websockets',
        'uvicorn.protocols.websockets.auto',
        'uvicorn.lifespan',
        'uvicorn.lifespan.on',
        'backend',
        'backend.main',
        'backend.app',
        'backend.app.api',
        'backend.app.api.monitor',
        'backend.app.api.spc',
        'backend.app.api.alerts',
        'backend.app.api.config',
        'backend.app.api.data',
        'backend.app.api.websocket',
        'backend.app.api.predict',
        'backend.app.core',
        'backend.app.core.auth',
        'backend.app.core.config',
        'backend.app.core.exceptions',
        'backend.app.models',
        'backend.app.models.requests',
        'backend.app.services',
        'backend.app.services.storage',
        'backend.app.engine',
        'backend.app.engine.collector',
        'backend.app.engine.collector.mock',
        'backend.app.engine.collector.sqlserver',
        'backend.app.engine.collector.mdb',
        'backend.app.engine.collector.fta',
        'backend.app.engine.collector.scheduler',
        'backend.app.engine.alert',
        'backend.app.engine.alert.engine',
        'engineio.async_drivers.threading',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=['tkinter', 'matplotlib', 'PIL'],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='ft1-backend',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,  # 需要控制台输出日志
    icon=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='ft1-backend',
)
