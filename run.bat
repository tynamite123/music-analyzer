@echo off
cd /d "%~dp0"
python music_analyzer.py "test-music" %*
pause