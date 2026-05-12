@echo off
setlocal enableextensions enabledelayedexpansion

REM ===== Script de produccion local (portable) =====
REM - Instala dependencias si faltan
REM - Compila en modo produccion
REM - Inicia Next optimizado accesible en la red local

REM Directorio del script (carpeta del proyecto), independiente de donde se ejecute
set "SCRIPT_DIR=%~dp0"
pushd "%SCRIPT_DIR%" || (echo No se encontro la carpeta del proyecto: %SCRIPT_DIR% & pause & exit /b 1)

REM Verificar Node.js
where node >nul 2>&1 || (
  echo No se encontro Node.js. Instalar desde https://nodejs.org/
  pause & exit /b 1
)

REM Instalar dependencias solo si faltan
if not exist node_modules (
  echo [1/3] Instalando dependencias...
  if exist package-lock.json (
    call npm ci || (echo Error en npm ci & pause & exit /b 1)
  ) else (
    call npm install --production=false || (echo Error en npm install & pause & exit /b 1)
  )
)

REM Compilar produccion
echo [2/3] Compilando build de produccion...
call npm run build || (echo Error en build & pause & exit /b 1)

REM Iniciar servidor optimizado
set "PORT=3000"
echo [3/3] Iniciando servidor en puerto %PORT% (LAN habilitada)...
echo URL local: http://localhost:%PORT%
echo URL LAN:   http://TU-IP:%PORT%  ^(reemplaza TU-IP por la IP de esta PC^)
call npx next start -p %PORT% -H 0.0.0.0

popd
endlocal
