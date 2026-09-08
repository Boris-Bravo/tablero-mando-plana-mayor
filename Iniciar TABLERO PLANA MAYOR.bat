@echo off
title Tablero de Mando y Control de la Plana Mayor
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0servidor.ps1"
